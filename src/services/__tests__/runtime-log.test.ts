import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(payload: unknown) => Promise<unknown>>(async () => ({ success: true })),
  send: vi.fn<(channel: string, payload: unknown) => void>(),
}))

vi.mock('../ipc-client', () => ({
  ipc: {
    isElectron: true,
    invoke: mocks.invoke,
    send: mocks.send,
  },
}))

import {
  configureRuntimeLogTestTransport,
  flushRuntimeLogQueue,
  installRuntimeLogConsoleCapture,
  installRuntimeLogShutdownFlush,
  resetRuntimeLogForTests,
  runtimeLog,
} from '../runtime-log'

describe('renderer runtime log transport', () => {
  let restoreConsole: (() => void) | undefined
  let restoreWindow: (() => void) | undefined

  beforeEach(() => {
    mocks.invoke.mockClear()
    mocks.send.mockClear()
    configureRuntimeLogTestTransport({ invoke: mocks.invoke, send: mocks.send })
  })

  afterEach(async () => {
    restoreConsole?.()
    restoreWindow?.()
    restoreConsole = undefined
    restoreWindow = undefined
    await flushRuntimeLogQueue()
    resetRuntimeLogForTests()
  })

  it('flushes every event in order without a fixed queue drop', async () => {
    for (let index = 0; index < 250; index += 1) runtimeLog.info('test', `event-${index}`)
    await flushRuntimeLogQueue()

    const entries = mocks.invoke.mock.calls.flatMap(([payload]) => {
      const value = payload as { batch?: Array<{ message: string; sequence?: number }> }
      return value.batch ?? []
    })
    expect(entries).toHaveLength(250)
    expect(entries.map(entry => entry.message)).toEqual(Array.from({ length: 250 }, (_v, i) => `event-${i}`))
    expect(entries.map(entry => entry.sequence)).toEqual(Array.from({ length: 250 }, (_v, i) => i + 1))
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('keeps a failed batch queued and retries it instead of falling back as if persisted', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('transport offline')).mockResolvedValue({ success: true })
    runtimeLog.error('test', 'must retry')
    await flushRuntimeLogQueue()
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    await flushRuntimeLogQueue()
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
    expect((mocks.invoke.mock.calls[1]?.[0] as { batch: Array<{ message: string }> }).batch[0]?.message).toBe('must retry')
    expect((mocks.invoke.mock.calls[1]?.[0] as { batch: Array<{ event?: string }> }).batch)
      .toEqual(expect.arrayContaining([expect.objectContaining({ event: 'log.transport.failed' })]))
  })

  it('sends the unacknowledged queue through the one-way channel during shutdown', async () => {
    runtimeLog.warn('test', 'shutdown event')
    await flushRuntimeLogQueue({ shutdown: true })
    expect(mocks.send).toHaveBeenCalledWith('runtime:log-batch', expect.objectContaining({
      batch: [expect.objectContaining({ message: 'shutdown event' })],
    }))
  })

  it('captures log/info/warn/error/debug calls while preserving native console output', async () => {
    const native = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }
    restoreConsole = installRuntimeLogConsoleCapture(native)

    native.log('log message')
    native.info('info message')
    native.warn('warn message')
    native.error('error message')
    native.debug('debug message')
    await flushRuntimeLogQueue()

    const messages = mocks.invoke.mock.calls
      .flatMap(([payload]) => (payload as { batch: Array<{ message: string }> }).batch)
      .map(entry => entry.message)
    expect(messages).toEqual([
      'log message',
      'info message',
      'warn message',
      'error message',
      'debug message',
    ])
  })

  it('flushes queued events through the one-way channel before the page unloads', async () => {
    const listeners = new Map<string, () => void>()
    const page = {
      addEventListener: vi.fn((type: string, listener: () => void) => { listeners.set(type, listener) }),
      removeEventListener: vi.fn((type: string) => { listeners.delete(type) }),
    }
    restoreWindow = installRuntimeLogShutdownFlush(page)
    runtimeLog.info('renderer', 'before unload')
    listeners.get('beforeunload')?.()
    expect(mocks.send).toHaveBeenCalledWith('runtime:log-batch', expect.objectContaining({
      batch: [expect.objectContaining({ message: 'before unload' })],
    }))
  })

  it('records a renderer console event even when native output throws', async () => {
    const native = {
      log: vi.fn(),
      info: vi.fn<(...args: unknown[]) => unknown>(() => { throw new Error('EPIPE') }),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }
    restoreConsole = installRuntimeLogConsoleCapture(native)
    expect(() => native.info('pipe closed')).toThrow('EPIPE')
    await flushRuntimeLogQueue()
    expect(mocks.invoke.mock.calls.flatMap(([payload]) => (
      (payload as { batch: Array<{ message: string }> }).batch
    ))).toEqual([expect.objectContaining({ message: 'pipe closed' })])
  })

  it('returns the queued event identity so UI projections can de-duplicate persisted logs', async () => {
    const eventId = runtimeLog.info('workflow-ui', 'persisted once')
    expect(eventId).toEqual(expect.any(String))
    await flushRuntimeLogQueue()
    expect(mocks.invoke.mock.calls.flatMap(([payload]) => (
      (payload as { batch: Array<{ eventId?: string }> }).batch
    ))).toEqual([expect.objectContaining({ eventId })])
  })
})
