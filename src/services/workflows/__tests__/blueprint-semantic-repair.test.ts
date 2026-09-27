import { describe, expect, it } from 'vitest'

import { StructuredContractDiagnostic } from '../../../shared/structured-contract-diagnostic'
import { buildMissingSuspenseHookRepairPlan } from '../blueprint-semantic-repair'

describe('blueprint semantic repair', () => {
  it('fills only a missing suspense hook and preserves every original blueprint fact', () => {
    const candidate = JSON.stringify({ blueprints: [{
      chapterNumber: 1,
      title: '夜航',
      role: '发展',
      purpose: '让主角追查旧信来源',
      keyEvents: '主角在信封夹层发现追踪器。',
      characters: ['林舟'],
      relationships: [],
      userGuidance: '保持克制',
    }] })
    const plan = buildMissingSuspenseHookRepairPlan({
      items: [1],
      candidateContent: candidate,
      diagnostic: new StructuredContractDiagnostic('missing_field', 'blueprints[0].suspenseHook'),
      writingLanguage: 'zh-CN',
    })

    expect(plan).toBeDefined()
    const repaired = plan!.applyRepair(candidate, JSON.stringify({
      repairs: [{ chapterNumber: 1, suspenseHook: '追踪器忽然亮起，显示信件刚从屋内发出。' }],
    }))
    expect(JSON.parse(repaired)).toEqual({ blueprints: [{
      chapterNumber: 1,
      title: '夜航',
      role: '发展',
      purpose: '让主角追查旧信来源',
      keyEvents: '主角在信封夹层发现追踪器。',
      characters: ['林舟'],
      relationships: [],
      userGuidance: '保持克制',
      suspenseHook: '追踪器忽然亮起，显示信件刚从屋内发出。',
    }] })
  })

  it('does not repair unrelated contract failures or accept extra repair chapter numbers', () => {
    const candidate = JSON.stringify({ blueprints: [{ chapterNumber: 1, title: '夜航', keyEvents: '追查旧信。' }] })
    expect(buildMissingSuspenseHookRepairPlan({
      items: [1], candidateContent: candidate,
      diagnostic: new StructuredContractDiagnostic('missing_field', 'blueprints[0].title'),
      writingLanguage: 'zh-CN',
    })).toBeUndefined()

    const plan = buildMissingSuspenseHookRepairPlan({
      items: [1], candidateContent: candidate,
      diagnostic: new StructuredContractDiagnostic('missing_field', 'blueprints[0].suspenseHook'),
      writingLanguage: 'zh-CN',
    })
    expect(() => plan!.applyRepair(candidate, JSON.stringify({ repairs: [
      { chapterNumber: 1, suspenseHook: '门外出现陌生脚步。' },
      { chapterNumber: 2, suspenseHook: '多出的章节。' },
    ] }))).toThrow()
  })
})
