import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type BetterSqlite3 from 'better-sqlite3'

import { getProjectDb } from '../../database'
import { StoryDirectionRepository } from '../story-direction-repository'
import { CharacterRosterRepository } from '../character-roster-repository'
import { ensureCharacterRosterSchema } from '../character-roster-schema'
import { textFingerprint } from '../../../src/shared/character-extraction'

vi.mock('../../database', () => ({ getProjectDb: vi.fn() }))
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE project_core (
      id TEXT PRIMARY KEY, project_name TEXT DEFAULT '', genre TEXT DEFAULT '', sub_genre TEXT DEFAULT '',
      target_audience TEXT DEFAULT '', total_chapters INTEGER DEFAULT 3, words_per_chapter INTEGER DEFAULT 3000,
      writing_language TEXT DEFAULT 'zh-CN', creative_strategy TEXT DEFAULT 'auto', narrative_thread_dormant_threshold INTEGER DEFAULT 8,
      plot_structure TEXT DEFAULT '', narrative_pov TEXT DEFAULT '', writing_style TEXT DEFAULT '', reference_works TEXT DEFAULT '',
      global_guidance TEXT DEFAULT '', golden_finger TEXT DEFAULT '', core_outline TEXT DEFAULT '', world_setting TEXT DEFAULT '',
      protagonist_profile TEXT DEFAULT '', premise TEXT DEFAULT '', worldbuilding TEXT DEFAULT '', characters_arch TEXT DEFAULT '',
      synopsis TEXT DEFAULT '', character_states TEXT DEFAULT '', created_at TEXT DEFAULT '', updated_at TEXT DEFAULT ''
    );
    INSERT INTO project_core (id, premise) VALUES ('main', '主角只有一个人格');
    CREATE TABLE blueprints (
      chapter_number INTEGER PRIMARY KEY, title TEXT DEFAULT '', role TEXT DEFAULT '', purpose TEXT DEFAULT '',
      key_events TEXT DEFAULT '', characters TEXT DEFAULT '[]', suspense_hook TEXT DEFAULT '', user_guidance TEXT DEFAULT '',
      notes TEXT DEFAULT '', notes_updated_at TEXT DEFAULT '', created_at TEXT DEFAULT '', updated_at TEXT DEFAULT ''
    );
    INSERT INTO blueprints (chapter_number, title, purpose, characters) VALUES (1, '开端', '主角独自脱险', '["主角"]');
    INSERT INTO blueprints (chapter_number, title, purpose, characters) VALUES (2, '危机', '主角再遇险境', '["主角"]');
    CREATE TABLE drafts (id INTEGER PRIMARY KEY, chapter_number INTEGER, version INTEGER, status TEXT);
    INSERT INTO drafts VALUES (1, 1, 1, 'finalized');
    INSERT INTO drafts VALUES (2, 2, 1, 'draft');
  `)
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => db.close())

describe('StoryDirectionRepository', () => {
  it('adds a future narrative thread and refuses one that rewrites finalized history', () => {
    db.exec(`CREATE TABLE narrative_thread_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, type TEXT NOT NULL,
      target_start_chapter INTEGER NOT NULL, target_end_chapter INTEGER NOT NULL,
      author_intent TEXT NOT NULL, lane TEXT NOT NULL DEFAULT 'sub', parent_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    )`)
    const before = StoryDirectionRepository.snapshot()
    expect(() => StoryDirectionRepository.apply({
      expectedFingerprint: before.fingerprint, coreChanges: { premise: '不能提交' }, blueprintChanges: [],
      newNarrativeThreads: [{ title: '过往人格', type: '人物弧光', authorIntent: '改写第一章', targetStartChapter: 1, targetEndChapter: 2 }],
    })).toThrow(/已定稿/)
    expect(StoryDirectionRepository.snapshot().core.premise).toBe('主角只有一个人格')
    const applied = StoryDirectionRepository.apply({
      expectedFingerprint: before.fingerprint, coreChanges: {}, blueprintChanges: [],
      newNarrativeThreads: [{ title: '第二人格伏笔', type: '人物弧光', authorIntent: '在危机中渐显', targetStartChapter: 2, targetEndChapter: 3 }],
    })
    expect(applied.snapshot.threadPlans).toMatchObject([{ title: '第二人格伏笔', targetStartChapter: 2 }])
  })

  it('durably resumes and idempotently saves an unfinished draft candidate', () => {
    db.exec(`
      CREATE TABLE contents (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
      INSERT INTO contents (body) VALUES ('原稿');
      ALTER TABLE drafts ADD COLUMN content_id INTEGER;
      UPDATE drafts SET content_id = 1 WHERE id = 2;
      CREATE TABLE revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, base_draft_id INTEGER NOT NULL, revision_index INTEGER NOT NULL,
        revision_type TEXT NOT NULL, status TEXT DEFAULT 'pending', merged_to_draft_id INTEGER,
        user_prompt TEXT DEFAULT '', review_source_id INTEGER, content_id INTEGER NOT NULL,
        word_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(base_draft_id, revision_index)
      );
    `)
    const before = StoryDirectionRepository.snapshot()
    const applied = StoryDirectionRepository.apply({
      expectedFingerprint: before.fingerprint,
      coreChanges: { premise: '第二人格出现' },
      blueprintChanges: [{ chapterNumber: 2, changes: { purpose: '人格切换' } }],
      idea: '第二人格在危机时帮助主角', modelId: 'test-model', generateDraftCandidates: true,
    })
    expect(applied.runId).toBeTruthy()
    expect(StoryDirectionRepository.latestRun()?.drafts).toMatchObject([
      { draftId: 2, chapterNumber: 2, status: 'pending' },
    ])
    const input = {
      runId: applied.runId!, draftId: 2, content: '新的候选修稿', wordCount: 7,
      baseContentHash: textFingerprint('原稿'),
    }
    const revisionId = StoryDirectionRepository.saveCandidate(input)
    expect(StoryDirectionRepository.saveCandidate(input)).toBe(revisionId)
    expect(StoryDirectionRepository.latestRun()?.drafts[0]).toMatchObject({ status: 'completed', revisionId })
    expect((db.prepare('SELECT body FROM contents WHERE id = 1').get() as { body: string }).body).toBe('原稿')

    const second = StoryDirectionRepository.apply({
      expectedFingerprint: StoryDirectionRepository.snapshot().fingerprint,
      coreChanges: { synopsis: '新的方向' },
      blueprintChanges: [{ chapterNumber: 2, changes: { purpose: '再次调整' } }],
      idea: '更新方向', modelId: 'test-model', generateDraftCandidates: true,
    })
    db.prepare("INSERT INTO drafts (id, chapter_number, version, status, content_id) VALUES (3, 2, 2, 'draft', 1)").run()
    expect(() => StoryDirectionRepository.saveCandidate({ ...input, runId: second.runId! }))
      .toThrow(/更新版本/)
  })

  it('commits character-card direction changes with project and blueprint changes', () => {
    db.exec(`CREATE TABLE characters (
      name TEXT PRIMARY KEY, role TEXT DEFAULT 'supporting', gender TEXT DEFAULT '', age TEXT DEFAULT '',
      appearance TEXT DEFAULT '', personality TEXT DEFAULT '', background TEXT DEFAULT '', abilities TEXT DEFAULT '',
      motivation TEXT DEFAULT '', relationships TEXT DEFAULT '', arc TEXT DEFAULT '', notes TEXT DEFAULT '',
      cs_location TEXT DEFAULT '', cs_power_level TEXT DEFAULT '', cs_physical_state TEXT DEFAULT '',
      cs_mental_state TEXT DEFAULT '', cs_key_items TEXT DEFAULT '', cs_recent_events TEXT DEFAULT '',
      cs_updated_at_chapter INTEGER DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`)
    ensureCharacterRosterSchema(db)
    const roster = CharacterRosterRepository.commit({
      operationId: 'initial-roster', expectedRevision: 0, schemaVersion: 1, intent: 'manual_edit',
      entries: [{ name: '主角', role: 'protagonist', gender: '', age: '', appearance: '', personality: '独立',
        background: '', abilities: '', motivation: '', relationships: [], arc: '', notes: '' }],
    })
    db.prepare("UPDATE blueprints SET characters = '[\"主角\",\"未来角色\"]' WHERE chapter_number = 2").run()
    const snapshot = StoryDirectionRepository.snapshot()
    StoryDirectionRepository.apply({
      expectedFingerprint: snapshot.fingerprint,
      expectedRosterRevision: roster.revision,
      coreChanges: { premise: '第二人格在关键时刻现身' },
      blueprintChanges: [{ chapterNumber: 2, changes: { purpose: '第二人格帮忙' } }],
      characterChanges: [{ name: '主角', changes: { personality: '平时独立，危机时由第二人格接管' } }],
    })
    expect(CharacterRosterRepository.read().entries[0].personality).toBe('平时独立，危机时由第二人格接管')
    expect(StoryDirectionRepository.snapshot().core.premise).toBe('第二人格在关键时刻现身')
    expect(StoryDirectionRepository.snapshot().blueprints[1].characters).toEqual(['主角', '未来角色'])
  })

  it('rewrites the whole character profile and relationships through a direction adjustment', () => {
    db.exec(`CREATE TABLE characters (
      name TEXT PRIMARY KEY, role TEXT DEFAULT 'supporting', gender TEXT DEFAULT '', age TEXT DEFAULT '',
      appearance TEXT DEFAULT '', personality TEXT DEFAULT '', background TEXT DEFAULT '', abilities TEXT DEFAULT '',
      motivation TEXT DEFAULT '', relationships TEXT DEFAULT '', arc TEXT DEFAULT '', notes TEXT DEFAULT '',
      cs_location TEXT DEFAULT '', cs_power_level TEXT DEFAULT '', cs_physical_state TEXT DEFAULT '',
      cs_mental_state TEXT DEFAULT '', cs_key_items TEXT DEFAULT '', cs_recent_events TEXT DEFAULT '',
      cs_updated_at_chapter INTEGER DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`)
    ensureCharacterRosterSchema(db)
    const roster = CharacterRosterRepository.commit({
      operationId: 'initial-roster-profile', expectedRevision: 0, schemaVersion: 1, intent: 'manual_edit',
      entries: [
        { name: '主角', role: 'protagonist', gender: '男', age: '十八', appearance: '灰袍',
          personality: '独立', background: '铁匠学徒', abilities: '锻造', motivation: '守家',
          relationships: [], arc: '成长', notes: '' },
        { name: '配角', role: 'supporting', gender: '女', age: '', appearance: '', personality: '',
          background: '', abilities: '', motivation: '', relationships: [], arc: '', notes: '' },
      ],
    })
    const snapshot = StoryDirectionRepository.snapshot()
    StoryDirectionRepository.apply({
      expectedFingerprint: snapshot.fingerprint,
      expectedRosterRevision: roster.revision,
      coreChanges: {},
      blueprintChanges: [],
      characterChanges: [{
        name: '主角',
        changes: {
          gender: '女', age: '二十四', appearance: '银甲', background: '没落将军之女',
          personality: '果敢', motivation: '复仇', arc: '从孤军到统帅',
        },
        relationships: [{ target: '配角', relation: '结拜姐妹' }],
      }],
    })
    const entry = CharacterRosterRepository.read().entries.find(item => item.name === '主角')!
    expect(entry).toMatchObject({
      gender: '女', age: '二十四', appearance: '银甲', background: '没落将军之女',
      personality: '果敢', motivation: '复仇', arc: '从孤军到统帅',
      relationships: [{ target: '配角', relation: '结拜姐妹' }],
    })
    const { revision: rosterRevision } = CharacterRosterRepository.read()
    expect(() => StoryDirectionRepository.apply({
      expectedFingerprint: StoryDirectionRepository.snapshot().fingerprint,
      expectedRosterRevision: rosterRevision,
      coreChanges: {},
      blueprintChanges: [],
      characterChanges: [{ name: '主角', changes: {}, relationships: [{ target: '陌生人', relation: '盟友' }] }],
    })).toThrow(/关系变更无效/u)
  })

  it('applies previewed planning changes while preserving finalized chapters and author notes', () => {
    const snapshot = StoryDirectionRepository.snapshot()
    const next = StoryDirectionRepository.apply({
      expectedFingerprint: snapshot.fingerprint,
      coreChanges: { premise: '主角的第二人格在危机时出现' },
      blueprintChanges: [{ chapterNumber: 2, changes: { purpose: '第二人格帮助主角脱险' } }],
    })
    expect(next.snapshot.core.premise).toBe('主角的第二人格在危机时出现')
    expect(next.snapshot.blueprints[0].purpose).toBe('主角独自脱险')
    expect(next.snapshot.blueprints[1].purpose).toBe('第二人格帮助主角脱险')
    expect(next.snapshot.blueprints[1].characters).toEqual(['主角'])
  })

  it('rejects blank and overlong chapter titles before applying a batch', () => {
    const snapshot = StoryDirectionRepository.snapshot()
    for (const title of ['', '题'.repeat(61)]) {
      expect(() => StoryDirectionRepository.apply({
        expectedFingerprint: snapshot.fingerprint,
        coreChanges: {},
        blueprintChanges: [{ chapterNumber: 2, changes: { title } }],
      })).toThrow(/标题/u)
    }
    expect(StoryDirectionRepository.snapshot().blueprints[1].title).toBe('危机')
  })

  it('applies confirmed terminology replacements to settings, roster identities, blueprints, and unfinished draft tasks', () => {
    db.exec(`
      CREATE TABLE contents (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
      INSERT INTO contents (body) VALUES ('定稿正文：幽狼保留原名，黑虫系统保留原名。');
      INSERT INTO contents (body) VALUES ('未定稿正文：幽狼与黑虫系统进入山谷。');
      ALTER TABLE drafts ADD COLUMN content_id INTEGER;
      UPDATE drafts SET content_id = 1 WHERE id = 1;
      UPDATE drafts SET content_id = 2 WHERE id = 2;
      INSERT INTO drafts (id, chapter_number, version, status) VALUES (3, 1, 2, 'draft');
    `)
    db.exec(`CREATE TABLE characters (
      name TEXT PRIMARY KEY, role TEXT DEFAULT 'supporting', gender TEXT DEFAULT '', age TEXT DEFAULT '',
      appearance TEXT DEFAULT '', personality TEXT DEFAULT '', background TEXT DEFAULT '', abilities TEXT DEFAULT '',
      motivation TEXT DEFAULT '', relationships TEXT DEFAULT '', arc TEXT DEFAULT '', notes TEXT DEFAULT '',
      cs_location TEXT DEFAULT '', cs_power_level TEXT DEFAULT '', cs_physical_state TEXT DEFAULT '',
      cs_mental_state TEXT DEFAULT '', cs_key_items TEXT DEFAULT '', cs_recent_events TEXT DEFAULT '',
      cs_updated_at_chapter INTEGER DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`)
    ensureCharacterRosterSchema(db)
    const roster = CharacterRosterRepository.commit({
      operationId: 'terminology-roster', expectedRevision: 0, schemaVersion: 1, intent: 'manual_edit',
      entries: [{ name: '幽狼', role: 'supporting', gender: '', age: '', appearance: '',
        personality: '警觉', background: '', abilities: '黑虫系统赋予追踪力', motivation: '',
        relationships: [], arc: '守护山谷', notes: '旧称幽狼的定稿记录', }],
    })
    db.prepare("UPDATE project_core SET premise = ?, golden_finger = ? WHERE id = 'main'")
      .run('幽狼守护山谷', '黑虫系统协助追踪')
    db.prepare('UPDATE blueprints SET characters = ?, purpose = ?, notes = ? WHERE chapter_number = 1')
      .run(JSON.stringify(['幽狼']), '幽狼守住入口', '定稿事实：幽狼在此受伤')
    db.prepare('UPDATE blueprints SET characters = ?, purpose = ? WHERE chapter_number = 2')
      .run(JSON.stringify(['幽狼']), '黑虫系统发现线索')
    const before = StoryDirectionRepository.snapshot()

    const applied = StoryDirectionRepository.apply({
      expectedFingerprint: before.fingerprint,
      expectedRosterRevision: roster.revision,
      coreChanges: {},
      blueprintChanges: [],
      terminologyReplacements: [
        { from: '幽狼', to: '凤凰' },
        { from: '黑虫系统', to: '智虫' },
      ],
      draftCandidateChapterNumbers: [1, 2],
      idea: '幽狼换成凤凰，黑虫系统换成智虫',
      modelId: 'test-model',
      generateDraftCandidates: true,
    })

    expect(applied.snapshot.core.premise).toBe('凤凰守护山谷')
    expect(applied.snapshot.core.goldenFinger).toBe('智虫协助追踪')
    expect(CharacterRosterRepository.read().entries).toMatchObject([
      { name: '凤凰', abilities: '智虫赋予追踪力', notes: '旧称幽狼的定稿记录' },
    ])
    expect(applied.snapshot.blueprints.map(item => item.characters)).toEqual([['凤凰'], ['凤凰']])
    expect(applied.snapshot.blueprints[0].notes).toBe('定稿事实：幽狼在此受伤')
    expect(StoryDirectionRepository.latestRun()?.drafts).toMatchObject([
      { draftId: 2, chapterNumber: 2, status: 'pending' },
    ])
    expect(StoryDirectionRepository.latestRun()?.terminologyReplacements).toEqual([
      { from: '幽狼', to: '凤凰' },
      { from: '黑虫系统', to: '智虫' },
    ])
    expect(db.prepare('SELECT body FROM contents WHERE id = 1').get()).toEqual({
      body: '定稿正文：幽狼保留原名，黑虫系统保留原名。',
    })
  })

  it('rejects a stale proposal and any finalized-chapter edit without partial writes', () => {
    const snapshot = StoryDirectionRepository.snapshot()
    expect(() => StoryDirectionRepository.apply({
      expectedFingerprint: snapshot.fingerprint,
      coreChanges: { premise: '错误覆盖' },
      blueprintChanges: [{ chapterNumber: 1, changes: { purpose: '改写定稿章' } }],
    })).toThrow(/已定稿/)
    expect(() => StoryDirectionRepository.apply({
      expectedFingerprint: snapshot.fingerprint,
      coreChanges: {},
      blueprintChanges: [{ chapterNumber: 1, changes: { title: '改写定稿标题' } }],
    })).toThrow(/已定稿/)
    expect(StoryDirectionRepository.snapshot().core.premise).toBe('主角只有一个人格')
    db.prepare("UPDATE project_core SET premise = '作者新改的设定' WHERE id = 'main'").run()
    expect(() => StoryDirectionRepository.apply({
      expectedFingerprint: snapshot.fingerprint,
      coreChanges: { premise: '过期提案' }, blueprintChanges: [],
    })).toThrow(/已变化/)
  })
})
