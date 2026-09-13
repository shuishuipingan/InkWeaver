import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ipc } from '../ipc-client'
import { runtimeLog } from '../runtime-log'

describe('runtime log IPC transport', () => {
  const invoke = vi.fn(async () => ({ success: true }))
  const debug = vi.spyOn(runtimeLog, 'debug')
  const error = vi.spyOn(runtimeLog, 'error')

  beforeEach(() => {
    invoke.mockClear()
    debug.mockClear()
    error.mockClear()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        velaAPI: {
          invoke,
          on: () => () => {},
          once: () => {},
          send: () => {},
          setZoomLevel: () => {},
          setZoomFactor: () => {},
          getZoomLevel: () => 0,
        },
      },
    })
  })

  it('does not recursively log the runtime log transport itself', async () => {
    await ipc.invoke('runtime:log', { batch: [{ message: 'one' }] } as never)

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(debug).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
