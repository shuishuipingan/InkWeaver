/**
 * propose_draft_revision — 提交一份正文修订提案（需作者批准）
 *
 * 硬边界：本工具**不改草稿、不改定稿**。它只按既有修订提案机制创建一条待处理修订
 * （baseDraftId + baseContentHash 指纹 + 修订后完整正文 + 复用共享计数），作者在既有
 * 修订 UI 里对比 diff 后自行决定合并或丢弃。不要用 write_file 绕过这条通道改正文。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { requireIpcSuccess } from '../../ipc-result'
import { countDraftUnits } from '../../../shared/draft-units'
import { textFingerprint } from '../../../shared/character-extraction'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import { readRecord } from './read-record.helpers'

/** 单次修订提案的正文上限（按 countDraftUnits 计），防止把长篇塞进一次提案。 */
export const DRAFT_REVISION_MAX_UNITS = 20_000
/** 原始字符上限（单位与计数不同，留出标点与空白的余量）。 */
export const DRAFT_REVISION_MAX_CHARACTERS = 120_000

export const proposeDraftRevisionTool = buildAgentTool({
  name: 'propose_draft_revision',
  description: '为某一章正文提交一份修订提案：给出修订后的完整正文，应用会与当前草稿逐段对比，作者批准后才可能合并。它只创建提案，不会直接改写草稿或定稿，也不要用 write_file 绕过这条通道去改正文。请只提交正文本身（不要 diff 片段、不要代码块围栏）。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: { type: 'number', description: '目标章节号（该章必须已有草稿）' },
      content: { type: 'string', description: '修订后的完整正文（不是片段、不是 diff）' },
      instruction: { type: 'string', description: '作者这次的修改要求，会随提案一起记录，便于复盘' },
    },
    required: ['chapter_number', 'content'],
  },
  requiresConfirmation: true,
  isReadOnly: false,
  execute: async (args, context) => {
    const chapterNumber = Number(args.chapter_number)
    if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) {
      return { success: false, content: '', error: '章节号无效：chapter_number 必须是正整数。' }
    }
    if (typeof args.content !== 'string') {
      return { success: false, content: '', error: '缺少修订正文：content 必须是修订后的完整正文。' }
    }
    const proposed = args.content.trim()
    if (!proposed) {
      return { success: false, content: '', error: '修订正文为空，未创建提案。' }
    }
    if (proposed.length > DRAFT_REVISION_MAX_CHARACTERS) {
      return {
        success: false,
        content: '',
        error: '修订正文过长（' + proposed.length + ' 字符，上限 ' + DRAFT_REVISION_MAX_CHARACTERS + '）；请拆分章节或分次提交。',
      }
    }
    const proposedUnits = countDraftUnits(proposed)
    if (proposedUnits > DRAFT_REVISION_MAX_UNITS) {
      return {
        success: false,
        content: '',
        error: '修订正文超出单次提案上限（' + proposedUnits + ' 字，上限 ' + DRAFT_REVISION_MAX_UNITS + ' 字）；请分次提交。',
      }
    }
    const instruction = typeof args.instruction === 'string' ? args.instruction.trim().slice(0, 500) : ''

    const { project, projectSession } = requireAgentProject(context)
    try {
      const latestMeta = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-latest', Math.trunc(chapterNumber), project.path))
      assertAgentProjectCurrent(context)
      const baseDraftId = Number(latestMeta.id) || 0
      if (baseDraftId <= 0) {
        return { success: false, content: '', error: '第 ' + Math.trunc(chapterNumber) + ' 章还没有草稿，无法创建修订提案。' }
      }

      const full = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', baseDraftId, project.path))
      assertAgentProjectCurrent(context)
      const current = typeof full.content === 'string' ? full.content : ''
      if (!current) {
        return { success: false, content: '', error: '第 ' + Math.trunc(chapterNumber) + ' 章的草稿正文为空，无法作为修订基准。' }
      }
      if (current.trim() === proposed) {
        return { success: false, content: '', error: '修订正文与当前草稿完全相同，未创建无意义的提案。' }
      }

      // 指纹与字数必须与 refine-draft 同源：主进程会用它拒绝针对旧正文的合并。
      const baseContentHash = textFingerprint(current)
      const wordCount = countDraftUnits(proposed)
      const created = await ipc.invokeWithProjectSession(projectSession, 'db:revision-replace-pending', {
        baseDraftId,
        revisionType: 'refine',
        ...(instruction ? { userPrompt: instruction } : {}),
        content: proposed,
        wordCount,
        baseContentHash,
      }, project.path)
      assertAgentProjectCurrent(context)
      requireIpcSuccess(created, '创建修订提案')
      const revisionId = Number(readRecord(created).id) || 0
      const revisionIndex = Number(readRecord(created).revisionIndex) || 0

      const beforeUnits = countDraftUnits(current)
      const delta = wordCount - beforeUnits
      const lines = [
        '已生成修订提案 r' + revisionIndex + '（第 ' + Math.trunc(chapterNumber) + ' 章，草稿 ID ' + baseDraftId + '）。',
        '· 字数：' + beforeUnits + ' → ' + wordCount + '（' + (delta >= 0 ? '+' : '') + delta + '）',
        '· 基准指纹：' + baseContentHash.slice(0, 12) + '（正文改动后该提案将无法合并）',
        instruction ? '· 记录的要求：' + instruction : '',
        '请在编辑器里打开这份修订稿，对比 diff 后自行决定合并或丢弃。本工具没有修改草稿或定稿。',
      ].filter(line => line.length > 0)
      void revisionId
      return { success: true, content: lines.join('\n') }
    } catch (error) {
      return { success: false, content: '', error: '创建修订提案失败：' + String(error) }
    }
  },
})
