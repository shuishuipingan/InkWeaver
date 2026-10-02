import { describe, expect, it } from 'vitest'

import { decodeBlueprintDirectionChanges, decodeCoreDirectionChanges } from '../story-direction-planner'
import type { BlueprintData } from '../../../electron/repositories/blueprint-repository'
import type { ProjectCoreData } from '../../../electron/repositories/project-core-repository'
import { parseExplicitTerminologyReplacements } from '../../shared/story-direction-terminology'

const core = { premise: '主角独自面对危机', globalGuidance: '' } as ProjectCoreData
const blueprint = {
  chapterNumber: 2, title: '危机', role: '冲突', purpose: '主角独自脱险', keyEvents: '遭遇追兵',
  characters: ['主角'], suspenseHook: '', userGuidance: '', notes: '作者备注', notesUpdatedAt: '',
} satisfies BlueprintData

describe('story direction proposal contract', () => {
  it('ignores unchanged metadata without turning it into novel guidance', () => {
    const result = decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: { unchanged: ['worldSetting'], premise: '第二人格帮助主角' },
    }), core)
    expect(result.changes).toEqual({ premise: '第二人格帮助主角' })
    expect(decodeCoreDirectionChanges(JSON.stringify({ coreChanges: { unchanged: true } }), core).changes).toEqual({})
    expect(() => decodeCoreDirectionChanges(JSON.stringify({ coreChanges: { premise: [] } }), core)).toThrow(/字段值无效/)
    expect(decodeCoreDirectionChanges(JSON.stringify({ characterChanges: [{ name: '主角', changes: { unchanged: true } }] }), core, ['主角']).characterChanges).toEqual([])
    expect(decodeBlueprintDirectionChanges(JSON.stringify({ changes: [{ chapterNumber: 2, changes: { unchanged: true } }] }), [blueprint])).toEqual([])
  })
  it('accepts only changed planning fields and keeps conflict warnings', () => {
    expect(decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: { premise: '第二人格在危机时帮助主角', globalGuidance: '' },
      summary: '增加人格伏笔', conflicts: ['第1章已定稿，不能改写'],
    }), core)).toEqual({
      changes: { premise: '第二人格在危机时帮助主角' },
      characterChanges: [],
      newNarrativeThreads: [],
      terminologyReplacements: [],
      summary: '增加人格伏笔', conflicts: ['第1章已定稿，不能改写'],
    })
  })

  it('maps Chinese free-form field labels such as second-personality settings instead of rejecting the plan', () => {
    const result = decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: { '第二人格定位': '第二人格平时沉睡，在主角遇险时短暂接管身体。' },
    }), core)
    expect(result.changes.protagonistProfile).toContain('第二人格定位')
    expect(result.changes.protagonistProfile).toContain('短暂接管身体')
    expect(result.summary).toContain('第二人格定位→protagonistProfile')
  })

  it('accepts structured terminology mappings from coreChanges and keeps them outside project text fields', () => {
    const replacements = parseExplicitTerminologyReplacements('幽狼换成凤凰，黑虫系统换成智虫')
    const result = decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: {
        terminology: { 幽狼: '凤凰', 黑虫系统: '智虫' },
      },
    }), core, [], [], 0, 100, replacements)

    expect(result.changes).toEqual({})
    expect(result.terminologyReplacements).toEqual([
      { from: '幽狼', to: '凤凰' },
      { from: '黑虫系统', to: '智虫' },
    ])
  })

  it('accepts bounded updates to known character cards only', () => {
    expect(decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: {}, characterChanges: [{ name: '主角', changes: { personality: '表面冷静，第二人格在危机时接管' } }],
    }), core, ['主角']).characterChanges).toEqual([
      { name: '主角', changes: { personality: '表面冷静，第二人格在危机时接管' } },
    ])
    expect(() => decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: {}, characterChanges: [{ name: '陌生人', changes: { personality: '新设定' } }],
    }), core, ['主角'])).toThrow(/未知/)
  })

  it('validates new narrative threads for future story direction', () => {
    expect(decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: {}, newNarrativeThreads: [{
        title: '第二人格伏笔', type: '人物弧光', authorIntent: '在危机时逐步显露',
        targetStartChapter: 2, targetEndChapter: 8,
      }],
    }), core).newNarrativeThreads).toMatchObject([{ title: '第二人格伏笔', targetStartChapter: 2 }])
    expect(() => decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: {}, newNarrativeThreads: [{
        title: '重复线索', type: '人物弧光', authorIntent: '重复', targetStartChapter: 2, targetEndChapter: 8,
      }],
    }), core, [], ['重复线索'])).toThrow(/无效/)
  })

  it('rejects out-of-range chapters and protected blueprint fields', () => {
    expect(() => decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 1, changes: { purpose: '改写已定稿章' } }],
    }), [blueprint])).toThrow(/范围外/)
    expect(() => decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { characters: ['另一个人物'] } }],
    }), [blueprint])).toThrow(/字段无效/)
  })

  it('keeps author notes and roster references outside AI chapter changes', () => {
    expect(decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { purpose: '第二人格帮主角脱险' } }],
    }), [blueprint])).toEqual([{ chapterNumber: 2, changes: { purpose: '第二人格帮主角脱险' } }])
  })

  it('accepts a cast list changed only by explicit terminology replacements without emitting a roster edit', () => {
    const castBlueprint: BlueprintData = { ...blueprint, characters: ['幽狼', '黑虫系统'] }
    const replacements = parseExplicitTerminologyReplacements('幽狼换成凤凰，黑虫系统换成智虫')

    expect(decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { characters: ['凤凰', '智虫'], purpose: '凤凰发现智虫系统的痕迹' } }],
    }), [castBlueprint], replacements)).toEqual([{
      chapterNumber: 2,
      changes: { purpose: '凤凰发现智虫系统的痕迹' },
    }])
  })

  it('also ignores the original cast list when a model echoes it beside explicit mappings', () => {
    const castBlueprint: BlueprintData = { ...blueprint, characters: ['幽狼', '黑虫系统'] }
    const replacements = parseExplicitTerminologyReplacements('幽狼换成凤凰，黑虫系统换成智虫')

    expect(decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { characters: ['幽狼', '黑虫系统'], purpose: '主角借此找到线索' } }],
    }), [castBlueprint], replacements)).toEqual([{
      chapterNumber: 2,
      changes: { purpose: '主角借此找到线索' },
    }])
  })

  it('ignores an unchanged cast list echoed as context by the model', () => {
    expect(decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { characters: ['主角'], purpose: '主角在危机中脱险' } }],
    }), [blueprint])).toEqual([{ chapterNumber: 2, changes: { purpose: '主角在危机中脱险' } }])
  })

  it('accepts a validated cast-list edit built from the known roster and rejects invented names', () => {
    const blueprint2 = { ...blueprint, characters: ['主角'] }
    expect(decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { characters: ['主角', '配角'], purpose: '两人结盟' } }],
    }), [blueprint2], [], ['主角', '配角'])).toEqual([{
      chapterNumber: 2,
      changes: { characters: ['主角', '配角'], purpose: '两人结盟' },
    }])
    expect(() => decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { characters: ['主角', '凭空出现的人'] } }],
    }), [blueprint2], [], ['主角', '配角'])).toThrow(/字段无效/)
    expect(() => decodeBlueprintDirectionChanges(JSON.stringify({
      changes: [{ chapterNumber: 2, changes: { characters: [] } }],
    }), [blueprint2])).toThrow(/字段无效/)
  })

  it('decodes full-profile character edits with relationships validated against the roster', () => {
    const result = decodeCoreDirectionChanges(JSON.stringify({
      characterChanges: [{
        name: '主角',
        changes: {
          role: 'protagonist', gender: '女', age: '二十四', appearance: '银甲',
          background: '没落将军之女', personality: '果敢', arc: '从孤军到统帅', notes: '',
        },
        relationships: [{ target: '配角', relation: '结拜姐妹' }],
      }],
    }), core, ['主角', '配角'])
    expect(result.characterChanges).toEqual([{
      name: '主角',
      changes: {
        role: 'protagonist', gender: '女', age: '二十四', appearance: '银甲',
        background: '没落将军之女', personality: '果敢', arc: '从孤军到统帅',
      },
      relationships: [{ target: '配角', relation: '结拜姐妹' }],
    }])
    expect(() => decodeCoreDirectionChanges(JSON.stringify({
      characterChanges: [{ name: '主角', changes: { role: '大反派' } }],
    }), core, ['主角'])).toThrow(/定位无效/)
    expect(() => decodeCoreDirectionChanges(JSON.stringify({
      characterChanges: [{ name: '主角', changes: {}, relationships: [{ target: '陌生人', relation: '盟友' }] }],
    }), core, ['主角'])).toThrow(/关系条目无效/)
    expect(() => decodeCoreDirectionChanges(JSON.stringify({
      characterChanges: [{ name: '主角', changes: {}, relationships: [{ target: '主角', relation: '自指' }] }],
    }), core, ['主角'])).toThrow(/关系条目无效/)
  })
})
