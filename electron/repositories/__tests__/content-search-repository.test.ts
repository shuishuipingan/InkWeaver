import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { getProjectDb } from '../../database'
import {
  CONTENT_SEARCH_DEFAULT_LIMIT,
  CONTENT_SEARCH_MAX_LIMIT,
  CONTENT_SEARCH_MAX_QUERY_LENGTH,
  ContentSearchRepository,
} from '../content-search-repository'

vi.mock('../../database', () => ({ getProjectDb: vi.fn() }))
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

const PADDING = '甲'.repeat(200)

function insertDraft(chapterNumber: number, version: number, status: string, body: string, wordCount: number | null = null): number {
  const contentId = Number(db.prepare('INSERT INTO contents (body) VALUES (?)').run(body).lastInsertRowid)
  db.prepare('INSERT INTO drafts (chapter_number, version, status, content_id, word_count) VALUES (?, ?, ?, ?, ?)')
    .run(chapterNumber, version, status, contentId, wordCount)
  return contentId
}

function seed(): void {
  // 第 1 章定稿：两处「玉佩」，两侧都有 200 字填充（用于验证片段半径与 matchStart）
  insertDraft(1, 1, 'finalized', `${PADDING}他把玉佩收进怀里。${PADDING}玉佩上刻着一行小字。${PADDING}`, 3200)
  // 第 2 章草稿：一处命中
  insertDraft(2, 1, 'draft', '雨夜，玉佩落在青石板上。', 1800)
  // 第 3 章定稿：包含 LIKE 元字符与反斜杠字面量，以及 ASCII 大小写
  insertDraft(3, 1, 'finalized', '进度 100% 完成，键名 a_b，路径 back\\slash，大小写 Jade。', 900)
  // 第 4..60 章草稿：用于 limit 与 scope
  for (let chapter = 4; chapter <= 60; chapter += 1) {
    insertDraft(chapter, 1, 'draft', `第 ${chapter} 章的玉佩线索。`, 100)
  }
  // 第 61 章：五处命中（验证单条命中最多 3 条片段）
  insertDraft(61, 1, 'finalized', '玉佩玉佩玉佩玉佩玉佩', 50)
  // 第 2 章的第二版：验证同章排序（版本降序在前）
  insertDraft(2, 2, 'draft', '改稿：玉佩又被提到了。', 1900)
  // 孤立正文（没有任何 draft 引用）：不得出现在结果里
  db.prepare('INSERT INTO contents (body) VALUES (?)').run('孤立的玉佩片段，没有草稿引用。')
}

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body TEXT NOT NULL
    );
    CREATE TABLE drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_number INTEGER NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      word_count INTEGER
    );
  `)
  vi.mocked(getProjectDb).mockReturnValue(db)
  seed()
})

afterEach(() => db.close())

describe('ContentSearchRepository 正文检索', () => {
  it('返回章节元数据与匹配片段，matchStart 指向片段内的匹配位置', () => {
    const hits = ContentSearchRepository.search({ query: '玉佩', scope: 'finalized' })
    const chapterOne = hits.find(hit => hit.chapterNumber === 1)!
    expect(chapterOne.status).toBe('finalized')
    expect(chapterOne.version).toBe(1)
    expect(chapterOne.matchCount).toBe(2)
    expect(chapterOne.excerpts).toHaveLength(2)
    const excerpt = chapterOne.excerpts[0]!
    expect(excerpt.text.slice(excerpt.matchStart, excerpt.matchStart + excerpt.matchLength)).toBe('玉佩')
    expect(excerpt.matchStart).toBe(60)
    expect(excerpt.text.length).toBe(60 + 2 + 60)
    expect(typeof chapterOne.contentId).toBe('number')
    expect(typeof chapterOne.draftId).toBe('number')
  })

  it('正文不出库：结果里没有 body 字段，也不含整章文本', () => {
    const [hit] = ContentSearchRepository.search({ query: '玉佩', scope: 'finalized' })
    expect(Object.keys(hit!).sort()).toEqual([
      'chapterNumber', 'contentId', 'draftId', 'excerpts', 'matchCount', 'status', 'version', 'wordCount',
    ])
    expect(JSON.stringify(hit)).not.toContain(PADDING)
    expect(hit!.excerpts.every(excerpt => excerpt.text.length <= 60 + 2 + 60)).toBe(true)
  })

  it('scope 过滤：finalized 不含草稿，drafts 不含定稿', () => {
    const finalized = ContentSearchRepository.search({ query: '玉佩', scope: 'finalized' }).map(hit => hit.chapterNumber)
    const drafts = ContentSearchRepository.search({ query: '玉佩', scope: 'drafts' }).map(hit => hit.chapterNumber)
    // 第 3 章正文里没有「玉佩」（只有 % / _ / \ 与 Jade），故不在这一组
    expect(finalized).toEqual([1, 61])
    expect(drafts).toContain(2)
    expect(drafts).toContain(4)
    expect(drafts).not.toContain(1)
    expect(drafts).not.toContain(61)
    const all = ContentSearchRepository.search({ query: '玉佩' })
    expect(all.length).toBeGreaterThan(finalized.length)
  })

  it('limit 生效且超上限被夹到 50', () => {
    expect(ContentSearchRepository.search({ query: '章的玉佩线索' })).toHaveLength(CONTENT_SEARCH_DEFAULT_LIMIT)
    expect(ContentSearchRepository.search({ query: '章的玉佩线索', limit: 1 })).toHaveLength(1)
    expect(ContentSearchRepository.search({ query: '章的玉佩线索', limit: 999 })).toHaveLength(CONTENT_SEARCH_MAX_LIMIT)
    // 非法 limit 回落到默认值，而不是报错
    expect(ContentSearchRepository.search({ query: '章的玉佩线索', limit: 0 })).toHaveLength(CONTENT_SEARCH_DEFAULT_LIMIT)
    expect(ContentSearchRepository.search({ query: '章的玉佩线索', limit: -5 })).toHaveLength(CONTENT_SEARCH_DEFAULT_LIMIT)
  })

  it('LIKE 元字符按字面量匹配：% / _ / \\ 不会被当成通配符', () => {
    const percent = ContentSearchRepository.search({ query: '%' })
    expect(percent.map(hit => hit.chapterNumber)).toEqual([3])
    const underscore = ContentSearchRepository.search({ query: '_' })
    expect(underscore.map(hit => hit.chapterNumber)).toEqual([3])
    const backslash = ContentSearchRepository.search({ query: '\\' })
    expect(backslash.map(hit => hit.chapterNumber)).toEqual([3])
  })

  it('ASCII 大小写不敏感，中文不受影响', () => {
    const hits = ContentSearchRepository.search({ query: 'jade' })
    expect(hits.map(hit => hit.chapterNumber)).toEqual([3])
    const exact = ContentSearchRepository.search({ query: 'Jade' })
    expect(exact.map(hit => hit.chapterNumber)).toEqual([3])
  })

  it('空 / 纯空白 / 超长 query 返回空数组且不抛异常', () => {
    expect(ContentSearchRepository.search({ query: '' })).toEqual([])
    expect(ContentSearchRepository.search({ query: '   ' })).toEqual([])
    // 恰好等于上限：允许（命中第 1 章正文里的 200 个连续「甲」）
    expect(ContentSearchRepository.search({ query: '甲'.repeat(CONTENT_SEARCH_MAX_QUERY_LENGTH) })).toHaveLength(1)
    // 超过上限：直接返回空结果，不抛异常
    expect(ContentSearchRepository.search({ query: '甲'.repeat(CONTENT_SEARCH_MAX_QUERY_LENGTH + 1) })).toEqual([])
  })

  it('无命中与孤立正文都返回空数组', () => {
    expect(ContentSearchRepository.search({ query: '从来不存在的词' })).toEqual([])
    expect(ContentSearchRepository.search({ query: '孤立的玉佩片段' })).toEqual([])
  })

  it('单条命中最多 3 条片段，但 matchCount 记录真实次数', () => {
    const [hit] = ContentSearchRepository.search({ query: '玉佩', scope: 'finalized' }).filter(entry => entry.chapterNumber === 61)
    expect(hit!.matchCount).toBe(5)
    expect(hit!.excerpts).toHaveLength(3)
  })

  it('同章多版本按版本降序排列', () => {
    const hits = ContentSearchRepository.search({ query: '玉佩', scope: 'drafts' }).filter(hit => hit.chapterNumber === 2)
    expect(hits.map(hit => hit.version)).toEqual([2, 1])
  })
})
