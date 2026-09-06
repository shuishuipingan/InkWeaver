import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { getProjectDb } from '../../database'
import { StoryContinuityRepository } from '../story-continuity-repository'
import { emptyStoryContinuityDocument } from '../../../src/shared/story-continuity'

vi.mock('../../database', () => ({ getProjectDb: vi.fn() }))
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`CREATE TABLE story_continuity_plans (
    chapter_number INTEGER PRIMARY KEY,
    revision INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`)
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => db.close())

describe('StoryContinuityRepository', () => {
  it('reads an empty plan, saves a revision, and rejects stale saves', () => {
    const initial = StoryContinuityRepository.read(3)
    expect(initial.revision).toBe(0)
    const next = StoryContinuityRepository.save({
      expectedRevision: 0,
      document: {
        ...emptyStoryContinuityDocument(3),
        sceneBeats: [{
          id: 'scene-3-1', sceneNumber: 1, status: 'planned', entryState: '', goal: '找到门', obstacle: '',
          choice: '', consequence: '', exitState: '', evidence: [],
        }],
      },
    })
    expect(next.revision).toBe(1)
    expect(StoryContinuityRepository.read(3).sceneBeats[0]?.goal).toBe('找到门')
    expect(() => StoryContinuityRepository.save({ expectedRevision: 0, document: next })).toThrow(/revision 已过期/)
  })
})
