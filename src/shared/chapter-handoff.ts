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

interface ChapterHandoffSourceIdentity {
  handoffId: string
  draftId: number
  chapterNumber: number
  sourceContentHash: string
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    throw new Error(`章节交接${field}无效`)
  }
  return value.trim()
}

function textList(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`章节交接${field}无效`)
  return value.map(item => requiredText(item, `${field}条目`))
}

/**
 * Decodes one model response without allowing it to choose project identity
 * or source revision. The caller supplies the frozen source identity.
 */
export function normalizeChapterHandoffCandidate(
  value: unknown,
  source: ChapterHandoffSourceIdentity,
): SaveChapterHandoffRequest {
  if (!record(value)) throw new Error('章节交接候选必须是对象')
  if (!CHAPTER_HANDOFF_TRANSITIONS.includes(value.transition as ChapterHandoffTransition)) {
    throw new Error('章节交接转场方式无效')
  }
  const evidence = textList(value.evidence, '证据', 8)
  if (evidence.length === 0) throw new Error('章节交接证据不能为空')
  return {
    ...source,
    sceneLocation: requiredText(value.sceneLocation, '场景地点'),
    viewpoint: requiredText(value.viewpoint, '叙事视角'),
    presentCharacters: textList(value.presentCharacters, '出场角色', 12),
    unfinishedActions: textList(value.unfinishedActions, '未完成动作', 12),
    immediateGoal: requiredText(value.immediateGoal, '即时目标'),
    emotionalState: requiredText(value.emotionalState, '情绪状态'),
    constraints: textList(value.constraints, '限制', 12),
    openQuestions: textList(value.openQuestions, '待回应问题', 12),
    transition: value.transition as ChapterHandoffTransition,
    evidence,
  }
}
