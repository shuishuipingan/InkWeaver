import { getProjectDb } from '../database'
import {
  emptyStoryContinuityDocument,
  normalizeStoryContinuityDocument,
  type StoryContinuityDocument,
} from '../../src/shared/story-continuity'

function db() {
  const value = getProjectDb()
  if (!value) throw new Error('项目数据库未打开')
  return value
}

export interface SaveStoryContinuityRequest {
  document: StoryContinuityDocument
  expectedRevision: number
}

export class StoryContinuityRepository {
  static read(chapterNumber: number): StoryContinuityDocument {
    if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) throw new Error('章节号无效')
    const row = db().prepare(`
      SELECT revision, payload_json AS payloadJson
      FROM story_continuity_plans
      WHERE chapter_number = ?
    `).get(chapterNumber) as { revision: number; payloadJson: string } | undefined
    if (!row) return emptyStoryContinuityDocument(chapterNumber)
    try {
      return normalizeStoryContinuityDocument(JSON.parse(row.payloadJson), chapterNumber)
    } catch {
      throw new Error('章节连续性计划数据损坏')
    }
  }

  static save(request: SaveStoryContinuityRequest): StoryContinuityDocument {
    const normalized = normalizeStoryContinuityDocument(request.document, request.document.chapterNumber)
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
      throw new Error('章节连续性 revision 无效')
    }
    const database = db()
    const current = this.read(normalized.chapterNumber)
    if (current.revision !== request.expectedRevision) throw new Error('章节连续性 revision 已过期')
    const next: StoryContinuityDocument = { ...normalized, revision: current.revision + 1 }
    database.prepare(`
      INSERT INTO story_continuity_plans (chapter_number, revision, payload_json, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(chapter_number) DO UPDATE SET
        revision = excluded.revision,
        payload_json = excluded.payload_json,
        updated_at = datetime('now')
    `).run(next.chapterNumber, next.revision, JSON.stringify(next))
    return this.read(next.chapterNumber)
  }
}
