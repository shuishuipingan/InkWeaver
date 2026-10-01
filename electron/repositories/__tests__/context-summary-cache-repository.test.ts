import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { getProjectDb } from '../../database'
import { ContextSummaryCacheRepository } from '../context-summary-cache-repository'
vi.mock('../../database', () => ({ getProjectDb: vi.fn() }))
const Database = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database
const request = { kind: 'architecture' as const, sourceKey: 'world', sourceHash: 'a'.repeat(64), version: 'extractive-v1' }
beforeEach(() => { db = new Database(':memory:'); vi.mocked(getProjectDb).mockReturnValue(db) })
afterEach(() => db.close())
describe('project-derived summary cache', () => {
  it('does not create tables on misses, and binds reads to source and version', () => {
    expect(ContextSummaryCacheRepository.get(request)).toBeNull()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([])
    ContextSummaryCacheRepository.put({ ...request, text: '凤凰守山门。' })
    expect(ContextSummaryCacheRepository.get(request)?.text).toBe('凤凰守山门。')
    expect(ContextSummaryCacheRepository.get({ ...request, sourceHash: 'b'.repeat(64) })).toBeNull()
    expect(ContextSummaryCacheRepository.get({ ...request, version: 'extractive-v2' })).toBeNull()
  })
  it('bounds stored entries, rejects oversized text and detects tampered summaries', () => {
    for (let i = 0; i < 130; i++) ContextSummaryCacheRepository.put({ ...request, sourceKey: `entry-${i}`, text: '摘录。' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM context_summary_cache').get()).toEqual({ n: 128 })
    expect(() => ContextSummaryCacheRepository.put({ ...request, text: '汉'.repeat(11_000) })).toThrow(/上限/)
    ContextSummaryCacheRepository.put({ ...request, text: '原摘录。' })
    db.prepare('UPDATE context_summary_cache SET summary_text = ? WHERE source_key = ?').run('错误内容', 'world')
    expect(ContextSummaryCacheRepository.get(request)).toBeNull()
  })
})
