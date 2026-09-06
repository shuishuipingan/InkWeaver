export const KNOWLEDGE_EVENT_SCHEMA_VERSION = 1 as const
export type KnowledgeEventStatus = 'candidate' | 'confirmed' | 'rejected' | 'stale'
export type KnowledgeEventCertainty = 'fact' | 'belief' | 'rumor'

export interface KnowledgeEvent {
  eventId: string
  character: string
  information: string
  certainty: KnowledgeEventCertainty
  falseBelief: boolean
  learnedBy: string
  sourceChapter: number
  validFromChapter?: number
  validUntilChapter?: number
  evidence: string
  status: KnowledgeEventStatus
}

function boundedText(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label}无效`)
  return value.trim()
}

function positiveChapter(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${label}无效`)
  return value as number
}

export function normalizeKnowledgeEvent(value: unknown): KnowledgeEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('知情事件无效')
  const record = value as Record<string, unknown>
  const certainty = record.certainty
  const status = record.status
  if (!['fact', 'belief', 'rumor'].includes(String(certainty))) throw new Error('知情事件确定性无效')
  if (!['candidate', 'confirmed', 'rejected', 'stale'].includes(String(status))) throw new Error('知情事件状态无效')
  if (typeof record.falseBelief !== 'boolean') throw new Error('误信标记无效')
  const sourceChapter = positiveChapter(record.sourceChapter, '来源章节')
  const validFromChapter = record.validFromChapter === undefined ? undefined : positiveChapter(record.validFromChapter, '生效章节')
  const validUntilChapter = record.validUntilChapter === undefined ? undefined : positiveChapter(record.validUntilChapter, '失效章节')
  const effectiveStart = validFromChapter ?? sourceChapter
  if (validUntilChapter !== undefined && validUntilChapter < effectiveStart) throw new Error('知情事件有效范围无效')
  return {
    eventId: boundedText(record.eventId, '知情事件 ID', 160),
    character: boundedText(record.character, '知情角色', 120),
    information: boundedText(record.information, '信息内容'),
    certainty: certainty as KnowledgeEventCertainty,
    falseBelief: record.falseBelief,
    learnedBy: boundedText(record.learnedBy, '获知方式'),
    sourceChapter,
    ...(validFromChapter === undefined ? {} : { validFromChapter }),
    ...(validUntilChapter === undefined ? {} : { validUntilChapter }),
    evidence: boundedText(record.evidence, '知情证据', 300),
    status: status as KnowledgeEventStatus,
  }
}

export function knowledgeEventAppliesAtChapter(event: Pick<KnowledgeEvent, 'sourceChapter' | 'validFromChapter' | 'validUntilChapter' | 'status'>, chapterNumber: number): boolean {
  if (event.status !== 'confirmed') return false
  const start = event.validFromChapter ?? event.sourceChapter
  return chapterNumber >= start && (event.validUntilChapter === undefined || chapterNumber <= event.validUntilChapter)
}

export function formatKnowledgeEventForPrompt(event: KnowledgeEvent, locale: 'zh-CN' | 'en-US'): string {
  const certainty = event.falseBelief
    ? locale === 'en-US' ? 'false belief' : '误信'
    : event.certainty === 'rumor' ? locale === 'en-US' ? 'rumor' : '传闻' : locale === 'en-US' ? 'known' : '已知'
  return locale === 'en-US'
    ? `- ${event.character} knows (${certainty}): ${event.information} (learned by ${event.learnedBy}; evidence: ${event.evidence}; source Chapter ${event.sourceChapter})`
    : `- ${event.character}（${certainty}）：${event.information}（获知方式：${event.learnedBy}；证据：${event.evidence}；来源第${event.sourceChapter}章）`
}
