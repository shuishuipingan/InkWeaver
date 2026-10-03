/**
 * analyze_prose_quality — 确定性的文风体检
 *
 * 给出可复核的测量结果（重复句式/短语、句长节奏、对话占比、副词密度），
 * 而不是让模型"感觉"文章好不好。修改前后各跑一次即可证明问题是否消除。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { analyzeProseMetrics, formatProseMetricsReport } from '../../../shared/prose-metrics'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'

interface DraftSummary {
  id?: number
  version?: number
}

export const analyzeProseQualityTool = buildAgentTool({
  name: 'analyze_prose_quality',
  description: '对某一章的最新草稿或一段给定文本做文风体检：检测重复句首/短语、句长节奏、对话占比与副词密度。适合在修改前后各调用一次，用数据确认重复和节奏问题是否真的解决。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: {
        type: 'number',
        description: '要分析的章节号；分析该章最新草稿。与 text 二选一。',
      },
      text: {
        type: 'string',
        description: '直接分析的文本片段（例如刚写好的段落）。与 chapter_number 二选一。',
      },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const chapterNumber = args.chapter_number as number | undefined
    const inlineText = args.text as string | undefined

    if (typeof inlineText === 'string' && inlineText.trim()) {
      return {
        success: true,
        content: `📐 文本体检（${inlineText.length} 字符输入）\n\n${formatProseMetricsReport(analyzeProseMetrics(inlineText))}`,
      }
    }
    if (typeof chapterNumber !== 'number' || !Number.isSafeInteger(chapterNumber) || chapterNumber < 1) {
      return {
        success: false,
        content: '',
        error: '缺少分析对象：请提供 chapter_number（章节号）或 text（文本片段）。',
      }
    }

    const { project, projectSession } = requireAgentProject(context)
    try {
      const draftsResult = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-list',
        chapterNumber,
        project.path,
      )
      assertAgentProjectCurrent(context)
      const drafts = (Array.isArray(draftsResult) ? draftsResult : []) as DraftSummary[]
      const latest = drafts[0] // db:draft-list 按 version 倒序返回
      if (!latest || typeof latest.id !== 'number') {
        return { success: true, content: `第 ${chapterNumber} 章暂无草稿，无法分析。` }
      }

      const fullDraft = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-get-full',
        latest.id,
        project.path,
      ) as { content?: string } | null
      assertAgentProjectCurrent(context)
      const content = fullDraft?.content ?? ''
      if (!content.trim()) {
        return { success: false, content: '', error: `第 ${chapterNumber} 章最新草稿内容为空。` }
      }

      return {
        success: true,
        content: `📐 第 ${chapterNumber} 章草稿 v${latest.version ?? '?'} 文风体检\n\n${formatProseMetricsReport(analyzeProseMetrics(content))}`,
      }
    } catch (error) {
      return { success: false, content: '', error: `分析草稿失败：${String(error)}` }
    }
  },
})
