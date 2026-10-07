import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectStore } from '../../../stores/project-store'
import { createAgentExecutionContext } from '../tools/project-context'
import { proposeNewCharactersTool } from '../tools/propose-new-characters.tool'

const projectPath = 'C:\\novels\\A'
let invoke: ReturnType<typeof vi.fn>

function stubApi() {
  invoke = vi.fn(async (channel: string, ...rest: unknown[]) => {
    void rest
    if (channel === 'db:character-roster-read') return { schemaVersion: 1, revision: 3, entries: [] }
    return []
  })
  vi.stubGlobal('window', {
    velaAPI: {
      invoke,
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  return invoke
}

beforeEach(() => {
  useProjectStore.setState({
    currentProject: { id: 'main', sessionLease: 'lease-A', name: 'A', path: projectPath, novelConfig: {} } as never,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useProjectStore.setState({ currentProject: null })
})

describe('propose_new_characters name guard', () => {
  it('rejects a merged name and points at the per-item shape', async () => {
    const calls = stubApi()
    const result = await proposeNewCharactersTool.execute(
      { characters: [{ name: '沈瑶光、鹿鸣、谢无尘', role: 'supporting' }] },
      createAgentExecutionContext(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('看起来是多个角色')
    expect(result.error).toContain('、')
    expect(result.error).toContain('单独一项')
    expect(result.error).toContain('allow_multi_name')
    expect(calls).not.toHaveBeenCalled()
  })

  it('rejects comma joined names and the 甲和乙 pattern', async () => {
    stubApi()
    const comma = await proposeNewCharactersTool.execute(
      { characters: [{ name: '沈瑶光，鹿鸣', role: 'supporting' }] },
      createAgentExecutionContext(),
    )
    expect(comma.success).toBe(false)
    expect(comma.error).toContain('看起来是多个角色')

    const conjunction = await proposeNewCharactersTool.execute(
      { characters: [{ name: '沈瑶光和林雪', role: 'supporting' }] },
      createAgentExecutionContext(),
    )
    expect(conjunction.success).toBe(false)
    expect(conjunction.error).toContain('和/与')
  })

  it('keeps names with interpuncts and ordinary two-character names', async () => {
    stubApi()
    const interpuncts = await proposeNewCharactersTool.execute(
      { characters: [{ name: '阿·喀琉斯', role: 'supporting' }, { name: '苏倦', role: 'minor' }, { name: '王和芳', role: 'minor' }] },
      createAgentExecutionContext(),
    )
    // 三个名字都不该被判为合并名（规则本体由 shared/__tests__/character-name-guards.test.ts 覆盖，
    // 这里只断言工具确实接上了共享检测）。
    expect(interpuncts.error ?? '').not.toContain('看起来是多个角色')
  })

  it('rejects a faction-shaped entry and points at the architecture lane', async () => {
    const calls = stubApi()
    const result = await proposeNewCharactersTool.execute(
      { characters: [{ name: '仙盟的祭局推动者', role: 'antagonist' }] },
      createAgentExecutionContext(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('看起来是势力')
    expect(result.error).toContain('architecture')
    expect(result.error).toContain('allow_faction_entries')
    expect(calls).not.toHaveBeenCalled()
  })

  it('honours the explicit author-confirmed escape hatches', async () => {
    stubApi()
    const merged = await proposeNewCharactersTool.execute(
      { characters: [{ name: '沈瑶光、鹿鸣', role: 'supporting' }], allow_multi_name: true },
      createAgentExecutionContext(),
    )
    expect(merged.error ?? '').not.toContain('看起来是多个角色')

    const faction = await proposeNewCharactersTool.execute(
      { characters: [{ name: '仙盟的祭局推动者', role: 'antagonist' }], allow_faction_entries: true },
      createAgentExecutionContext(),
    )
    expect(faction.error ?? '').not.toContain('看起来是势力')
  })
})
