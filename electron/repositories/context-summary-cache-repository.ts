import { createHash } from 'node:crypto'
import { getProjectDb } from '../database'
import type { ContextSummaryCacheKey, ContextSummaryCacheEntry } from '../../src/shared/context-summary'

function validate(key: ContextSummaryCacheKey): void {
  if (!key || !['architecture', 'character-detail', 'chapter-summary'].includes(key.kind)
    || typeof key.sourceKey !== 'string' || !key.sourceKey.trim() || key.sourceKey.length > 256
    || typeof key.sourceHash !== 'string' || !/^[a-f0-9]{64}$/u.test(key.sourceHash)
    || typeof key.version !== 'string' || !/^extractive-v\d+$/u.test(key.version)) throw new Error('上下文摘要缓存参数无效')
}
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const identity = (key: ContextSummaryCacheKey) => hash(JSON.stringify([key.kind, key.sourceKey, key.sourceHash, key.version]))

export class ContextSummaryCacheRepository {
  static get(key: ContextSummaryCacheKey): ContextSummaryCacheEntry | null {
    validate(key)
    const db = getProjectDb()
    if (!db || !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='context_summary_cache'").get()) return null
    const row = db.prepare('SELECT summary_text, summary_hash FROM context_summary_cache WHERE cache_key = ?').get(identity(key)) as { summary_text: string; summary_hash: string } | undefined
    if (!row || Buffer.byteLength(row.summary_text, 'utf8') > 32_768 || hash(row.summary_text) !== row.summary_hash) return null
    return { ...key, text: row.summary_text }
  }

  static put(entry: ContextSummaryCacheEntry): void {
    validate(entry)
    if (typeof entry.text !== 'string' || Buffer.byteLength(entry.text, 'utf8') > 32_768) throw new Error('上下文摘要缓存超过 32 KiB 上限')
    const db = getProjectDb()
    if (!db) throw new Error('项目数据库未打开')
    db.transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS context_summary_cache (
        cache_key TEXT PRIMARY KEY, source_key TEXT NOT NULL, summary_text TEXT NOT NULL,
        summary_hash TEXT NOT NULL, access_order INTEGER NOT NULL
      )`)
      const order = (db.prepare('SELECT COALESCE(MAX(access_order), 0) + 1 AS n FROM context_summary_cache').get() as { n: number }).n
      db.prepare(`INSERT INTO context_summary_cache VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET summary_text=excluded.summary_text, summary_hash=excluded.summary_hash, access_order=excluded.access_order`)
        .run(identity(entry), entry.sourceKey, entry.text, hash(entry.text), order)
      db.prepare('DELETE FROM context_summary_cache WHERE cache_key IN (SELECT cache_key FROM context_summary_cache ORDER BY access_order DESC LIMIT -1 OFFSET 128)').run()
    })()
  }
}
