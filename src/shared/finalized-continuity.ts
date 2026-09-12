export type FinalizedContinuityFactCategory =
  | 'character-state'
  | 'timeline'
  | 'open-thread'
  | 'plot'

export interface FinalizedContinuityFact {
  category: FinalizedContinuityFactCategory
  entities: string[]
  statement: string
  sourceChapter: number
  /** Story chapters during which this fact remains valid. */
  validFromChapter?: number
  validUntilChapter?: number
  evidence: string
}

export interface FinalizedContinuityProjection {
  draftId: number
  chapterNumber: number
  chapterTitle: string
  chapterNotes: string
  facts?: FinalizedContinuityFact[]
}

export interface SaveFinalizedContinuityRequest {
  draftId: number
  chapterNumber: number
  chapterNotes: string
  facts?: FinalizedContinuityFact[]
}

export function factAppliesAtChapter(
  fact: Pick<FinalizedContinuityFact, 'sourceChapter' | 'validFromChapter' | 'validUntilChapter'>,
  chapterNumber: number,
): boolean {
  const start = fact.validFromChapter ?? fact.sourceChapter
  const end = fact.validUntilChapter
  return chapterNumber >= start && (end === undefined || chapterNumber <= end)
}
