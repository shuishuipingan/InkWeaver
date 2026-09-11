import { describe, expect, it } from 'vitest'

import { summarizeQualityReview, type QualityReviewScore } from '../quality-review-summary'

const dimensions = ['handoff', 'timePlaceViewpoint', 'emotionChoice', 'knowledgeBoundary', 'necessaryRepetition', 'deferredPayoff'] as const

function score(reviewerId: string, blindId: string, index: number): QualityReviewScore {
  const preferred = index < 18 ? 'after' : index < 22 ? 'tie' : 'before'
  const before = Object.fromEntries(dimensions.map(dimension => [dimension, 3])) as QualityReviewScore['before']
  const after = Object.fromEntries(dimensions.map(dimension => [dimension, 4])) as QualityReviewScore['after']
  return {
    reviewerId,
    blindId,
    before,
    after,
    preferred,
    factuallyCorrectBefore: true,
    factuallyCorrectAfter: true,
    intentionalTransitionMisreported: index === 0 ? false : undefined,
  }
}

describe('quality review summary', () => {
  it('aggregates two complete reviewers and applies the roadmap thresholds', () => {
    const scores = ['reviewer-a', 'reviewer-b'].flatMap(reviewer => Array.from({ length: 24 }, (_, index) => score(reviewer, `BLIND-${String(index).padStart(4, '0')}`, index)))
    const summary = summarizeQualityReview(scores)

    expect(summary).toMatchObject({
      eligible: true,
      reviewerCount: 2,
      caseCount: 24,
      afterPreferenceRate: expect.closeTo(18 / 20, 6),
      averageScoreDelta: expect.closeTo(1, 6),
      factsCorrectnessPreserved: true,
      intentionalTransitionMisreportRate: 0,
    })
  })

  it('fails closed for missing reviewer coverage, facts regressions, or excessive misreports', () => {
    const summary = summarizeQualityReview([
      {
        ...score('reviewer-a', 'BLIND-0001', 0),
        after: { handoff: 1, timePlaceViewpoint: 1, emotionChoice: 1, knowledgeBoundary: 1, necessaryRepetition: 1, deferredPayoff: 1 },
        factuallyCorrectAfter: false,
        intentionalTransitionMisreported: true,
      },
    ])

    expect(summary.eligible).toBe(false)
    expect(summary.reviewerCount).toBe(1)
    expect(summary.caseCount).toBe(1)
    expect(summary.factsCorrectnessPreserved).toBe(false)
    expect(summary.validationErrors.length).toBeGreaterThan(0)
  })
})
