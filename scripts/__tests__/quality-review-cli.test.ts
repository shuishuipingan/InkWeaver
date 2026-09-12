import { describe, expect, it } from 'vitest'

import { parseQualityReviewRows } from '../summarize-quality-review.mjs'

describe('quality review summary CLI input', () => {
  it('parses an explicit rows payload and returns the audited summary', () => {
    const rows = [{
      reviewerId: 'reviewer-a', blindId: 'BLIND-0001',
      before: { handoff: 3, timePlaceViewpoint: 3, emotionChoice: 3, knowledgeBoundary: 3, necessaryRepetition: 3, deferredPayoff: 3 },
      after: { handoff: 4, timePlaceViewpoint: 4, emotionChoice: 4, knowledgeBoundary: 4, necessaryRepetition: 4, deferredPayoff: 4 },
      preferred: 'after', factuallyCorrectBefore: true, factuallyCorrectAfter: true,
    }]
    const summary = parseQualityReviewRows(JSON.stringify(rows))
    expect(summary).toMatchObject({ reviewerCount: 1, caseCount: 1, averageScoreDelta: 1, eligible: false })
  })

  it('rejects a JSON object that does not contain a reviewer row array', () => {
    expect(() => parseQualityReviewRows(JSON.stringify({ rows: [] }))).toThrow('quality review input must be an array')
  })
})
