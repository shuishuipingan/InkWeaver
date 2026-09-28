import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  setActiveProjectSessionContext,
} from '../../shared/project-session-context'
import { ipc } from '../ipc-client'

const invoke = vi.fn()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const projectSession = {
  projectId: 'project-A',
  leaseId: 'lease-A',
  projectPath: 'C:/projects/A',
}

beforeEach(() => {
  invoke.mockReset()
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
  setActiveProjectSessionContext({
    projectId: 'project-A',
    leaseId: 'lease-A',
    projectPath: 'C:/projects/A',
  })
})

afterEach(() => {
  setActiveProjectSessionContext(null)
  Reflect.deleteProperty(globalThis, 'window')
})

describe('project-scoped IPC session transport', () => {
  it('appends the frozen active session to a project database request', async () => {
    invoke.mockResolvedValue([])

    await ipc.invoke('db:blueprint-get-all', 'C:/projects/A')

    expect(invoke).toHaveBeenCalledWith(
      'db:blueprint-get-all',
      'C:/projects/A',
      {
        projectId: 'project-A',
        leaseId: 'lease-A',
        projectPath: 'C:/projects/A',
      },
    )
  })

  it('allows a capability-grant filesystem request without an active project session', async () => {
    invoke.mockResolvedValue({ success: true })
    setActiveProjectSessionContext(null)

    await ipc.invoke('fs:grant-write-file', 'grant-export-1', 'chapter.txt', 'content')

    expect(invoke).toHaveBeenCalledWith(
      'fs:grant-write-file',
      'grant-export-1',
      'chapter.txt',
      'content',
    )
  })

  it('silently skips a passive project query when no project session is active', async () => {
    invoke.mockResolvedValue([])
    setActiveProjectSessionContext(null)

    await expect(ipc.invokeBackground('db:draft-list-all', projectSession.projectPath))
      .resolves.toBeUndefined()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('silently cancels a passive query rejected after switching projects', async () => {
    const pending = deferred<unknown>()
    invoke.mockReturnValue(pending.promise)

    const query = ipc.invokeBackgroundWithProjectSession(
      projectSession,
      'db:draft-list-all',
      projectSession.projectPath,
    )
    setActiveProjectSessionContext({
      projectId: 'project-B',
      leaseId: 'lease-B',
      projectPath: 'C:/projects/B',
    })
    pending.reject(new Error('project session lease expired'))

    await expect(query).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith(
      'db:draft-list-all',
      projectSession.projectPath,
      projectSession,
    )
  })

  it('silently discards a passive query result when the project closes in flight', async () => {
    const pending = deferred<unknown>()
    invoke.mockReturnValue(pending.promise)

    const query = ipc.invokeBackgroundWithProjectSession(
      projectSession,
      'db:draft-list-all',
      projectSession.projectPath,
    )
    setActiveProjectSessionContext(null)
    pending.resolve([])

    await expect(query).resolves.toBeUndefined()
  })

  it('preserves failures from explicit project saves', async () => {
    const saveError = new Error('disk full')
    invoke.mockRejectedValue(saveError)

    await expect(ipc.invokeWithProjectSession(
      projectSession,
      'project:save',
      'project-A',
      { id: 'project-A' },
      projectSession.projectPath,
    )).rejects.toBe(saveError)
  })

  it('rejects writes from the passive background-query boundary', async () => {
    const invokeBackground = ipc.invokeBackgroundWithProjectSession as unknown as (
      context: typeof projectSession,
      channel: string,
      ...args: unknown[]
    ) => Promise<unknown>

    await expect(invokeBackground(
      projectSession,
      'project:save',
      'project-A',
      { id: 'project-A' },
      projectSession.projectPath,
    )).rejects.toThrow(/project:save/)

    expect(invoke).not.toHaveBeenCalled()
  })
})
