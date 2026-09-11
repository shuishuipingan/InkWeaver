import { createHash } from 'node:crypto'

import type { ChapterPairQualityCase } from './quality-fixtures'

export interface BlindQualityReviewCase {
  blindId: string
  previousChapter: string
  nextChapter: string
}

export interface BlindQualityReviewPacket {
  schemaVersion: '1'
  seedFingerprint: string
  cases: BlindQualityReviewCase[]
}

export interface BlindQualityEvaluationKeyEntry {
  caseId: string
  blindId: string
  kind: ChapterPairQualityCase['kind']
  expectedSignals: string[]
}

export interface BlindQualityReviewPacketResult {
  publicPacket: BlindQualityReviewPacket
  /** Keep this mapping private; it contains the labels hidden from reviewers. */
  evaluationKey: BlindQualityEvaluationKeyEntry[]
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * Builds the reviewer-facing half of the fixed chapter-pair evaluation.
 * Category labels and expected signals stay in the private evaluation key so
 * a reviewer cannot infer which transition class is being scored.
 */
export function createBlindQualityReviewPacket(
  cases: readonly ChapterPairQualityCase[],
  seed: string,
): BlindQualityReviewPacketResult {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error('quality review cases are required')
  if (typeof seed !== 'string' || seed.trim() === '') throw new Error('quality review seed is required')
  const seen = new Set<string>()
  const ordered = cases.map(item => {
    if (!item.id || seen.has(item.id)) throw new Error(`duplicate quality review case: ${item.id}`)
    seen.add(item.id)
    const blindDigest = digest(`${seed}\u0000${item.id}`)
    return { item, blindDigest }
  }).sort((left, right) => left.blindDigest.localeCompare(right.blindDigest))

  const evaluationKey = ordered.map(({ item, blindDigest }) => ({
    caseId: item.id,
    blindId: `BLIND-${blindDigest.slice(0, 8).toUpperCase()}`,
    kind: item.kind,
    expectedSignals: [...item.expectedSignals],
  }))
  return {
    publicPacket: {
      schemaVersion: '1',
      seedFingerprint: digest(seed).slice(0, 16),
      cases: ordered.map(({ item }, index) => ({
        blindId: evaluationKey[index]!.blindId,
        previousChapter: item.previousChapter,
        nextChapter: item.nextChapter,
      })),
    },
    evaluationKey,
  }
}
