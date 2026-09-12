import { describe, expect, it } from 'vitest'

import {
  buildChapterHandoffPrompt,
  parseChapterHandoffCompletion,
} from '../chapter-handoff.command'

const source = {
  handoffId: 'chapter-handoff-run-2-3',
  draftId: 17,
  chapterNumber: 3,
  sourceContentHash: 'c'.repeat(64),
}

describe('chapter handoff command contract', () => {
  it('builds a prompt that prioritizes the ending scene and requires evidence', () => {
    const prompt = buildChapterHandoffPrompt({
      chapterNumber: 3,
      chapterTitle: '暗锁',
      content: '前面的章节内容。'.repeat(20) + '林舟握着钥匙，听见门后有人叫出了他的名字。',
      chapterEntities: ['林舟', '沈月'],
      writingLanguage: 'zh-CN',
    })

    expect(prompt).toContain('完整章节交接记录')
    expect(prompt).toContain('必须逐字摘录正文证据')
    expect(prompt).toContain('不得编造正文没有出现的事实')
    expect(prompt).toContain('林舟')
  })

  it('normalizes a JSON completion using the frozen source identity', () => {
    const result = parseChapterHandoffCompletion(JSON.stringify({
      sceneLocation: '旧码头',
      viewpoint: '林舟',
      presentCharacters: ['林舟'],
      unfinishedActions: ['打开暗锁'],
      immediateGoal: '确认门后是否有人',
      emotionalState: '警惕',
      constraints: ['不能遗失钥匙'],
      openQuestions: ['门后是谁？'],
      transition: 'continue-scene',
      evidence: ['他握着钥匙，听见门后有人叫出了他的名字。'],
    }), source)

    expect(result).toMatchObject({
      handoffId: source.handoffId,
      draftId: source.draftId,
      chapterNumber: source.chapterNumber,
      sourceContentHash: source.sourceContentHash,
      sceneLocation: '旧码头',
    })
  })
})
