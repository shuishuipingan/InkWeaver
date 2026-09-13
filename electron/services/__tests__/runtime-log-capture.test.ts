import { describe, expect, it, vi } from 'vitest'

import { installChildProcessCapture, installConsoleCapture } from '../runtime-log-capture'

describe('runtime console capture', () => {
  it('captures log/info/warn/error/debug without changing the original console contract', () => {
    const target = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }
    const originalLog = target.log
    const originalError = target.error
    const events: Array<Record<string, unknown>> = []
    const dispose = installConsoleCapture(target, event => { events.push(event as unknown as Record<string, unknown>) }, {
      sessionId: 'session-a',
      process: 'main',
      source: 'console',
      nextSequence: (() => { let sequence = 0; return () => ++sequence })(),
    })

    target.log('log', { value: 1 })
    target.info('info')
    target.warn('warn')
    target.error(new Error('error'))
    target.debug('debug')

    expect(events.map(event => event.level)).toEqual(['info', 'info', 'warn', 'error', 'debug'])
    expect(events.map(event => event.sequence)).toEqual([1, 2, 3, 4, 5])
    expect(events[3]).toMatchObject({ message: 'Error: error', outcome: 'failed' })
    expect(originalLog).toHaveBeenCalledWith('log', { value: 1 })
    expect(originalError).toHaveBeenCalledWith(expect.any(Error))

    dispose()
    target.warn('after-dispose')
    expect(events).toHaveLength(5)
  })

  it('keeps console output alive when the sink fails and marks the capture failure', () => {
    const target = {
      log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    }
    const originalInfo = target.info
    const captureErrors: unknown[] = []
    const dispose = installConsoleCapture(target, () => { throw new Error('writer offline') }, {
      sessionId: 'session-a',
      process: 'renderer',
      source: 'console',
      nextSequence: () => 1,
      onSinkError: error => captureErrors.push(error),
    })

    expect(() => target.info('still visible')).not.toThrow()
    expect(originalInfo).toHaveBeenCalledWith('still visible')
    expect(captureErrors).toHaveLength(1)
    dispose()
  })

  it('still records a console event when the native output itself throws', () => {
    const target = {
      log: vi.fn(), info: vi.fn<(...args: unknown[]) => unknown>(() => { throw new Error('EPIPE') }), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    }
    const events: unknown[] = []
    const dispose = installConsoleCapture(target, event => { events.push(event) }, {
      sessionId: 'session-a', process: 'main', nextSequence: () => events.length + 1,
    })

    expect(() => target.info('pipe closed')).toThrow('EPIPE')
    expect(events).toHaveLength(1)
    dispose()
  })

  it('captures child stdout/stderr and lifecycle outcomes as metadata events', () => {
    const listeners = new Map<string, (value?: unknown, value2?: unknown) => void>()
    const child = {
      pid: 4242,
      stdout: { on: vi.fn((event: string, listener: (value: unknown) => void) => listeners.set(`stdout:${event}`, listener)) },
      stderr: { on: vi.fn((event: string, listener: (value: unknown) => void) => listeners.set(`stderr:${event}`, listener)) },
      on: vi.fn((event: string, listener: (value?: unknown, value2?: unknown) => void) => listeners.set(event, listener)),
    }
    const events: Array<Record<string, unknown>> = []

    installChildProcessCapture(child, event => { events.push(event as unknown as Record<string, unknown>) }, {
      sessionId: 'session-a',
      process: 'mcp',
      source: 'mcp:test-server',
      childId: 'test-server',
      nextSequence: (() => { let sequence = 0; return () => ++sequence })(),
    })

    listeners.get('stdout:data')?.(Buffer.from('{"jsonrpc":"2.0"}\n'))
    listeners.get('stderr:data')?.(Buffer.from('server warning\n'))
    listeners.get('exit')?.(0, null)
    listeners.get('error')?.(new Error('spawn failed'))

    expect(events.map(event => event.event)).toEqual([
      'child.stdout', 'child.stderr', 'child.exit', 'child.error',
    ])
    expect(events[0]).toMatchObject({ process: 'mcp', pid: 4242 })
    expect(events[0]?.details).toMatchObject({ stream: 'stdout', bytes: 18 })
    expect(events[1]?.details).toMatchObject({ stream: 'stderr', preview: 'server warning' })
    expect(events[2]).toMatchObject({ outcome: 'succeeded' })
    expect(events[3]).toMatchObject({ outcome: 'failed', error: { message: 'spawn failed' } })
  })

  it('summarizes long console strings instead of persisting model-sized payloads', () => {
    const target = {
      log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    }
    const events: Array<Record<string, unknown>> = []
    const dispose = installConsoleCapture(target, event => { events.push(event as unknown as Record<string, unknown>) }, {
      sessionId: 'session-a', process: 'renderer', nextSequence: () => events.length + 1,
    })

    target.error('x'.repeat(6_000))

    expect(events[0]?.message).toBe('[string:6000]')
    dispose()
  })
})
