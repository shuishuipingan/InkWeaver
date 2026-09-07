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

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
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
