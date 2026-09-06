import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { getProjectDb } from '../../database'
import { KnowledgeEventRepository } from '../knowledge-event-repository'
import type { KnowledgeEvent } from '../../../src/shared/knowledge-event'

vi.mock('../../database', () => ({ getProjectDb: vi.fn() }))
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

const event: KnowledgeEvent = {
  eventId: 'knowledge:lin:1', character: '林夏', information: '灯塔会在午夜熄灭', certainty: 'fact',
  falseBelief: false, learnedBy: '亲眼见到', sourceChapter: 1, evidence: '她看见灯塔熄灭。', status: 'confirmed',
}

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`CREATE TABLE knowledge_events (
    event_id TEXT PRIMARY KEY, character_name TEXT NOT NULL, source_chapter INTEGER NOT NULL,
    status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT ''
  )`)
  vi.mocked(getProjectDb).mockReturnValue(db)
})
afterEach(() => db.close())

describe('KnowledgeEventRepository', () => {
  it('keeps candidates non-authoritative until status is confirmed and filters by chapter', () => {
    KnowledgeEventRepository.saveCandidate(event)
    expect(KnowledgeEventRepository.listForChapter(['林夏'], 1)).toHaveLength(1)
    KnowledgeEventRepository.setStatus(event.eventId, 'rejected')
    expect(KnowledgeEventRepository.listForChapter(['林夏'], 1)).toHaveLength(0)
  })
})
