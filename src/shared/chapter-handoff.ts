export const CHAPTER_HANDOFF_TRANSITIONS = [
  'continue-scene',
  'time-jump',
  'location-change',
  'viewpoint-change',
  'flashback',
  'parallel-event',
] as const

export type ChapterHandoffTransition = typeof CHAPTER_HANDOFF_TRANSITIONS[number]
export type ChapterHandoffStatus = 'candidate' | 'confirmed' | 'superseded' | 'stale'

export interface SaveChapterHandoffRequest {
  handoffId: string
  draftId: number
  chapterNumber: number
  sourceContentHash: string
  sceneLocation: string
  viewpoint: string
  presentCharacters: string[]
  unfinishedActions: string[]
  immediateGoal: string
  emotionalState: string
  constraints: string[]
  openQuestions: string[]
  transition: ChapterHandoffTransition
  evidence: string[]
}

export interface ChapterHandoffRecord extends SaveChapterHandoffRequest {
  status: ChapterHandoffStatus
  createdAt: string
  updatedAt: string
  confirmedAt?: string
}
