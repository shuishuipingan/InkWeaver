/**
 * Shared, JSON-safe runtime log contract.
 *
 * This module intentionally has no Electron, filesystem, or UI dependency so
 * the same validation/redaction rules can be used by the main process,
 * renderer, workers, and tests.
 */

export const RUNTIME_LOG_SCHEMA_VERSION = 1 as const

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type RuntimeLogProcess = 'main' | 'renderer' | 'worker' | 'mcp' | 'script'
export type RuntimeLogOutcome =
  | 'started'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rejected'
  | 'skipped'

export interface RuntimeLogError {
  name?: string
  message: string
  code?: string
  stack?: string
  cause?: string
}

export interface RuntimeLogRedaction {
  applied: boolean
  fields?: string[]
  truncated?: boolean
}

export interface RuntimeLogEvent {
  schemaVersion: typeof RUNTIME_LOG_SCHEMA_VERSION
  eventId: string
  occurredAt: string
  monotonicMs?: number
  sequence: number
  serverSequence?: number
  sessionId: string
  process: RuntimeLogProcess
  pid?: number
  level: RuntimeLogLevel
  source: string
  event: string
  message: string
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  chapterNumber?: number
  operation?: string
  outcome?: RuntimeLogOutcome
  durationMs?: number
  details?: Record<string, unknown>
  error?: RuntimeLogError
  redaction?: RuntimeLogRedaction
}

export interface RuntimeLogInput {
  eventId?: string
  occurredAt?: string | Date
  monotonicMs?: number
  sequence: number
  serverSequence?: number
  sessionId: string
  process: RuntimeLogProcess
  pid?: number
  level: RuntimeLogLevel
  source: string
  event: string
  message: string
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  chapterNumber?: number
  operation?: string
  outcome?: RuntimeLogOutcome
  durationMs?: number
  details?: unknown
  error?: unknown
}

/** Renderer/worker transport payload; the main process supplies trusted process identity. */
export interface RuntimeLogTransportEntry {
  eventId?: string
  occurredAt?: string
  monotonicMs?: number
  sequence?: number
  sessionId?: string
  level?: RuntimeLogLevel
  source?: string
  event?: string
  message?: string
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  chapterNumber?: number
  operation?: string
  outcome?: RuntimeLogOutcome
  durationMs?: number
  details?: unknown
  error?: unknown
}

export interface RuntimeLogBatchPayload {
  batch: RuntimeLogTransportEntry[]
  /** Compatibility field; new transports must report a gap event instead of dropping. */
  dropped?: number
}

export interface RuntimeLogPageQuery {
  limit?: number
  cursor?: string
  level?: RuntimeLogLevel
  process?: RuntimeLogProcess
  source?: string
  event?: string
  runId?: string
  projectSessionId?: string
  correlationId?: string
  from?: string
  to?: string
}

export type RuntimeLogPersistenceState = 'healthy' | 'pending' | 'emergency-spool' | 'degraded'

export interface RuntimeLogStatus {
  persistenceState: RuntimeLogPersistenceState
  pendingCount: number
  queueDepth: number
  retryCount: number
  segment?: string
  lastError?: string
  totalPersisted: number
  totalFailed: number
}

export interface RuntimeLogPage {
  events: RuntimeLogEvent[]
  nextCursor?: string
  complete: boolean
  status: RuntimeLogStatus
}

export interface RuntimeLogDetailsOptions {
  maxDepth?: number
  maxBytes?: number
}

export interface NormalizedRuntimeLogDetails {
  value: Record<string, unknown>
  redaction: RuntimeLogRedaction
}

interface NormalizedRuntimeLogMessage {
  value: string
  redacted: boolean
  truncated: boolean
}

const LEVELS = new Set<RuntimeLogLevel>(['debug', 'info', 'warn', 'error', 'fatal'])
const PROCESSES = new Set<RuntimeLogProcess>(['main', 'renderer', 'worker', 'mcp', 'script'])
const OUTCOMES = new Set<RuntimeLogOutcome>([
  'started', 'succeeded', 'failed', 'cancelled', 'rejected', 'skipped',
])
const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'authorization', 'cookie', 'password', 'secret',
  'token', 'access_token', 'refresh_token', 'privatekey', 'private_key',
])
const PATH_SHAPED_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/[^/]+(?:[\\/][^/]+)+)/u
const SECRET_SHAPED_PATTERN = /^(?:bearer\s+|sk-[A-Za-z0-9]|gh[pousr]_[A-Za-z0-9]|AIza[A-Za-z0-9_-]{20,})/u

function redactInlineSecrets(value: string): { text: string; changed: boolean } {
  let text = value
  let changed = false
  const replace = (pattern: RegExp, replacement: string): void => {
    const next = text.replace(pattern, replacement)
    if (next !== text) changed = true
    text = next
  }
  replace(/(https?:\/\/[^/\s:@]+:)[^@\s]+@/giu, '$1[REDACTED]@')
  replace(/(\b(?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*)[^\s,&]+/giu, '$1[REDACTED]')
  replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]')
  replace(/\b(?:sk-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{20,})\b/gu, '[REDACTED:secret]')
  return { text, changed }
}

function randomEventId(): string {
  // crypto.randomUUID is available in both modern Chromium and Node. Keep a
  // deterministic fallback for older test runners and restricted workers.
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch { /* fall through */ }
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? String(value) : serialized
  } catch {
    return String(value)
  }
}

function errorValue(value: unknown): RuntimeLogError | undefined {
  if (value === undefined || value === null) return undefined
  if (value instanceof Error) {
    const message = redactInlineSecrets(value.message || String(value)).text
    const stack = value.stack ? redactInlineSecrets(value.stack).text : undefined
    return {
      name: value.name || undefined,
      message,
      stack,
      ...(value.cause !== undefined ? { cause: redactInlineSecrets(stringValue(value.cause)).text } : {}),
    }
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const rawMessage = typeof record.message === 'string' ? record.message : stringValue(value)
    const message = redactInlineSecrets(rawMessage).text
    const stack = typeof record.stack === 'string' ? redactInlineSecrets(record.stack).text : undefined
    return {
      ...(typeof record.name === 'string' ? { name: record.name } : {}),
      message,
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
      ...(stack ? { stack } : {}),
      ...(record.cause !== undefined ? { cause: redactInlineSecrets(stringValue(record.cause)).text } : {}),
    }
  }
  return { message: redactInlineSecrets(stringValue(value)).text }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function clipString(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value
  let result = value.slice(0, Math.max(0, maxBytes - 18))
  while (byteLength(`${result}…[truncated]`) > maxBytes && result.length > 0) result = result.slice(0, -1)
  return `${result}…[truncated]`
}

function normalizeRuntimeLogMessage(value: string): NormalizedRuntimeLogMessage {
  const inline = redactInlineSecrets(value)
  const clipped = clipString(inline.text, 2_048)
  return {
    value: clipped,
    redacted: inline.changed,
    truncated: clipped !== inline.text,
  }
}

/**
 * Convert arbitrary details into a JSON-safe object. Sensitive keys and path
 * shaped values are replaced, cycles/depth are marked, and oversized strings
 * are clipped with an explicit redaction flag.
 */
export function normalizeRuntimeLogDetails(
  input: unknown,
  options: RuntimeLogDetailsOptions = {},
): NormalizedRuntimeLogDetails {
  const maxDepth = Math.max(0, Math.trunc(options.maxDepth ?? 6))
  const maxBytes = Math.max(128, Math.trunc(options.maxBytes ?? 32_768))
  const fields = new Set<string>()
  const seen = new WeakSet<object>()
  let truncated = false

  const sanitize = (value: unknown, keyPath: string, depth: number): unknown => {
    if (depth > maxDepth) {
      truncated = true
      fields.add(keyPath || '$')
      return '[REDACTED:depth-limit]'
    }
    if (typeof value === 'string') {
      const inline = redactInlineSecrets(value)
      if (inline.changed) fields.add(keyPath || '$')
      const safeValue = inline.text
      if (PATH_SHAPED_PATTERN.test(safeValue)) {
        fields.add(keyPath || '$')
        return '[REDACTED:path]'
      }
      if (SECRET_SHAPED_PATTERN.test(safeValue)) {
        fields.add(keyPath || '$')
        return '[REDACTED:secret]'
      }
      const clipped = clipString(safeValue, Math.min(maxBytes, 8_192))
      if (clipped !== safeValue) {
        truncated = true
        fields.add(keyPath || '$')
      }
      return clipped
    }
    if (typeof value === 'bigint') return `${value}n`
    if (typeof value !== 'object' || value === null) {
      if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
      if (typeof value === 'function' || typeof value === 'symbol') return String(value)
      return value
    }
    if (seen.has(value)) {
      truncated = true
      fields.add(keyPath || '$')
      return '[REDACTED:cycle]'
    }
    seen.add(value)
    if (Array.isArray(value)) {
      return value.map((item, index) => sanitize(item, `${keyPath}[${index}]`, depth + 1))
    }
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = keyPath ? `${keyPath}.${key}` : key
      if (SENSITIVE_KEYS.has(key.toLowerCase().replaceAll('-', '_'))) {
        fields.add(childPath)
        output[key] = '[REDACTED]'
      } else {
        output[key] = sanitize(child, childPath, depth + 1)
      }
    }
    return output
  }

  const result = sanitize(input, '', 0)
  let objectValue: Record<string, unknown>
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    objectValue = result as Record<string, unknown>
  } else {
    objectValue = { value: result }
  }

  // Keep the return value an object and enforce the byte ceiling without
  // replacing already-redacted fields (which would hide useful diagnostics).
  let serialized = JSON.stringify(objectValue)
  if (byteLength(serialized) > maxBytes) {
    truncated = true
    fields.add('$')
    const compact: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(objectValue)) {
      const remaining = Math.max(32, Math.floor(maxBytes / Math.max(1, Object.keys(objectValue).length)))
      compact[key] = typeof value === 'string' ? clipString(value, remaining) : value
      serialized = JSON.stringify(compact)
      if (byteLength(serialized) > maxBytes) compact[key] = '[REDACTED:truncated]'
    }
    objectValue = compact
    serialized = JSON.stringify(objectValue)
    if (byteLength(serialized) > maxBytes) objectValue = { value: '[REDACTED:truncated]' }
  }

  return {
    value: objectValue,
    redaction: {
      applied: fields.size > 0,
      ...(fields.size > 0 ? { fields: [...fields].sort() } : {}),
      ...(truncated ? { truncated: true } : {}),
    },
  }
}

export function createRuntimeLogEvent(input: RuntimeLogInput): RuntimeLogEvent {
  const normalizedDetails = input.details === undefined
    ? undefined
    : normalizeRuntimeLogDetails(input.details)
  const error = errorValue(input.error)
  const normalizedMessage = normalizeRuntimeLogMessage(input.message)
  const occurredAt = input.occurredAt instanceof Date
    ? input.occurredAt.toISOString()
    : input.occurredAt ?? new Date().toISOString()
  const outcome = input.outcome ?? (error ? 'failed' : undefined)
  const event: RuntimeLogEvent = {
    schemaVersion: RUNTIME_LOG_SCHEMA_VERSION,
    eventId: input.eventId ?? randomEventId(),
    occurredAt,
    sequence: input.sequence,
    sessionId: input.sessionId,
    process: input.process,
    level: input.level,
    source: input.source,
    event: input.event,
    message: normalizedMessage.value,
    ...(input.monotonicMs !== undefined ? { monotonicMs: input.monotonicMs } : {}),
    ...(input.serverSequence !== undefined ? { serverSequence: input.serverSequence } : {}),
    ...(input.pid !== undefined ? { pid: input.pid } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.projectSessionId ? { projectSessionId: input.projectSessionId } : {}),
    ...(input.chapterNumber !== undefined ? { chapterNumber: input.chapterNumber } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(outcome ? { outcome } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(normalizedDetails ? { details: normalizedDetails.value } : {}),
    ...(error ? { error } : {}),
    ...((normalizedDetails?.redaction.applied
      || normalizedDetails?.redaction.truncated
      || normalizedMessage.redacted
      || normalizedMessage.truncated)
      ? {
          redaction: {
            applied: Boolean(normalizedDetails?.redaction.applied || normalizedMessage.redacted || normalizedMessage.truncated),
            fields: [
              ...(normalizedDetails?.redaction.fields ?? []),
              ...(normalizedMessage.redacted || normalizedMessage.truncated ? ['message'] : []),
            ].filter((field, index, fields) => fields.indexOf(field) === index).sort(),
            ...(normalizedDetails?.redaction.truncated || normalizedMessage.truncated ? { truncated: true } : {}),
          },
        }
      : {}),
  }
  return event
}

export function isRuntimeLogEvent(value: unknown): value is RuntimeLogEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== RUNTIME_LOG_SCHEMA_VERSION
    || typeof record.eventId !== 'string'
    || typeof record.occurredAt !== 'string'
    || !Number.isSafeInteger(record.sequence) || (record.sequence as number) < 0
    || typeof record.sessionId !== 'string'
    || !PROCESSES.has(record.process as RuntimeLogProcess)
    || !LEVELS.has(record.level as RuntimeLogLevel)
    || typeof record.source !== 'string'
    || typeof record.event !== 'string'
    || typeof record.message !== 'string') return false
  if (record.details !== undefined && (
    !record.details || typeof record.details !== 'object' || Array.isArray(record.details)
  )) return false
  if (record.outcome !== undefined && !OUTCOMES.has(record.outcome as RuntimeLogOutcome)) return false
  if (record.error !== undefined && (
    !record.error || typeof record.error !== 'object' || Array.isArray(record.error)
    || typeof (record.error as Record<string, unknown>).message !== 'string'
  )) return false
  return true
}
