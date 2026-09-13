import { createHash } from 'node:crypto'

import { getProjectDb } from '../database'
import {
  isPlanningMaterialKind,
  type PlanningMaterialInput,
  type PlanningMaterialKind,
  type PlanningMaterialRecord,
  type PlanningMaterialStatus,
} from '../../src/shared/planning-material'

function requireDb() {
  const db = getProjectDb()
  if (!db) throw new Error('项目数据库未打开')
  return db
}
function normalize(input: PlanningMaterialInput): PlanningMaterialInput & { contentHash: string } {
  const name = input.name.trim()
  const content = input.content.replace(/^\uFEFF/u, '').trim()
  if (!name || name.length > 160) throw new Error('规划资料名称无效')
  if (!isPlanningMaterialKind(input.kind)) throw new Error('规划资料类型无效')
  if (!content || Buffer.byteLength(content, 'utf8') > 2_000_000) throw new Error('规划资料内容为空或过大')
  return {
    name,
    kind: input.kind,
    content,
    ...(input.sourceDisplayName?.trim() ? { sourceDisplayName: input.sourceDisplayName.trim().slice(0, 240) } : {}),
    ...(input.sourceHash ? { sourceHash: input.sourceHash } : {}),
    contentHash: createHash('sha256').update(content, 'utf8').digest('hex'),
  }
}

function materialId(value: Pick<PlanningMaterialInput, 'name' | 'kind'> & { contentHash: string }): string {
  return createHash('sha256')
    .update(`planning-material:${value.kind}:${value.name}:${value.contentHash}`, 'utf8')
    .digest('hex')
}

function rowToRecord(row: Record<string, unknown>): PlanningMaterialRecord {
  return {
    id: String(row.id),
    schemaVersion: 1,
    name: String(row.name),
    kind: String(row.kind) as PlanningMaterialKind,
    content: String(row.content),
    ...(row.source_display_name ? { sourceDisplayName: String(row.source_display_name) } : {}),
    ...(row.source_hash ? { sourceHash: String(row.source_hash) } : {}),
    contentHash: String(row.content_hash),
    status: String(row.status) as PlanningMaterialStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.confirmed_at ? { confirmedAt: String(row.confirmed_at) } : {}),
  }
}

export class PlanningMaterialRepository {
  static upsertCandidate(input: PlanningMaterialInput): PlanningMaterialRecord {
    const value = normalize(input)
    const id = materialId(value)
    const db = requireDb()
    db.prepare(`
      INSERT INTO planning_materials (
        id, name, kind, content, source_display_name, source_hash, content_hash, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate')
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        kind = excluded.kind,
        content = excluded.content,
        source_display_name = excluded.source_display_name,
        source_hash = excluded.source_hash,
        content_hash = excluded.content_hash,
        updated_at = datetime('now')
    `).run(
      id,
      value.name,
      value.kind,
      value.content,
      value.sourceDisplayName ?? '',
      value.sourceHash ?? value.contentHash,
      value.contentHash,
    )
    return this.get(id)!
  }

  static get(id: string): PlanningMaterialRecord | null {
    const row = requireDb().prepare('SELECT * FROM planning_materials WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? rowToRecord(row) : null
  }

  static list(status?: PlanningMaterialStatus): PlanningMaterialRecord[] {
    const rows = status
      ? requireDb().prepare('SELECT * FROM planning_materials WHERE status = ? ORDER BY updated_at DESC, id ASC').all(status)
      : requireDb().prepare('SELECT * FROM planning_materials ORDER BY updated_at DESC, id ASC').all()
    return (rows as Record<string, unknown>[]).map(rowToRecord)
  }

  static listConfirmed(): PlanningMaterialRecord[] {
    return this.list('confirmed')
  }

  static confirm(id: string, expectedContentHash?: string): PlanningMaterialRecord {
    const existing = this.get(id)
    if (!existing) throw new Error('规划资料不存在')
    if (expectedContentHash && expectedContentHash !== existing.contentHash) throw new Error('规划资料已变化，请重新预览')
    const result = requireDb().prepare(`
      UPDATE planning_materials
      SET status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND content_hash = ?
    `).run(id, existing.contentHash)
    if (result.changes !== 1) throw new Error('规划资料已变化，请重新预览')
    return this.get(id)!
  }

  static reject(id: string): PlanningMaterialRecord {
    const result = requireDb().prepare(`
      UPDATE planning_materials
      SET status = 'rejected', updated_at = datetime('now')
      WHERE id = ?
    `).run(id)
    if (result.changes !== 1) throw new Error('规划资料不存在')
    return this.get(id)!
  }
}
