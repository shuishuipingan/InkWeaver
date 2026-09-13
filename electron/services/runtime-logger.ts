/**
 * InkWeaver's single main-process runtime log boundary.
 *
 * Persistence is unconditional: the console threshold only controls what is
 * mirrored to stdout. Main, renderer, IPC and child-process adapters all feed
 * the same append-only RuntimeLogWriter so a UI log is never the source of
 * truth and no event is silently rate-limited or dropped.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, dialog, ipcMain } from 'electron'

import { VELA_HOME } from '../utils/config-utils'
import {
  createRuntimeLogEvent,
  type RuntimeLogEvent,
  type RuntimeLogLevel,
  type RuntimeLogPageQuery,
  type RuntimeLogProcess,
} from '../../src/shared/runtime-log'
import { RuntimeLogWriter } from './runtime-log-writer'
import { RuntimeLoggerCore, type RuntimeLogContext } from './runtime-logger-core'
import { installConsoleCapture, type RuntimeConsoleTarget } from './runtime-log-capture'

export type LogLevel = RuntimeLogLevel

const nativeConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

const configuredLevel = process.env.AI_NOVEL_LOG_LEVEL as RuntimeLogLevel | undefined
const initialConsoleLevel: RuntimeLogLevel = configuredLevel && [
  'debug', 'info', 'warn', 'error', 'fatal',
].includes(configuredLevel) ? configuredLevel : 'info'

let homeDirectory = ''
try { homeDirectory = os.homedir() } catch { /* keep paths unchanged when unavailable */ }

function resolveLogDirectory(): string {
  try {
    // Electron's userData/logs path is writable for installed macOS and
    // Windows applications; app.getPath can throw before app.ready.
    const logsPath = app.getPath('logs')
    if (logsPath) return path.resolve(logsPath)
  } catch { /* use the stable VELA fallback */ }
  return path.resolve(VELA_HOME, 'logs')
}

function redactPathText(text: string): string {
  return homeDirectory ? text.split(homeDirectory).join('~') : text
}

function formatEvent(event: RuntimeLogEvent): string {
  const details = event.details ? ` ${JSON.stringify(event.details)}` : ''
  const error = event.error ? ` error=${JSON.stringify(event.error)}` : ''
  const context = [
    event.requestId && `requestId=${event.requestId}`,
    event.correlationId && `correlationId=${event.correlationId}`,
    event.runId && `runId=${event.runId}`,
    event.projectSessionId && `projectSessionId=${event.projectSessionId}`,
    event.durationMs !== undefined && `durationMs=${event.durationMs}`,
  ].filter(Boolean).join(' ')
  return `[${event.occurredAt}] [${event.level.toUpperCase()}] [${event.source}] ${redactPathText(event.message)}${context ? ` ${context}` : ''}${details}${error}`
}

let processSequence = 0
const processSessionId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
const nextSequence = () => ++processSequence

const writer = new RuntimeLogWriter({
  rootDir: resolveLogDirectory(),
  maxSegmentBytes: 10 * 1024 * 1024,
  maxSegments: 30,
})

function mirrorEvent(event: RuntimeLogEvent): void {
  const line = formatEvent(event)
  try {
    if (event.level === 'fatal' || event.level === 'error') nativeConsole.error(line)
    else if (event.level === 'warn') nativeConsole.warn(line)
    else if (event.level === 'debug') nativeConsole.debug(line)
    else nativeConsole.info(line)
  } catch { /* an EPIPE must never become a second application failure */ }
}

const core = new RuntimeLoggerCore({
  writer,
  process: 'main',
  sessionId: processSessionId,
  pid: process.pid,
  consoleLevel: initialConsoleLevel,
  nextSequence,
  consoleSink: mirrorEvent,
  onPersistenceError: (error, event) => {
    // Do not call runtimeLogger here: if the disk is full that would recurse.
    try {
      nativeConsole.error(formatEvent({
        ...event,
        level: 'error',
        source: 'runtime-log-writer',
        event: 'log.persistence.failed',
        message: `日志持久化失败：${String(error)}`,
        outcome: 'failed',
      }))
    } catch { /* the writer status remains the machine-readable fallback */ }
  },
})

/** Persist one externally-created event (used by renderer/child-process adapters). */
function ingest(event: RuntimeLogEvent): void {
  void writer.append(event).catch(error => {
    try { nativeConsole.error(`[runtime-log] ingest failed: ${String(error)}`) } catch { /* ignore EPIPE */ }
  })
}

/** Ingest a child/worker event while preserving its trusted process identity. */
export function ingestRuntimeLogEvent(event: RuntimeLogEvent): void {
  ingest(event)
}

function rendererInput(input: Record<string, unknown>, senderProcessId?: number): RuntimeLogEvent {
  const allowedLevel = ['debug', 'info', 'warn', 'error', 'fatal'].includes(String(input.level))
    ? input.level as RuntimeLogLevel
    : 'info'
  const process = 'renderer' as RuntimeLogProcess
  const details = input.details
  return createRuntimeLogEvent({
    ...(typeof input.eventId === 'string' ? { eventId: input.eventId } : {}),
    ...(typeof input.occurredAt === 'string' ? { occurredAt: input.occurredAt } : {}),
    sequence: Number.isSafeInteger(input.sequence) ? Number(input.sequence) : nextSequence(),
    sessionId: typeof input.sessionId === 'string' && input.sessionId ? input.sessionId : `renderer-${senderProcessId ?? 'unknown'}`,
    process,
    ...(Number.isSafeInteger(senderProcessId) ? { pid: senderProcessId } : {}),
    level: allowedLevel,
    source: typeof input.source === 'string' && input.source ? input.source : 'renderer',
    event: typeof input.event === 'string' && input.event ? input.event : 'renderer.message',
    message: typeof input.message === 'string' ? input.message : String(input.message ?? ''),
    ...(typeof input.requestId === 'string' ? { requestId: input.requestId } : {}),
    ...(typeof input.correlationId === 'string' ? { correlationId: input.correlationId } : {}),
    ...(typeof input.runId === 'string' ? { runId: input.runId } : {}),
    ...(typeof input.projectId === 'string' ? { projectId: input.projectId } : {}),
    ...(typeof input.projectSessionId === 'string' ? { projectSessionId: input.projectSessionId } : {}),
    ...(Number.isSafeInteger(input.chapterNumber) ? { chapterNumber: Number(input.chapterNumber) } : {}),
    ...(typeof input.operation === 'string' ? { operation: input.operation } : {}),
    ...(typeof input.outcome === 'string' ? { outcome: input.outcome as RuntimeLogContext['outcome'] } : {}),
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
  })
}

const consoleCaptureContext = {
  sessionId: processSessionId,
  process: 'main' as const,
  source: 'console',
  pid: process.pid,
  nextSequence,
  onSinkError: (error: unknown) => {
    try { nativeConsole.error(`[runtime-log] console capture failed: ${String(error)}`) } catch { /* ignore */ }
  },
}

// The capture is installed at module evaluation before controllers register.
// RuntimeLoggerCore mirrors through nativeConsole, so its own output cannot
// recursively enter this wrapper.
installConsoleCapture(
  console as unknown as RuntimeConsoleTarget,
  ingest,
  consoleCaptureContext,
)

export const runtimeLogger = {
  debug(source: string, message: string, details?: unknown, context?: RuntimeLogContext): void {
    core.debug(source, message, details, context)
  },
  info(source: string, message: string, details?: unknown, context?: RuntimeLogContext): void {
    core.info(source, message, details, context)
  },
  warn(source: string, message: string, details?: unknown, context?: RuntimeLogContext): void {
    core.warn(source, message, details, context)
  },
  error(source: string, message: string, details?: unknown, context?: RuntimeLogContext): void {
    core.error(source, message, details, context)
  },
  fatal(source: string, message: string, details?: unknown, context?: RuntimeLogContext): void {
    core.fatal(source, message, details, context)
  },
  setLevel(level: RuntimeLogLevel): void {
    core.setConsoleLevel(level)
  },
  getLevel(): RuntimeLogLevel {
    return core.consoleLevel()
  },
  currentLogFile(): string {
    const segment = writer.status().segment
    return path.join(resolveLogDirectory(), segment ?? `app-${new Date().toISOString().slice(0, 10)}.001.jsonl`)
  },
  status() {
    return writer.status()
  },
  readPage(query: RuntimeLogPageQuery = {}) {
    return writer.readPage(query)
  },
  flush() {
    return core.flush()
  },
}

/** Main-process safe console facade. Each call produces exactly one event. */
export const safeConsole = {
  log: (...args: unknown[]) => mirrorConsole('info', args),
  info: (...args: unknown[]) => mirrorConsole('info', args),
  warn: (...args: unknown[]) => mirrorConsole('warn', args),
  error: (...args: unknown[]) => mirrorConsole('error', args),
}

function mirrorConsole(level: Extract<RuntimeLogLevel, 'info' | 'warn' | 'error'>, args: unknown[]): void {
  const message = args.map(value => value instanceof Error ? String(value.stack ?? value.message) : stringify(value)).join(' ')
  const details = args.length > 1
    ? {
        argumentCount: args.length,
        args: args.map(value => value instanceof Error
          ? `${value.name || 'Error'}: ${value.message}`
          : typeof value === 'string'
            ? `[string:${value.length}]`
            : Array.isArray(value)
              ? `[array:${value.length}]`
              : value && typeof value === 'object'
                ? `[object:${Object.keys(value).slice(0, 8).join(',')}]`
                : String(value)),
      }
    : undefined
  core[level]('console', message, details, {
    operation: `console.${level}`,
  })
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text
  } catch { return String(value) }
}

/** Backwards-compatible lazy mirror used by older safe-console imports. */
export function mirrorConsoleToFile(level: 'info' | 'warn' | 'error', text: string): void {
  core[level]('console', text, undefined, { operation: `console.${level}` })
}

let runtimeIpcRegistered = false

/** Register renderer log ingestion, query, export status, and level control. */
export function registerRuntimeLoggerIPC(): void {
  if (runtimeIpcRegistered) return
  runtimeIpcRegistered = true

  const ingestPayload = (payload: unknown, senderProcessId?: number): { success: boolean; error?: string } => {
    try {
      if (payload && typeof payload === 'object' && Array.isArray((payload as { batch?: unknown }).batch)) {
        for (const input of (payload as { batch: unknown[] }).batch) {
          if (input && typeof input === 'object') ingest(rendererInput(input as Record<string, unknown>, senderProcessId))
        }
        const dropped = Number((payload as { dropped?: unknown }).dropped)
        if (Number.isFinite(dropped) && dropped > 0) {
          core.warn('renderer', 'Renderer 报告了日志覆盖缺口', { dropped }, { operation: 'log.queue.gap', outcome: 'failed' })
        }
      } else if (payload && typeof payload === 'object') {
        ingest(rendererInput(payload as Record<string, unknown>, senderProcessId))
      }
      return { success: true }
    } catch (error) {
      try { nativeConsole.error(`[runtime-log] renderer payload rejected: ${String(error)}`) } catch { /* ignore */ }
      return { success: false, error: String(error) }
    }
  }

  ipcMain.handle('runtime:log', (event, payload: unknown) => ingestPayload(payload, event.sender?.id))
  // A one-way channel is used by the renderer during beforeunload so it does
  // not wait for a Promise while Chromium is tearing the page down.
  if (typeof (ipcMain as unknown as { on?: unknown }).on === 'function') {
    ipcMain.on('runtime:log-batch', (event, payload) => { ingestPayload(payload, event.sender?.id) })
  }
  ipcMain.handle('runtime:set-level', (_event, level: unknown) => {
    if (!['debug', 'info', 'warn', 'error'].includes(String(level))) {
      return { success: false, error: `非法日志级别: ${String(level)}` }
    }
    runtimeLogger.setLevel(level as RuntimeLogLevel)
    runtimeLogger.info('runtime', '运行时控制台日志级别已调整', { level }, { operation: 'runtime.log.level' })
    return { success: true, level: runtimeLogger.getLevel() }
  })
  ipcMain.handle('runtime:get-level', () => ({ success: true, level: runtimeLogger.getLevel() }))
  ipcMain.handle('runtime:log-status', () => runtimeLogger.status())
  ipcMain.handle('runtime:log-page', (_event, query: unknown) => runtimeLogger.readPage(query && typeof query === 'object' ? query as RuntimeLogPageQuery : {}))
  ipcMain.handle('runtime:log-flush', async () => {
    await runtimeLogger.flush()
    return { success: true, status: runtimeLogger.status() }
  })
  ipcMain.handle('runtime:log-export', async () => {
    try {
      const selection = await dialog.showOpenDialog({
        title: '选择日志导出目录',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (selection.canceled || selection.filePaths.length === 0) return { success: false, cancelled: true }
      const parent = selection.filePaths[0]
      const suffix = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`
      const destination = path.join(parent, `inkweaver-runtime-logs-${suffix}`)
      const receipt = await writer.exportBundle(destination)
      return {
        success: true,
        displayName: path.basename(destination),
        files: receipt.files,
      }
    } catch (error) {
      core.error('runtime-log', '日志 bundle 导出失败', {
        errorName: error instanceof Error ? error.name : typeof error,
      }, { operation: 'log.export', outcome: 'failed' })
      return { success: false, error: '日志导出失败，请检查目标目录权限。' }
    }
  })
}

const TRACE_SKIP_CHANNELS = new Set([
  'runtime:log', 'runtime:log-batch', 'runtime:log-status', 'runtime:log-page', 'runtime:log-flush', 'runtime:log-export',
  'runtime:set-level', 'runtime:get-level',
  'llm:stream-chunk', 'llm:stream-done', 'llm:stream-error',
])

const IMPORTANT_CHANNEL_PREFIXES = [
  'project:', 'llm:', 'db:', 'kb:', 'chapter:', 'import:', 'finalization:', 'skills:', 'dialog:', 'fs:',
]

export function traceIPC<Args extends unknown[], Result>(
  channel: string,
  handler: (...args: Args) => Promise<Result> | Result,
): (...args: Args) => Promise<Result> {
  if (TRACE_SKIP_CHANNELS.has(channel)) return (...args: Args) => Promise.resolve(handler(...args))
  const important = IMPORTANT_CHANNEL_PREFIXES.some(prefix => channel.startsWith(prefix))
  return async (...args: Args): Promise<Result> => {
    const startedAt = Date.now()
    const requestId = randomUUID()
    const correlationId = `${channel}:${requestId}`
    const logArgs = args.slice(1)
    const safeArgs = redactSensitive(logArgs)
    const context: RuntimeLogContext = { requestId, correlationId, operation: `ipc.${channel}`, outcome: 'started' }
    if (important) runtimeLogger.info('ipc', `调用 ${channel}`, { args: safeArgs }, context)
    else runtimeLogger.debug('ipc', `调用 ${channel}`, { argCount: logArgs.length }, context)
    try {
      const result = await handler(...args)
      const elapsedMs = Date.now() - startedAt
      recordIpcTiming(channel, elapsedMs)
      const completionContext = { ...context, outcome: 'succeeded' as const, durationMs: elapsedMs }
      if (elapsedMs > 1_000) runtimeLogger.warn('ipc', `慢操作 ${channel}`, { elapsedMs, thresholdMs: 1_000 }, completionContext)
      else if (important) runtimeLogger.info('ipc', `完成 ${channel}`, { elapsedMs }, completionContext)
      else runtimeLogger.debug('ipc', `完成 ${channel}`, { elapsedMs }, completionContext)
      return result
    } catch (error) {
      const elapsedMs = Date.now() - startedAt
      runtimeLogger.error('ipc', `失败 ${channel}`, { elapsedMs, error: String(error) }, {
        ...context,
        outcome: 'failed',
        durationMs: elapsedMs,
        error,
      })
      throw error
    }
  }
}

const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'authorization', 'cookie', 'password', 'token', 'secret',
  'access_token', 'refresh_token', 'privatekey', 'private_key',
])
const PATH_SHAPED_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/[^/]+(?:[\\/][^/]+)+)/iu

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[REDACTED:depth-limit]'
  if (Array.isArray(value)) return value.map(item => redactSensitive(item, depth + 1))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        output[key] = typeof child === 'string' && child ? `[REDACTED:${child.length}]` : '[REDACTED]'
      } else output[key] = redactSensitive(child, depth + 1)
    }
    return output
  }
  if (typeof value === 'string' && PATH_SHAPED_PATTERN.test(value)) return redactPathText(value)
  return value
}

let ipcPatchInstalled = false

/** Wrap every ipcMain.handle registration; call before controller registration. */
export function installIPCGlobalTracing(ipc: {
  handle: (channel: string, listener: (...args: any[]) => any) => void
}): void {
  if (ipcPatchInstalled) return
  ipcPatchInstalled = true
  const originalHandle = ipc.handle.bind(ipc)
  ipc.handle = ((channel: string, listener: (...args: any[]) => any) => {
    return originalHandle(channel, traceIPC(channel, listener))
  }) as typeof ipc.handle
  runtimeLogger.info('ipc', '全局 IPC 追踪已启用', undefined, { operation: 'ipc.tracing.enabled' })
}

const IPC_SAMPLE_LIMIT = 200
const ipcElapsed: number[] = []
let slowCount = 0
let slowestChannel = ''
let slowestMs = 0

function recordIpcTiming(channel: string, elapsedMs: number): void {
  ipcElapsed.push(elapsedMs)
  if (elapsedMs > 1_000) {
    slowCount += 1
    if (elapsedMs > slowestMs) { slowestMs = elapsedMs; slowestChannel = channel }
  }
  if (ipcElapsed.length < IPC_SAMPLE_LIMIT) return
  const sorted = [...ipcElapsed].sort((a, b) => a - b)
  runtimeLogger.info('perf', 'IPC 性能摘要', {
    samples: sorted.length,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    maxMs: sorted.at(-1),
    slowOps: slowCount,
    thresholdMs: 1_000,
    slowestChannel: slowestChannel || undefined,
    slowestMs: slowestMs || undefined,
  }, { operation: 'perf.ipc.summary' })
  ipcElapsed.length = 0
  slowCount = 0
  slowestChannel = ''
  slowestMs = 0
}

try {
  fs.mkdirSync(resolveLogDirectory(), { recursive: true })
  runtimeLogger.info('runtime', '运行日志服务已初始化', {
    logDirectory: redactPathText(resolveLogDirectory()),
    consoleLevel: runtimeLogger.getLevel(),
  }, { operation: 'runtime.started', outcome: 'succeeded' })
} catch (error) {
  try { nativeConsole.error(`[runtime-log] initialization failed: ${String(error)}`) } catch { /* ignore */ }
}
