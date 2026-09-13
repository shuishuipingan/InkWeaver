import {
  createRuntimeLogEvent,
  type RuntimeLogEvent,
  type RuntimeLogInput,
  type RuntimeLogLevel,
  type RuntimeLogProcess,
} from '../../src/shared/runtime-log'

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'
const MAX_CONSOLE_ARGUMENT_CHARS = 512

export interface RuntimeConsoleTarget {
  log: (...args: unknown[]) => unknown
  info: (...args: unknown[]) => unknown
  warn: (...args: unknown[]) => unknown
  error: (...args: unknown[]) => unknown
  debug: (...args: unknown[]) => unknown
}

export interface RuntimeConsoleCaptureContext {
  sessionId: string
  process: RuntimeLogProcess
  source?: string
  nextSequence(): number
  pid?: number
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  onSinkError?(error: unknown): void
  emit?(event: RuntimeLogEvent): void | Promise<void>
}

/** Minimal child-process surface so tests and Electron adapters can share the
 * same capture implementation without importing Node's ChildProcess type into
 * the renderer-safe console adapter. */
export interface RuntimeChildProcessTarget {
  pid?: number
  stdout?: { on(event: string, listener: (data: unknown) => void): unknown }
  stderr?: { on(event: string, listener: (data: unknown) => void): unknown }
  on(event: string, listener: (...args: any[]) => void): unknown
}

export interface RuntimeChildProcessCaptureContext {
  sessionId: string
  process: Extract<RuntimeLogProcess, 'mcp' | 'worker' | 'script'>
  source: string
  childId: string
  nextSequence(): number
  pid?: number
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  protocol?: boolean
  onSinkError?(error: unknown): void
}

function levelFor(method: ConsoleMethod): RuntimeLogLevel {
  return method === 'log' || method === 'info' ? 'info' : method
}

function argumentText(value: unknown): string {
  if (value instanceof Error) return `${value.name || 'Error'}: ${value.message}`
  if (typeof value === 'string') {
    return value.length > MAX_CONSOLE_ARGUMENT_CHARS ? `[string:${value.length}]` : value
  }
  if (typeof value === 'bigint') return `${value}n`
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return String(value)
    return serialized.length > MAX_CONSOLE_ARGUMENT_CHARS
      ? argumentSummary(value)
      : serialized
  } catch {
    return String(value)
  }
}

function argumentSummary(value: unknown): string {
  if (value instanceof Error) return `${value.name || 'Error'}: ${value.message}`
  if (typeof value === 'string') return `[string:${value.length}]`
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  if (typeof value === 'bigint') return '[bigint]'
  if (Array.isArray(value)) return `[array:${value.length}]`
  if (value && typeof value === 'object') return `[object:${Object.keys(value as object).slice(0, 8).join(',')}]`
  return `[${typeof value}]`
}

function errorArgument(args: readonly unknown[]): unknown {
  return args.find(value => value instanceof Error)
}

function inputFor(method: ConsoleMethod, args: readonly unknown[], context: RuntimeConsoleCaptureContext): RuntimeLogInput {
  const error = errorArgument(args)
  const message = args.map(argumentText).join(' ')
  return {
    sequence: context.nextSequence(),
    sessionId: context.sessionId,
    process: context.process,
    ...(context.pid !== undefined ? { pid: context.pid } : {}),
    level: levelFor(method),
    source: context.source ?? 'console',
    event: `console.${method}`,
    message,
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    ...(context.runId ? { runId: context.runId } : {}),
    ...(context.projectId ? { projectId: context.projectId } : {}),
    ...(context.projectSessionId ? { projectSessionId: context.projectSessionId } : {}),
    ...(error ? { outcome: 'failed' as const, error } : {}),
    ...(args.length > 1 ? { details: { argumentCount: args.length, args: args.map(argumentSummary) } } : {}),
  }
}

/**
 * Wrap every console method while preserving the original output contract.
 * The native method always runs first; a failing asynchronous sink can never
 * break application code and is surfaced through onSinkError.
 */
export function installConsoleCapture(
  target: RuntimeConsoleTarget,
  sink: ((event: RuntimeLogEvent) => void | Promise<void>) | undefined,
  context: RuntimeConsoleCaptureContext,
): () => void {
  const originals = new Map<ConsoleMethod, RuntimeConsoleTarget[ConsoleMethod]>()
  const methods: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug']
  for (const method of methods) {
    const original = target[method]
    originals.set(method, original)
    target[method] = ((...args: unknown[]) => {
      try {
        original.apply(target, args)
      } finally {
        if (!sink && !context.emit) return
        let event: RuntimeLogEvent
        try {
          event = createRuntimeLogEvent(inputFor(method, args, context))
        } catch (error) {
          context.onSinkError?.(error)
          return
        }
        try {
          const result = (sink ?? context.emit)!(event)
          if (result && typeof (result as Promise<void>).then === 'function') {
            void (result as Promise<void>).catch(error => context.onSinkError?.(error))
          }
        } catch (error) {
          context.onSinkError?.(error)
        }
      }
    }) as RuntimeConsoleTarget[ConsoleMethod]
  }
  return () => {
    for (const method of methods) {
      const original = originals.get(method)
      if (original) target[method] = original
    }
  }
}

function chunkText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) {
    try { return new TextDecoder().decode(value) } catch { return String(value) }
  }
  return String(value ?? '')
}

function previewText(value: string, maxLength = 512): string {
  const compact = value.replace(/\s+/gu, ' ').trim()
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{20,})\b/gu, '[REDACTED:secret]')
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 14)}…[truncated]` : compact
}

function chunkDetails(stream: 'stdout' | 'stderr', value: unknown, protocol: boolean): Record<string, unknown> {
  const text = chunkText(value)
  const lines = text.split(/\r?\n/u).filter(Boolean).length
  return {
    stream,
    bytes: new TextEncoder().encode(text).byteLength,
    lines,
    ...(stream === 'stderr' || !protocol ? { preview: previewText(text) } : {}),
    ...(protocol ? { protocol: 'json-rpc' } : {}),
  }
}

/**
 * Capture an external process without copying protocol payloads into the
 * application log. Every stream chunk and lifecycle transition remains
 * represented by a structured event, while stderr gets only a bounded,
 * secret-masked preview.
 */
export function installChildProcessCapture(
  target: RuntimeChildProcessTarget,
  sink: ((event: RuntimeLogEvent) => void | Promise<void>) | undefined,
  context: RuntimeChildProcessCaptureContext,
): () => void {
  let active = true
  const emit = (input: RuntimeLogInput): void => {
    if (!active || !sink) return
    try {
      const result = sink(createRuntimeLogEvent(input))
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch(error => context.onSinkError?.(error))
      }
    } catch (error) {
      context.onSinkError?.(error)
    }
  }
  const base = {
    sessionId: context.sessionId,
    process: context.process,
    pid: context.pid ?? target.pid,
    source: context.source,
    requestId: context.requestId,
    correlationId: context.correlationId,
    runId: context.runId,
    projectId: context.projectId,
    projectSessionId: context.projectSessionId,
  }
  const captureStream = (stream: 'stdout' | 'stderr', value: unknown): void => {
    const details = chunkDetails(stream, value, Boolean(context.protocol))
    emit({
      ...base,
      sequence: context.nextSequence(),
      level: stream === 'stderr' ? 'warn' : 'debug',
      event: `child.${stream}`,
      operation: `child.${stream}`,
      message: stream === 'stderr' ? '外部子进程 stderr 输出' : '外部子进程 stdout 输出',
      details,
    })
  }
  target.stdout?.on('data', value => captureStream('stdout', value))
  target.stderr?.on('data', value => captureStream('stderr', value))
  target.on('exit', (code: number | null, signal: string | null) => {
    const succeeded = code === 0 && signal === null
    emit({
      ...base,
      sequence: context.nextSequence(),
      level: succeeded ? 'info' : 'error',
      event: 'child.exit',
      operation: 'child.exit',
      outcome: succeeded ? 'succeeded' : 'failed',
      message: `外部子进程已退出：${context.childId}`,
      details: { childId: context.childId, code, signal },
    })
  })
  target.on('close', (code: number | null, signal: string | null) => {
    emit({
      ...base,
      sequence: context.nextSequence(),
      level: code === 0 && signal === null ? 'debug' : 'warn',
      event: 'child.close',
      operation: 'child.close',
      outcome: code === 0 && signal === null ? 'succeeded' : 'failed',
      message: `外部子进程 stdio 已关闭：${context.childId}`,
      details: { childId: context.childId, code, signal },
    })
  })
  target.on('error', (error: unknown) => {
    emit({
      ...base,
      sequence: context.nextSequence(),
      level: 'error',
      event: 'child.error',
      operation: 'child.error',
      outcome: 'failed',
      message: `外部子进程错误：${context.childId}`,
      details: { childId: context.childId },
      error,
    })
  })
  return () => { active = false }
}
