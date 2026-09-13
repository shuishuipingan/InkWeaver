import { afterEach, describe, expect, it, vi } from 'vitest'

const mirrorConsoleToFile = vi.hoisted(() => vi.fn())
vi.mock('../../services/runtime-logger', () => ({ mirrorConsoleToFile }))

import { safeConsole } from '../safe-console'

describe('safe console boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not schedule a second asynchronous file mirror', async () => {
    const nativeLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    safeConsole.log('one', { value: 1 })
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(nativeLog).toHaveBeenCalledWith('one', { value: 1 })
    expect(mirrorConsoleToFile).not.toHaveBeenCalled()
  })
})
