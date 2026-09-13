import { describe, expect, it } from 'vitest'

import {
  RUNTIME_LOG_SCHEMA_VERSION,
  createRuntimeLogEvent,
  isRuntimeLogEvent,
  normalizeRuntimeLogDetails,
} from '../runtime-log'

describe('runtime log event contract', () => {
  it('creates a JSON-safe event with stable identity and correlation fields', () => {
    const event = createRuntimeLogEvent({
      sequence: 7,
      sessionId: 'session-a',
      process: 'renderer',
      level: 'error',
      source: 'project-store',
      event: 'project.save.failed',
      message: '项目保存失败',
      requestId: 'request-a',
      runId: 'run-a',
      projectSessionId: 'project-session-a',
      details: { projectPath: 'C:\\Users\\author\\book', attempts: 2 },
      error: new Error('secret-provider-error'),
    })

    expect(event).toMatchObject({
      schemaVersion: RUNTIME_LOG_SCHEMA_VERSION,
      sequence: 7,
      sessionId: 'session-a',
      process: 'renderer',
      level: 'error',
      source: 'project-store',
      event: 'project.save.failed',
      requestId: 'request-a',
      runId: 'run-a',
      projectSessionId: 'project-session-a',
      outcome: 'failed',
      error: { message: 'secret-provider-error' },
    })
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(event.error?.stack).toContain('Error: secret-provider-error')
    expect(JSON.parse(JSON.stringify(event))).toEqual(event)
    expect(event.details?.projectPath).toBe('[REDACTED:path]')
  })

  it('normalizes cyclic, deep, and oversized details without throwing or silently hiding truncation', () => {
    const cyclic: Record<string, unknown> = { secret: 'token-value', nested: {} }
    cyclic.self = cyclic
    const normalized = normalizeRuntimeLogDetails(cyclic, { maxDepth: 2, maxBytes: 120 })

    expect(normalized.value).toMatchObject({ secret: '[REDACTED]' })
    expect(normalized.redaction.applied).toBe(true)
    expect(normalized.redaction.truncated).toBe(true)
    expect(normalized.redaction.fields).toEqual(expect.arrayContaining(['secret', 'self']))
    expect(JSON.stringify(normalized.value).length).toBeLessThanOrEqual(120)
  })

  it('redacts inline credentials from diagnostic strings instead of only matching whole-value secrets', () => {
    const normalized = normalizeRuntimeLogDetails({
      providerError: 'request failed https://alice:super-secret@example.invalid/v1?api_key=sk-inline token=token-value',
    })

    const serialized = JSON.stringify(normalized.value)
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('sk-inline')
    expect(serialized).not.toContain('token-value')
    expect(normalized.redaction.applied).toBe(true)
  })

  it('bounds direct event messages and records that the message was redacted', () => {
    const event = createRuntimeLogEvent({
      sequence: 2,
      sessionId: 'session-a',
      process: 'main',
      level: 'error',
      source: 'test',
      event: 'test.long-message',
      message: `prefix token=inline-secret ${'x'.repeat(6_000)}`,
    })

    expect(event.message.length).toBeLessThanOrEqual(2_048)
    expect(event.message).not.toContain('inline-secret')
    expect(event.redaction?.fields).toContain('message')
    expect(event.redaction?.truncated).toBe(true)
  })

  it('validates the closed event shape and rejects untrusted values', () => {
    const valid = createRuntimeLogEvent({
      sequence: 1,
      sessionId: 's',
      process: 'main',
      level: 'info',
      source: 'runtime',
      event: 'runtime.started',
      message: 'started',
    })
    expect(isRuntimeLogEvent(valid)).toBe(true)
    expect(isRuntimeLogEvent({ ...valid, level: 'verbose' })).toBe(false)
    expect(isRuntimeLogEvent({ ...valid, sequence: -1 })).toBe(false)
    expect(isRuntimeLogEvent({ ...valid, details: 'raw details' })).toBe(false)
  })
})
