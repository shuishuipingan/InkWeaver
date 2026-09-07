import { describe, expect, it } from 'vitest'
import { emptyStoryContinuityDocument } from '../story-continuity'
import { aggregateStoryContinuity } from '../story-continuity-aggregation'

function document(chapterNumber: number, volume: string, mainline: string) {
  const value = emptyStoryContinuityDocument(chapterNumber)
  return {
    ...value,
    arcContribution: {
      ...value.arcContribution,
      volume,
      mainline,
      turningPoint: chapterNumber === 2 ? '第一次反转' : '',
      unresolvedQuestions: chapterNumber === 1 ? ['谁寄来的信？'] : [],
    },
    sceneBeats: [{
      id: `scene-${chapterNumber}`, sceneNumber: 1, status: chapterNumber === 2 ? 'observed' as const : 'planned' as const,
      entryState: '', goal: '', obstacle: '', choice: '', consequence: '留下线索', exitState: '', evidence: [],
    }],
    readerExpectations: chapterNumber === 1 ? [{
      id: 'expect-1', question: '谁寄来的信？', introducedChapter: 1,
      expectedProgress: '找到来源', status: 'open' as const, delayReason: '', evidence: [],
    }] : [],
  }
}

describe('story continuity aggregation', () => {
  it('groups saved chapter sheets by volume and keeps progress evidence distinct', () => {
    const result = aggregateStoryContinuity([
      document(2, '第一卷', '发现异常'),
      document(1, '第一卷', '建立日常'),
      document(3, '第二卷', '进入新阶段'),
    ])
    expect(result).toEqual([
      expect.objectContaining({
        volume: '第一卷', chapters: [1, 2], chapterCount: 2,
        mainlineContributions: ['建立日常', '发现异常'],
        turningPoints: ['第一次反转'], observedSceneCount: 1, sceneCount: 2,
        activeExpectationCount: 1, unresolvedQuestions: ['谁寄来的信？'],
      }),
      expect.objectContaining({ volume: '第二卷', chapters: [3], chapterCount: 1 }),
    ])
  })
})
