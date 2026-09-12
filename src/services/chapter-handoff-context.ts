import type { WritingLanguage } from '../shared/writing-language'
import type { ChapterHandoffRecord } from '../shared/chapter-handoff'

function list(values: readonly string[], empty: string): string {
  return values.length > 0 ? values.map(value => `- ${value}`).join('\n') : empty
}

/**
 * Formats one author-confirmed handoff for the next-chapter prompt. The
 * wording deliberately tells the model to preserve the handoff as a scene
 * constraint without turning an uncertain transition into a new fact.
 */
export function formatChapterHandoff(
  handoff: ChapterHandoffRecord | null,
  writingLanguage: WritingLanguage,
): string {
  if (!handoff) {
    return writingLanguage === 'en-US'
      ? '[No confirmed chapter handoff is available.]'
      : '【暂无已确认的章节交接记录】'
  }

  if (writingLanguage === 'en-US') {
    return [
      '[Confirmed chapter handoff — preserve continuity]',
      `Scene location: ${handoff.sceneLocation}`,
      `Viewpoint: ${handoff.viewpoint}`,
      `Present characters:\n${list(handoff.presentCharacters, '(none)')}`,
      `Unfinished actions:\n${list(handoff.unfinishedActions, '(none)')}`,
      `Immediate goal: ${handoff.immediateGoal}`,
      `Emotional state: ${handoff.emotionalState}`,
      `Constraints:\n${list(handoff.constraints, '(none)')}`,
      `Open questions:\n${list(handoff.openQuestions, '(none)')}`,
      `Selected transition: ${handoff.transition}`,
      `Evidence:\n${list(handoff.evidence, '(none)')}`,
      'Do not reset the scene, character emotions, unfinished actions, or constraints without a justified transition.',
    ].join('\n')
  }

  return [
    '【已确认章节交接——必须保持连续性】',
    `场景地点：${handoff.sceneLocation}`,
    `叙事视角：${handoff.viewpoint}`,
    `在场人物：\n${list(handoff.presentCharacters, '（无）')}`,
    `未完成动作：\n${list(handoff.unfinishedActions, '（无）')}`,
    `即时目标：${handoff.immediateGoal}`,
    `情绪状态：${handoff.emotionalState}`,
    `限制条件：\n${list(handoff.constraints, '（无）')}`,
    `待回应问题：\n${list(handoff.openQuestions, '（无）')}`,
    `指定转场方式：${handoff.transition}`,
    `正文证据：\n${list(handoff.evidence, '（无）')}`,
    '不得重置场景、人物情绪、未完成动作或限制条件；如需转场，必须通过正文给出合理依据。',
  ].join('\n')
}
