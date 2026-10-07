/**
 * factionEdges 落库往返。
 *
 * 这条链上有两个静默丢失入口：
 *  1) entry → CharacterData 转换不带它 → 保存即丢（保存后重开 roster 就没了）；
 *  2) canonicalEntries 不含它 → payloadHash 不感知 → "先无立场、后有立场"的提交会被
 *     当成重复提交跳过，立场永远写不进去。
 * 两个入口都必须钉住，否则修了落库也留不下数据。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'

import { ensureCharacterFactionEdgesColumn, getProjectDb } from '../../database'
import { CharacterRepository } from '../character-repository'
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

function createProjectDb(options: { withFactionColumn?: boolean } = {}): BetterSqlite3.Database {
  const created = new Database(':memory:')
  created.exec(`
    CREATE TABLE project_core (
      id TEXT PRIMARY KEY,
      characters_arch TEXT DEFAULT ''
    );
    INSERT INTO project_core (id, characters_arch) VALUES ('main', '');
    CREATE TABLE characters (
      name TEXT PRIMARY KEY,
      role TEXT DEFAULT 'supporting',
      gender TEXT DEFAULT '',
      age TEXT DEFAULT '',
      appearance TEXT DEFAULT '',
      personality TEXT DEFAULT '',
      background TEXT DEFAULT '',
      abilities TEXT DEFAULT '',
      motivation TEXT DEFAULT '',
      relationships TEXT DEFAULT '',
      arc TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      cs_location TEXT DEFAULT '',
      cs_power_level TEXT DEFAULT '',
      cs_physical_state TEXT DEFAULT '',
      cs_mental_state TEXT DEFAULT '',
      cs_key_items TEXT DEFAULT '',
      cs_recent_events TEXT DEFAULT '',
      cs_updated_at_chapter INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
      ${options.withFactionColumn === false ? '' : ', faction_edges TEXT DEFAULT NULL'}
    );
  `)
  ensureCharacterRosterSchema(created)
  return created
}

function entry(overrides: Partial<CharacterRosterEntry> = {}): CharacterRosterEntry {
  return {
    name: '林舟',
    role: 'protagonist',
    gender: '男',
    age: '十八岁',
    appearance: '灰袍少年',
    personality: '克制',
    background: '铁砧镇学徒',
    abilities: '锻造',
    motivation: '守住家人',
    relationships: [{ target: '苏绾', relation: '师徒' }],
    arc: '从学徒成长为守护者',
    notes: '左手有旧伤',
    ...overrides,
  }
}

function companion(): CharacterRosterEntry {
  return entry({
    name: '苏绾',
    role: 'supporting',
    gender: '女',
    age: '二十六岁',
    appearance: '青衣剑客',
    personality: '冷静',
    background: '游侠',
    abilities: '剑术',
    motivation: '偿还旧债',
    relationships: [{ target: '林舟', relation: '师徒' }],
    arc: '学会托付',
    notes: '',
  })
}

function commitRequest(overrides: Partial<CharacterRosterCommitRequest> = {}): CharacterRosterCommitRequest {
  return {
    operationId: 'architecture-run-faction-001',
    expectedRevision: 0,
    schemaVersion: 1,
    entries: [entry(), companion()],
    ...overrides,
  }
}

function findEntry(name: string): CharacterRosterEntry | undefined {
  return CharacterRosterRepository.read().entries.find(candidate => candidate.name === name)
}

function rawColumn(name: string): string | null {
  const row = db.prepare('SELECT faction_edges FROM characters WHERE name = ?').get(name) as
    | { faction_edges: string | null }
    | undefined
  return row?.faction_edges ?? null
}

beforeEach(() => {
  db = createProjectDb()
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => db.close())

describe('factionEdges 落库往返', () => {
  it('round-trips faction edges through CharacterRepository itself', () => {
    CharacterRepository.upsert({
      name: '直接写',
      role: 'supporting',
      gender: '女',
      age: '二十岁',
      appearance: '',
      personality: '',
      background: '',
      abilities: '',
      motivation: '',
      relationships: '',
      factionEdges: [{ faction: '铁砧镇', stance: '效忠' }, { faction: '灰袍会', stance: '敌对' }],
      arc: '',
      notes: '',
    })
    expect(CharacterRepository.getByName('直接写')?.factionEdges).toEqual([
      { faction: '铁砧镇', stance: '效忠' },
      { faction: '灰袍会', stance: '敌对' },
    ])
    expect(JSON.parse(rawColumn('直接写') ?? 'null')).toHaveLength(2)
  })

  it('writes faction edges into the characters column and reads them back in full', () => {
    CharacterRosterRepository.commit(commitRequest({
      entries: [
        entry({
          factionEdges: [
            { faction: '铁砧镇', stance: '名义归属，暗中怀疑' },
            { faction: '灰袍会', stance: '敌对', text: '第十九章正面冲突' },
          ],
        }),
        companion(),
      ],
    }))

    expect(findEntry('林舟')?.factionEdges).toEqual([
      { faction: '铁砧镇', stance: '名义归属，暗中怀疑' },
      { faction: '灰袍会', stance: '敌对', text: '第十九章正面冲突' },
    ])
    // 真正落到了列上，而不是只在内存里往返
    expect(JSON.parse(rawColumn('林舟') ?? '[]')).toHaveLength(2)
    // 没有立场的角色不受影响
    expect(findEntry('苏绾')?.factionEdges).toBeUndefined()
  })

  it('keeps projects without faction edges byte-identical (no new field, column stays NULL)', () => {
    CharacterRosterRepository.commit(commitRequest())

    expect(findEntry('林舟')?.factionEdges).toBeUndefined()
    expect(rawColumn('林舟')).toBeNull()
    // 旧行为不变：关系仍走 relationships 列
    expect(findEntry('林舟')?.relationships).toEqual([{ target: '苏绾', relation: '师徒' }])
  })

  it('writes newly generated faction edges and never lets a faction-less replay erase them', () => {
    // 第一次架构生成：没有立场
    CharacterRosterRepository.commit(commitRequest({ intent: 'architecture_generation' }))
    expect(findEntry('林舟')?.factionEdges).toBeUndefined()

    // 重新生成架构，候选带上了立场：canonicalEntries 感知 factionEdges → 哈希不同 → 必须真正落库
    CharacterRosterRepository.commit(commitRequest({
      operationId: 'architecture-run-faction-002',
      expectedRevision: 1,
      intent: 'architecture_generation',
      entries: [
        entry({ factionEdges: [{ faction: '灰烬教团', stance: '暗中合作' }] }),
        companion(),
      ],
    }))
    expect(findEntry('林舟')?.factionEdges).toEqual([{ faction: '灰烬教团', stance: '暗中合作' }])

    // 幂等回放：再生成一次且候选**不带立场** → 已有立场必须原样保留（不能被静默抹掉）
    CharacterRosterRepository.commit(commitRequest({
      operationId: 'architecture-run-faction-003',
      expectedRevision: 2,
      intent: 'architecture_generation',
    }))
    expect(findEntry('林舟')?.factionEdges).toEqual([{ faction: '灰烬教团', stance: '暗中合作' }])
  })

  it('migrates an older characters table that predates the faction_edges column', () => {
    const legacy = createProjectDb({ withFactionColumn: false })
    legacy.prepare(
      "INSERT INTO characters (name, role, notes) VALUES ('旧角色', 'supporting', '旧备注')",
    ).run()

    ensureCharacterFactionEdgesColumn(legacy)

    const columns = (legacy.prepare('PRAGMA table_info(characters)').all() as Array<{ name: string }>)
      .map(column => column.name)
    expect(columns).toContain('faction_edges')
    // 既有数据完好，且迁移可重复执行
    expect(legacy.prepare('SELECT name, notes FROM characters WHERE name = ?').get('旧角色'))
      .toEqual({ name: '旧角色', notes: '旧备注' })
    expect(() => ensureCharacterFactionEdgesColumn(legacy)).not.toThrow()
    legacy.close()
  })

  it('treats an unparsable or malformed faction_edges column as no edges instead of crashing', () => {
    db.prepare(
      "INSERT INTO characters (name, role, faction_edges) VALUES ('坏列', 'supporting', '{not json')",
    ).run()

    expect(() => CharacterRepository.getAll()).not.toThrow()
    expect(CharacterRepository.getByName('坏列')?.factionEdges).toBeUndefined()

    // 合法 JSON 但数组项形状不对：只保留形状正确的项
    db.prepare('UPDATE characters SET faction_edges = ? WHERE name = ?')
      .run(JSON.stringify([{ faction: 42, stance: '坏' }, { faction: '铁砧镇', stance: '合作' }]), '坏列')
    expect(CharacterRepository.getByName('坏列')?.factionEdges).toEqual([
      { faction: '铁砧镇', stance: '合作' },
    ])
  })
})
