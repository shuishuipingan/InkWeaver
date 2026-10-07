import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectStore } from '../../../../stores/project-store'
import { builtinTools } from '..'
import { createAgentExecutionContext } from '../project-context'
import { NEW_CHARACTER_MAX, proposeNewCharactersTool } from '../propose-new-characters.tool'

const projectPath = 'C:\\novels\\A'
const existingEntries = [
  { name: '沈瑶光', aliases: ['瑶光'], role: 'protagonist', gender: '女', age: '19', appearance: '', personality: '', background: '', abilities: '', motivation: '', relationships: [], arc: '', notes: '' },
]

function stubApi(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    'db:character-roster-read': { schemaVersion: 1, revision: 7, entries: existingEntries, migrationState: 'ready', status: 'ready' },
    'db:character-roster-commit': {
      success: true,
      receipt: { operationId: 'op', payloadHash: 'h', revision: 8, idempotent: false, snapshot: { entries: [] } },
    },
    ...overrides,
  }
  const invoke = vi.fn(async (channel: string, ...rest: unknown[]) => {
    void rest
    return channel in routes ? routes[channel] : []
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

function callsFor(invoke: ReturnType<typeof stubApi>, channel: string): unknown[][] {
  return invoke.mock.calls.filter(([name]) => name === channel) as unknown[][]
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

describe('propose_new_characters tool', () => {
  it('registers as a confirmation-required tool without changing the read-only group', () => {
    expect(builtinTools.map(tool => tool.name)).toContain('propose_new_characters')
    expect(proposeNewCharactersTool.requiresConfirmation).toBe(true)
    expect(proposeNewCharactersTool.isReadOnly).toBe(false)
    // 与 propose_change_plan 的分工必须写在给模型看的描述里。
    expect(proposeNewCharactersTool.description).toContain('新增角色用本工具')
    expect(proposeNewCharactersTool.description).toContain('propose_change_plan')
    expect(proposeNewCharactersTool.description).toContain('不要臆造 currentState')
    expect(builtinTools.filter(tool => !tool.requiresConfirmation)).toHaveLength(18)
    expect(builtinTools).toHaveLength(26)
  })

  it('rejects malformed batches before touching any channel', async () => {
    const invoke = stubApi()
    const empty = await proposeNewCharactersTool.execute({ characters: [] }, createAgentExecutionContext())
    expect(empty.success).toBe(false)
    expect(empty.error).toContain('characters 不能为空')

    const tooMany = await proposeNewCharactersTool.execute(
      { characters: Array.from({ length: NEW_CHARACTER_MAX + 1 }, (_v, i) => ({ name: '角色' + i, role: 'supporting' })) },
      createAgentExecutionContext(),
    )
    expect(tooMany.success).toBe(false)
    expect(tooMany.error).toContain('最多新增')

    const noName = await proposeNewCharactersTool.execute({ characters: [{ role: 'supporting' }] }, createAgentExecutionContext())
    expect(noName.success).toBe(false)
    expect(noName.error).toContain('缺少 name')

    const noRole = await proposeNewCharactersTool.execute({ characters: [{ name: '谢无尘' }] }, createAgentExecutionContext())
    expect(noRole.success).toBe(false)
    expect(noRole.error).toContain('缺少 role')

    const duplicated = await proposeNewCharactersTool.execute(
      { characters: [{ name: '鹿鸣', role: 'supporting' }, { name: '鹿鸣', role: 'minor' }] },
      createAgentExecutionContext(),
    )
    expect(duplicated.success).toBe(false)
    expect(duplicated.error).toContain('重复出现')

    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects a duplicate name without reaching the commit channel', async () => {
    const invoke = stubApi()
    const byName = await proposeNewCharactersTool.execute(
      { characters: [{ name: '沈瑶光', role: 'protagonist' }] },
      createAgentExecutionContext(),
    )
    expect(byName.success).toBe(false)
    expect(byName.error).toContain('重名')
    expect(byName.error).toContain('沈瑶光')

    const byAlias = await proposeNewCharactersTool.execute(
      { characters: [{ name: '顾长安', role: 'supporting', aliases: ['瑶光'] }] },
      createAgentExecutionContext(),
    )
    expect(byAlias.success).toBe(false)
    expect(byAlias.error).toContain('别名')
    expect(callsFor(invoke, 'db:character-roster-commit')).toHaveLength(0)
  })

  it('submits a complete manual_edit snapshot with the expected revision', async () => {
    const invoke = stubApi()
    const result = await proposeNewCharactersTool.execute(
      {
        characters: [
          { name: '鹿鸣', role: '配角', personality: '寡言', currentState: { location: '不该出现', powerLevel: '', physicalState: '', mentalState: '', keyItems: '', recentEvents: '', updatedAtChapter: 9 } },
          { name: '谢无尘', role: 'antagonist', aliases: ['无尘'] },
        ],
        summary: '补齐五位配角',
      },
      createAgentExecutionContext(),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('已新增 2 名角色')
    expect(result.content).toContain('1 人 → 3 人')

    const commits = callsFor(invoke, 'db:character-roster-commit')
    expect(commits).toHaveLength(1)
    const request = commits[0]![1] as Record<string, unknown>
    const entries = request.entries as Array<Record<string, unknown>>
    // 完整快照：现有 1 人 + 新增 2 人，顺序为「现有在前」。
    expect(entries).toHaveLength(3)
    expect(entries[0]!.name).toBe('沈瑶光')
    expect(entries[1]!.name).toBe('鹿鸣')
    expect(entries[2]!.name).toBe('谢无尘')
    expect(entries[2]!.aliases).toEqual(['无尘'])
    // role 走项目既有归一化（中文「配角」→ supporting）。
    expect(entries[1]!.role).toBe('supporting')
    // currentState 一律不接收。
    expect(entries[1]!.currentState).toBeUndefined()
    expect(request.intent).toBe('manual_edit')
    expect(request.expectedRevision).toBe(7)
    expect(request.schemaVersion).toBe(1)
    expect(typeof request.operationId).toBe('string')
    expect(String(request.operationId)).toMatch(/^[0-9a-f-]{36}$/)
    expect(commits[0]![2]).toBe(projectPath)
  })

  it('reports an optimistic-lock failure without re-reading or retrying', async () => {
    const invoke = stubApi({
      'db:character-roster-commit': { success: false, error: '角色名单已被其他操作修改（revision 冲突）' },
    })
    const result = await proposeNewCharactersTool.execute(
      { characters: [{ name: '温辞', role: 'minor' }] },
      createAgentExecutionContext(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('revision 冲突')
    expect(result.error).toContain('不会自动重试')
    expect(callsFor(invoke, 'db:character-roster-read')).toHaveLength(1)
    expect(callsFor(invoke, 'db:character-roster-commit')).toHaveLength(1)
  })
})
