/**
 * search_project — 在自己作品的正文里做全文检索（只读）
 *
 * 覆盖定稿与各版草稿（主进程侧参数化 LIKE 扫描 contents.body），只返回匹配片段，
 * 正文不出库。用于回答「某件信物 / 某个设定 / 某句话在第几章出现过」。
 * 要找作者导入的参考资料与设定文档，用 search_knowledge。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import { readInteger, readList, readRecord, truncationNotice } from './read-record.helpers'

const SEARCH_SCOPES = ['finalized', 'drafts', 'all'] as const

/** 工具侧默认条数；通道上限为 50，这里更保守，避免把上下文灌满。 */
export const SEARCH_PROJECT_DEFAULT_LIMIT = 10
/** 工具侧条数上限。 */
export const SEARCH_PROJECT_MAX_LIMIT = 20
/** 单条片段最多渲染的字符数（通道已裁到匹配点前后各约 60 字，这里再兜一层）。 */
export const SEARCH_PROJECT_EXCERPT_LIMIT = 240
/** query 长度上限，与通道一致：超过 200 字符通道会直接返回空数组，所以在本地就拦下。 */
export const SEARCH_PROJECT_MAX_QUERY_CHARS = 200

function statusLabel(status: unknown): string {
  if (status === 'finalized') return '定稿'
  if (status === 'draft') return '草稿'
  return typeof status === 'string' && status ? status : '未知状态'
}

/** 在片段里标出命中位置；下标非法时原样返回，绝不抛错。 */
export function highlightExcerpt(text: unknown, matchStart: unknown, matchLength: unknown): string {
  const raw = typeof text === 'string' ? text : ''
  const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
  const start = Number(matchStart)
  const length = Number(matchLength)
  if (!Number.isInteger(start) || start < 0 || start > raw.length || !Number.isInteger(length) || length <= 0) {
    return compact(raw)
  }
  const end = Math.min(raw.length, start + length)
  return compact(raw.slice(0, start) + '【' + raw.slice(start, end) + '】' + raw.slice(end))
}

function excerptLimit(value: unknown): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

export const searchProjectTool = buildAgentTool({
  name: 'search_project',
  description: '在**自己作品的正文**里做全文检索——定稿与各版草稿都算。用于回答「某件信物 / 某个设定 / 某句话在第几章出现过」「这个说法我前面用过吗」这类问题。注意：它搜的是本项目正文，不是作者导入的参考资料（那要用 search_knowledge）。只返回匹配片段与出处，不返回整章正文；正文里找不到时应据实说明，不要臆测。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '要检索的关键词或短语（按字面量匹配，支持中文；最长 200 字符）' },
      scope: { type: 'string', description: '检索范围', enum: [...SEARCH_SCOPES], default: 'all' },
      limit: { type: 'number', description: '最多返回多少个草稿版本的命中（1-20，默认 10）' },
    },
    required: ['query'],
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const rawQuery = typeof args.query === 'string' ? args.query : ''
    const query = rawQuery.trim()
    if (!query) {
      return { success: false, content: '', error: '缺少检索关键词：请给出要在正文里查找的词或短语。' }
    }
    if (query.length > SEARCH_PROJECT_MAX_QUERY_CHARS) {
      return {
        success: false,
        content: '',
        error: '检索关键词过长（' + query.length + ' 字符，上限 ' + SEARCH_PROJECT_MAX_QUERY_CHARS + '）；请改用更短的短语。',
      }
    }
    const requestedScope = typeof args.scope === 'string' ? args.scope.trim() : ''
    if (requestedScope && !SEARCH_SCOPES.includes(requestedScope as typeof SEARCH_SCOPES[number])) {
      return {
        success: false,
        content: '',
        error: '不支持的检索范围「' + requestedScope + '」。可用值：' + SEARCH_SCOPES.join(' / ') + '。',
      }
    }
    const scope = (requestedScope || 'all') as typeof SEARCH_SCOPES[number]
    const limit = readInteger(args.limit, SEARCH_PROJECT_DEFAULT_LIMIT, 1, SEARCH_PROJECT_MAX_LIMIT)

    const { project, projectSession } = requireAgentProject(context)
    try {
      const rawHits = await ipc.invokeWithProjectSession(projectSession, 'db:content-search', { query, scope, limit }, project.path)
      assertAgentProjectCurrent(context)
      const hits = readList(rawHits).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
      if (hits.length === 0) {
        return {
          success: true,
          content: '正文里没有找到「' + query + '」（范围：' + scope + '）。'
            + '可以换个关键词、放宽范围（scope=all 覆盖定稿与全部草稿），或确认它是否只出现在设定/蓝图/参考资料里——那些请用 read_architecture、read_characters 或 search_knowledge。',
        }
      }

      const chapters = new Set(hits.map(hit => Number(hit.chapterNumber) || 0))
      const totalMatches = hits.reduce((sum, hit) => sum + (Number(hit.matchCount) || 0), 0)
      const lines = [
        '🔍 「' + query + '」在正文命中 ' + hits.length + ' 个版本（' + chapters.size + ' 章，共 ' + totalMatches + ' 处；范围：' + scope + '）',
      ]
      for (const hit of hits) {
        const chapterNumber = Number(hit.chapterNumber) || 0
        const version = Number(hit.version) || 0
        const matchCount = Number(hit.matchCount) || 0
        const excerpts = readList(hit.excerpts).map(entry => readRecord(entry))
        const shown = excerpts.slice(0, Math.max(1, Math.min(3, excerptLimit(3))))
        lines.push('')
        lines.push('第 ' + chapterNumber + ' 章（' + statusLabel(hit.status) + ' v' + version
          + (Number(hit.wordCount) > 0 ? '，' + Number(hit.wordCount) + ' 字' : '')
          + '）：命中 ' + matchCount + ' 处'
          + (matchCount > shown.length ? '，这里列出前 ' + shown.length + ' 处' : '')
          + '（draftId ' + (Number(hit.draftId) || '?') + ' / contentId ' + (Number(hit.contentId) || '?') + '）')
        if (shown.length === 0) {
          lines.push('  · （该版本命中但未返回片段，可换更具体的关键词再查）')
          continue
        }
        for (const excerpt of shown) {
          lines.push('  · ' + highlightExcerpt(excerpt.text, excerpt.matchStart, excerpt.matchLength))
        }
      }
      if (hits.length >= limit) {
        lines.push(truncationNotice(limit + 1, hits.length, '个命中版本'))
        lines.push('（已达到本次条数上限 ' + limit + '；提高 limit（上限 ' + SEARCH_PROJECT_MAX_LIMIT + '）或缩小 scope 可看到更多）')
      }
      return { success: true, content: lines.join('\n') }
    } catch (error) {
      return { success: false, content: '', error: '检索正文失败：' + String(error) }
    }
  },
})
