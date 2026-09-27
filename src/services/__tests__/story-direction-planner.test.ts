import { describe, expect, it } from 'vitest'

import { decodeBlueprintDirectionChanges, decodeCoreDirectionChanges } from '../story-direction-planner'
import type { BlueprintData } from '../../../electron/repositories/blueprint-repository'
import type { ProjectCoreData } from '../../../electron/repositories/project-core-repository'

const core = { premise: '主角独自面对危机', globalGuidance: '' } as ProjectCoreData
const blueprint = {
  chapterNumber: 2, title: '危机', role: '冲突', purpose: '主角独自脱险', keyEvents: '遭遇追兵',
  characters: ['主角'], suspenseHook: '', userGuidance: '', notes: '作者备注', notesUpdatedAt: '',
} satisfies BlueprintData

describe('story direction proposal contract', () => {
  it('accepts only changed planning fields and keeps conflict warnings', () => {
    expect(decodeCoreDirectionChanges(JSON.stringify({
      coreChanges: { premise: '第二人格在危机时帮助主角', globalGuidance: '' },
      summary: '增加人格伏笔', conflicts: ['第1章已定稿，不能改写'],
    }), core)).toEqual({
      changes: { premise: '第二人格在危机时帮助主角' },
      characterChanges: [],
      newNarrativeThreads: [],
      summary: '增加人格伏笔', conflicts: ['第1章已定稿，不能改写'],
    })
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
})
