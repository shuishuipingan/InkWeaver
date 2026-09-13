/**
 * Renderer runtime-log transport.
 *
 * The renderer is not allowed to silently discard an event because another
 * event is in flight. Events stay in an unbounded (until persisted) queue,
 * are acknowledged by the main process in batches, and are put back at the
 * front of the queue when the transport fails. The browser fallback mirrors
 * to the native console, but never claims that the event was persisted.
 */

import { createRuntimeLogEvent, type RuntimeLogLevel, type RuntimeLogTransportEntry } from '../shared/runtime-log'

export type LogLevel = Extract<RuntimeLogLevel, 'debug' | 'info' | 'warn' | 'error' | 'fatal'>

export interface RuntimeLogContext {
  event?: string
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  chapterNumber?: number
  operation?: string
  outcome?: 'started' | 'succeeded' | 'failed' | 'cancelled' | 'rejected' | 'skipped'
  durationMs?: number
  error?: unknown
}

export interface RuntimeLogTestTransport {
  invoke: (payload: { batch: RuntimeLogTransportEntry[] }) => Promise<unknown>
  send: (channel: 'runtime:log-batch', payload: { batch: RuntimeLogTransportEntry[] }) => void
}

const FLUSH_INTERVAL_MS = 200
const FLUSH_BATCH_SIZE = 20
const INITIAL_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 10_000
const MAX_CONSOLE_ARGUMENT_CHARS = 512

const nativeConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

const queue: RuntimeLogTransportEntry[] = []
let sequence = 0
let sessionId = createSessionId()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let flushInFlight: Promise<void> | null = null
let inFlightBatch: RuntimeLogTransportEntry[] | null = null
let consecutiveFailures = 0
let testTransport: RuntimeLogTestTransport | undefined

function createSessionId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return `renderer-${globalThis.crypto.randomUUID()}`
  } catch { /* fall through */ }
  return `renderer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function monotonicNow(): number | undefined {
  try {
    if (typeof performance?.now === 'function') return performance.now()
  } catch { /* performance is unavailable in some workers */ }
  return undefined
}

function isTestEnv(): boolean {
  return (typeof process !== 'undefined' && process.env?.VITEST === 'true')
    || (typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test')
}

function fallback(level: LogLevel, source: string, message: string, details?: unknown): void {
  const fn = level === 'fatal' || level === 'error'
    ? nativeConsole.error
    : level === 'warn'
      ? nativeConsole.warn
      : level === 'debug'
        ? nativeConsole.debug
        : nativeConsole.info
  try { fn(`[${source}] ${message}`, details ?? '') } catch { /* EPIPE must not break the app */ }
}

export interface RuntimeConsoleTarget {
  log: (...args: unknown[]) => unknown
  info: (...args: unknown[]) => unknown
  warn: (...args: unknown[]) => unknown
  error: (...args: unknown[]) => unknown
  debug: (...args: unknown[]) => unknown
}

export interface RuntimeLogWindowTarget {
  addEventListener: (type: string, listener: () => void) => unknown
  removeEventListener: (type: string, listener: () => void) => unknown
}

function formatConsoleArgument(value: unknown): string {
  if (value instanceof Error) {
    const stack = String(value.stack ?? value.message)
    return stack.length > MAX_CONSOLE_ARGUMENT_CHARS
      ? `${value.name || 'Error'}: ${value.message}`
      : stack
  }
  if (typeof value === 'string') {
    return value.length > MAX_CONSOLE_ARGUMENT_CHARS ? `[string:${value.length}]` : value
  }
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return String(value)
    return serialized.length > MAX_CONSOLE_ARGUMENT_CHARS
      ? summarizeConsoleArgument(value)
      : serialized
  } catch {
    return String(value)
  }
}

function summarizeConsoleArgument(value: unknown): string {
  if (value instanceof Error) return `${value.name || 'Error'}: ${value.message}`
  if (typeof value === 'string') return `[string:${value.length}]`
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  if (Array.isArray(value)) return `[array:${value.length}]`
  if (value && typeof value === 'object') return `[object:${Object.keys(value as object).slice(0, 8).join(',')}]`
  return `[${typeof value}]`
}

function captureConsoleCall(level: LogLevel, args: unknown[]): void {
  const message = args.map(formatConsoleArgument).join(' ')
  write(level, 'console', message, args.length > 1 ? { argumentCount: args.length, args: args.map(summarizeConsoleArgument) } : undefined, {
    operation: `console.${level}`,
  })
}

/** Install an idempotent renderer console bridge and return its restore hook. */
export function installRuntimeLogConsoleCapture(target: RuntimeConsoleTarget = console): () => void {
  const originals = {
    log: target.log,
    info: target.info,
    warn: target.warn,
    error: target.error,
    debug: target.debug,
  }
  let active = true
  const wrap = (level: LogLevel, original: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    try {
      return original(...args)
    } finally {
      if (active) captureConsoleCall(level, args)
    }
  }
  target.log = wrap('info', originals.log)
  target.info = wrap('info', originals.info)
  target.warn = wrap('warn', originals.warn)
  target.error = wrap('error', originals.error)
  target.debug = wrap('debug', originals.debug)
  return () => {
    if (!active) return
    active = false
    target.log = originals.log
    target.info = originals.info
    target.warn = originals.warn
    target.error = originals.error
    target.debug = originals.debug
  }
}

/** Flush the queue synchronously enough for Electron's page teardown path. */
export function installRuntimeLogShutdownFlush(target: RuntimeLogWindowTarget = window): () => void {
  const handler = () => { void flushRuntimeLogQueue({ shutdown: true }) }
  target.addEventListener('beforeunload', handler)
  return () => target.removeEventListener('beforeunload', handler)
}

interface NativeRuntimeLogApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  send: (channel: string, ...args: unknown[]) => void
}

/**
 * Read only the preload bridge needed by the logger. Keeping this tiny
 * boundary local avoids a runtime-log ↔ ipc-client module cycle: ipc-client
 * itself records IPC calls through runtime-log, so importing it here makes a
 * renderer Vite graph needlessly recursive and can stall the update fixture.
 */
function nativeRuntimeTransport(): RuntimeLogTestTransport | undefined {
  if (typeof window === 'undefined') return undefined
  const api = (window as unknown as { velaAPI?: NativeRuntimeLogApi }).velaAPI
  if (!api) return undefined
  return {
    invoke: payload => api.invoke('runtime:log', payload),
    send: (channel, payload) => api.send(channel, payload),
  }
}

function transport(): RuntimeLogTestTransport | undefined {
  return testTransport ?? nativeRuntimeTransport()
}

function enqueue(level: LogLevel, source: string, message: string, details?: unknown, context?: RuntimeLogContext): string {
  const event = createRuntimeLogEvent({
    sequence: ++sequence,
    sessionId,
    process: 'renderer',
    level,
    source: source || 'renderer',
    event: context?.event ?? `runtime.${level}`,
    message,
    monotonicMs: monotonicNow(),
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.correlationId ? { correlationId: context.correlationId } : {}),
    ...(context?.runId ? { runId: context.runId } : {}),
    ...(context?.projectId ? { projectId: context.projectId } : {}),
    ...(context?.projectSessionId ? { projectSessionId: context.projectSessionId } : {}),
    ...(context?.chapterNumber !== undefined ? { chapterNumber: context.chapterNumber } : {}),
    ...(context?.operation ? { operation: context.operation } : {}),
    ...(context?.outcome ? { outcome: context.outcome } : {}),
    ...(context?.durationMs !== undefined ? { durationMs: context.durationMs } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(context?.error !== undefined ? { error: context.error } : {}),
  })

  // The main process recreates the trusted event boundary. Keeping all fields
  // here makes a transport packet self-describing when captured on shutdown.
  queue.push({
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    monotonicMs: event.monotonicMs,
    sequence: event.sequence,
    sessionId: event.sessionId,
    level: event.level,
    source: event.source,
    event: event.event,
    message: event.message,
    ...(event.requestId ? { requestId: event.requestId } : {}),
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.projectId ? { projectId: event.projectId } : {}),
    ...(event.projectSessionId ? { projectSessionId: event.projectSessionId } : {}),
    ...(event.chapterNumber !== undefined ? { chapterNumber: event.chapterNumber } : {}),
    ...(event.operation ? { operation: event.operation } : {}),
    ...(event.outcome ? { outcome: event.outcome } : {}),
    ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
    ...(event.details !== undefined ? { details: event.details } : {}),
    ...(event.error !== undefined ? { error: event.error } : {}),
  })
  scheduleFlush()
  return event.eventId
}

function scheduleFlush(): void {
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flushRuntimeLogQueue()
    return
  }
  if (flushTimer || retryTimer || flushInFlight) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushRuntimeLogQueue()
  }, FLUSH_INTERVAL_MS)
}

function isAcknowledged(result: unknown): boolean {
  if (result === undefined || result === null) return true
  if (typeof result !== 'object') return true
  const success = (result as { success?: unknown }).success
  return success !== false
}

function scheduleRetry(): void {
  if (retryTimer || queue.length === 0) return
  const delay = Math.min(
    MAX_RETRY_DELAY_MS,
    INITIAL_RETRY_DELAY_MS * (2 ** Math.max(0, consecutiveFailures - 1)),
  )
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flushRuntimeLogQueue()
  }, delay)
}

async function flushNow(): Promise<void> {
  const activeTransport = transport()
  if (!activeTransport || queue.length === 0) return

  while (queue.length > 0) {
    const batch = queue.splice(0, FLUSH_BATCH_SIZE)
    inFlightBatch = batch
    try {
      const result = await activeTransport.invoke({ batch })
      if (!isAcknowledged(result)) throw new Error('runtime log transport rejected the batch')
      consecutiveFailures = 0
    } catch (error) {
      queue.unshift(...batch)
      consecutiveFailures += 1
      enqueue(
        'error',
        'runtime-log',
        '日志上报失败，事件已保留待重试',
        {
          retryCount: consecutiveFailures,
          queueDepth: queue.length,
          batchCount: batch.length,
          errorName: error instanceof Error ? error.name : typeof error,
          persistenceState: 'pending',
        },
        {
          event: 'log.transport.failed',
          operation: 'log.transport.failed',
          outcome: 'failed',
        },
      )
      scheduleRetry()
      fallback('error', 'runtime-log', `日志上报失败，已保留待重试队列：${String(error)}`)
      inFlightBatch = null
      return
    }
    inFlightBatch = null
  }
}

/** Flush all currently queued events. Failed batches remain queued. */
export function flushRuntimeLogQueue(options: { shutdown?: boolean } = {}): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (options.shutdown) {
    if (queue.length > 0 || inFlightBatch) {
      const activeTransport = transport()
      const batch = [...(inFlightBatch ?? []), ...queue]
      queue.length = 0
      if (activeTransport) {
        try { activeTransport.send('runtime:log-batch', { batch }) } catch (error) {
          queue.unshift(...batch)
          fallback('error', 'runtime-log', `关闭时日志发送失败，已保留队列：${String(error)}`)
        }
      } else {
        queue.unshift(...batch)
      }
    }
    return flushInFlight ?? Promise.resolve()
  }
  if (flushInFlight) return flushInFlight
  flushInFlight = flushNow().finally(() => {
    flushInFlight = null
    if (queue.length > 0) scheduleFlush()
  })
  return flushInFlight
}

/** Explicitly inject a transport in tests; production never calls this. */
export function configureRuntimeLogTestTransport(transportValue: RuntimeLogTestTransport): void {
  testTransport = transportValue
}

/** Clear renderer transport state between tests without hiding production failures. */
export function resetRuntimeLogForTests(): void {
  if (flushTimer) clearTimeout(flushTimer)
  if (retryTimer) clearTimeout(retryTimer)
  flushTimer = null
  retryTimer = null
  queue.length = 0
  inFlightBatch = null
  sequence = 0
  sessionId = createSessionId()
  consecutiveFailures = 0
  testTransport = undefined
}

export const runtimeLog = {
  debug(source: string, message: string, details?: unknown, context?: RuntimeLogContext): string | undefined {
    return write('debug', source, message, details, context)
  },
  info(source: string, message: string, details?: unknown, context?: RuntimeLogContext): string | undefined {
    return write('info', source, message, details, context)
  },
  warn(source: string, message: string, details?: unknown, context?: RuntimeLogContext): string | undefined {
    return write('warn', source, message, details, context)
  },
  error(source: string, message: string, details?: unknown, context?: RuntimeLogContext): string | undefined {
    return write('error', source, message, details, context)
  },
  fatal(source: string, message: string, details?: unknown, context?: RuntimeLogContext): string | undefined {
    return write('fatal', source, message, details, context)
  },
}

function write(level: LogLevel, source: string, message: string, details?: unknown, context?: RuntimeLogContext): string | undefined {
  // Explicit test transports intentionally bypass the Vitest browser fallback.
  if (!transport() || (!testTransport && isTestEnv())) {
    fallback(level, source, message, details)
    return undefined
  }
  return enqueue(level, source, message, details, context)
}
