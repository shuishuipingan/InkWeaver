import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CharacterRosterEntry } from '../../../shared/character-roster'
import { normalizeCharacterCardsForPersistence } from '../character-card-normalizer'
import { mergeAcceptedCharacterCandidates } from '../../character-extraction-merge'
import { syncBlueprintCharacterCandidates } from '../blueprint-character-sync'

/**
 * facets 兼容性的**双保险**（Lead 裁定的 layers-①）。
 *
 * 星芒在契约层（character-roster.ts）与展示层（relationship-presentation.ts）已自测兼容；
 * 本文件在**旧数据真实流经的三个读写组件**上再覆盖一层：即便某一层漏了，另一层还能抓住。
 *
 * 硬约束：无 facets 的旧数据读写正常，且**不得凭空长出 facet 字段**。
 * 判据用 `'facets' in relation === false` 而不是 `=== undefined` —— 后者会把
 * 「显式写了 facets: undefined」也算通过，掩盖掉「不该有该字段」这件事。
 */
const projectPath = 'C:\\novels\\facets-legacy'
const projectSession = { projectId: 'facets-legacy', leaseId: 'lease-facets-legacy', projectPath }

function legacyEntry(overrides: Partial<CharacterRosterEntry> = {}): CharacterRosterEntry {
  return {
    name: '林岚',
    role: 'protagonist',
    gender: '女',
    age: '27',
    appearance: '灰色职业套装',
    personality: '谨慎',
    background: '旧数据背景',
    abilities: '调查',
    motivation: '查清真相',
    relationships: [{ target: '周砚', relation: '共同追查真相' }],
    arc: '旧数据弧光',
    notes: '旧数据备注',
    ...overrides,
  }
}

function stubIpc(existing: CharacterRosterEntry[]) {
  const commits: Array<{ entries: CharacterRosterEntry[] }> = []
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:character-roster-read') {
      return { status: existing.length > 0 ? 'ready' : 'empty', revision: 7, entries: existing }
    }
    if (channel === 'db:character-roster-commit') {
      const request = args[0] as { entries: CharacterRosterEntry[] }
      commits.push(request)
      return { success: true, receipt: { revision: 8, snapshot: { status: 'ready', entries: request.entries } } }
    }
    throw new Error(`unexpected IPC: ${channel}`)
  })
  vi.stubGlobal('window', {
    velaAPI: {
      invoke, on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  return { invoke, commits }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('facets 兼容：无 facets 的旧数据流经三个读写组件', () => {
  it('character-card-normalizer：旧卡片归一化正常，且不引入 facets / factionEdges', () => {
    const cards = normalizeCharacterCardsForPersistence([
      { name: '林岚', role: 'protagonist', relationships: '周砚——共同追查真相' },
      { name: '周砚', role: 'supporting' },
    ])

    expect(cards).toHaveLength(2)
    // 本用例只钉兼容性（文本→图边的转换本身由 character-card-normalizer.test.ts 既有覆盖）：
    // 旧数据路径不得凭空长出 facet 结构，持久化形状必须仍是字符串。
    const card = cards[0] as unknown as Record<string, unknown>
    expect('facets' in card).toBe(false)
    expect('factionEdges' in card).toBe(false)
    expect(typeof card.relationships).toBe('string')
  })

  it('character-extraction-merge：旧名册合并后既保留旧关系，也不引入 facets', () => {
    const entries = mergeAcceptedCharacterCandidates(
      // 名册必须包含关系的 target：mergeAcceptedCharacterCandidates 会丢弃指向名册外角色的
      // 悬空关系（character-extraction-merge.ts:125-126），这是既有语义而非本卡范围。
      { status: 'ready', revision: 1, entries: [legacyEntry(), legacyEntry({ name: '周砚', role: 'supporting', relationships: [] })] } as never,
      [{
        candidateId: 'c1',
        status: 'accepted',
        disposition: 'new',
        name: '苏晚',
        aliases: [],
        fields: { role: 'supporting' },
      }] as never,
    )

    const existing = entries.find(entry => entry.name === '林岚')!
    expect(existing.relationships).toEqual([{ target: '周砚', relation: '共同追查真相' }])
    for (const relationship of existing.relationships) {
      expect('facets' in relationship).toBe(false)
    }
    for (const entry of entries) expect('factionEdges' in entry).toBe(false)
  })

  it('blueprint-character-sync：旧名册同步提交正常，且提交体不含 facet 字段', async () => {
    const { commits } = stubIpc([legacyEntry()])

    const receipt = await syncBlueprintCharacterCandidates(
      [{ chapterNumber: 1, characters: ['林岚', '新角色'] }],
      projectPath,
      projectSession as never,
      'facets-legacy-op',
    )

    expect(receipt).not.toBeNull()
    expect(commits).toHaveLength(1)
    const committed = commits[0]!.entries
    for (const entry of committed) {
      expect('factionEdges' in entry).toBe(false)
      for (const relationship of entry.relationships) {
        expect('facets' in (relationship as unknown as Record<string, unknown>)).toBe(false)
      }
    }
    // 同步只提交新增/变更项（blueprint-character-sync.ts:219 会跳过无变化项），
    // 因此「旧条目根本不出现在提交体里」比「提交后字段未变」是更强的证据：它压根没被改写。
    expect(committed.some(entry => entry.name === '林岚')).toBe(false)
    expect(committed.some(entry => entry.name === '新角色')).toBe(true)
  })
})