import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeWithProjectSession: vi.fn(),
}))

vi.mock('../../ipc-client', () => ({
  ipc: {
    isElectron: true,
    invoke: mocks.invoke,
    invokeWithProjectSession: mocks.invokeWithProjectSession,
  },
}))

import { skillRegistry } from '../skill-registry'

describe('independently installable writing skills', () => {
  beforeEach(() => {
    skillRegistry.clear()
    mocks.invoke.mockReset()
    mocks.invokeWithProjectSession.mockReset()
    mocks.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'skills:list-user') return []
      if (channel === 'skills:install-user' || channel === 'skills:remove-user') return { success: true }
      return []
    })
  })

  it('validates the manifest before installing and reloads the user registry', async () => {
    const content = `---
name: scene-craft
description: Build a scene.
stage: drafting
---
Write the scene.`

    await expect(skillRegistry.installUserSkill(content)).resolves.toMatchObject({
      metadata: { name: 'scene-craft', stages: ['drafting'] },
    })
    expect(mocks.invoke).toHaveBeenCalledWith('skills:install-user', 'scene-craft', content)
    expect(mocks.invoke).toHaveBeenCalledWith('skills:list-user')
  })

  it('rejects malformed or unsafe packages and never sends them to the main process', async () => {
    await expect(skillRegistry.installUserSkill('---\nname: broken\ndescription: missing close')).rejects.toThrow()
    await expect(skillRegistry.installUserSkill(`---
name: ../escape
description: unsafe
---
body`)).rejects.toThrow()
    expect(mocks.invoke).not.toHaveBeenCalledWith('skills:install-user', expect.anything(), expect.anything())
  })

  it('removes a user Skill through the fixed app-data boundary', async () => {
    await expect(skillRegistry.removeUserSkill('scene-craft')).resolves.toEqual({ success: true })
    expect(mocks.invoke).toHaveBeenCalledWith('skills:remove-user', 'scene-craft')
  })
})
