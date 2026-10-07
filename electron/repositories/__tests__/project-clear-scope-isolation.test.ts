import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'

import { getCurrentProjectPath, getProjectDb } from '../../database'
import { ProjectClearRepository } from '../project-clear-repository'

vi.mock('../../database', () => ({
  getCurrentProjectPath: vi.fn(),
  getProjectDb: vi.fn(),
}))

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_number INTEGER, status TEXT);
    CREATE TABLE contents (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT);
    CREATE TABLE revisions (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE reviews (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE post_process_runs (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE post_process_steps (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE summary_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE finalized_draft_import_operations (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE finalization_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, content_snapshot TEXT);
    CREATE TABLE context_summary_cache (
      cache_key TEXT PRIMARY KEY, summary_text TEXT, summary_hash TEXT, source_key TEXT, access_order INTEGER
    );
    CREATE TABLE character_extraction_candidates (id TEXT PRIMARY KEY, source_id TEXT, name TEXT);
    CREATE TABLE agent_conversations (
      id TEXT PRIMARY KEY, title TEXT, mode TEXT, model_id TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE agent_messages (
      id TEXT PRIMARY KEY, conversation_id TEXT, seq INTEGER, role TEXT, content TEXT,
      tool_calls_json TEXT, artifacts_json TEXT, created_at TEXT
    );
  `)
  vi.mocked(getProjectDb).mockReturnValue(db)
  vi.mocked(getCurrentProjectPath).mockReturnValue('C:/projects/clear-scope')
})

afterEach(() => db.close())

function count(table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
}

describe('「清空生成数据」的范围边界', () => {
  it('清空 generatedText 后生成内容被清，助手会话记录完整保留', () => {
    db.exec(`
      INSERT INTO drafts (chapter_number, status) VALUES (1, 'finalized');
      INSERT INTO contents (body) VALUES ('章节正文');
      INSERT INTO finalization_outbox (content_snapshot) VALUES ('冻结的定稿全文');
      INSERT INTO context_summary_cache VALUES ('k1', '摘要', 'hash', 'src', 1);
      INSERT INTO character_extraction_candidates VALUES ('cand-1', 'src', '未确认人物');
      INSERT INTO agent_conversations
        VALUES ('c1', '设定讨论', 'fast', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO agent_messages
        VALUES ('m1', 'c1', 1, 'user', '把这个设定定成 X', NULL, NULL, '2026-01-01T00:00:00.000Z');
    `)

    ProjectClearRepository.clearGeneratedData({ generatedText: true })

    expect(count('drafts')).toBe(0)
    expect(count('contents')).toBe(0)
    // 本次补入范围的两张：定稿全文快照会残留整章文本，摘要缓存是含正文片段的派生数据
    expect(count('finalization_outbox')).toBe(0)
    expect(count('context_summary_cache')).toBe(0)
    // 未确认的提取候选属于稿子的中间产物，随生成数据一起清
    expect(count('character_extraction_candidates')).toBe(0)
    // 助手会话是"作者与助手的对话记录"，不是生成的小说内容：刻意保留，并提供单独入口
    expect(count('agent_conversations')).toBe(1)
    expect(count('agent_messages')).toBe(1)
    expect(db.prepare('SELECT content FROM agent_messages WHERE id = ?').get('m1'))
      .toEqual({ content: '把这个设定定成 X' })
  })

  it('creativeFields 的 DELETE 列表包含文风档案历史（与 project_core.writing_style 同源）', () => {
    const prepared: string[] = []
    const mockDb = {
      prepare: (sql: string) => {
        prepared.push(sql)
        return {
          run: () => ({ changes: 0 }),
          all: () => [],
          // ensureCharacterRosterSchema 会读 COUNT(*) 与 project_core 列，这里给出保守形状。
          get: () => ({ count: 0, present: true, characters_arch: '' }),
        }
      },
      transaction: (fn: () => void) => () => fn(),
      exec: () => {},
    }
    vi.mocked(getProjectDb).mockReturnValue(mockDb as never)

    ProjectClearRepository.clearGeneratedData({ creativeFields: true })

    expect(prepared.some(sql => /DELETE FROM writing_style_history/u.test(sql))).toBe(true)
  })
})
