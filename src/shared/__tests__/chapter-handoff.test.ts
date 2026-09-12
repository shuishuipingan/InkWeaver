import { describe, expect, it } from 'vitest'

import { normalizeChapterHandoffCandidate } from '../chapter-handoff'

const source = {
  handoffId: 'handoff-7',
  draftId: 7,
  chapterNumber: 3,
  sourceContentHash: 'b'.repeat(64),
}

describe('normalizeChapterHandoffCandidate', () => {
  it('binds a structured model candidate to the frozen source identity', () => {
    const result = normalizeChapterHandoffCandidate({
      sceneLocation: '旧码头',
      viewpoint: '林舟',
      presentCharacters: ['林舟'],
      unfinishedActions: ['打开暗锁'],
      immediateGoal: '确认门后是否有人',
      emotionalState: '警惕',
      constraints: ['不能遗失钥匙'],
      openQuestions: ['门后是谁？'],
      transition: 'continue-scene',
      evidence: ['他握紧钥匙，听见门后有人叫他的名字。'],
    }, source)

    expect(result).toMatchObject({
      ...source,
      sceneLocation: '旧码头',
      transition: 'continue-scene',
    })
  })

  it('rejects candidates with missing evidence or unsupported transitions', () => {
    expect(() => normalizeChapterHandoffCandidate({
      sceneLocation: '旧码头',
      viewpoint: '林舟',
      presentCharacters: [],
      unfinishedActions: [],
      immediateGoal: '目标',
      emotionalState: '警惕',
      constraints: [],
      openQuestions: [],
      transition: 'teleport',
      evidence: [],
    }, source)).toThrow(/转场|证据/u)
  })
})
