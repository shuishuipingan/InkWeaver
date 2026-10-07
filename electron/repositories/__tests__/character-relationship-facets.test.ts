/**
 * 多面关系（facets）落库往返。
 *
 * 展示层明确从**持久化 JSON** 解析 facets（relationship-presentation 的
 * "reading persisted JSON" 用例），所以写入侧把它排除在白名单外就是断链：
 * 生成时有多面关系，保存后只剩一条主句。这里钉住整条链。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'

import { getProjectDb } from '../../database'
import { CharacterRosterRepository } from '../character-roster-repository'
import { ensureCharacterRosterSchema } from '../character-roster-schema'
import type {
  CharacterRosterCommitRequest,
  CharacterRosterEntry,
  CharacterRosterRelationshipFacet,
} from '../../../src/shared/character-roster'

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
    name: '林舟', role: 'protagonist', gender: '男', age: '十八岁', appearance: '灰袍少年',
    personality: '克制', background: '铁砧镇学徒', abilities: '锻造', motivation: '守住家人',
    relationships: [{ target: '苏绾', relation: '师徒' }],
    arc: '从学徒成长为守护者', notes: '',
    ...overrides,
  }
}

function companion(): CharacterRosterEntry {
  return entry({
    name: '苏绾', role: 'supporting', gender: '女', appearance: '青衣剑客',
    relationships: [{ target: '林舟', relation: '师徒' }], notes: '',
  })
}

function commitRequest(overrides: Partial<CharacterRosterCommitRequest> = {}): CharacterRosterCommitRequest {
  return {
    operationId: 'architecture-run-facet-001',
    expectedRevision: 0,
    schemaVersion: 1,
    intent: 'architecture_generation',
    entries: [entry(), companion()],
    ...overrides,
  }
}

function facetsOf(name: string) {
  return CharacterRosterRepository.read().entries
    .find(candidate => candidate.name === name)?.relationships[0]?.facets
}

beforeEach(() => {
  db = createProjectDb()
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => db.close())

describe('多面关系落库往返', () => {
  it('keeps every valid facet through commit → read', () => {
    CharacterRosterRepository.commit(commitRequest({
      entries: [
        entry({
          relationships: [{
            target: '苏绾',
            relation: '师徒',
            facets: [
              { kind: 'stance', text: '表面恭敬，暗中抗拒' },
              { kind: 'emotion', text: '既依赖又怨怼' },
              { kind: 'knowledge', text: '不知道对方在查同一件事' },
            ],
          }],
        }),
        companion(),
      ],
    }))

    expect(facetsOf('林舟')).toEqual([
      { kind: 'stance', text: '表面恭敬，暗中抗拒' },
      { kind: 'emotion', text: '既依赖又怨怼' },
      { kind: 'knowledge', text: '不知道对方在查同一件事' },
    ])
    // 真落在列上（不只是内存往返）
    const raw = db.prepare('SELECT relationships FROM characters WHERE name = ?').get('林舟') as { relationships: string }
    expect(JSON.parse(raw.relationships)[0].facets).toHaveLength(3)
  })

  it('drops only the invalid facets instead of rejecting the whole relationship', () => {
    CharacterRosterRepository.commit(commitRequest({
      entries: [
        entry({
          relationships: [{
            target: '苏绾',
            relation: '师徒',
            facets: [
              // 运行时必须是非法 kind，类型层用 cast 表达"故意越界"
              { kind: 'not-a-kind' as unknown as CharacterRosterRelationshipFacet['kind'], text: '未知维度' },
              { kind: 'stance', text: '   ' },
              { kind: 'emotion', text: '有效维度' },
            ],
          }],
        }),
        companion(),
      ],
    }))

    expect(facetsOf('林舟')).toEqual([{ kind: 'emotion', text: '有效维度' }])
  })

  it('treats an empty or absent facet list as no facets (old shape preserved)', () => {
    CharacterRosterRepository.commit(commitRequest({
      entries: [
        entry({ relationships: [{ target: '苏绾', relation: '师徒', facets: [] }] }),
        companion(),
      ],
    }))

    expect(facetsOf('林舟')).toBeUndefined()
    const raw = db.prepare('SELECT relationships FROM characters WHERE name = ?').get('林舟') as { relationships: string }
    expect(JSON.parse(raw.relationships)[0]).not.toHaveProperty('facets')
  })

  it('does not let a later generation without facets erase existing ones', () => {
    CharacterRosterRepository.commit(commitRequest({
      entries: [
        entry({ relationships: [{ target: '苏绾', relation: '师徒', facets: [{ kind: 'stance', text: '敬而远之' }] }] }),
        companion(),
      ],
    }))
    expect(facetsOf('林舟')).toEqual([{ kind: 'stance', text: '敬而远之' }])

    // 重新生成一次且候选不带 facets：已有 facets 必须保留
    CharacterRosterRepository.commit(commitRequest({
      operationId: 'architecture-run-facet-002',
      expectedRevision: 1,
    }))
    expect(facetsOf('林舟')).toEqual([{ kind: 'stance', text: '敬而远之' }])
  })

  it('reproduces the user scenario: manifest relations with facets survive to readSnapshot', () => {
    // 架构命令产出的 manifest relations 形状（target/relation/facets/evidence）
    const manifestRelations = [
      {
        target: '苏绾',
        relation: '师徒',
        facets: [
          { kind: 'stance' as const, text: '名义上的师父' },
          { kind: 'history' as const, text: '十年前救过他一命' },
        ],
      },
    ]
    CharacterRosterRepository.commit(commitRequest({
      entries: [
        entry({ relationships: manifestRelations }),
        companion(),
      ],
    }))

    // 重开项目后角色卡读到的关系必须仍带多面维度
    const reopened = CharacterRosterRepository.read().entries.find(candidate => candidate.name === '林舟')
    expect(reopened?.relationships[0]?.facets).toEqual([
      { kind: 'stance', text: '名义上的师父' },
      { kind: 'history', text: '十年前救过他一命' },
    ])
  })
})
