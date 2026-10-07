/**
 * 蓝图同步的**空字段补齐**语义：只填空，绝不覆盖作者内容。
 *
 * 这是"档案自动填充"的最后一道防线 —— 即使提交载荷里带着模型写的值，
 * 仓储也只允许它落进旧值为空的字段。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'

import { getProjectDb } from '../../database'
import { CharacterRosterRepository } from '../character-roster-repository'
import { ensureCharacterRosterSchema } from '../character-roster-schema'
import type { CharacterRosterCommitRequest, CharacterRosterEntry } from '../../../src/shared/character-roster'

vi.mock('../../database', async importOriginal => ({
  ...(await importOriginal<typeof import('../../database')>()),
  getProjectDb: vi.fn(),
}))

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

function createProjectDb(): BetterSqlite3.Database {
  const created = new Database(':memory:')
  created.exec(`
    CREATE TABLE project_core (id TEXT PRIMARY KEY, characters_arch TEXT DEFAULT '');
    INSERT INTO project_core (id, characters_arch) VALUES ('main', '');
    CREATE TABLE characters (
      name TEXT PRIMARY KEY, role TEXT DEFAULT 'supporting',
      gender TEXT DEFAULT '', age TEXT DEFAULT '', appearance TEXT DEFAULT '',
      personality TEXT DEFAULT '', background TEXT DEFAULT '', abilities TEXT DEFAULT '',
      motivation TEXT DEFAULT '', relationships TEXT DEFAULT '', arc TEXT DEFAULT '', notes TEXT DEFAULT '',
      cs_location TEXT DEFAULT '', cs_power_level TEXT DEFAULT '', cs_physical_state TEXT DEFAULT '',
      cs_mental_state TEXT DEFAULT '', cs_key_items TEXT DEFAULT '', cs_recent_events TEXT DEFAULT '',
      cs_updated_at_chapter INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      faction_edges TEXT DEFAULT NULL
    );
  `)
  ensureCharacterRosterSchema(created)
  return created
}

function entry(overrides: Partial<CharacterRosterEntry> = {}): CharacterRosterEntry {
  return {
    name: '太虚宫主', role: 'supporting', gender: '', age: '', appearance: '',
    personality: '', background: '', abilities: '', motivation: '', arc: '',
    relationships: [], notes: '自动候选来源：章节蓝图（第149章）',
    ...overrides,
  }
}

function companion(): CharacterRosterEntry {
  return entry({ name: '苏倦', role: 'protagonist', notes: '作者手写' })
}

function commitRequest(overrides: Partial<CharacterRosterCommitRequest> = {}): CharacterRosterCommitRequest {
  return {
    operationId: 'blueprint-sync-001',
    expectedRevision: 0,
    schemaVersion: 1,
    intent: 'blueprint_sync',
    entries: [entry(), companion()],
    ...overrides,
  }
}

function stored(name: string): CharacterRosterEntry | undefined {
  return CharacterRosterRepository.read().entries.find(candidate => candidate.name === name)
}

beforeEach(() => {
  db = createProjectDb()
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => db.close())

describe('蓝图同步的空字段补齐', () => {
  it('把模型给的资料填进空字段', () => {
    CharacterRosterRepository.commit(commitRequest())
    expect(stored('太虚宫主')?.appearance).toBe('')

    CharacterRosterRepository.commit(commitRequest({
      operationId: 'blueprint-sync-002',
      expectedRevision: 1,
      entries: [entry({ appearance: '素白道袍', personality: '居高临下', arc: '从旁观者变成清算者' }), companion()],
    }))

    expect(stored('太虚宫主')?.appearance).toBe('素白道袍')
    expect(stored('太虚宫主')?.personality).toBe('居高临下')
    expect(stored('太虚宫主')?.arc).toBe('从旁观者变成清算者')
  })

  it('绝不覆盖作者已经写过的字段，也不改写 notes', () => {
    const authorNote = '自动候选来源：章节蓝图（第149章）\n作者补充：最终反派'
    CharacterRosterRepository.commit(commitRequest({
      entries: [entry({ personality: '作者亲笔：阴晴不定', notes: authorNote }), companion()],
    }))

    CharacterRosterRepository.commit(commitRequest({
      operationId: 'blueprint-sync-003',
      expectedRevision: 1,
      entries: [
        entry({ personality: '模型乱写的人设', appearance: '素白道袍', notes: '自动候选来源：章节蓝图（第149章）' }),
        companion(),
      ],
    }))

    const result = stored('太虚宫主')
    // 作者写过的字段原样
    expect(result?.personality).toBe('作者亲笔：阴晴不定')
    // 空字段被补
    expect(result?.appearance).toBe('素白道袍')
    // notes 一个字符都不动
    expect(result?.notes).toBe(authorNote)
  })
})
