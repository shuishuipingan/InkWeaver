export const QUALITY_REVIEW_DIMENSIONS = [
  'handoff',
  'timePlaceViewpoint',
  'emotionChoice',
  'knowledgeBoundary',
  'necessaryRepetition',
  'deferredPayoff',
] as const

export type QualityReviewDimension = typeof QUALITY_REVIEW_DIMENSIONS[number]
export type QualityReviewScores = Record<QualityReviewDimension, number>
export type QualityReviewPreference = 'before' | 'after' | 'tie' | 'invalid'

export interface QualityReviewScore {
  reviewerId: string
  blindId: string
  before: QualityReviewScores
  after: QualityReviewScores
  preferred: QualityReviewPreference
  factuallyCorrectBefore: boolean
  factuallyCorrectAfter: boolean
  intentionalTransitionMisreported?: boolean
}

export interface QualityReviewSummary {
  eligible: boolean
  reviewerCount: number
  caseCount: number
  afterPreferenceRate: number
  averageBeforeScore: number
  averageAfterScore: number
  averageScoreDelta: number
  factsCorrectnessPreserved: boolean
  intentionalTransitionMisreportRate: number
  validationErrors: string[]
}

const FINAL_THRESHOLD = Object.freeze({
  minimumReviewers: 2,
  minimumCases: 24,
  afterPreferenceRate: 0.7,
  averageScoreDelta: 0.5,
  maximumMisreportRate: 0.1,
})

function validScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function validateScore(score: QualityReviewScore, index: number): string[] {
  const errors: string[] = []
  if (typeof score.reviewerId !== 'string' || score.reviewerId.trim() === '') errors.push(`row ${index + 1}: reviewerId missing`)
  if (typeof score.blindId !== 'string' || score.blindId.trim() === '') errors.push(`row ${index + 1}: blindId missing`)
  if (!['before', 'after', 'tie', 'invalid'].includes(score.preferred)) errors.push(`row ${index + 1}: preferred value invalid`)
  for (const dimension of QUALITY_REVIEW_DIMENSIONS) {
    if (!validScore(score.before?.[dimension])) errors.push(`row ${index + 1}: before.${dimension} must be 1..5`)
    if (!validScore(score.after?.[dimension])) errors.push(`row ${index + 1}: after.${dimension} must be 1..5`)
  }
  if (typeof score.factuallyCorrectBefore !== 'boolean' || typeof score.factuallyCorrectAfter !== 'boolean') {
    errors.push(`row ${index + 1}: factual correctness flags are required`)
  }
  return errors
}

/** Summarize real reviewer rows and fail closed when coverage or thresholds are missing. */
export function summarizeQualityReview(rows: readonly QualityReviewScore[]): QualityReviewSummary {
  const validationErrors = rows.flatMap(validateScore)
  const reviewers = new Set(rows.map(row => row.reviewerId).filter(Boolean))
  const cases = new Set(rows.map(row => row.blindId).filter(Boolean))
  const seen = new Set<string>()
  for (const row of rows) {
    const key = `${row.reviewerId}\u0000${row.blindId}`
    if (seen.has(key)) validationErrors.push(`duplicate reviewer/case row: ${row.reviewerId}/${row.blindId}`)
    seen.add(key)
  }
  if (reviewers.size < FINAL_THRESHOLD.minimumReviewers) validationErrors.push('fewer than two independent reviewers')
  if (cases.size < FINAL_THRESHOLD.minimumCases) validationErrors.push('fewer than 24 blind cases')

  const validRows = rows.filter(row => validateScore(row, 0).length === 0)
  const beforeScores = validRows.flatMap(row => QUALITY_REVIEW_DIMENSIONS.map(dimension => row.before[dimension]))
  const afterScores = validRows.flatMap(row => QUALITY_REVIEW_DIMENSIONS.map(dimension => row.after[dimension]))
  const preferredRows = validRows.filter(row => row.preferred === 'before' || row.preferred === 'after')
  const afterPreferenceRate = preferredRows.length === 0
    ? 0
    : preferredRows.filter(row => row.preferred === 'after').length / preferredRows.length
  const averageBeforeScore = average(beforeScores)
  const averageAfterScore = average(afterScores)
  const factsCorrectnessPreserved = validRows.every(row => !row.factuallyCorrectBefore || row.factuallyCorrectAfter)
  const markedTransitionRows = validRows.filter(row => row.intentionalTransitionMisreported !== undefined)
  const intentionalTransitionMisreportRate = markedTransitionRows.length === 0
    ? 0
    : markedTransitionRows.filter(row => row.intentionalTransitionMisreported === true).length / markedTransitionRows.length
  const averageScoreDelta = averageAfterScore - averageBeforeScore
  const eligible = validationErrors.length === 0
    && reviewers.size >= FINAL_THRESHOLD.minimumReviewers
    && cases.size >= FINAL_THRESHOLD.minimumCases
    && afterPreferenceRate >= FINAL_THRESHOLD.afterPreferenceRate
    && averageScoreDelta >= FINAL_THRESHOLD.averageScoreDelta
    && factsCorrectnessPreserved
    && intentionalTransitionMisreportRate <= FINAL_THRESHOLD.maximumMisreportRate

  return {
    eligible,
    reviewerCount: reviewers.size,
    caseCount: cases.size,
    afterPreferenceRate,
    averageBeforeScore,
    averageAfterScore,
    averageScoreDelta,
    factsCorrectnessPreserved,
    intentionalTransitionMisreportRate,
    validationErrors,
  }
}
