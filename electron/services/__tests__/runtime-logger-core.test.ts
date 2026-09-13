import { describe, expect, it, vi } from 'vitest'

import { RuntimeLoggerCore } from '../runtime-logger-core'
import type { RuntimeLogEvent } from '../../../src/shared/runtime-log'
import type { RuntimeLogWriterLike } from '../runtime-logger-core'

function writer() {
  return {
    append: vi.fn<RuntimeLogWriterLike['append']>(async (_event: RuntimeLogEvent) => ({ persisted: true, eventId: 'event' })),
    flush: vi.fn(async () => undefined),
    status: vi.fn(() => ({
      persistenceState: 'healthy' as const,
      pendingCount: 0,
      queueDepth: 0,
      retryCount: 0,
      totalPersisted: 0,
      totalFailed: 0,
    })),
  }
}

describe('RuntimeLoggerCore', () => {
  it('persists debug and repeated events even when console level filters their display', async () => {
    const sink = writer()
    const core = new RuntimeLoggerCore({
      writer: sink,
      process: 'main',
      sessionId: 'session-a',
      consoleLevel: 'info',
      consoleSink: vi.fn(),
    })

    core.debug('test', 'debug event')
    core.info('test', 'same event')
    core.info('test', 'same event')
    await core.flush()

    expect(sink.append).toHaveBeenCalledTimes(3)
    const appended = sink.append.mock.calls as Array<[RuntimeLogEvent]>
    expect(appended.map(([event]) => event.level)).toEqual(['debug', 'info', 'info'])
    expect(appended.map(([event]) => event.sequence)).toEqual([1, 2, 3])
    expect(core.shouldDisplay('debug')).toBe(false)
    expect(core.shouldDisplay('info')).toBe(true)
    expect(core.flush).toBeDefined()
    expect(sink.flush).toHaveBeenCalledTimes(1)
  })

  it('adds operation context and exposes a mutable console threshold without changing persistence', () => {
    const sink = writer()
    const core = new RuntimeLoggerCore({ writer: sink, process: 'renderer', sessionId: 's' })

    core.error('ipc', 'request failed', { code: 'E_TEST' }, {
      requestId: 'request-a',
      correlationId: 'corr-a',
      runId: 'run-a',
      projectSessionId: 'project-session-a',
      outcome: 'failed',
      durationMs: 42,
    })
    core.setConsoleLevel('debug')

    expect(sink.append).toHaveBeenCalledTimes(1)
    expect((sink.append.mock.calls as Array<[RuntimeLogEvent]>)[0]?.[0]).toMatchObject({
      requestId: 'request-a',
      correlationId: 'corr-a',
      runId: 'run-a',
      projectSessionId: 'project-session-a',
      outcome: 'failed',
      durationMs: 42,
    })
    expect(core.consoleLevel()).toBe('debug')
    expect(core.shouldDisplay('debug')).toBe(true)
  })
})
