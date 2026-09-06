import { createHash } from 'node:crypto'

import { getProjectDb } from '../database'
import {
  CHAPTER_HANDOFF_TRANSITIONS,
  type ChapterHandoffRecord,
  type SaveChapterHandoffRequest,
} from '../../src/shared/chapter-handoff'

const HASH = /^[a-f0-9]{64}$/u
const MAX_TEXT = 500
const MAX_LIST_ITEMS = 12
const MAX_EVIDENCE_ITEMS = 8

interface HandoffRow {
  handoff_id: string
  draft_id: number
  chapter_number: number
  source_content_hash: string
  status: ChapterHandoffRecord['status']
  payload_json: string
  created_at: string
  updated_at: string
  confirmed_at: string | null
}

function db() {
  const value = getProjectDb()
  if (!value) throw new Error('项目数据库未打开')
  return value
}

function text(value: unknown, field: string, required = true): string {
  if (typeof value !== 'string') throw new Error(`章节交接${field}无效`)
  const normalized = value.trim()
  if (required && !normalized) throw new Error(`章节交接${field}不能为空`)
  if (normalized.length > MAX_TEXT) throw new Error(`章节交接${field}过长`)
  return normalized
}

function list(value: unknown, field: string, maxItems = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`章节交接${field}无效`)
  return value.map((item) => text(item, `${field}条目`)).filter(Boolean)
}

function normalizedRequest(input: SaveChapterHandoffRequest): SaveChapterHandoffRequest {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.handoffId)) {
    throw new Error('章节交接 ID 无效')
  }
  if (!Number.isSafeInteger(input.draftId) || input.draftId < 1) throw new Error('章节交接草稿 ID 无效')
  if (!Number.isSafeInteger(input.chapterNumber) || input.chapterNumber < 1) throw new Error('章节交接章节号无效')
  if (!HASH.test(input.sourceContentHash)) throw new Error('章节交接来源正文哈希无效')
  if (!CHAPTER_HANDOFF_TRANSITIONS.includes(input.transition)) throw new Error('章节交接转场方式无效')
  return {
    handoffId: input.handoffId,
    draftId: input.draftId,
    chapterNumber: input.chapterNumber,
    sourceContentHash: input.sourceContentHash,
    sceneLocation: text(input.sceneLocation, '场景地点'),
    viewpoint: text(input.viewpoint, '叙事视角'),
    presentCharacters: list(input.presentCharacters, '出场角色'),
    unfinishedActions: list(input.unfinishedActions, '未完成动作'),
    immediateGoal: text(input.immediateGoal, '即时目标'),
    emotionalState: text(input.emotionalState, '情绪状态'),
    constraints: list(input.constraints, '限制'),
    openQuestions: list(input.openQuestions, '待回应问题'),
    transition: input.transition,
    evidence: list(input.evidence, '证据', MAX_EVIDENCE_ITEMS),
  }
}

function payloadOf(record: SaveChapterHandoffRequest): string {
  return JSON.stringify({
    sceneLocation: record.sceneLocation,
    viewpoint: record.viewpoint,
    presentCharacters: record.presentCharacters,
    unfinishedActions: record.unfinishedActions,
    immediateGoal: record.immediateGoal,
    emotionalState: record.emotionalState,
    constraints: record.constraints,
    openQuestions: record.openQuestions,
    transition: record.transition,
    evidence: record.evidence,
  })
}

function rowToRecord(row: HandoffRow): ChapterHandoffRecord {
  const payload = JSON.parse(row.payload_json) as Omit<SaveChapterHandoffRequest, 'handoffId' | 'draftId' | 'chapterNumber' | 'sourceContentHash'>
  return {
    handoffId: row.handoff_id,
    draftId: row.draft_id,
    chapterNumber: row.chapter_number,
    sourceContentHash: row.source_content_hash,
    ...payload,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.confirmed_at ? { confirmedAt: row.confirmed_at } : {}),
  }
}

function sourceDraft(input: SaveChapterHandoffRequest): { contentHash: string } {
  const row = db().prepare(`
    SELECT drafts.chapter_number AS chapterNumber,
           drafts.status AS status,
           contents.body AS body
    FROM drafts
    JOIN contents ON contents.id = drafts.content_id
    WHERE drafts.id = ?
  `).get(input.draftId) as { chapterNumber: number; status: string; body: string } | undefined
  if (!row || row.chapterNumber !== input.chapterNumber || row.status !== 'finalized') {
    throw new Error('章节交接必须绑定匹配章节的 finalized 定稿')
  }
  const contentHash = createHash('sha256').update(row.body, 'utf8').digest('hex')
  if (contentHash !== input.sourceContentHash) throw new Error('章节交接来源正文已变化')
  return { contentHash }
}

export class ChapterHandoffRepository {
  static saveCandidate(input: SaveChapterHandoffRequest): ChapterHandoffRecord {
    const normalized = normalizedRequest(input)
    sourceDraft(normalized)
    const database = db()
    const existing = database.prepare('SELECT * FROM chapter_handoffs WHERE handoff_id = ?')
      .get(normalized.handoffId) as HandoffRow | undefined
    const payload = payloadOf(normalized)
    if (existing) {
      if (
        existing.draft_id !== normalized.draftId
        || existing.source_content_hash !== normalized.sourceContentHash
        || existing.payload_json !== payload
      ) throw new Error('章节交接 ID 已绑定其他内容')
      return rowToRecord(existing)
    }
    database.prepare(`
      INSERT INTO chapter_handoffs (
        handoff_id, draft_id, chapter_number, source_content_hash, payload_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      normalized.handoffId,
      normalized.draftId,
      normalized.chapterNumber,
      normalized.sourceContentHash,
      payload,
    )
    return rowToRecord(database.prepare('SELECT * FROM chapter_handoffs WHERE handoff_id = ?').get(normalized.handoffId) as HandoffRow)
  }

  static get(handoffId: string): ChapterHandoffRecord | null {
    const row = db().prepare('SELECT * FROM chapter_handoffs WHERE handoff_id = ?').get(handoffId) as HandoffRow | undefined
    return row ? rowToRecord(row) : null
  }

  static confirm(handoffId: string): ChapterHandoffRecord {
    const database = db()
    const current = this.get(handoffId)
    if (!current) throw new Error('章节交接候选不存在')
    if (current.status === 'stale') throw new Error('章节交接来源已过期')
    sourceDraft(current)
    database.transaction(() => {
      database.prepare(`
        UPDATE chapter_handoffs
        SET status = 'superseded', updated_at = datetime('now')
        WHERE draft_id = ? AND status = 'confirmed' AND handoff_id <> ?
      `).run(current.draftId, handoffId)
      database.prepare(`
        UPDATE chapter_handoffs
        SET status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
        WHERE handoff_id = ?
      `).run(handoffId)
    })()
    return this.get(handoffId)!
  }

  static getLatestConfirmedBefore(chapterNumber: number): ChapterHandoffRecord | null {
    if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) throw new Error('目标章节无效')
    const row = db().prepare(`
      SELECT * FROM chapter_handoffs
      WHERE chapter_number < ? AND status = 'confirmed'
      ORDER BY chapter_number DESC, updated_at DESC
      LIMIT 1
    `).get(chapterNumber) as HandoffRow | undefined
    return row ? rowToRecord(row) : null
  }

  static listForChapter(chapterNumber: number): ChapterHandoffRecord[] {
    if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) throw new Error('目标章节无效')
    const rows = db().prepare(`
      SELECT * FROM chapter_handoffs
      WHERE chapter_number = ?
      ORDER BY CASE status WHEN 'candidate' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
               updated_at DESC
    `).all(chapterNumber) as HandoffRow[]
    return rows.map(rowToRecord)
  }
}
