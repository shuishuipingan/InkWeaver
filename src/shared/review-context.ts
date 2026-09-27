import { factAppliesAtChapter, type FinalizedContinuityProjection } from './finalized-continuity'

const REVIEW_CONTEXT_CHAR_LIMIT = 18_000

/** Build review evidence only from finalized continuity facts before the target chapter. */
export function buildFinalizedReviewContext(
  projections: readonly FinalizedContinuityProjection[],
  chapterNumber: number,
  currentEntities: readonly string[] = [],
): string {
  const prior = projections.filter(item => item.chapterNumber < chapterNumber)
    .sort((left, right) => left.chapterNumber - right.chapterNumber)
  if (prior.length === 0) {
    return `审计范围：当前目标为第 ${chapterNumber} 章正文；此前没有可用的已定稿章节连续性记录。知识库导入文档和拆书参照语料不是本项目已发生剧情，不可用于推断未写章节。`
  }

  const recentStart = Math.max(0, prior.length - 12)
  const recent = prior.slice(recentStart)
  const entitySet = new Set(currentEntities.map(value => value.trim()).filter(Boolean))
  const relevantFacts = prior.flatMap(projection => (projection.facts ?? [])
    .filter(fact => factAppliesAtChapter(fact, chapterNumber)
      && fact.entities.some(entity => entitySet.has(entity)))
    .map(fact => ({ chapter: projection.chapterNumber, fact })))
    .slice(-30)
  const lines = [
    `审计范围：目标为第 ${chapterNumber} 章当前草稿。以下只包含本项目在目标章之前已定稿的章节要点与连续性事实。知识库导入文档、拆书原文和未写章节都不是本审计的故事事实。`,
    '较早的已定稿章节目录：',
    ...prior.slice(0, recentStart).map(item => `- 第${item.chapterNumber}章 ${item.chapterTitle}`),
    '最近已定稿章节要点：',
    ...recent.map(item => `- 第${item.chapterNumber}章 ${item.chapterTitle}：${item.chapterNotes.slice(0, 420)}`),
    ...(relevantFacts.length > 0 ? ['与本章角色相关的既有定稿事实：', ...relevantFacts.map(({ chapter, fact }) => (
      `- 第${chapter}章 [${fact.category}] ${fact.statement.slice(0, 240)}；证据：${fact.evidence.slice(0, 240)}`
    ))] : []),
  ]
  let result = lines.join('\n')
  if (result.length > REVIEW_CONTEXT_CHAR_LIMIT) result = `${result.slice(0, REVIEW_CONTEXT_CHAR_LIMIT)}…（历史上下文已截断；未使用知识库参考文档）`
  return result
}
