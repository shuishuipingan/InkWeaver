/**
 * 蓝图自动建档 + 档案填充。
 *
 * 用户场景：蓝图引入新角色（含炮灰/配角）时应该"把角色卡的内容一起建好"，
 * 而不是只留一个名字（用户库里「太虚宫主」就是那张只有名字的空卡）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invokeWithProjectSession: vi.fn(),
}))

vi.mock('../../ipc-client', () => ({
  ipc: { invokeWithProjectSession: mocks.invokeWithProjectSession },
}))

import {
  BLUEPRINT_AUTO_CARD_SOURCE_MARKER,
  MAX_ENRICHMENT_TOTAL_CHARACTERS,
  buildEnrichmentDigest,
  decodeEnrichmentProfiles,
  enrichBlueprintCharacterProfiles,
  selectEnrichmentCandidates,
} from '../blueprint-character-enrichment'
import { partitionBlueprintCharacterCandidates } from '../blueprint-character-sync'
import type { CharacterRosterEntry } from '../../../shared/character-roster'

function source(name: string, chapters: number[]) {
  return { name, chapters: new Set(chapters) }
}

function entry(overrides: Partial<CharacterRosterEntry> = {}): CharacterRosterEntry {
  return {
    name: '太虚宫主',
    role: 'supporting',
    gender: '', age: '', appearance: '', personality: '', background: '',
    abilities: '', motivation: '', arc: '',
    relationships: [],
    notes: `${BLUEPRINT_AUTO_CARD_SOURCE_MARKER}（第149、151章）`,
    ...overrides,
  }
}

function blueprint(chapterNumber: number, characters: string[], keyEvents = '') {
  return { chapterNumber, characters, role: '推进', purpose: '冲突升级', keyEvents }
}

const baseDeps = (overrides = {}) => ({
  expectedProjectPath: '/tmp/project',
  projectSession: { projectId: 'p1', leaseId: 'l1', projectPath: '/tmp/project' },
  writingLanguage: 'zh-CN' as const,
  log: vi.fn(),
  uiText: (zh: string, _en: string) => zh,
  ...overrides,
})

beforeEach(() => {
  mocks.invokeWithProjectSession.mockReset()
})

describe('蓝图角色候选划分', () => {
  it('按出场章节数推导定位：≥3 章是配角，1–2 章是龙套', () => {
    const { accepted } = partitionBlueprintCharacterCandidates([
      source('陆沉舟', [1, 2, 3]),
      source('路人甲', [7]),
      source('小贩乙', [9, 10]),
    ])
    expect(accepted.map(item => [item.name, item.role])).toEqual([
      ['陆沉舟', 'supporting'],
      ['路人甲', 'minor'],
      ['小贩乙', 'minor'],
    ])
  })

  it('多人合并名与势力名不建卡，但「太虚宫主」这类具体人物不被误杀', () => {
    const { accepted, skipped } = partitionBlueprintCharacterCandidates([
      source('张三、李四', [1, 2, 3]),
      source('仙盟高层', [4]),
      // 含「宫」但不含聚合词：是人物，必须建卡（用户库里那张空卡就是它）
      source('太虚宫主', [149, 151, 152, 153, 154]),
    ])
    expect(accepted.map(item => item.name)).toEqual(['太虚宫主'])
    expect(accepted[0]?.role).toBe('supporting')
    expect(skipped).toEqual([
      { name: '张三、李四', reason: 'multiName' },
      { name: '仙盟高层', reason: 'factionLike' },
    ])
  })
})

describe('空卡档案填充', () => {
  it('只挑自动建的空卡，且不限于本轮新建（历史空卡一并补）', () => {
    const candidates = selectEnrichmentCandidates(
      [
        entry(),
        entry({ name: '有资料的角色', appearance: '灰袍', gender: '男' }),
        entry({ name: '作者手写卡', notes: '作者自己写的备注' }),
      ],
      [blueprint(149, ['太虚宫主', '有资料的角色', '作者手写卡'])],
    )
    expect(candidates.map(item => item.name)).toEqual(['太虚宫主'])
  })

  it('用蓝图事实生成档案，只填空字段提交', async () => {
    const commit = vi.fn(async () => ({ success: true }))
    mocks.invokeWithProjectSession.mockImplementation(async (_session, channel) => {
      if (channel === 'db:character-roster-read') {
        return { status: 'ready', revision: 7, entries: [entry()] }
      }
      return commit()
    })

    const outcome = await enrichBlueprintCharacterProfiles({
      ...baseDeps(),
      blueprints: [blueprint(149, ['太虚宫主'], '她第一次现身，要求交出信物')],
      generate: async () => JSON.stringify({
        profiles: [{
          name: '太虚宫主',
          gender: '女',
          age: '不详',
          appearance: '素白道袍，眉眼极冷',
          personality: '居高临下',
          background: '太虚宫掌权者',
          abilities: '未显露',
          motivation: '收回信物',
          arc: '从旁观者变成清算者',
        }],
      }),
    })

    expect(outcome.error).toBeUndefined()
    expect(outcome.enriched).toEqual(['太虚宫主'])
    const commitPayload = mocks.invokeWithProjectSession.mock.calls
      .find(call => call[1] === 'db:character-roster-commit')?.[2] as
      | { intent: string; expectedRevision: number; entries: CharacterRosterEntry[] }
      | undefined
    expect(commitPayload?.intent).toBe('blueprint_sync')
    expect(commitPayload?.expectedRevision).toBe(7)
    expect(commitPayload?.entries[0]?.appearance).toBe('素白道袍，眉眼极冷')
    expect(commitPayload?.entries[0]?.notes).toContain(BLUEPRINT_AUTO_CARD_SOURCE_MARKER)
  })

  it('作者在来源标记后面追加的备注不会被抹掉，模型也不写已填字段', async () => {
    const authorNote = `${BLUEPRINT_AUTO_CARD_SOURCE_MARKER}（第149章）\n作者补充：这个角色是我设定里的最终反派`
    const commit = vi.fn(async () => ({ success: true }))
    mocks.invokeWithProjectSession.mockImplementation(async (_session, channel) => {
      if (channel === 'db:character-roster-read') {
        return { status: 'ready', revision: 3, entries: [entry({ notes: authorNote })] }
      }
      return commit()
    })

    await enrichBlueprintCharacterProfiles({
      ...baseDeps(),
      blueprints: [blueprint(149, ['太虚宫主'])],
      generate: async () => JSON.stringify({
        profiles: [{ name: '太虚宫主', appearance: '素白道袍', personality: '模型写的人设' }],
      }),
    })

    const payload = mocks.invokeWithProjectSession.mock.calls
      .find(call => call[1] === 'db:character-roster-commit')?.[2] as
      | { entries: CharacterRosterEntry[] } | undefined
    // notes 原样回传（仓储侧不做改写，作者补充的一个字都不动）
    expect(payload?.entries[0]?.notes).toBe(authorNote)
    expect(payload?.entries[0]?.appearance).toBe('素白道袍')
  })

  it('作者已经写过的字段不会被模型值替换（八项里非空的不进提交载荷）', async () => {
    const commit = vi.fn(async () => ({ success: true }))
    mocks.invokeWithProjectSession.mockImplementation(async (_session, channel) => {
      if (channel === 'db:character-roster-read') {
        // 作者写了两项：这张卡按"八项全空"的判据不算空卡，因此根本不会被挑中
        return { status: 'ready', revision: 3, entries: [entry({ personality: '作者亲笔', arc: '作者亲笔' })] }
      }
      return commit()
    })

    const outcome = await enrichBlueprintCharacterProfiles({
      ...baseDeps(),
      blueprints: [blueprint(149, ['太虚宫主'])],
      generate: async () => JSON.stringify({ profiles: [{ name: '太虚宫主', personality: '模型乱写' }] }),
    })

    expect(outcome.enriched).toEqual([])
    expect(mocks.invokeWithProjectSession.mock.calls.some(call => call[1] === 'db:character-roster-commit'))
      .toBe(false)
  })

  it('生成失败只回报、不抛出（蓝图不受影响）', async () => {
    mocks.invokeWithProjectSession.mockImplementation(async (_session, channel) => (
      channel === 'db:character-roster-read'
        ? { status: 'ready', revision: 1, entries: [entry()] }
        : { success: true }
    ))

    const outcome = await enrichBlueprintCharacterProfiles({
      ...baseDeps(),
      blueprints: [blueprint(149, ['太虚宫主'])],
      generate: async () => { throw new Error('模型超时') },
    })

    expect(outcome.error).toContain('模型超时')
    expect(outcome.enriched).toEqual([])
  })

  it('超过上限时只处理前 N 个并报告剩余', async () => {
    // 单轮上限 60 名、每批 12 名：多出的部分留到下一轮
    const many = Array.from({ length: MAX_ENRICHMENT_TOTAL_CHARACTERS + 5 }, (_, index) => entry({ name: `角色${index}` }))
    const commit = vi.fn(async () => ({ success: true }))
    mocks.invokeWithProjectSession.mockImplementation(async (_session, channel) => {
      if (channel === 'db:character-roster-read') return { status: 'ready', revision: 5, entries: many }
      return commit()
    })

    const outcome = await enrichBlueprintCharacterProfiles({
      ...baseDeps(),
      blueprints: [blueprint(149, many.map(item => item.name))],
      generate: async () => JSON.stringify({
        profiles: many.map(item => ({ name: item.name, appearance: '有外观' })),
      }),
    })

    expect(outcome.enriched).toHaveLength(MAX_ENRICHMENT_TOTAL_CHARACTERS)
    expect(outcome.deferredForLimit).toBe(5)
  })
})

describe('档案填充的解析与摘要', () => {
  it('形状不对的模型输出不会崩，也不会编造', () => {
    expect(decodeEnrichmentProfiles('not json').size).toBe(0)
    expect(decodeEnrichmentProfiles('{"profiles":[{"name":"甲","appearance":"  "}]}').size).toBe(0)
    const parsed = decodeEnrichmentProfiles('{"profiles":[{"name":"甲","appearance":"灰袍","未知字段":"x"}]}')
    expect(parsed.get('甲')).toEqual({ appearance: '灰袍' })
  })

  it('摘要引用该角色出场的章节事实，并限制条数', () => {
    const blueprints = Array.from({ length: 12 }, (_, index) => blueprint(100 + index, ['甲'], `事件${index}`))
    const digest = buildEnrichmentDigest(blueprints, { name: '甲', chapters: blueprints.map(item => item.chapterNumber) })
    expect(digest.split('\n')).toHaveLength(8)
    expect(digest).toContain('第100章')
  })
})
