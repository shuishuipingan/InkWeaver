import { BaseWorkflowCommand, CommandExecuteParams, type WorkflowGenerationRuntimeDependencies } from './base-command'
import { useProjectStore } from '../../../stores/project-store'
import { resolvePromptTemplate } from '../../prompt-templates'
import { ReviewPromptBuilder } from '../../prompts/prompt-builder'
import { ipc } from '../../ipc-client'
import { requireIpcSuccess } from '../../ipc-result'
import { unwrapKnowledgeValue } from '../../knowledge-service'
import { projectSessionContextFromProject, sameProjectSessionContext } from '../../../shared/project-session-context'
import type { ProjectSessionContext } from '../../../shared/ipc-channels'
import { readWorkflowDraftMeta } from '../workflow-draft-meta'
import {
  requireWorkflowProjectSession,
  workflowUiText,
  workflowWritingLanguage,
} from '../workflow-project-session'
import { promptLanguageText } from '../../prompt-language'
import { readConsistencyPreflight } from '../../consistency-preflight'
import { mergeConsistencyFindingsIntoReview, type ReviewLike } from '../../../shared/consistency-preflight'
import {
  adjacentFindingsAsReviewItems,
  inspectAdjacentContinuity,
} from '../../../shared/adjacent-continuity'
import { buildBlueprintEventCoverage } from '../../../shared/review-event-coverage'
import { textFingerprint } from '../../../shared/character-extraction'

export function parseReviewOutput(text: string): ReviewLike | null {
  try {
    const clean = text.replace(/```json?\s*/giu, '').replace(/```/gu, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const parsed: unknown = JSON.parse(clean.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const candidate = parsed as Record<string, unknown>
    if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.items)) return null
    if (!candidate.items.every(item => item && typeof item === 'object' && !Array.isArray(item))) return null
    return candidate as ReviewLike
  } catch {
    return null
  }
}


export interface ReviewChapterParams {
  draftPath: string
  draftContent: string
  chapterNumber: number
  /** 审稿维度侧重点（可选） */
  reviewFocus?: string
}

export class ReviewChapterCommand extends BaseWorkflowCommand<string> {
  constructor(
    private params: ReviewChapterParams,
    generationDependencies?: WorkflowGenerationRuntimeDependencies,
  ) {
    super(generationDependencies)
  }

  async execute(params: CommandExecuteParams): Promise<string> {
    return this.executeWithGenerationRuntime('text', params, () => this.executeWithinGeneration(params))
  }

  private async executeWithinGeneration({ context, callbacks }: CommandExecuteParams): Promise<string> {
    const projectSession = requireWorkflowProjectSession(context)
    const writingLanguage = workflowWritingLanguage(context)
    const text = (zhCNText: string, enUSText: string) => workflowUiText(context, zhCNText, enUSText)
    const project = useProjectStore.getState().currentProject
    if (!project || !sameProjectSessionContext(
      projectSession,
      projectSessionContextFromProject(project),
    )) throw new Error(text('当前项目已切换，审稿已停止', 'The project changed, so the review stopped.'))

    const draft = this.params.draftContent
    if (!draft) throw new Error(text('无草稿内容', 'There is no draft content to review.'))

    callbacks.log(text('准备启动一致性审查引擎...', 'Preparing the continuity review...'))
    callbacks.log(text('  检索全书设定档案...', '  Retrieving established story facts...'))

    // 使用向量检索获取与待审章节相关的历史上下文（替代全局摘要）
    let contextSummary = promptLanguageText(writingLanguage, '（无上下文参考）', '(no relevant prior context)')
    try {
      // 从待审内容中提取前 200 字作为检索 query
      const queryText = draft.slice(0, 200)
      const results = unwrapKnowledgeValue(await ipc.invokeWithProjectSession(
        projectSession,
        'kb:search',
        queryText,
        5,
        context.projectPath,
      ))
      if (results.length > 0) {
        contextSummary = results
          .map((r: { fileName: string; score: number; text: string }, i: number) =>
            promptLanguageText(
              writingLanguage,
              `[${i + 1}] (${r.fileName}, 相关度 ${(r.score * 100).toFixed(0)}%)\n${r.text}`,
              `[${i + 1}] (${r.fileName}, relevance ${(r.score * 100).toFixed(0)}%)\n${r.text}`,
            ))
          .join('\n\n')
      }
    } catch {
      contextSummary = promptLanguageText(writingLanguage, '（知识库检索不可用）', '(knowledge-base search unavailable)')
    }

    const characterState = await this.readCharacterStates(context.projectPath, projectSession, writingLanguage)
    const worldBuilding = await this.readWorldBuilding(context.projectPath, projectSession, writingLanguage)

    const template = await resolvePromptTemplate('consistency_check', projectSession, writingLanguage)
    if (!template) throw new Error(text('未找到审稿模板', 'The review prompt template was not found.'))

    const promptBuilder = new ReviewPromptBuilder(template, writingLanguage)
      .withChapterContent(draft)
      .withCharacterStates(characterState)
      .withGlobalSummary(contextSummary)
      .withWorldBuilding(worldBuilding)
      .withReviewFocus(this.params.reviewFocus || '')

    callbacks.log(text('调用 AI 审查员对本章进行多维度扫描...', 'Running the AI continuity review...'))

    // 期望 JSON 格式返回
    const reviewResultRaw = await this.callLLMWithBuilder(
      promptBuilder,
      callbacks,
      {
        responseFormat: { type: 'json_object' },
        purpose: 'review-chapter',
        reasoningStage: 'review',
      },
      context,
    )
    this.assertNotCancelled(context)

    let reviewResultClean = this.stripThinkingTags(reviewResultRaw)
    let parsedResult = parseReviewOutput(reviewResultClean)
    if (!parsedResult) {
      callbacks.log(text(
        '审稿结果格式无效；将在同一预算内重建一次，不会保存无效报告。',
        'The review response was invalid; rebuilding it once within the same budget. No invalid report will be saved.',
      ))
      const repairBuilder = new ReviewPromptBuilder(template, writingLanguage)
        .withChapterContent(draft)
        .withCharacterStates(characterState)
        .withGlobalSummary(contextSummary)
        .withWorldBuilding(worldBuilding)
        .withReviewFocus([
          this.params.reviewFocus || '',
          promptLanguageText(
            writingLanguage,
            '上一次审稿响应不是有效 JSON。请只返回包含 summary 字符串和 items 数组的完整 JSON 对象；不要解释、Markdown 或代码块。',
            'The previous review response was not valid JSON. Return only one complete JSON object with a summary string and an items array; no explanation, Markdown, or code fence.',
          ),
          `上一次无效响应（仅作格式证据）：${reviewResultClean.slice(0, 8_000)}`,
        ].filter(Boolean).join('\n\n'))
      reviewResultClean = this.stripThinkingTags(await this.callLLMWithBuilder(
        repairBuilder,
        callbacks,
        {
          responseFormat: { type: 'json_object' },
          purpose: 'review-chapter-repair',
          reasoningStage: 'review',
        },
        context,
      ))
      parsedResult = parseReviewOutput(reviewResultClean)
    }
    if (!parsedResult) {
      throw new Error(text(
        '审稿结果在一次重建后仍无效，未保存审稿报告。请重试或切换模型。',
        'The review remained invalid after one rebuild, so no report was saved. Retry or switch models.',
      ))
    }

    const baseDraft = await readWorkflowDraftMeta(this.params.draftPath, context.projectPath, projectSession)
    if (!baseDraft) throw new Error(text('找不到基准草稿版本', 'The source draft version could not be found.'))
    const baseVersion = baseDraft.version

    // The review request may outlive an editor save. Re-read the authoritative
    // draft before persistence when the host provides the full-content seam;
    // an old result must never be attached to newer text.
    try {
      const currentFull = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-get-full',
        baseDraft.id,
        context.projectPath,
      )
      if (currentFull?.content && textFingerprint(currentFull.content) !== textFingerprint(draft)) {
        throw new Error(text('审稿基准正文已变化，已拒绝保存旧审稿结果。', 'The review source changed, so the stale review was not saved.'))
      }
    } catch (error) {
      if (error instanceof Error && /审稿基准正文已变化|review source changed/iu.test(error.message)) throw error
      // Compatibility with older test/host seams that cannot read full drafts.
    }

    const revIndex = await ipc.invokeWithProjectSession(projectSession, 'db:review-next-index', baseDraft.id, context.projectPath)

    const blueprint = await ipc.invokeWithProjectSession(
      projectSession, 'db:blueprint-get', this.params.chapterNumber, context.projectPath,
    )
    if (blueprint) {
      const eventCoverage = buildBlueprintEventCoverage(
        blueprint.keyEvents,
        draft,
        Array.isArray(parsedResult.items) ? parsedResult.items : [],
      )
      parsedResult = { ...parsedResult, blueprintEventCoverage: eventCoverage }
      try {
        const preflight = await readConsistencyPreflight(projectSession, [blueprint])
        parsedResult = mergeConsistencyFindingsIntoReview(parsedResult, preflight.findings, context.uiLocale ?? 'zh-CN')
      } catch {
        callbacks.log(text(
          '一致性证据暂时不可用；AI 审稿仍会继续。',
          'Continuity evidence is temporarily unavailable; the AI review will continue.',
        ))
      }
      if (!sameProjectSessionContext(projectSession, projectSessionContextFromProject(useProjectStore.getState().currentProject))) {
        throw new Error(text('当前项目已切换，审稿已停止', 'The project changed, so the review stopped.'))
      }
    }

    if (this.params.chapterNumber > 1) {
      try {
        const previousHandoff = await ipc.invokeWithProjectSession(
          projectSession,
          'db:chapter-handoff-latest-before',
          this.params.chapterNumber,
          context.projectPath,
        )
        let previousEnding = ''
        const previousMeta = await ipc.invokeWithProjectSession(
          projectSession,
          'db:draft-get-finalized',
          this.params.chapterNumber - 1,
          context.projectPath,
        )
        if (previousMeta) {
          const previousFull = await ipc.invokeWithProjectSession(
            projectSession,
            'db:draft-get-full',
            previousMeta.id,
            context.projectPath,
          )
          previousEnding = previousFull?.content?.slice(-1200) ?? ''
        }
        const findings = inspectAdjacentContinuity({
          chapterNumber: this.params.chapterNumber,
          currentDraft: draft,
          previousEnding,
          previousHandoff: previousHandoff ?? undefined,
        })
        if (findings.length > 0) {
          parsedResult = {
            ...parsedResult,
            items: [
              ...(Array.isArray(parsedResult.items) ? parsedResult.items : []),
              ...adjacentFindingsAsReviewItems(findings, context.uiLocale ?? 'zh-CN'),
            ],
          }
          callbacks.log(text(
            `相邻章节衔接检查发现 ${findings.length} 个可定位问题；仅提供建议，不会自动改正文。`,
            `Adjacent continuity found ${findings.length} actionable issue(s); suggestions do not change the manuscript automatically.`,
          ))
        }
      } catch {
        callbacks.log(text(
          '相邻章节证据暂时不可用；其余审稿仍会继续。',
          'Adjacent-chapter evidence is unavailable; the rest of the review will continue.',
        ))
      }
    }

    this.assertNotCancelled(context)
    const createResult = await ipc.invokeWithProjectSession(projectSession, 'db:review-create', {
      baseDraftId: baseDraft.id,
      reviewIndex: revIndex,
      content: JSON.stringify(parsedResult, null, 2),
    }, context.projectPath)
    requireIpcSuccess(createResult, text('保存审稿报告', 'Save the review report'))

    // 将审稿报告 JSON 序列化为字符串，作为 content 传给 Tab
    // EditorArea 渲染 ReviewReport 的条件：activeTab.content 存在
    this.assertNotCancelled(context)
    const reportContent = JSON.stringify(parsedResult, null, 2)

    if (!sameProjectSessionContext(
      projectSession,
      projectSessionContextFromProject(useProjectStore.getState().currentProject),
    )) throw new Error(text('当前项目已切换，已拒绝打开旧审稿报告', 'The project changed, so the stale review report was not opened.'))
    const { useEditorStore } = await import('../../../stores/editor-store')
    const pseudoReviewPath = `vela://draft/ch${this.params.chapterNumber}/v${baseVersion}/review${revIndex}`
    useEditorStore.getState().openFile({
      id: `review-${this.params.draftPath}-${revIndex}`,
      name: text(
        `审稿报告：第${this.params.chapterNumber}章`,
        `Review report: Chapter ${this.params.chapterNumber}`,
      ),
      type: 'review-report',
      content: reportContent,
      filePath: this.params.draftPath,
      reportPath: pseudoReviewPath,
      reviewReport: reportContent,
      chapterNumber: this.params.chapterNumber,
      chapterDir: `vela://draft/ch${this.params.chapterNumber}`,
      reviewId: createResult.id,
      projectKey: context.projectPath,
    })

    callbacks.log(text(
      `审查完成，已生成审稿报告 r${revIndex}`,
      `Review complete; created review report r${revIndex}`,
    ))
    return reviewResultClean
  }

  private async readCharacterStates(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: NonNullable<CommandExecuteParams['context']['writingLanguage']>,
  ): Promise<string> {
    try {
      const allChars = await ipc.invokeWithProjectSession(projectSession, 'db:character-get-all', projectPath)
      const states: string[] = []
      for (const card of allChars) {
        if (card.name && card.currentState) {
          const cs = card.currentState
          states.push(promptLanguageText(
            writingLanguage,
            `${card.name}（${card.role || '未知'}）: ${cs.powerLevel || ''}, ${cs.location || ''}, ${cs.physicalState || ''}, ${cs.mentalState || ''}, 最近：${cs.recentEvents || ''}`,
            `${card.name} (${card.role || 'unknown'}): power ${cs.powerLevel || ''}; location ${cs.location || ''}; physical ${cs.physicalState || ''}; mental ${cs.mentalState || ''}; recent ${cs.recentEvents || ''}`,
          ))
        }
      }
      return states.length > 0 ? states.join('\n') : promptLanguageText(writingLanguage, '（暂无）', '(none)')
    } catch { return promptLanguageText(writingLanguage, '（读取失败）', '(unavailable)') }
  }

  private async readWorldBuilding(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: NonNullable<CommandExecuteParams['context']['writingLanguage']>,
  ): Promise<string> {
    const core = await ipc.invokeWithProjectSession(projectSession, 'db:project-core-get', projectPath)
    return core?.worldbuilding || promptLanguageText(writingLanguage, '（暂无）', '(none)')
  }
}
