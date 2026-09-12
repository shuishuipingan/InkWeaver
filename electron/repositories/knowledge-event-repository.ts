import { getProjectDb } from '../database'
import { knowledgeEventAppliesAtChapter, normalizeKnowledgeEvent, type KnowledgeEvent } from '../../src/shared/knowledge-event'

function db() {
  const value = getProjectDb()
  if (!value) throw new Error('项目数据库未打开')
  return value
}

interface EventRow {
  event_id: string
  payload_json: string
}

function rowToEvent(row: EventRow): KnowledgeEvent {
  return normalizeKnowledgeEvent(JSON.parse(row.payload_json))
}

export class KnowledgeEventRepository {
  static saveCandidate(value: KnowledgeEvent): KnowledgeEvent {
    const event = { ...normalizeKnowledgeEvent(value), status: 'candidate' as const }
    const database = db()
    const existing = database.prepare('SELECT event_id, payload_json FROM knowledge_events WHERE event_id = ?').get(event.eventId) as EventRow | undefined
    if (existing) {
      const current = rowToEvent(existing)
      if (JSON.stringify(current) !== JSON.stringify(event)) throw new Error('知情事件 ID 已绑定其他内容')
      return current
    }
    database.prepare('INSERT INTO knowledge_events (event_id, character_name, source_chapter, status, payload_json) VALUES (?, ?, ?, ?, ?)').run(event.eventId, event.character, event.sourceChapter, event.status, JSON.stringify(event))
    return event
  }

  static listForChapter(characters: readonly string[], chapterNumber: number): KnowledgeEvent[] {
    if (characters.length === 0) return []
    const rows = db().prepare('SELECT event_id, payload_json FROM knowledge_events WHERE character_name IN (' + characters.map(() => '?').join(',') + ') ORDER BY source_chapter ASC, event_id ASC').all(...characters) as EventRow[]
    return rows.map(rowToEvent).filter(event => knowledgeEventAppliesAtChapter(event, chapterNumber))
  }

  /** Review-only projection: candidates are visible to the author but never to prompts. */
  static listForReview(characters: readonly string[], chapterNumber: number): KnowledgeEvent[] {
    if (characters.length === 0) return []
    const rows = db().prepare('SELECT event_id, payload_json FROM knowledge_events WHERE character_name IN (' + characters.map(() => '?').join(',') + ') ORDER BY source_chapter ASC, event_id ASC').all(...characters) as EventRow[]
    return rows.map(rowToEvent).filter(event => {
      if (event.status === 'candidate') {
        const start = event.validFromChapter ?? event.sourceChapter
        return event.sourceChapter <= chapterNumber && start <= chapterNumber
      }
      return knowledgeEventAppliesAtChapter(event, chapterNumber)
    })
  }

  static setStatus(eventId: string, status: KnowledgeEvent['status']): KnowledgeEvent {
    if (!['candidate', 'confirmed', 'rejected', 'stale'].includes(status)) throw new Error('知情事件状态无效')
    const database = db()
    const row = database.prepare('SELECT event_id, payload_json FROM knowledge_events WHERE event_id = ?').get(eventId) as EventRow | undefined
    if (!row) throw new Error('知情事件不存在')
    const event = { ...rowToEvent(row), status }
    database.prepare('UPDATE knowledge_events SET status = ?, payload_json = ?, updated_at = datetime(\'now\') WHERE event_id = ?').run(status, JSON.stringify(event), eventId)
    return event
  }
}
