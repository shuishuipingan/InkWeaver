import { describe, expect, it } from 'vitest'
import { formatKnowledgeEventForPrompt, knowledgeEventAppliesAtChapter, normalizeKnowledgeEvent } from '../knowledge-event'

const event = {
  eventId: 'knowledge:lin:secret:3', character: '林夏', information: '弟弟仍在灯塔',
  certainty: 'belief', falseBelief: true, learnedBy: '听见匿名信', sourceChapter: 3,
  validUntilChapter: 5, evidence: '信上写着弟弟的名字。', status: 'confirmed',
} as const

describe('knowledge events', () => {
  it('keeps false belief and source evidence explicit and filters by validity', () => {
    const normalized = normalizeKnowledgeEvent(event)
    expect(knowledgeEventAppliesAtChapter(normalized, 4)).toBe(true)
    expect(knowledgeEventAppliesAtChapter(normalized, 6)).toBe(false)
    expect(formatKnowledgeEventForPrompt(normalized, 'zh-CN')).toContain('误信')
    expect(formatKnowledgeEventForPrompt(normalized, 'en-US')).toContain('false belief')
  })

  it('rejects an invalid range instead of silently changing knowledge history', () => {
    expect(() => normalizeKnowledgeEvent({ ...event, validUntilChapter: 2 })).toThrow(/有效范围/)
  })
})
