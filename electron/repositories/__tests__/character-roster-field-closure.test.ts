/**
 * CharacterRosterEntry 字段闭环护栏。
 *
 * 背景：factionEdges 落库时挖出五处丢点，其中四处是**同一模式**——逐字段白名单投射
 * （normalizeEntry / canonicalEntries / characterFromEntry / mergeExistingEntryManualWins）。
 * 列缺失会主动报 no such column，白名单投射却静默通过：**将来加任何新字段都会重演**。
 *
 * 本文件把「加字段时四处白名单都要记得改」从人的自觉变成机械保证，靠两件事：
 *   ① 编译期穷尽钉子（下方 UncoveredKey）——新字段没进 COVERED_KEYS 就**编译不过**；
 *   ② 运行时逐字段闭环——commit→read、commit→commit、payloadHash 三条路径各断言一遍。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'

import { ensureCharacterFactionEdgesColumn, getProjectDb } from '../../database'
import { CharacterRosterRepository } from '../character-roster-repository'
import { ensureCharacterRosterSchema } from '../character-roster-schema'
import type {
  CharacterRosterCommitRequest,
  CharacterRosterEntry,
  CharacterRosterRelationship,
} from '../../../src/shared/character-roster'

vi.mock('../../database', async importOriginal => ({
  ...(await importOriginal<typeof import('../../database')>()),
  getProjectDb: vi.fn(),
}))

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

// —— 编译期穷尽钉子：CharacterRosterEntry 新增字段而这里没跟上，本行即报类型错误。
const COVERED_KEYS = [
  'characterId', 'name', 'aliases', 'role', 'gender', 'age', 'appearance',
  'personality', 'background', 'abilities', 'motivation', 'relationships',
  'factionEdges', 'arc', 'notes', 'currentState', 'legacyRelationshipNotes',
] as const satisfies readonly (keyof CharacterRosterEntry)[]
type UncoveredKey = Exclude<keyof CharacterRosterEntry, typeof COVERED_KEYS[number]>
const _everyEntryKeyIsCovered: UncoveredKey extends never ? true : never = true
void _everyEntryKeyIsCovered

// 第二层穷尽钉子：关系是嵌套接口，顶层的 COVERED_KEYS 钉不到它。
// facets 的教训正在这里——展示层从持久化 JSON 读它，写侧却曾把它排除在白名单外。
const COVERED_RELATIONSHIP_KEYS = [
  'target', 'relation', 'facets', 'direction', 'sourceChapter', 'evidence',
] as const satisfies readonly (keyof CharacterRosterRelationship)[]
type UncoveredRelationshipKey = Exclude<keyof CharacterRosterRelationship, typeof COVERED_RELATIONSHIP_KEYS[number]>
const _everyRelationshipKeyIsCovered: UncoveredRelationshipKey extends never ? true : never = true
void _everyRelationshipKeyIsCovered

let db: BetterSqlite3.Database

function createProjectDb(): BetterSqlite3.Database {
  const created = new Database(':memory:')
  created.exec(`
    CREATE TABLE project_core (id TEXT PRIMARY KEY, characters_arch TEXT DEFAULT '');
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
      updated_at TEXT DEFAULT (datetime('now')),
      faction_edges TEXT DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS blueprints (id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_number INTEGER DEFAULT 0, characters TEXT DEFAULT '[]', updated_at TEXT DEFAULT (datetime('now')));
  `)
  ensureCharacterRosterSchema(created)
  ensureCharacterFactionEdgesColumn(created)
  return created
}

/** 填满 CharacterRosterEntry 的每一个可选字段。 */
function fullEntry(overrides: Partial<CharacterRosterEntry> = {}): CharacterRosterEntry {
  return {
    characterId: 'char_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    name: '林舟',
    aliases: ['阿舟', '铁砧学徒'],
    role: 'protagonist',
    gender: '男',
    age: '十八岁',
    appearance: '灰袍少年',
    personality: '克制',
    background: '铁砧镇学徒',
    abilities: '锻造',
    motivation: '守住家人',
    // 关系闭包要求 target 出现在同一批名册里（assertRelationshipClosure），
    // 所以夹具里的关系只指向同伴角色，由 commitRequest 一并提交。
    // 注意：facets 不属 roster 存储契约（normalizeRelationships 只保留
    // target/relation/direction/sourceChapter），它是展示层概念，故这里不放。
    relationships: [
      {
        target: '苏绾',
        relation: '师徒',
        facets: [{ kind: 'stance', text: '名义师徒' }],
        direction: 'mutual',
        sourceChapter: 3,
        evidence: '林舟把钥匙交给她',
      },
    ],
    factionEdges: [{ faction: '铁砧盟', stance: '名义归属', text: '挂名弟子' }],
    arc: '从学徒成长为守护者',
    notes: '左手有旧伤',
    currentState: {
      location: '铁砧镇',
      powerLevel: '锻骨初境',
      physicalState: '左臂旧伤',
      mentalState: '压抑',
      keyItems: '熔心铁',
      recentEvents: '宗门大比',
      updatedAtChapter: 12,
    },
    ...overrides,
  }
}

function companionEntry(): CharacterRosterEntry {
  return fullEntry({
    characterId: 'char_b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
    name: '苏绾',
    role: 'supporting',
    aliases: undefined,
    relationships: [{ target: '林舟', relation: '师徒' }],
    factionEdges: undefined,
    currentState: undefined,
  })
}

function commitRequest(overrides: Partial<CharacterRosterCommitRequest> = {}): CharacterRosterCommitRequest {
  return {
    operationId: 'fields-closure-001',
    expectedRevision: 0,
    schemaVersion: 1,
    entries: [fullEntry(), companionEntry()],
    intent: 'architecture_generation',
    ...overrides,
  }
}

function readEntry(): CharacterRosterEntry {
  return CharacterRosterRepository.read().entries.find(entry => entry.name === '林舟')!
}

beforeEach(() => {
  db = createProjectDb()
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => db.close())

describe('CharacterRosterEntry 字段闭环', () => {
  it('commit → read：每一个字段（含全部可选字段）都原样读回', () => {
    const submitted = fullEntry()
    CharacterRosterRepository.commit(commitRequest())
    const readBack = readEntry()

    for (const key of COVERED_KEYS.filter(candidate => candidate !== 'legacyRelationshipNotes')) {
      if (key === 'currentState') continue // 单独断言：读回会多一个系统写入的 provenance
      expect(readBack, `字段 ${key} 在落库往返中丢失或改变`).toHaveProperty(key)
      expect(readBack[key], `字段 ${key} 的值不一致`).toEqual(submitted[key])
    }

    // 关系层：嵌套接口的每个字段都必须原样往返 —— 顶层逐字段断言看不到这一层。
    const submittedRelationship = submitted.relationships[0]!
    const readRelationship = readBack.relationships[0]! as unknown as Record<string, unknown>
    for (const key of COVERED_RELATIONSHIP_KEYS) {
      expect(readRelationship, `关系字段 ${key} 在落库往返中丢失`).toHaveProperty(key)
      expect(readRelationship[key], `关系字段 ${key} 的值不一致`)
        .toEqual(submittedRelationship[key as keyof typeof submittedRelationship])
    }

    // currentState：提交的每个键都要原样读回，多出来的键只能是实现写入的 provenance。
    const submittedState = submitted.currentState!
    const readState = readBack.currentState! as unknown as Record<string, unknown>
    for (const [stateKey, stateValue] of Object.entries(submittedState)) {
      expect(readState[stateKey], `currentState.${stateKey} 不一致`).toEqual(stateValue)
    }
    expect(Object.keys(readState).filter(candidate => !(candidate in submittedState))).toEqual(['provenance'])
  })

  it('commit → commit：本轮没产出新字段时，已有的新字段不被抹掉（manual wins）', () => {
    const first = CharacterRosterRepository.commit(commitRequest())
    expect(first.revision).toBe(1)

    // 重新生成时模型没产出 factionEdges / currentState —— 已有值必须留存。
    const regenerated = fullEntry({
      factionEdges: undefined,
      currentState: undefined,
      characterId: undefined,
      aliases: undefined,
    })
    CharacterRosterRepository.commit({
      operationId: 'fields-closure-002',
      expectedRevision: first.revision,
      schemaVersion: 1,
      entries: [regenerated, companionEntry()],
      intent: 'architecture_generation',
    })

    const readBack = readEntry()
    expect(readBack.factionEdges).toEqual([{ faction: '铁砧盟', stance: '名义归属', text: '挂名弟子' }])
    expect(readBack.currentState).toMatchObject({ location: '铁砧镇', updatedAtChapter: 12 })
    expect(readBack.characterId).toBe('char_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')
    expect(readBack.aliases).toEqual(['阿舟', '铁砧学徒'])
  })

  it('canonicalEntries 哈希路径：带与不带新字段的同一 entry，payloadHash 必须不同', () => {
    const withField = CharacterRosterRepository.commit(commitRequest())
    const withoutField = CharacterRosterRepository.commit({
      operationId: 'fields-closure-003',
      expectedRevision: withField.revision,
      schemaVersion: 1,
      entries: [fullEntry({ factionEdges: undefined }), companionEntry()],
      intent: 'architecture_generation',
    })

    // 哈希不感知新字段的话，这两次会被当成同一份 payload，幂等回放会静默吞掉差异。
    expect(withoutField.payloadHash).not.toBe(withField.payloadHash)
  })

  it('语义钉子：factionEdges 的空数组与 undefined 同义，合并后等价于无字段', () => {
    const first = CharacterRosterRepository.commit(commitRequest())

    // 第二次显式提交空数组：语义上表示「没有可依据的势力归属」，不得被当成一次有效清空以外的东西。
    CharacterRosterRepository.commit({
      operationId: 'fields-closure-004',
      expectedRevision: first.revision,
      schemaVersion: 1,
      entries: [fullEntry({ factionEdges: [] }), companionEntry()],
      intent: 'architecture_generation',
    })

    // 既有值优先保留（manual wins），空数组不构成「有值」，所以原值仍在。
    expect(readEntry().factionEdges).toEqual([{ faction: '铁砧盟', stance: '名义归属', text: '挂名弟子' }])
    // 而入口归一：提交一份本来就没有方案的 entry（空数组），读回时不该凭空长出该字段。
    CharacterRosterRepository.commit({
      operationId: 'fields-closure-005',
      expectedRevision: CharacterRosterRepository.read().revision,
      schemaVersion: 1,
      entries: [fullEntry({ name: '空立场者', characterId: 'char_c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', factionEdges: [] }), companionEntry()],
      intent: 'architecture_generation',
    })
    const empty = CharacterRosterRepository.read().entries.find(entry => entry.name === '空立场者')!
    expect('factionEdges' in empty).toBe(false)
  })

  it('legacyRelationshipNotes 不可经生成路径提交（契约明令）', () => {
    const first = CharacterRosterRepository.commit(commitRequest())

    // 契约：该字段只会由 read 返回、或由 manual_edit 原样回写；模型生成 / 导入 /
    // 蓝图同步 / 章节推进 / 旧图谱修复均不可提交。它的 manual_edit 往返需要
    // 「该角色已有旧自由文本」这一前提，属 character-roster-repository.test.ts 的覆盖范围，
    // 本文件只钉住这一侧的拒绝行为。
    expect(() => CharacterRosterRepository.commit(commitRequest({
      operationId: 'fields-closure-006',
      expectedRevision: first.revision,
      entries: [fullEntry({ legacyRelationshipNotes: '生成路径不该能写这个' }), companionEntry()],
    }))).toThrowError(/自由文本关系/)
  })

  it('判别力自证：把投射结果里的 factionEdges / currentState 抹掉后，逐字段比较必然不等', () => {
    CharacterRosterRepository.commit(commitRequest())
    const readBack = readEntry()

    // 等价于「normalizeEntry / characterFromEntry 的投射被删掉」：读回值会缺字段，
    // 于是逐字段断言必然在那一处变红 —— 这正是本文件在测投射完整性的证据。
    const missingProjection = { ...readBack } as Record<string, unknown>
    delete missingProjection.factionEdges
    delete missingProjection.currentState

    expect(missingProjection).not.toEqual(readBack)
    expect('factionEdges' in missingProjection).toBe(false)
  })
})