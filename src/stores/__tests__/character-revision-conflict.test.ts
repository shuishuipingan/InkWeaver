/**
 * 用户场景：名册被后台工作流推到新版本后，手动保存/删除必须能自愈 —— **且不能删数据**。
 *
 * 关键不变式：manual_edit 提交的是完整名单，"请求里没有的角色等于被删除"。
 * 所以冲突自愈必须是**三方合并**（基线 / 用户当前 / 最新），不能重放旧快照 ——
 * 否则工作流在冲突期间新增的角色会被删掉（真实案例：界面 8 张、后台已 56 张）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData } from '../../shared/ipc-channels'
import { characterRosterEntryFromCard } from '../../services/character-roster-client'
import { useEditorStore } from '../editor-store'
import { useProjectStore } from '../project-store'
import {
  characterMutationFailureCode,
  mergeCharacterChangesOntoLatest,
  useCharacterStore,
  type CharacterCard,
} from '../character-store'

const { invoke, invokeWithProjectSession } = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeWithProjectSession: vi.fn(),
}))

vi.mock('../../services/ipc-client', () => ({
  ipc: {
    invoke,
    invokeWithProjectSession,
    invokeBackgroundWithProjectSession: invokeWithProjectSession,
  },
}))

const PROJECT = 'C:\\novels\\project-a'
const CONFLICT = '角色名单 revision 已过期，已拒绝覆盖'

function project(): ProjectData {
  return {
    id: 'a', sessionLease: 'lease-a', name: 'A', path: PROJECT,
    novelConfig: {
      genre: '玄幻', subGenre: '', targetAudience: '全龄', totalChapters: 10, wordsPerChapter: 3000,
      plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '', worldSetting: '',
      goldenFinger: '', protagonistProfile: '', globalGuidance: '',
    },
    characterStates: '', createdAt: '', updatedAt: '',
  }
}

function card(name: string, notes = ''): CharacterCard {
  return {
    name, role: 'protagonist', gender: '', age: '', appearance: '', personality: '',
    background: '', abilities: '', motivation: '', relationships: '[]', arc: '', notes,
  }
}

let backend: { commits: Array<{ revision: number; names: string[] }>; pushWorkflowCharacters: (count: number) => void }

beforeEach(() => {
  invoke.mockReset()
  invokeWithProjectSession.mockReset()
  // 用户界面拿到的是 8 张（rev 5）
  let entries = Array.from({ length: 8 }, (_, index) => card('角色' + index))
  let revision = 5
  const commits: Array<{ revision: number; names: string[] }> = []
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:character-roster-read') {
      return { status: 'ready', revision, entries: entries.map(characterRosterEntryFromCard) }
    }
    if (channel === 'db:character-roster-commit') {
      const request = args[0] as { expectedRevision: number; entries: Array<{ name: string }> }
      commits.push({ revision: request.expectedRevision, names: request.entries.map(entry => entry.name) })
      if (request.expectedRevision !== revision) return { success: false, error: CONFLICT }
      entries = request.entries.map(entry => card(entry.name))
      revision += 1
      return { success: true, receipt: { revision, snapshot: { entries: request.entries } } }
    }
    return { success: true }
  })
  invokeWithProjectSession.mockImplementation(async (_session: unknown, channel: string, ...args: unknown[]) => (
    invoke(channel, ...args)
  ))

  useEditorStore.setState({ tabs: [], activeTabId: null, draftLedgers: {} })
  useProjectStore.setState({ currentProject: project(), fileTree: [], loading: false })
  useCharacterStore.getState().reset()
  backend = {
    commits,
    pushWorkflowCharacters: (count: number) => {
      for (let index = 0; index < count; index += 1) entries = [...entries, card('工作流新增' + index)]
      revision += 1
    },
  }
})

describe('三方合并（纯函数）', () => {
  it('冲突期间由工作流新增的条目在合并后必须仍然存在', () => {
    const baseline = [card('甲'), card('乙')]
    const latest = [...baseline, card('丙'), card('丁')] // 工作流新增
    const current = [card('甲', '作者改了备注'), card('乙')] // 用户只改了甲的备注

    const merged = mergeCharacterChangesOntoLatest(baseline, current, latest)

    expect(merged.ok).toBe(true)
    const names = merged.ok ? merged.cards.map(item => item.name) : []
    expect(names).toEqual(expect.arrayContaining(['甲', '乙', '丙', '丁']))
    expect(merged.ok && merged.cards.find(item => item.name === '甲')?.notes).toBe('作者改了备注')
  })

  it('用户明确删除的只删那一张，不带走别人', () => {
    const baseline = [card('甲'), card('乙')]
    const latest = [...baseline, card('丙')]
    const current = [card('甲')] // 用户删了乙

    const merged = mergeCharacterChangesOntoLatest(baseline, current, latest)

    expect(merged.ok && merged.cards.map(item => item.name).sort()).toEqual(['丙', '甲'])
  })

  it('用户改的那张在最新名册里已不存在时不盲目提交', () => {
    const baseline = [card('甲'), card('乙')]
    const latest = [card('乙')] // 甲被后台删掉/改名
    const current = [card('甲', '作者在改它'), card('乙')]

    const merged = mergeCharacterChangesOntoLatest(baseline, current, latest)

    expect(merged.ok).toBe(false)
    expect(merged.ok === false && merged.reason).toBe('edited-character-missing')
  })
})

describe('角色保存的版本冲突自愈', () => {
  it('用户场景：工作流把名册从 8 张推到 56 张后，保存用户那张卡不得删掉新增的 48 张', async () => {
    await useCharacterStore.getState().load(PROJECT)
    expect(useCharacterStore.getState().characters).toHaveLength(8)

    // 蓝图同步把名册推到 56 张（rev 5 → 6）
    backend.pushWorkflowCharacters(48)

    // 用户改了其中一张并保存（界面仍持 rev 5）
    useCharacterStore.setState({
      characters: useCharacterStore.getState().characters.map(character => (
        character.name === '角色0' ? { ...character, notes: '作者改过' } : character
      )),
    })
    await useCharacterStore.getState().saveAll(PROJECT)

    const last = backend.commits.at(-1)
    expect(backend.commits.map(commit => commit.revision)).toEqual([5, 6])
    // ★ 不变式：56 张一个不少，且用户的改动在
    expect(last?.names).toHaveLength(56)
    expect(last?.names).toContain('工作流新增47')
    expect(last?.names).toContain('角色0')
  })

  it('删除同样自愈：只删用户删的那一张', async () => {
    await useCharacterStore.getState().load(PROJECT)
    backend.pushWorkflowCharacters(3)

    const result = await useCharacterStore.getState().deleteCharacterWithReason('角色0', PROJECT)

    expect(result).toEqual({ ok: true })
    const last = backend.commits.at(-1)
    expect(last?.names).not.toContain('角色0')
    expect(last?.names).toContain('工作流新增2')
  })

  it('冲突仍然失败时按真实原因报错，不再说成项目切换', async () => {
    await useCharacterStore.getState().load(PROJECT)
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'db:character-roster-read') {
        return { status: 'ready', revision: 99, entries: [characterRosterEntryFromCard(card('角色0'))] }
      }
      if (channel === 'db:character-roster-commit') return { success: false, error: CONFLICT }
      return { success: true }
    })

    const failure = await useCharacterStore.getState().saveAll(PROJECT).catch(error => error as unknown)

    expect(characterMutationFailureCode(failure)).toBe('revision-conflict')
  })
})

describe('失败原因分类', () => {
  it('三类失败分别归类：版本冲突 ≠ 项目切换 ≠ 其它', () => {
    expect(characterMutationFailureCode(new Error(CONFLICT))).toBe('revision-conflict')
    expect(characterMutationFailureCode(new Error('项目会话与当前数据库不匹配，已拒绝删除'))).toBe('project-session-invalid')
    expect(characterMutationFailureCode(new Error('磁盘写入失败'))).toBe('other')
  })
})
