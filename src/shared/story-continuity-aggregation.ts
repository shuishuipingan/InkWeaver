import type { StoryContinuityDocument } from './story-continuity'

export interface VolumeProgressSummary {
  volume: string
  chapters: number[]
  chapterCount: number
  mainlineContributions: string[]
  subplots: string[]
  characterArcs: string[]
  turningPoints: string[]
  costs: string[]
  unresolvedQuestions: string[]
  sceneCount: number
  observedSceneCount: number
  activeExpectationCount: number
}

export interface VolumeTrendStep {
  volume: string
  /** Mainline contribution strings that first appear in this volume. */
  newMainlineItems: string[]
  /** Mainline contribution strings already seen in the previous volume. */
  continuedMainlineItems: string[]
  /** Subplot strings that first appear in this volume. */
  newSubplots: string[]
}

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function firstChapter(summary: VolumeProgressSummary): number {
  return Math.min(...summary.chapters.filter(Number.isFinite))
}

/**
 * Builds a read-only volume projection from chapter work sheets. Empty fields
 * are ignored, chapter order is stable, and no aggregate result is authoritative
 * until the author saves the underlying chapter documents.
 */
export function aggregateStoryContinuity(
  documents: readonly StoryContinuityDocument[],
): VolumeProgressSummary[] {
  const groups = new Map<string, StoryContinuityDocument[]>()
  for (const document of [...documents].sort((left, right) => left.chapterNumber - right.chapterNumber)) {
    const volume = document.arcContribution.volume.trim() || '未分卷'
    const group = groups.get(volume) ?? []
    group.push(document)
    groups.set(volume, group)
  }
  return [...groups.entries()].map(([volume, group]) => {
    const chapters = [...new Set(group.map(document => document.chapterNumber))].sort((left, right) => left - right)
    const scenes = group.flatMap(document => document.sceneBeats)
    return {
      volume,
      chapters,
      chapterCount: chapters.length,
      mainlineContributions: uniqueText(group.map(document => document.arcContribution.mainline)),
      subplots: uniqueText(group.flatMap(document => document.arcContribution.subplots)),
      characterArcs: uniqueText(group.flatMap(document => document.arcContribution.characterArcs)),
      turningPoints: uniqueText(group.map(document => document.arcContribution.turningPoint)),
      costs: uniqueText(group.map(document => document.arcContribution.cost)),
      unresolvedQuestions: uniqueText(group.flatMap(document => [
        ...document.arcContribution.unresolvedQuestions,
        ...document.readerExpectations
          .filter(expectation => expectation.status === 'open' || expectation.status === 'progressing')
          .map(expectation => expectation.question),
      ])),
      sceneCount: scenes.length,
      observedSceneCount: scenes.filter(scene => scene.status === 'observed').length,
      activeExpectationCount: group.reduce((total, document) => total + document.readerExpectations.filter(expectation => (
        expectation.status === 'open' || expectation.status === 'progressing'
      )).length, 0),
    }
  })
}

/**
 * Derives how story threads evolve across volumes. Volumes are ordered by
 * their first chapter. A contribution/subplot is "new" in a volume only when
 * it was absent from every earlier volume; otherwise it is "continued".
 * This is purely presentational and never edits the underlying sheets.
 */
export function deriveVolumeTrends(summaries: readonly VolumeProgressSummary[]): VolumeTrendStep[] {
  const ordered = [...summaries].sort((left, right) => firstChapter(left) - firstChapter(right))
  const seenMainline = new Set<string>()
  const seenSubplots = new Set<string>()
  return ordered.map(summary => {
    const mainlineItems = summary.mainlineContributions.filter(Boolean)
    const subplotItems = summary.subplots.filter(Boolean)
    const newMainlineItems = mainlineItems.filter(item => !seenMainline.has(item))
    const continuedMainlineItems = mainlineItems.filter(item => seenMainline.has(item))
    const newSubplots = subplotItems.filter(item => !seenSubplots.has(item))
    mainlineItems.forEach(item => seenMainline.add(item))
    subplotItems.forEach(item => seenSubplots.add(item))
    return {
      volume: summary.volume,
      newMainlineItems,
      continuedMainlineItems,
      newSubplots,
    }
  })
}