/**
 * ContentSearchRepository — 项目正文检索（contents.body LIKE 扫描 + 片段提取）
 *
 * 为什么用 LIKE 而不是 FTS：
 * - 规模：单项目百来章、正文约数十万字符，LIKE 全表扫描在这个量级完全够用，远低于 FTS5 的门槛；
 * - 一致性：FTS 需要额外索引表，正文每次写入都要同步，漏同步就会出现"刚写的章搜不到"；
 * - 依赖：不引入 FTS5 编译要求，也不新增表。
 *
 * 两条硬边界：
 * - 参数化 + ESCAPE：作者输入里的 %、_、\ 一律按字面量匹配，绝不被当成通配符；
 * - 正文不出库：只返回匹配点前后各约 60 字的片段（单条命中最多 3 段），不返回整章正文。
 *
 * 大小写：SQLite 的 LIKE 默认对 ASCII 不敏感（除非打开 case_sensitive_like），中文没有大小写，
 * 因此"全角/半角与中文"不受影响；片段定位用同样的折叠规则（toLowerCase），保证 matchStart 准确。
 */
import { getProjectDb } from '../database'

export type ContentSearchScope = 'finalized' | 'drafts' | 'all'

export interface ContentSearchParams {
  query: string
  scope?: ContentSearchScope
  limit?: number
}

export interface ContentSearchExcerpt {
  text: string
  matchStart: number
  matchLength: number
}

export interface ContentSearchHit {
  chapterNumber: number
  version: number
  status: string
  contentId: number
  draftId: number
  wordCount: number | null
  matchCount: number
  excerpts: ContentSearchExcerpt[]
}

export const CONTENT_SEARCH_DEFAULT_LIMIT = 20
export const CONTENT_SEARCH_MAX_LIMIT = 50
/** 超过这个长度的 query 直接视为无效并返回空结果，避免异常长的 LIKE 模式拖慢扫描。 */
export const CONTENT_SEARCH_MAX_QUERY_LENGTH = 200
/** 片段半径：匹配点前后各取这么多字符（首尾不足则截断）。 */
export const CONTENT_SEARCH_EXCERPT_RADIUS = 60
export const CONTENT_SEARCH_MAX_EXCERPTS_PER_HIT = 3

function db() {
  const value = getProjectDb()
  if (!value) throw new Error('项目数据库未打开')
  return value
}

/** LIKE 模式转义：\ % _ 三个字符都要转义，配合 SQL 里的 ESCAPE '\' 使用。 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, character => `\\${character}`)
}

function normalizeScope(scope: ContentSearchParams['scope']): ContentSearchScope {
  return scope === 'finalized' || scope === 'drafts' ? scope : 'all'
}

function normalizeLimit(limit: ContentSearchParams['limit']): number {
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1) return CONTENT_SEARCH_DEFAULT_LIMIT
  return Math.min(limit, CONTENT_SEARCH_MAX_LIMIT)
}

/** 在正文里定位 query，返回命中总数与至多 3 条片段（含片段内的匹配起始下标）。 */
function locateMatches(body: string, query: string): { matchCount: number; excerpts: ContentSearchExcerpt[] } {
  const haystack = body.toLowerCase()
  const needle = query.toLowerCase()
  const excerpts: ContentSearchExcerpt[] = []
  let matchCount = 0
  let cursor = 0
  while (needle && cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor)
    if (index === -1) break
    matchCount += 1
    if (excerpts.length < CONTENT_SEARCH_MAX_EXCERPTS_PER_HIT) {
      const start = Math.max(0, index - CONTENT_SEARCH_EXCERPT_RADIUS)
      const end = Math.min(body.length, index + needle.length + CONTENT_SEARCH_EXCERPT_RADIUS)
      excerpts.push({
        text: body.slice(start, end),
        matchStart: index - start,
        matchLength: query.length,
      })
    }
    cursor = index + Math.max(1, needle.length)
  }
  return { matchCount, excerpts }
}

export class ContentSearchRepository {
  /**
   * 检索项目正文。
   * - 空 query / 纯空白 / 超过 CONTENT_SEARCH_MAX_QUERY_LENGTH → 返回空数组（不抛裸异常，调用方无需 try/catch）；
   * - 排序：章节号升序、版本降序（同一章优先展示较新的版本）；
   * - 只读：不写库、不触碰任何索引。
   */
  static search(params: ContentSearchParams): ContentSearchHit[] {
    const query = typeof params?.query === 'string' ? params.query.trim() : ''
    if (!query || query.length > CONTENT_SEARCH_MAX_QUERY_LENGTH) return []
    const scope = normalizeScope(params.scope)
    const limit = normalizeLimit(params.limit)
    const pattern = `%${escapeLikePattern(query)}%`
    const rows = db().prepare(`
      SELECT
        drafts.id             AS draftId,
        drafts.chapter_number AS chapterNumber,
        drafts.version        AS version,
        drafts.status         AS status,
        drafts.content_id     AS contentId,
        drafts.word_count     AS wordCount,
        contents.body         AS body
      FROM drafts
      JOIN contents ON contents.id = drafts.content_id
      WHERE contents.body LIKE ? ESCAPE '\\'
        AND (
          ? = 'all'
          OR (? = 'finalized' AND drafts.status = 'finalized')
          OR (? = 'drafts' AND drafts.status <> 'finalized')
        )
      ORDER BY drafts.chapter_number ASC, drafts.version DESC
      LIMIT ?
    `).all(pattern, scope, scope, scope, limit) as Array<{
      draftId: number
      chapterNumber: number
      version: number
      status: string
      contentId: number
      wordCount: number | null
      body: string
    }>
    return rows.map(row => {
      const { matchCount, excerpts } = locateMatches(row.body, query)
      return {
        chapterNumber: row.chapterNumber,
        version: row.version,
        status: row.status,
        contentId: row.contentId,
        draftId: row.draftId,
        wordCount: typeof row.wordCount === 'number' ? row.wordCount : null,
        matchCount,
        excerpts,
      }
    })
  }
}
