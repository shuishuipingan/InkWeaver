/**
 * read_reviews — 读取 AI 审稿意见（只读）
 *
 * 回答「这章审稿发现了什么」「上一次审稿的结论是什么」。数据来自审稿流程已产出的记录
 * （db:review-list / db:review-get-full），本工具不生成新审稿——需要新审稿请用 start_workflow。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import {
  READ_TOOL_MAX_ITEMS,
  READ_TOOL_TEXT_LIMIT,
  readDrafts,
  readInteger,
  readList,
  readRecord,
  readText,
  resolveChapterNumber,
  truncationNotice,
} from './read-record.helpers'

function formatReview(record: Record<string, unknown>, draftVersion?: unknown): string {
  const lines = [
    '· 审稿 ID ' + (Number(record.id) || '未知')
      + '（第 ' + (Number(record.reviewIndex) || '?') + ' 次，基准草稿 ID ' + (Number(record.baseDraftId) || '未知')
      + (draftVersion !== undefined ? '，v' + String(draftVersion) : '') + '）',
    '  产出时间：' + (typeof record.createdAt === 'string' ? record.createdAt : '未知'),
    '  正文（含分类与严重度）：',
    '  ' + (readText(record.content, READ_TOOL_TEXT_LIMIT) || '（正文为空）'),
  ]
  return lines.join('\n')
}

export const readReviewsTool = buildAgentTool({
  name: 'read_reviews',
  description: '读取某一章已产出的 AI 审稿意见（含逐条意见正文、轮次与产出时间）。章节号缺省时取最近一章有审稿记录的章节。用于回答「这章审稿发现了什么问题」「上次审稿结论」；需要产生新审稿请改用 start_workflow。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: { type: 'number', description: '章节号；缺省=最近一章有审稿记录的章节' },
      review_id: { type: 'number', description: '直接读取某条审稿记录的完整内容（与 chapter_number 二选一）' },
      limit: { type: 'number', description: '最多列出几条审稿记录（1-10，默认 3）' },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    const limit = readInteger(args.limit, 3, 1, 10)
    try {
      const directId = Number(args.review_id)
      if (Number.isFinite(directId) && directId > 0) {
        const full = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:review-get-full', Math.trunc(directId), project.path))
        assertAgentProjectCurrent(context)
        if (Object.keys(full).length === 0) {
          return { success: true, content: '没有找到审稿记录 ID ' + Math.trunc(directId) + '（可能已删除，或不属于当前项目）。' }
        }
        return { success: true, content: '📋 审稿记录\n' + formatReview(full) }
      }

      const drafts = readDrafts(await ipc.invokeWithProjectSession(projectSession, 'db:draft-list-all', project.path))
      assertAgentProjectCurrent(context)
      const resolved = resolveChapterNumber(args.chapter_number, drafts)
      if (resolved.chapterNumber === null) {
        return { success: true, content: '当前项目还没有任何草稿，因此没有可读的审稿记录。' }
      }
      const chapterDrafts = readDrafts(await ipc.invokeWithProjectSession(projectSession, 'db:draft-list', resolved.chapterNumber, project.path))
      assertAgentProjectCurrent(context)
      if (chapterDrafts.length === 0) {
        return { success: true, content: '第 ' + resolved.chapterNumber + ' 章还没有草稿，因此没有审稿记录。' }
      }

      const metas: Array<Record<string, unknown>> = []
      for (const draft of chapterDrafts) {
        const reviews = readList(await ipc.invokeWithProjectSession(projectSession, 'db:review-list', draft.id, project.path))
        assertAgentProjectCurrent(context)
        for (const entry of reviews) {
          const meta = readRecord(entry)
          if (Object.keys(meta).length > 0) metas.push({ ...meta, draftVersion: draft.version })
        }
      }
      if (metas.length === 0) {
        return { success: true, content: '第 ' + resolved.chapterNumber + ' 章的 ' + chapterDrafts.length + ' 个草稿版本都还没有审稿记录。' }
      }

      metas.sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')))
      const shown = metas.slice(0, Math.min(limit, READ_TOOL_MAX_ITEMS))
      const lines = ['📋 第 ' + resolved.chapterNumber + ' 章审稿记录（共 ' + metas.length + ' 条，本次列出 ' + shown.length + ' 条）']
      for (const meta of shown) {
        const id = Number(meta.id) || 0
        const full = id > 0
          ? readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:review-get-full', id, project.path))
          : {}
        assertAgentProjectCurrent(context)
        lines.push('')
        lines.push(formatReview({ ...meta, ...full }, meta.draftVersion))
      }
      lines.push(truncationNotice(metas.length, shown.length, '条审稿记录'))
      return { success: true, content: lines.join('\n') }
    } catch (error) {
      return { success: false, content: '', error: '读取审稿记录失败：' + String(error) }
    }
  },
})
