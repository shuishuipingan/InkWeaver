import {
  createRuntimeLogEvent,
  type RuntimeLogEvent,
  type RuntimeLogInput,
  type RuntimeLogLevel,
  type RuntimeLogOutcome,
  type RuntimeLogProcess,
} from '../../src/shared/runtime-log'
import type { RuntimeLogWriterStatus } from './runtime-log-writer'

export interface RuntimeLogWriterLike {
  append(event: RuntimeLogEvent): Promise<{ persisted: boolean; eventId: string; serverSequence?: number }>
  flush(): Promise<void>
  status(): RuntimeLogWriterStatus
}

export interface RuntimeLogContext {
  occurredAt?: string | Date
  monotonicMs?: number
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  chapterNumber?: number
  operation?: string
  outcome?: RuntimeLogOutcome
  durationMs?: number
  error?: unknown
}

export interface RuntimeLoggerCoreOptions {
  writer: RuntimeLogWriterLike
  process: RuntimeLogProcess
  sessionId: string
  pid?: number
  nextSequence?: () => number
  consoleLevel?: RuntimeLogLevel
  consoleSink?: (event: RuntimeLogEvent) => void
  onPersistenceError?: (error: unknown, event: RuntimeLogEvent) => void
}

const LEVEL_ORDER: Record<RuntimeLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
}

/**
 * Process-independent logger facade. Persistence is unconditional; the
 * console threshold only controls mirroring to stdout/DevTools.
 */
export class RuntimeLoggerCore {
  private sequence = 0
  private level: RuntimeLogLevel
  private readonly writer: RuntimeLogWriterLike
  private readonly options: RuntimeLoggerCoreOptions

  constructor(options: RuntimeLoggerCoreOptions) {
    this.options = options
    this.writer = options.writer
    this.level = options.consoleLevel ?? 'info'
  }

  debug(source: string, message: string, details?: unknown, context?: RuntimeLogContext): RuntimeLogEvent {
    return this.emit('debug', source, message, details, context)
  }

  info(source: string, message: string, details?: unknown, context?: RuntimeLogContext): RuntimeLogEvent {
    return this.emit('info', source, message, details, context)
  }

  warn(source: string, message: string, details?: unknown, context?: RuntimeLogContext): RuntimeLogEvent {
    return this.emit('warn', source, message, details, context)
  }

  error(source: string, message: string, details?: unknown, context?: RuntimeLogContext): RuntimeLogEvent {
    return this.emit('error', source, message, details, context)
  }

  fatal(source: string, message: string, details?: unknown, context?: RuntimeLogContext): RuntimeLogEvent {
    return this.emit('fatal', source, message, details, context)
  }

  setConsoleLevel(level: RuntimeLogLevel): void {
    this.level = level
  }

  consoleLevel(): RuntimeLogLevel {
    return this.level
  }

  shouldDisplay(level: RuntimeLogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level]
  }

  async flush(): Promise<void> {
    await this.writer.flush()
  }

  status(): RuntimeLogWriterStatus {
    return this.writer.status()
  }

  private emit(
    level: RuntimeLogLevel,
    source: string,
    message: string,
    details?: unknown,
    context: RuntimeLogContext = {},
  ): RuntimeLogEvent {
    const input: RuntimeLogInput = {
      sequence: this.options.nextSequence?.() ?? ++this.sequence,
      sessionId: this.options.sessionId,
      process: this.options.process,
      ...(this.options.pid !== undefined ? { pid: this.options.pid } : {}),
      level,
      source,
      event: context.operation ?? `${source}.message`,
      message,
      ...(context.occurredAt !== undefined ? { occurredAt: context.occurredAt } : {}),
      ...(context.monotonicMs !== undefined ? { monotonicMs: context.monotonicMs } : {}),
      ...(context.requestId ? { requestId: context.requestId } : {}),
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
      ...(context.runId ? { runId: context.runId } : {}),
      ...(context.projectId ? { projectId: context.projectId } : {}),
      ...(context.projectSessionId ? { projectSessionId: context.projectSessionId } : {}),
      ...(context.chapterNumber !== undefined ? { chapterNumber: context.chapterNumber } : {}),
      ...(context.operation ? { operation: context.operation } : {}),
      ...(context.outcome ? { outcome: context.outcome } : {}),
      ...(context.durationMs !== undefined ? { durationMs: context.durationMs } : {}),
      ...(details !== undefined ? { details } : {}),
      ...(context.error !== undefined ? { error: context.error } : {}),
    }
    const event = createRuntimeLogEvent(input)
    if (this.shouldDisplay(level)) {
      try {
        this.options.consoleSink?.(event)
      } catch { /* console output must never break application code */ }
    }
    try {
      const persistence = this.writer.append(event)
      void persistence.then(result => {
        if (!result.persisted) this.options.onPersistenceError?.(new Error('runtime log append was not persisted'), event)
      }).catch(error => this.options.onPersistenceError?.(error, event))
    } catch (error) {
      this.options.onPersistenceError?.(error, event)
    }
    return event
  }
}
