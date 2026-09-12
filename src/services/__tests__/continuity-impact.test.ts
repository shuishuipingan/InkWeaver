import { describe, expect, it } from 'vitest'

import { collectContinuityImpact } from '../continuity-impact'

describe('collectContinuityImpact', () => {
  it('returns later projections, next-chapter handoffs, and overlapping thread plans', () => {
    const impact = collectContinuityImpact(3, {
      projections: [
        { draftId: 1, chapterNumber: 2, chapterTitle: '旧章', chapterNotes: '事实', facts: [] },
        { draftId: 2, chapterNumber: 4, chapterTitle: '后章', chapterNotes: '后续', facts: [] },
      ],
      handoffs: [
        { handoffId: 'h-3', draftId: 3, chapterNumber: 3, sourceContentHash: 'a', sceneLocation: '地点', viewpoint: '人', presentCharacters: [], unfinishedActions: [], immediateGoal: '目标', emotionalState: '情绪', constraints: [], openQuestions: [], transition: 'continue-scene', evidence: [], status: 'confirmed', createdAt: '', updatedAt: '' },
        { handoffId: 'h-2', draftId: 2, chapterNumber: 2, sourceContentHash: 'b', sceneLocation: '地点', viewpoint: '人', presentCharacters: [], unfinishedActions: [], immediateGoal: '目标', emotionalState: '情绪', constraints: [], openQuestions: [], transition: 'continue-scene', evidence: [], status: 'confirmed', createdAt: '', updatedAt: '' },
      ],
      threadPlans: [{ id: 9, title: '红门谜团', type: 'mystery', targetStartChapter: 2, targetEndChapter: 8, authorIntent: '持续推进', createdAt: '', updatedAt: '' }],
    })

    expect(impact.map(item => item.kind)).toEqual([
      'continuity-projection',
      'chapter-handoff',
      'narrative-thread',
    ])
    expect(impact.find(item => item.kind === 'continuity-projection')?.affectedChapters).toEqual([4])
    expect(impact.find(item => item.kind === 'chapter-handoff')?.affectedChapters).toEqual([4])
    expect(impact.find(item => item.kind === 'narrative-thread')?.affectedChapters).toEqual([3, 4, 5, 6, 7, 8])
  })
})
