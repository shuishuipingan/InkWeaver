export type NarrativeThreadStatus = 'planned' | 'planted' | 'progressing' | 'resolved' | 'abandoned'
export type NarrativeThreadEventType = Exclude<NarrativeThreadStatus, 'planned'>
export type NarrativeThreadLane = 'main' | 'sub'

export const DEFAULT_NARRATIVE_THREAD_DORMANT_THRESHOLD = 3
export const MIN_NARRATIVE_THREAD_DORMANT_THRESHOLD = 1
export const MAX_NARRATIVE_THREAD_DORMANT_THRESHOLD = 50

export function resolveNarrativeThreadDormantThreshold(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_NARRATIVE_THREAD_DORMANT_THRESHOLD
  }
  return Math.min(
    MAX_NARRATIVE_THREAD_DORMANT_THRESHOLD,
    Math.max(MIN_NARRATIVE_THREAD_DORMANT_THRESHOLD, Math.trunc(value)),
  )
}

export interface NarrativeThreadPlanInput {
  title: string
  type: string
  targetStartChapter: number
  targetEndChapter: number
  authorIntent: string
  lane?: NarrativeThreadLane
  parentId?: number
}

export interface NarrativeThreadEventInput {
  planId: number
  draftId: number
  type: NarrativeThreadEventType
  evidence: string
  reason: string
}

export interface NarrativeThreadEvent extends NarrativeThreadEventInput {
  id: number
  chapterNumber: number
  chapterTitle: string
  /** SHA-256 of the complete finalized source bound at confirmation time. */
  evidenceContentHash?: string
  createdAt: string
}

export interface NarrativeThreadView extends NarrativeThreadPlanInput {
  id: number
  status: NarrativeThreadStatus
  dormantChapters: number
  overdue: boolean
  events: NarrativeThreadEvent[]
  createdAt: string
  updatedAt: string
  progress?: {
    percent: number
    nextTargetChapter?: number
    eventCount: number
  }
}

export interface NarrativeThreadPlanRecord extends NarrativeThreadPlanInput {
  id: number
  createdAt: string
  updatedAt: string
}

export interface NarrativeThreadChapterContext {
  chapterNumber: number
  title: string
  keyEvents: string
  characters: string[]
}
