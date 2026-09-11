import { describe, expect, it } from 'vitest'

import { FIXED_CHAPTER_PAIR_CASES } from '../quality-fixtures'
import { createBlindQualityReviewPacket } from '../quality-review-packet'

describe('blind quality review packet', () => {
  it('creates a deterministic anonymized packet without leaking category or scoring signals', () => {
    const first = createBlindQualityReviewPacket(FIXED_CHAPTER_PAIR_CASES, 'review-seed-v1')
    const second = createBlindQualityReviewPacket(FIXED_CHAPTER_PAIR_CASES, 'review-seed-v1')

    expect(first).toEqual(second)
    expect(first.publicPacket.schemaVersion).toBe('1')
    expect(first.publicPacket.cases).toHaveLength(24)
    expect(new Set(first.publicPacket.cases.map(item => item.blindId)).size).toBe(24)
    expect(first.publicPacket.cases[0]).toEqual(expect.objectContaining({
      blindId: expect.stringMatching(/^BLIND-[0-9A-F]{8}$/),
      previousChapter: expect.any(String),
      nextChapter: expect.any(String),
    }))
    expect(JSON.stringify(first.publicPacket)).not.toContain('expectedSignals')
    expect(JSON.stringify(first.publicPacket)).not.toContain('viewpoint-change')
    expect(first.evaluationKey).toHaveLength(24)
    expect(first.evaluationKey[0]).toEqual(expect.objectContaining({ caseId: expect.any(String), blindId: expect.any(String) }))
  })

  it('changes the blind order when the reviewer seed changes while preserving all source cases', () => {
    const first = createBlindQualityReviewPacket(FIXED_CHAPTER_PAIR_CASES, 'review-seed-a')
    const second = createBlindQualityReviewPacket(FIXED_CHAPTER_PAIR_CASES, 'review-seed-b')
    expect(first.publicPacket.cases.map(item => item.blindId)).not.toEqual(second.publicPacket.cases.map(item => item.blindId))
    expect(new Set(first.evaluationKey.map(item => item.caseId))).toEqual(new Set(FIXED_CHAPTER_PAIR_CASES.map(item => item.id)))
  })
})
