import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'

import { getProjectDb } from '../../database'
import { StyleHistoryRepository } from '../style-history-repository'

vi.mock('../../database', () => ({
  getProjectDb: vi.fn(),
}))

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

let db: BetterSqlite3.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE writing_style_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      previous_style TEXT NOT NULL DEFAULT '',
      next_style TEXT NOT NULL DEFAULT '',
      source_fingerprint TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => {
  db.close()
})

describe('StyleHistoryRepository', () => {
  it('records a style profile change with source fingerprint and lists newest first', () => {
    StyleHistoryRepository.record('旧文风', '新文风', 'abc123')
    StyleHistoryRepository.record('', '第二版文风', 'def456')
    const records = StyleHistoryRepository.list()
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ nextStyle: '第二版文风', sourceFingerprint: 'def456' })
    expect(records[1]).toMatchObject({ previousStyle: '旧文风', nextStyle: '新文风', sourceFingerprint: 'abc123' })
  })
})