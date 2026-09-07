import { getProjectDb } from '../database'

export interface WritingStyleHistoryRecord {
  id: number
  previousStyle: string
  nextStyle: string
  sourceFingerprint: string
  createdAt: string
}

/** 项目文风档案版本历史；只记录每次 AI 写入前的旧值和新值，不含正文。 */
export class StyleHistoryRepository {
  static list(limit = 30): WritingStyleHistoryRecord[] {
    const db = getProjectDb()
    if (!db) return []
    return db.prepare(`
      SELECT id, previous_style AS previousStyle, next_style AS nextStyle,
             source_fingerprint AS sourceFingerprint, created_at AS createdAt
      FROM writing_style_history
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as WritingStyleHistoryRecord[]
  }

  static record(previousStyle: string, nextStyle: string, sourceFingerprint: string): WritingStyleHistoryRecord {
    const db = getProjectDb()
    if (!db) throw new Error('项目数据库未打开')
    const result = db.prepare(`
      INSERT INTO writing_style_history (previous_style, next_style, source_fingerprint)
      VALUES (?, ?, ?)
    `).run(previousStyle, nextStyle, sourceFingerprint)
    const id = Number(result.lastInsertRowid)
    const row = db.prepare(`
      SELECT id, previous_style AS previousStyle, next_style AS nextStyle,
             source_fingerprint AS sourceFingerprint, created_at AS createdAt
      FROM writing_style_history
      WHERE id = ?
    `).get(id) as WritingStyleHistoryRecord
    return row
  }
}