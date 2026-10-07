/**
 * read_revision_proposals — 读取修订提案（只读）
 *
 * 回答「有哪些待处理修订」「这条修订来自哪次审稿」。修订提案按基础草稿存储
 * （db:revision-list / db:revision-get-full），本工具只读，不合并也不丢弃。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import {
  READ_TOOL_MAX_ITEMS,
  fingerprint,
  readDrafts,
  readInteger,
  readList,
  readRecord,
  readText,
  resolveChapterNumber,
  truncationNotice,
} from './read-record.helpers'

const REVISION_STATUSES = ['pending', 'merged', 'discarded'] as const

function formatRevision(meta: Record<string, unknown>, draftVersion: unknown, content: string): string {
  const lines = [
    '· 修订提案 ' + (Number(meta.id) || '?')
      + '（第 ' + (Number(meta.revisionIndex) || '?') + ' 版，类型 ' + (typeof meta.revisionType === 'string' ? meta.revisionType : '未知')
      + '，状态 ' + (typeof meta.status === 'string' ? meta.status : '未知') + '）',
    '  基准草稿：ID ' + (Number(meta.baseDraftId) || '未知')
      + (draftVersion !== undefined ? '（v' + String(draftVersion) + '）' : '')
      + '，基准指纹 ' + fingerprint(meta.baseContentHash)
      + (Number(meta.mergedToDraftId) > 0 ? '，已合并到草稿 ID ' + Number(meta.mergedToDraftId) : ''),
    '  字数：' + (Number(meta.wordCount) || 0)
      + '；创建：' + (typeof meta.createdAt === 'string' ? meta.createdAt : '未知')
      + (Number(meta.reviewSourceId) > 0 ? '；来源审稿 ID ' + Number(meta.reviewSourceId) : ''),
  ]
  const prompt = readText(meta.userPrompt, 160)
  if (prompt) lines.push('  作者要求：' + prompt)
  if (content) lines.push('  变更摘要：' + content)
  return lines.join('\n')
}

export const readRevisionProposalsTool = buildAgentTool({
  name: 'read_revision_proposals',
  description: '读取修订提案：待处理 / 已合并 / 已丢弃的修订记录，含基准正文指纹、变更摘要、作者要求与来源审稿 ID。用于回答「有哪些待处理修订」「这条修订是按什么要求生成的」。只读，不合并、不丢弃、不改写草稿。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: { type: 'number', description: '章节号；缺省=最近一章有草稿的章节' },
      status: { type: 'string', description: '按状态过滤', enum: [...REVISION_STATUSES] },
      limit: { type: 'number', description: '最多列出多少条（1-20，默认 8）' },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    const limit = readInteger(args.limit, READ_TOOL_MAX_ITEMS, 1, 20)
    const requested = typeof args.status === 'string' ? args.status.trim() : ''
    if (requested && !REVISION_STATUSES.includes(requested as typeof REVISION_STATUSES[number])) {
      return {
        success: false,
        content: '',
        error: '不支持的修订状态「' + requested + '」。可用值：' + REVISION_STATUSES.join(' / ') + '。',
      }
    }

    try {
      const drafts = readDrafts(await ipc.invokeWithProjectSession(projectSession, 'db:draft-list-all', project.path))
      assertAgentProjectCurrent(context)
      const resolved = resolveChapterNumber(args.chapter_number, drafts)
      if (resolved.chapterNumber === null) {
        return { success: true, content: '当前项目还没有任何草稿，因此没有修订提案可读。' }
      }
      const chapterDrafts = readDrafts(await ipc.invokeWithProjectSession(projectSession, 'db:draft-list', resolved.chapterNumber, project.path))
      assertAgentProjectCurrent(context)
      if (chapterDrafts.length === 0) {
        return { success: true, content: '第 ' + resolved.chapterNumber + ' 章还没有草稿，因此没有修订提案。' }
      }

      const entries: Array<{ meta: Record<string, unknown>; draftVersion: number }> = []
      for (const draft of chapterDrafts) {
        const revisions = readList(await ipc.invokeWithProjectSession(projectSession, 'db:revision-list', draft.id, project.path))
        assertAgentProjectCurrent(context)
        for (const entry of revisions) {
          const meta = readRecord(entry)
          if (Object.keys(meta).length > 0) entries.push({ meta, draftVersion: draft.version })
        }
      }
      if (entries.length === 0) {
        return { success: true, content: '第 ' + resolved.chapterNumber + ' 章的 ' + chapterDrafts.length + ' 个草稿版本都还没有修订提案。' }
      }

      const pool = requested ? entries.filter(entry => entry.meta.status === requested) : entries
      const sorted = pool.slice().sort((left, right) => String(right.meta.createdAt ?? '').localeCompare(String(left.meta.createdAt ?? '')))
      const shown = sorted.slice(0, limit)
      const pendingCount = entries.filter(entry => entry.meta.status === 'pending').length
      const lines = [
        '✏️ 第 ' + resolved.chapterNumber + ' 章修订提案（共 ' + entries.length + ' 条'
          + '，待处理 ' + pendingCount + ' 条'
          + (requested ? '，筛选「' + requested + '」后 ' + pool.length + ' 条' : '')
          + '；本次列出 ' + shown.length + ' 条）',
      ]
      for (const entry of shown) {
        const id = Number(entry.meta.id) || 0
        const full = id > 0
          ? readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:revision-get-full', id, project.path))
          : {}
        assertAgentProjectCurrent(context)
        lines.push('')
        lines.push(formatRevision({ ...entry.meta, ...full }, entry.draftVersion, readText(full.content, 400)))
      }
      if (shown.length === 0) lines.push('没有符合筛选条件的修订提案。')
      lines.push(truncationNotice(pool.length, shown.length, '条修订提案'))
      return { success: true, content: lines.join('\n') }
    } catch (error) {
      return { success: false, content: '', error: '读取修订提案失败：' + String(error) }
    }
  },
})
