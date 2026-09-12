import type BetterSqlite3 from 'better-sqlite3'

import { getProjectDb } from '../database'
import type {
  CharacterExtractionCandidate,
  CharacterExtractionCandidateStatus,
} from '../../src/shared/character-extraction'

interface CandidateRow {
  candidate_id: string
  source_id: string
  source_hash: string
  status: CharacterExtractionCandidateStatus
  payload_json: string
  created_at: string
  updated_at: string
}

const STATUS: ReadonlySet<string> = new Set(['pending', 'accepted', 'rejected', 'stale', 'applied'])

function db(): BetterSqlite3.Database {
  const value = getProjectDb()
  if (!value) throw new Error('项目数据库未打开')
  return value
}

function normalize(candidate: CharacterExtractionCandidate): CharacterExtractionCandidate {
  if (!candidate.candidateId.trim()) throw new Error('人物候选 ID 不能为空')
  if (!candidate.source.sourceId.trim() || !candidate.source.sourceHash.trim()) throw new Error('人物候选来源无效')
  if (!candidate.name.trim()) throw new Error('人物候选姓名不能为空')
  if (!STATUS.has(candidate.status)) throw new Error('人物候选状态无效')
  return {
    ...candidate,
    name: candidate.name.trim(),
    aliases: [...new Set(candidate.aliases.map(alias => alias.trim()).filter(Boolean))],
    fieldEvidence: candidate.fieldEvidence.map(evidence => ({ ...evidence, excerpt: evidence.excerpt.trim() })),
  }
}

function rowToCandidate(row: CandidateRow): CharacterExtractionCandidate {
  const candidate = JSON.parse(row.payload_json) as CharacterExtractionCandidate
  return { ...candidate, status: row.status }
}

export class CharacterExtractionCandidateRepository {
  static saveBatch(candidates: readonly CharacterExtractionCandidate[]): CharacterExtractionCandidate[] {
    const database = db()
    const normalized = candidates.map(normalize)
    database.transaction(() => {
      for (const candidate of normalized) {
        const payload = JSON.stringify({ ...candidate, status: 'pending' as const })
        const existing = database.prepare(`
          SELECT * FROM character_extraction_candidates WHERE candidate_id = ?
        `).get(candidate.candidateId) as CandidateRow | undefined
        if (existing) {
          if (
            existing.source_id !== candidate.source.sourceId
            || existing.source_hash !== candidate.source.sourceHash
            || existing.payload_json !== payload
          ) throw new Error('人物候选 ID 已绑定其他来源或内容')
          continue
        }
        database.prepare(`
          INSERT INTO character_extraction_candidates (
            candidate_id, source_id, source_hash, status, payload_json
          ) VALUES (?, ?, ?, 'pending', ?)
        `).run(candidate.candidateId, candidate.source.sourceId, candidate.source.sourceHash, payload)
      }
    })()
    return normalized.map(candidate => this.get(candidate.candidateId)!).filter(Boolean)
  }

  static get(candidateId: string): CharacterExtractionCandidate | null {
    const row = db().prepare(`
      SELECT * FROM character_extraction_candidates WHERE candidate_id = ?
    `).get(candidateId) as CandidateRow | undefined
    return row ? rowToCandidate(row) : null
  }

  static list(sourceId: string, sourceHash: string): CharacterExtractionCandidate[] {
    const rows = db().prepare(`
      SELECT * FROM character_extraction_candidates
      WHERE source_id = ? AND source_hash = ?
      ORDER BY updated_at ASC, candidate_id ASC
    `).all(sourceId, sourceHash) as CandidateRow[]
    return rows.map(rowToCandidate)
  }

  static setStatus(candidateId: string, status: CharacterExtractionCandidateStatus): CharacterExtractionCandidate {
    if (!STATUS.has(status)) throw new Error('人物候选状态无效')
    const result = db().prepare(`
      UPDATE character_extraction_candidates
      SET status = ?, updated_at = datetime('now')
      WHERE candidate_id = ?
    `).run(status, candidateId)
    if (result.changes === 0) throw new Error('人物候选不存在')
    return this.get(candidateId)!
  }

  static markSourceStale(sourceId: string, sourceHash: string): number {
    const result = db().prepare(`
      UPDATE character_extraction_candidates
      SET status = 'stale', updated_at = datetime('now')
      WHERE source_id = ? AND source_hash = ? AND status IN ('pending', 'accepted')
    `).run(sourceId, sourceHash)
    return result.changes
  }
}
