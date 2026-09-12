import type { ChapterHandoffRecord } from '../shared/chapter-handoff'
import type { FinalizedContinuityProjection } from '../shared/finalized-continuity'
import type { NarrativeThreadPlanRecord } from '../shared/narrative-thread'

export type ContinuityImpactKind = 'continuity-projection' | 'chapter-handoff' | 'narrative-thread'

export interface ContinuityImpactItem {
  kind: ContinuityImpactKind
  id: string
  label: string
  sourceChapter: number
  affectedChapters: number[]
}

export function collectContinuityImpact(
  changedChapter: number,
  input: {
    projections: readonly FinalizedContinuityProjection[]
    handoffs: readonly ChapterHandoffRecord[]
    threadPlans: readonly NarrativeThreadPlanRecord[]
  },
): ContinuityImpactItem[] {
  if (!Number.isSafeInteger(changedChapter) || changedChapter < 1) {
    throw new Error('改稿影响分析章节号无效')
  }
  const impacts: ContinuityImpactItem[] = []
  for (const projection of input.projections) {
    if (projection.chapterNumber <= changedChapter) continue
    impacts.push({
      kind: 'continuity-projection',
      id: `projection:${projection.draftId}`,
      label: projection.chapterTitle || `第${projection.chapterNumber}章连续性事实`,
      sourceChapter: projection.chapterNumber,
      affectedChapters: [projection.chapterNumber],
    })
  }
  for (const handoff of input.handoffs) {
    if (handoff.chapterNumber !== changedChapter || handoff.status === 'stale') continue
    impacts.push({
      kind: 'chapter-handoff',
      id: handoff.handoffId,
      label: `第${handoff.chapterNumber}章章节交接`,
      sourceChapter: handoff.chapterNumber,
      affectedChapters: [handoff.chapterNumber + 1],
    })
  }
  for (const plan of input.threadPlans) {
    if (plan.targetEndChapter < changedChapter) continue
    const start = Math.max(changedChapter, plan.targetStartChapter)
    impacts.push({
      kind: 'narrative-thread',
      id: `thread:${plan.id}`,
      label: plan.title,
      sourceChapter: plan.targetStartChapter,
      affectedChapters: Array.from(
        { length: plan.targetEndChapter - start + 1 },
        (_, index) => start + index,
      ),
    })
  }
  return impacts
}
