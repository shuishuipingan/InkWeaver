import { BaseWorkflowCommand, CommandExecuteParams, type LLMCompletion } from './base-command'
import { useProjectStore } from '../../../stores/project-store'
import { sha256Hex } from '../../../shared/sha256-hex'
import { resolvePromptTemplate } from '../../prompt-templates'
import { ChapterPromptBuilder } from '../../prompts/prompt-builder'
import { ipc } from '../../ipc-client'
import { unwrapKnowledgeValue } from '../../knowledge-service'
import { projectSessionContextFromProject, sameProjectSessionContext } from '../../../shared/project-session-context'
import type { DraftMeta } from '../../../../electron/repositories/draft-repository'
import { planDraftCharacterContext } from '../../draft-character-context'
import { applyContextBudgetReceipt, type ContextBudgetBinding } from '../../../shared/context-budget-receipt'
import { cachedContextSummary } from '../../context-summary-cache'
import { DRAFT_CONTEXT_INPUT_LIMIT, UNKNOWN_CONTEXT_INPUT_LIMIT, draftOutputReservation } from '../../../shared/adaptive-prompt-budget'
import type { ProjectSessionContext } from '../../../shared/ipc-channels'
import { requireWorkflowProjectSession, workflowWritingLanguage, workflowUiText } from '../workflow-project-session'
import {
  DIR_PROMPTS
} from '../../../shared/project-paths'
import type { ChapterInfo } from '../chapter-workflow'
import { normalizeChapterWordsTarget } from '../chapter-creation-parameters'
import { appendVisibleTextContinuation } from '../bounded-completion'
import { stripThinkingTags } from '../workflow-utils'
import {
  createGenerationRuntime,
  type CreateGenerationRuntimeOptions,
  type GenerationRuntime,
} from '../../generation/generation-runtime'
import type {
  GenerationAttemptReceipt,
  GenerationOutcome,
  GenerationSession,
} from '../../generation/generation-harness'
import type { PromptBudgetPolicy, PromptBudgetSection } from '../../../shared/prompt-budget'
import type { WritingLanguage } from '../../../shared/writing-language'
import { factAppliesAtChapter, type FinalizedContinuityProjection } from '../../../shared/finalized-continuity'
import type { NarrativeThreadView } from '../../../shared/narrative-thread'
import { promptLanguageText } from '../../prompt-language'
import { countDraftUnits } from '../../../shared/draft-units'
import { formatChapterHandoff } from '../../chapter-handoff-context'
import type { ChapterHandoffRecord } from '../../../shared/chapter-handoff'
import { generationReceiptFromAttempt } from '../../../shared/generation-receipt'
import { formatPromptBudgetCompactionNotice, formatAdaptivePromptBudgetNotice } from '../../generation/prompt-budget-failure'
import { formatKnowledgeEventForPrompt, type KnowledgeEvent } from '../../../shared/knowledge-event'
import {
  selectContextEntries,
  type ContextReceipt,
  type ContextSelectionEntry,
  type ContextReceiptEntry,
} from '../../../shared/context-receipt'

export { countDraftUnits } from '../../../shared/draft-units'

// 续写时要能看到较长的已写结尾，才能接住当下的场景、语气与未收的动作。
const CONTINUE_PROMPT_MAX_CHARS = 2400
const MIN_TARGET_COMPLETION_RATIO = 0.82
const MAX_AUTO_CONTINUE_ROUNDS = 7
const MAX_TARGET_OVERAGE_RATIO = 0.12
const PREVIOUS_ENDING_MAX_CHARS = 1000
const PREVIOUS_DRAFT_CONTEXT_MAX_CHARS = 12_000
const ACTIVE_THREAD_CONTEXT_MAX_CHARS = 1200
const ACTIVE_THREAD_CONTEXT_MAX_ITEMS = 6
const MAX_DRAFT_PROMPT_UTF8_BYTES = 65_536
const DRAFT_PROMPT_DEGRADATION_PRIORITY = Object.freeze({
  premise: 50,
  coreOutline: 50,
  synopsis: 40,
  linkedCast: 30,
  secondaryCast: 20,
  confirmedPlanningMaterials: 15,
  distantBlueprints: 10,
})

interface DraftArchitectureSection {
  sectionName: string
  label: string
  text: string
  startOffset?: number
  degradation?: PromptBudgetSection['degradation']
}

function normalizePromptNewlineRuns(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim()
}

function promptTextOccurrences(text: string, fragment: string): number[] {
  if (!fragment) return []
  const starts: number[] = []
  let cursor = 0
  while (cursor <= text.length - fragment.length) {
    const start = text.indexOf(fragment, cursor)
    if (start < 0) break
    starts.push(start)
    cursor = start + fragment.length
  }
  return starts
}

interface DraftArchitectureContext {
  text: string
  sections: DraftArchitectureSection[]
  entries?: ContextReceiptEntry[]
  legacyCharactersPresent?: boolean
}

interface DraftCharacterContext {
  linked: string
  secondary: string
  text: string
  details: string
  detailSummary: string
  entries: ContextReceiptEntry[]
  cardCount: number
  budgetBindings: ContextBudgetBinding[]
}

function characterBudgetSections(context: DraftCharacterContext): DraftArchitectureSection[] {
  return [
    ...(context.linked ? [{ sectionName: 'core-cast', label: '', text: context.linked }] : []),
    ...(context.details ? [{ sectionName: 'linked-cast', label: '', text: context.details,
      degradation: { priority: 30, strategy: 'summary' as const, fallbackText: context.detailSummary } }] : []),
    ...(context.secondary ? [{ sectionName: 'secondary-cast', label: '', text: context.secondary,
      degradation: { priority: 20, strategy: 'complete-lines' as const } }] : []),
  ]
}

function promptBudgetSectionsForDraft(input: {
  systemPrompt: string
  prompt: string
  targetChapterText: string
  contexts: readonly DraftArchitectureSection[]
}): PromptBudgetPolicy {
  const locatedSections: Array<{ section: PromptBudgetSection; start: number }> = []
  if (input.systemPrompt) {
    locatedSections.push({
      section: {
        sectionName: 'system-instructions',
        messageIndex: 0,
        finalText: input.systemPrompt,
      },
      start: 0,
    })
  }
  const targetChapterStart = input.prompt.indexOf(input.targetChapterText)
  if (!input.targetChapterText || targetChapterStart < 0) {
    throw new Error('章节提示缺少受保护的目标章节证据，已阻止生成。')
  }
  locatedSections.push({
    section: {
      sectionName: 'target-chapter',
      messageIndex: 1,
      finalText: input.targetChapterText,
    },
    start: targetChapterStart,
  })

  const addOccurrences = (
    sectionName: string,
    finalText: string,
    degradation?: PromptBudgetSection['degradation'],
    startOffset?: number,
  ) => {
    if (!finalText) return
    if (startOffset !== undefined) {
      if (input.prompt.slice(startOffset, startOffset + finalText.length) !== finalText) {
        throw new Error(`草稿提示词预算区段「${sectionName}」没有匹配最终请求。`)
      }
      const overlapsLocatedSection = locatedSections.some(({ section, start }) => (
        section.messageIndex === 1
        && startOffset < start + section.finalText.length
        && startOffset + finalText.length > start
      ))
      if (overlapsLocatedSection) {
        throw new Error(`草稿提示词预算区段「${sectionName}」与受保护证据重叠。`)
      }
      locatedSections.push({
        section: {
          sectionName,
          messageIndex: 1,
          finalText,
          ...(degradation ? { degradation } : {}),
        },
        start: startOffset,
      })
      return
    }
    let cursor = 0
    while (cursor < input.prompt.length) {
      const start = input.prompt.indexOf(finalText, cursor)
      if (start < 0) break
      const end = start + finalText.length
      const overlapsClaimedSection = locatedSections.some(({ section, start: claimedStart }) => (
        section.messageIndex === 1
        && start < claimedStart + section.finalText.length
        && end > claimedStart
      ))
      if (overlapsClaimedSection) {
        // Repeated phrases inside protected evidence or an already-attributed
        // context section must not create a second, overlapping policy entry.
        cursor = start + 1
        continue
      }
      locatedSections.push({
        section: {
          sectionName,
          messageIndex: 1,
          finalText,
          ...(degradation ? { degradation } : {}),
        },
        start,
      })
      cursor = start + finalText.length
    }
  }

  for (const context of input.contexts) {
    addOccurrences(context.sectionName, context.text, context.degradation, context.startOffset)
  }

  return {
    limitUtf8Bytes: MAX_DRAFT_PROMPT_UTF8_BYTES,
    adaptive: { maxInputTokens: DRAFT_CONTEXT_INPUT_LIMIT, unknownInputTokens: UNKNOWN_CONTEXT_INPUT_LIMIT },
    sections: locatedSections
      .sort((left, right) => left.section.messageIndex - right.section.messageIndex || left.start - right.start)
      .map(({ section }) => section),
  }
}
export function sanitizeDraftText(text: string): string {
  const cleaned = stripThinkingTags(text)
    .replace(/^\s*(?:点我继续生成后续内容|继续生成后续内容|请点击继续|未完待续)\s*$/gmi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const paragraphs = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const paragraph of paragraphs) {
    const key = paragraph.replace(/\s+/g, '')
    if (key.length >= 40 && seen.has(key)) continue
    if (key.length >= 40) seen.add(key)
    deduped.push(paragraph)
  }
  return deduped.join('\n\n').trim()
}

const THINKING_TAGS = ['<think>', '</think>'] as const

/**
 * Convert the cumulative raw stream into safe provisional prose. A suffix that
 * could still become a thinking tag is withheld so split tags never flash in
 * the writing panel before the next chunk arrives.
 */
export function visibleDraftStreamText(rawText: string): string {
  const lower = rawText.toLowerCase()
  let safeEnd = rawText.length
  const longestTag = Math.max(...THINKING_TAGS.map(tag => tag.length))
  for (let length = 1; length < longestTag; length += 1) {
    const suffix = lower.slice(-length)
    if (THINKING_TAGS.some(tag => tag.startsWith(suffix))) {
      safeEnd = rawText.length - length
    }
  }
  return sanitizeDraftText(rawText.slice(0, safeEnd))
}

function maxDraftCharsForTarget(targetChars: number): number {
  return Math.floor(targetChars * (1 + MAX_TARGET_OVERAGE_RATIO))
}

export const DRAFT_GENERATION_BUDGET = Object.freeze({
  maxAttempts: 8,
  maxRequestedOutputTokens: 196_608,
  maxRequestedOutputTokensPerAttempt: 65_536,
  deadlineMs: 20 * 60_000,
})

export interface GenerateDraftCommandDependencies {
  createRuntime(options: CreateGenerationRuntimeOptions): Promise<GenerationRuntime>
}

export interface GenerateDraftCommandOptions {
  /**
   * Ephemeral ending from the immediately preceding draft in the same batch.
   * It is prompt-only context and must never be persisted as finalized state.
   */
  readonly previousDraftEnding?: string
  /** The complete saved candidate content from the immediately preceding batch chapter. */
  readonly previousDraftContent?: string
  readonly previousDraftVersion?: number
  readonly dependencies?: Partial<GenerateDraftCommandDependencies>
}

const DEFAULT_DEPENDENCIES: GenerateDraftCommandDependencies = {
  createRuntime: options => createGenerationRuntime(options),
}

/** Use the same bounded previous-ending window for finalized and in-batch prose. */
export function previousChapterEnding(content: string): string {
  return content.slice(-PREVIOUS_ENDING_MAX_CHARS)
}

/** Keep a saved candidate's identity and broad context, rather than treating its tail as history. */
function previousDraftContext(content: string, version?: number): string {
  const normalized = content.trim()
  if (!normalized) return ''
  const label = version === undefined ? 'saved candidate draft' : `saved candidate draft v${version}`
  if (normalized.length <= PREVIOUS_DRAFT_CONTEXT_MAX_CHARS) return `【${label}】\n${normalized}`
  const half = Math.floor(PREVIOUS_DRAFT_CONTEXT_MAX_CHARS / 2)
  return `【${label}; middle omitted only for budget】\n${normalized.slice(0, half)}\n…\n${normalized.slice(-half)}`
}

function observeWorkflowCancellation(context: CommandExecuteParams['context']): {
  signal: AbortSignal
  dispose(): void
} {
  const controller = new AbortController()
  const timer = setInterval(() => {
    if (context.cancelled) controller.abort()
  }, 25)
  if (context.cancelled) controller.abort()
  return {
    signal: controller.signal,
    dispose: () => clearInterval(timer),
  }
}

function logDraftAttempt(
  callbacks: CommandExecuteParams['callbacks'],
  phase: string,
  receipt: GenerationAttemptReceipt,
): void {
  callbacks.setGenerationReceipt?.(generationReceiptFromAttempt(receipt))
  callbacks.log(
    `  ${phase}：租约请求上限 ${receipt.budget.requestedOutputTokens} Tokens` +
    `（单次上限 ${receipt.budget.maxRequestedOutputTokensPerAttempt}，` +
    `累计 ${receipt.budget.cumulativeRequestedOutputTokens}/${receipt.budget.maxRequestedOutputTokens}）`,
  )
}

function completionFromOutcome(outcome: GenerationOutcome): LLMCompletion {
  return { content: outcome.content, finishReason: outcome.finishReason, receipt: outcome.receipt }
}

function workflowGenerationModelId(context: CommandExecuteParams['context']): string | undefined {
  return context.generationModelId?.trim() || undefined
}
function assertDraftProjectSession(session: ProjectSessionContext): void {
  if (!sameProjectSessionContext(session, projectSessionContextFromProject(useProjectStore.getState().currentProject))) {
    throw new Error('当前项目已切换，章节生成已停止')
  }
}

function contextReceiptEntry(
  id: string,
  layer: ContextSelectionEntry['layer'],
  label: string,
  content: string,
  sourceChapter?: number,
  required = false,
  sourceSpan?: { start: number; end: number },
): ContextReceipt['entries'][number] {
  const charCount = content.trim().length
  return {
    id,
    layer,
    label,
    ...(sourceChapter === undefined ? {} : { sourceChapter }),
    ...(required ? { required: true } : {}),
    ...(sourceSpan ? { sourceSpan } : {}),
    included: charCount > 0,
    ...(charCount > 0 ? {} : { reason: 'unavailable' as const }),
    charCount,
  }
}

/** Add non-budgeted prompt layers to the privacy-safe receipt without storing their text. */
function extendContextReceipt(
  receipt: ContextReceipt,
  entries: readonly ContextReceipt['entries'][number][],
): ContextReceipt {
  const existing = new Set(receipt.entries.map(entry => entry.id))
  return {
    ...receipt,
    entries: [
      ...receipt.entries,
      ...entries.filter(entry => !existing.has(entry.id)),
    ].sort((left, right) => left.id.localeCompare(right.id)),
  }
}

/** Join a visible continuation without allowing a repeated prompt tail to count as new prose. */
export function appendVisibleDraftContinuation(draft: string, continuation: string): string {
  return appendVisibleTextContinuation(draft, continuation, sanitizeDraftText)
}

function takeSentenceBoundaryWithin(text: string, maxChars: number): string {
  let units = 0
  let boundaryIndex = -1
  let segmentStart = 0

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (!'。！？….?!'.includes(char)) continue

    let candidateBoundary = index + 1
    while (candidateBoundary < text.length && '”’」』）】'.includes(text[candidateBoundary])) {
      candidateBoundary += 1
    }
    units += countDraftUnits(text.slice(segmentStart, candidateBoundary))
    if (units > maxChars) break
    boundaryIndex = candidateBoundary
    segmentStart = candidateBoundary
    index = candidateBoundary - 1
  }

  return boundaryIndex > 0 ? text.slice(0, boundaryIndex).trim() : ''
}

function capDraftAtNaturalBoundary(text: string, maxChars: number): string {
  const cleaned = sanitizeDraftText(text)
  if (countDraftUnits(cleaned) <= maxChars) return cleaned

  const paragraphs = cleaned.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean)
  let capped = ''

  for (const paragraph of paragraphs) {
    const candidate = capped ? `${capped}\n\n${paragraph}` : paragraph
    if (countDraftUnits(candidate) <= maxChars) {
      capped = candidate
      continue
    }

    const remaining = maxChars - countDraftUnits(capped)
    const sentence = takeSentenceBoundaryWithin(paragraph, remaining)
    if (sentence) capped = capped ? `${capped}\n\n${sentence}` : sentence
    break
  }

  return capped.trim()
}

export class GenerateDraftCommand extends BaseWorkflowCommand {
  private readonly dependencies: GenerateDraftCommandDependencies
  private readonly previousDraftEnding: string | undefined
  private readonly previousDraftContent: string | undefined
  private readonly previousDraftVersion: number | undefined

  constructor(
    private chapterInfo: ChapterInfo,
    options: GenerateDraftCommandOptions = {},
  ) {
    super()
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies }
    this.previousDraftEnding = options.previousDraftEnding
      ? previousChapterEnding(options.previousDraftEnding)
      : undefined
    this.previousDraftContent = options.previousDraftContent?.trim() || undefined
    this.previousDraftVersion = options.previousDraftVersion
  }

  async execute({ context, callbacks }: CommandExecuteParams): Promise<string> {
    const expectedProjectPath = this.chapterInfo.projectPath
    const projectSession = requireWorkflowProjectSession(context)
    const project = useProjectStore.getState().currentProject
    if (!project || !sameProjectSessionContext(
      projectSession,
      projectSessionContextFromProject(project),
    )) {
      throw new Error('当前项目已切换，章节生成已停止')
    }
    const novelConfig = Object.freeze({ ...project.novelConfig })
    const writingLanguage = workflowWritingLanguage(context)

    callbacks.log('拼装章节上下文 (强类型注入中)...')

    const architectureContext = await this.readArchitecture(
      expectedProjectPath,
      projectSession,
      writingLanguage,
    )
    const outlineSummary = novelConfig.coreOutline?.trim()
      ? await cachedContextSummary(projectSession, 'architecture', 'core-outline', novelConfig.coreOutline,
        { maxChars: 2_000, terms: this.chapterInfo.characters, chapterNumber: this.chapterInfo.chapterNumber }) : null
    const draftNovelConfig = { ...novelConfig, ...(outlineSummary ? { coreOutline: outlineSummary.text } : {}) }
    const projectPrompts = await this.readProjectPrompts(
      expectedProjectPath,
      projectSession,
      writingLanguage,
    )
    const planningMaterials = await this.readPlanningMaterials(
      expectedProjectPath,
      projectSession,
      writingLanguage,
    )
    const guidanceSections: DraftArchitectureSection[] = [
      { sectionName: 'global-guidance', label: '', text: normalizePromptNewlineRuns(novelConfig.globalGuidance?.trim() || '') },
      { sectionName: 'project-guidance', label: '', text: normalizePromptNewlineRuns(projectPrompts) },
      ...planningMaterials.sections.map((text, index) => ({
        sectionName: `confirmed-planning-material-${index + 1}`, label: '', text: normalizePromptNewlineRuns(text),
        degradation: {
          priority: DRAFT_PROMPT_DEGRADATION_PRIORITY.confirmedPlanningMaterials,
          strategy: 'whole-section' as const,
        },
      })),
    ].filter(section => section.text)
    const mergedGuidance = guidanceSections.map(section => section.text).join('\n\n')

    const characterContext = await this.readCharacterStates(
      expectedProjectPath,
      projectSession,
      writingLanguage,
      this.chapterInfo.characters,
    )
    if (architectureContext.legacyCharactersPresent && characterContext.cardCount === 0) {
      throw new Error(workflowUiText(context, '旧角色图谱尚未转换为结构化角色卡，请先完成角色图谱修复再生成章节。',
        'The legacy character graph has no structured cards. Repair the character graph before generating a chapter.'))
    }
    let futureBlueprintsStr = promptLanguageText(
      writingLanguage,
      '（无后续蓝图）',
      '(no future chapter blueprints)',
    )
    const futureReceiptEntries: ContextReceiptEntry[] = []
    const futureBudgetBindings: ContextBudgetBinding[] = []
    try {
      const { loadDirectoryBlueprints } = await import('../directory-workflow')
      const allBlueprints = await loadDirectoryBlueprints(expectedProjectPath, projectSession)
      const futureBlueprintsArr = allBlueprints.filter(
        b => b.chapterNumber > this.chapterInfo.chapterNumber && b.chapterNumber <= this.chapterInfo.chapterNumber + 5
      )
      if (futureBlueprintsArr.length > 0) {
        const rows = futureBlueprintsArr.map(b => promptLanguageText(
          writingLanguage,
          `第${b.chapterNumber}章 ${b.title}：${b.keyEvents}`,
          `Chapter ${b.chapterNumber}: ${b.title} — ${b.keyEvents}`,
        ).replace(/[\r\n]+/gu, ' '))
        futureBlueprintsStr = rows.join('\n')
        const sectionBytes = new TextEncoder().encode(futureBlueprintsStr).byteLength
        let rowEndBytes = 0
        rows.forEach((row, index) => {
          rowEndBytes += new TextEncoder().encode(row).byteLength + (index ? 1 : 0)
          const blueprint = futureBlueprintsArr[index]!
          const entryId = `future-plan:${blueprint.chapterNumber}`
          futureReceiptEntries.push({ id: entryId, layer: 'future-plan', label: blueprint.title, sourceChapter: blueprint.chapterNumber,
            included: true, charCount: row.length, representation: 'full', sourceKind: 'planning' })
          futureBudgetBindings.push({ entryId, sectionName: 'distant-blueprints', fullSectionBytes: sectionBytes, fullEndBytes: rowEndBytes })
        })
      }
    } catch { /* 忽略 */ }

    const isFirstChapter = this.chapterInfo.chapterNumber === 1
    const draftArchitecture = isFirstChapter && (characterContext.linked || characterContext.secondary)
      ? {
          ...architectureContext,
          text: [architectureContext.text, characterContext.text].filter(Boolean).join('\n\n---\n\n'),
          sections: [
            ...architectureContext.sections,
            ...characterBudgetSections(characterContext),
          ],
        }
      : architectureContext
    const templateKey = isFirstChapter ? 'first_chapter_draft' : 'next_chapter_draft'
    const template = await resolvePromptTemplate(templateKey, projectSession, writingLanguage)
    if (!template) throw new Error(`未找到模板: ${templateKey}`)

    // ==========================================
    // Prompt 构建——按「稳定前缀 → 可变后缀」排列
    // 以最大化 LLM 上下文缓存命中率
    // ==========================================
    const promptBuilder = new ChapterPromptBuilder(template, writingLanguage)
      // ---- 缓存命中区（跨章稳定，前缀对齐）----
      .withArchitecture(draftArchitecture.text)
      .withGlobalGuidance(mergedGuidance)
      .withWritingStyle(novelConfig.writingStyle || '')
      .withNovelConfig(draftNovelConfig)
      .withWordNumber(normalizeChapterWordsTarget(this.chapterInfo.wordsTarget, novelConfig.wordsPerChapter))
      // ---- 章节公共区（首章与后续章都必须完整注入）----
      .withChapterInfo(this.chapterInfo)
      .withFutureBlueprints(futureBlueprintsStr)
      .withUserGuidance(this.chapterInfo.userGuidance?.trim() || promptLanguageText(
        writingLanguage,
        '（无微操指导）',
        '(no author guidance)',
      ))

    // Even a first chapter gets an explicit empty receipt so the UI can tell
    // the difference between “no history exists” and “history was omitted”.
    const emptyContextReceipt: ContextReceipt = {
      version: 1,
      chapterNumber: this.chapterInfo.chapterNumber,
      budgetChars: 0,
      selectedChars: 0,
      entries: [],
    }
    const planningReceiptEntries: ContextReceiptEntry[] = planningMaterials.sections.map((text, index) => ({
      id: `planning-material:${index + 1}`, layer: 'planning-material', label: text.split('\n')[0]!,
      included: true, charCount: text.length, sourceKind: 'planning', representation: 'full',
    }))
    const guidanceReceiptEntries = guidanceSections.filter(section => !section.degradation).map(section => ({
      ...contextReceiptEntry(`guidance:${section.sectionName}`, 'fixed-rules', section.sectionName === 'global-guidance' ? '全局写作指导' : '项目写作指导', section.text, undefined, true),
      sourceKind: 'project-setting' as const, representation: 'full' as const,
    }))
    const allBudgetBindings = [...characterContext.budgetBindings, ...futureBudgetBindings,
      ...planningMaterials.sections.map((text, index) => ({ entryId: `planning-material:${index + 1}`,
        sectionName: `confirmed-planning-material-${index + 1}`, fullSectionBytes: new TextEncoder().encode(text).byteLength,
        fullEndBytes: new TextEncoder().encode(text).byteLength }))]
    context.data.contextReceipt = emptyContextReceipt
    context.data.planningMaterialCount = planningMaterials.count
    context.data.contextReceipt = extendContextReceipt(emptyContextReceipt, [
      ...(outlineSummary ? [{ id: 'configuration:outline', layer: 'fixed-rules' as const, label: '全书大纲', included: true,
        required: true, charCount: outlineSummary.retainedChars, originalCharCount: outlineSummary.originalChars,
        sourceKind: 'planning' as const, cacheHit: outlineSummary.cacheHit,
        representation: outlineSummary.retainedChars < outlineSummary.originalChars ? 'summary' as const : 'full' as const }] : []),
      ...(architectureContext.entries ?? []),
      ...characterContext.entries,
      contextReceiptEntry(
        'author-task:chapter',
        'author-task',
        '本章作者任务与硬性要求',
        this.chapterInfo.userGuidance?.trim() || '',
        this.chapterInfo.chapterNumber,
        true,
      ),
      ...futureReceiptEntries, ...planningReceiptEntries, ...guidanceReceiptEntries,
    ])

    const draftBaseReceipt = context.data.contextReceipt as ContextReceipt
    // 续写阶段也要带着同一批连续性锚点（要点时间线 / 活跃线索 / 知情范围 / 上一章交接）。
    let continuityContext = ''
    if (!isFirstChapter) {
      // 从蓝图 JSON 的 notes 字段读取章节要点时间线（按序拼装，利于前缀缓存）
      const chapterTimeline = await this.readChapterNotesTimeline(
        expectedProjectPath,
        this.chapterInfo.chapterNumber,
        projectSession,
        writingLanguage,
        this.chapterInfo.characters,
      )
      callbacks.log(`  已加载章节要点与连续性事实（${chapterTimeline.factCount} 条）`)
      context.data.contextReceipt = chapterTimeline.receipt
      const omittedContextCount = chapterTimeline.receipt.entries.filter(entry => !entry.included).length
      if (omittedContextCount > 0) {
        callbacks.log(`  上下文预算省略 ${omittedContextCount} 个完整条目（详见 ContextReceipt）`)
      }
      const activeThreads = await this.readActiveNarrativeThreads(
        expectedProjectPath,
        projectSession,
        writingLanguage,
      )
      callbacks.log(`  已加载相关活跃叙事线索（${activeThreads.count} 条）`)
      const knowledgeEvents = await this.readKnowledgeEvents(
        expectedProjectPath,
        projectSession,
        writingLanguage,
      )
      callbacks.log(`  已加载当前角色知情范围（${knowledgeEvents.count} 条）`)

      let chapterHandoff: ChapterHandoffRecord | null = null
      try {
        chapterHandoff = await ipc.invokeWithProjectSession(
          projectSession,
          'db:chapter-handoff-latest-before',
          this.chapterInfo.chapterNumber,
          expectedProjectPath,
        )
        if (chapterHandoff) callbacks.log('  已加载上一章确认的场景交接记录')
      } catch {
        // Older projects may not have a handoff yet; the previous ending remains
        // a valid fallback and the prompt explicitly says that no handoff exists.
      }

      let previousEnding = this.previousDraftEnding ?? ''
      const savedCandidateSummary = this.previousDraftContent?.trim()
        ? await cachedContextSummary(projectSession, 'chapter-summary', `candidate:${this.chapterInfo.chapterNumber - 1}:${this.previousDraftVersion ?? 0}`,
          this.previousDraftContent, { maxChars: 3_000, terms: this.chapterInfo.characters, chapterNumber: this.chapterInfo.chapterNumber }) : null
      const savedCandidateContext = previousDraftContext(savedCandidateSummary
        ? `${savedCandidateSummary.text}\n\n${previousChapterEnding(this.previousDraftContent ?? '')}` : '', this.previousDraftVersion)
      let previousEndingSource: 'unfinished-candidate' | 'finalized-history' | 'none' = savedCandidateContext
        ? 'unfinished-candidate'
        : 'none'
      // A saved candidate is the authoritative continuity source for a
      // continuous draft. Do not fall back to finalized history when the
      // candidate context is present: that would both issue an unnecessary
      // finalized read and make an unfinished candidate look like history.
      if (!previousEnding && !savedCandidateContext) {
        try {
          const prevNum = this.chapterInfo.chapterNumber - 1
          const meta = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-finalized', prevNum, expectedProjectPath)
          if (meta) {
            const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', meta.id, expectedProjectPath)
            if (full?.content) {
              previousEnding = previousChapterEnding(full.content)
              previousEndingSource = 'finalized-history'
            }
          }
        } catch { /* 忽略 */ }
      }

      let filteredContext = ''
      try {
        callbacks.log('  🔍 检索知识库相关片段...')
        let searchQuery = `${this.chapterInfo.title} ${this.chapterInfo.keyEvents} ${this.chapterInfo.characters.join(' ')}`
        if (this.chapterInfo.knowledgeQueryHint?.trim()) {
          searchQuery += ` ${this.chapterInfo.knowledgeQueryHint.trim()}`
          callbacks.log(`  📌 追加用户检索关键词：${this.chapterInfo.knowledgeQueryHint.trim()}`)
        }
        const results = unwrapKnowledgeValue(await ipc.invokeWithProjectSession(
          projectSession,
          'kb:search-writing-context',
          searchQuery,
          5,
          expectedProjectPath,
        ))
        filteredContext = results.length > 0
          ? results.map((r: { fileName: string; score: number; text: string }, i: number) => promptLanguageText(
              writingLanguage,
              `[${i + 1}] (${r.fileName}, 相关度 ${(r.score * 100).toFixed(0)}%)\n${r.text}`,
              `[${i + 1}] (${r.fileName}, relevance ${(r.score * 100).toFixed(0)}%)\n${r.text}`,
            )).join('\n\n')
          : promptLanguageText(writingLanguage, '（知识库中无相关内容）', '(no relevant knowledge-base context)')
        if (results.length > 0) filteredContext = `${promptLanguageText(writingLanguage,
          '【参考资料：本书未发生的事件不能照搬，但其中的冲突设计、场景铺陈与细节笔法可以化用进本章】',
          '[Reference material: do not copy events that never happened in this novel, but do adapt its conflict design, scene framing, and concrete detail into this chapter]')}\n${filteredContext}`
      } catch {
        filteredContext = promptLanguageText(writingLanguage, '（知识库检索不可用）', '(knowledge-base search unavailable)')
      }

      context.data.contextReceipt = extendContextReceipt(chapterTimeline.receipt, [
        ...draftBaseReceipt.entries.filter(entry => entry.id === 'configuration:outline'),
        ...(architectureContext.entries ?? []),
        ...characterContext.entries,
        ...guidanceReceiptEntries, ...planningReceiptEntries,
        contextReceiptEntry('fixed-rules:style', 'fixed-rules', '文风约束', novelConfig.writingStyle || ''),
        contextReceiptEntry('active-thread:relevant', 'active-thread', '相关活跃叙事线', activeThreads.text),
        contextReceiptEntry('knowledge-search:current', 'knowledge-search', '知识库检索片段', filteredContext),
        contextReceiptEntry(
          'immediate-handoff:previous',
          'immediate-handoff',
          '上一章确认交接',
          formatChapterHandoff(chapterHandoff, writingLanguage),
          chapterHandoff?.chapterNumber,
        ),
        contextReceiptEntry(
          'knowledge-search:confirmed-events',
          'knowledge-search',
          '当前角色已确认知情范围',
          knowledgeEvents.text,
        ),
        contextReceiptEntry(
          'unfinished-candidate:previous',
          'unfinished-candidate',
          '上一章已保存候选稿',
          savedCandidateContext,
          this.chapterInfo.chapterNumber - 1,
          false,
          savedCandidateContext ? { start: 0, end: savedCandidateContext.length } : undefined,
        ),
        contextReceiptEntry(
          'adjacent-prose:previous-finalized',
          'adjacent-prose',
          '上一章相邻正文片段',
          previousEndingSource === 'finalized-history' ? previousEnding : '',
          this.chapterInfo.chapterNumber - 1,
          false,
          previousEndingSource === 'finalized-history' ? { start: 0, end: previousEnding.length } : undefined,
        ),
        contextReceiptEntry(
          'author-task:chapter',
          'author-task',
          '本章作者任务与硬性要求',
          this.chapterInfo.userGuidance?.trim() || '',
          this.chapterInfo.chapterNumber,
          true,
        ),
        ...futureReceiptEntries,
      ])
      const currentReceipt = context.data.contextReceipt as ContextReceipt
      currentReceipt.entries = currentReceipt.entries.map(entry => entry.id === 'knowledge-search:current'
        ? { ...entry, sourceKind: 'reference-material' } : entry.id === 'knowledge-search:confirmed-events'
          ? { ...entry, sourceKind: 'confirmed-knowledge' } : entry)

      promptBuilder
        // ---- 缓存命中区续（要点时间线按序追加，前缀对齐）----
        .withGlobalSummary([chapterTimeline.text, activeThreads.text, knowledgeEvents.text].filter(Boolean).join('\n\n'))
        .withCharacterStates(characterContext.text)
        .withChapterHandoff(formatChapterHandoff(chapterHandoff, writingLanguage))
        // ---- 缓存失效区（逐章变化）----
        .withPreviousEnding(savedCandidateContext || previousEnding || promptLanguageText(
          writingLanguage,
          '（无前文）',
          '(no previous manuscript)',
        ))
        .withFilteredContext(filteredContext)
        .withShortSummary('')
      continuityContext = [
        chapterTimeline.text,
        activeThreads.text,
        knowledgeEvents.text,
        formatChapterHandoff(chapterHandoff, writingLanguage),
      ].filter(Boolean).join('\n\n')
    }

    const prompt = promptBuilder.build()
    const draftSystemRole = `${promptBuilder.getSystemRole()}\n${promptLanguageText(writingLanguage,
      '资料来源规则：定稿正文与核实的连续性事实代表已发生事件，必须保持一致；架构、人物背景与弧线、未来蓝图是设定或规划，按本章蓝图推进。正文的生动优先：多写具体的动作、对白、感官细节与场景氛围，把设定与约束织进情节里，而不是复述设定。参考书片段仅供防事实污染，其冲突设计与细节笔法应当化用。',
      'Source rules: finalized prose and verified continuity facts establish occurred events and must stay consistent; architecture, character background/arcs, and upcoming blueprints are settings to advance through this chapter blueprint. Vivid prose first: favor concrete action, dialogue, sensory detail, and scene atmosphere, weaving settings and constraints into the plot instead of restating them. Reference excerpts guard against fact contamination only; adapt their conflict design and detail craft.')} `
    const serializedGlobalGuidance = typeof novelConfig.globalGuidance === 'string'
      ? JSON.stringify(novelConfig.globalGuidance)
      : undefined
    const serializedNovelConfig = JSON.stringify(draftNovelConfig, null, 2)
    const novelConfigRanges = promptTextOccurrences(prompt, serializedNovelConfig).map(start => ({
      start,
      end: start + serializedNovelConfig.length,
    }))
    const configEntry = serializedGlobalGuidance
      ? `"globalGuidance": ${serializedGlobalGuidance}`
      : undefined
    const configGuidanceStarts = configEntry
      ? promptTextOccurrences(prompt, configEntry)
          .filter(entryStart => novelConfigRanges.some(range => (
            entryStart >= range.start && entryStart + configEntry.length <= range.end
          )))
          .map(start => start + '"globalGuidance": '.length)
      : []
    const configGuidanceRanges = configGuidanceStarts.map(start => ({
      start,
      end: start + serializedGlobalGuidance!.length,
    }))
    const targetChapterStart = prompt.indexOf(JSON.stringify(this.chapterInfo, null, 2))
    const targetChapterEnd = targetChapterStart + JSON.stringify(this.chapterInfo, null, 2).length
    const guidanceBlockStarts = mergedGuidance
      ? promptTextOccurrences(prompt, mergedGuidance).filter(start => {
          const end = start + mergedGuidance.length
          const overlapsTarget = targetChapterStart >= 0 && start < targetChapterEnd && end > targetChapterStart
          const overlapsConfigCopy = configGuidanceRanges.some(range => start < range.end && end > range.start)
          return !overlapsTarget && !overlapsConfigCopy
        })
      : []
    if (mergedGuidance && guidanceBlockStarts.length === 0) {
      throw new Error('草稿提示词缺少最终合并指导区段，已阻止生成。')
    }
    const locatedGuidanceSections = guidanceBlockStarts.flatMap(blockStart => {
      let guidanceCursor = blockStart
      return guidanceSections.map((section, index) => {
        const result = { ...section, startOffset: guidanceCursor }
        guidanceCursor += section.text.length + (index + 1 < guidanceSections.length ? 2 : 0)
        return result
      })
    })
    const globalGuidanceConfigSections = serializedGlobalGuidance && novelConfig.globalGuidance
      ? configGuidanceStarts.map((startOffset) => ({
          sectionName: 'global-guidance-config',
          label: '',
          text: serializedGlobalGuidance,
          startOffset,
        }))
      : []
    const promptBudget = promptBudgetSectionsForDraft({
      systemPrompt: draftSystemRole,
      prompt,
      targetChapterText: JSON.stringify(this.chapterInfo, null, 2),
      contexts: [
        ...globalGuidanceConfigSections,
        ...locatedGuidanceSections,
        ...draftArchitecture.sections,
        ...(typeof draftNovelConfig.coreOutline === 'string' && draftNovelConfig.coreOutline
          ? [{
              sectionName: 'core-outline',
              label: '',
              text: JSON.stringify(draftNovelConfig.coreOutline),
            }]
          : []),
        ...(!isFirstChapter ? characterBudgetSections(characterContext) : []),
        {
          sectionName: 'distant-blueprints',
          label: '',
          text: futureBlueprintsStr,
          degradation: { priority: DRAFT_PROMPT_DEGRADATION_PRIORITY.distantBlueprints, strategy: 'complete-lines' as const },
        },
      ],
    })
    const targetChars = normalizeChapterWordsTarget(this.chapterInfo.wordsTarget, novelConfig.wordsPerChapter)
    callbacks.setContextReceipt?.(context.data.contextReceipt as ContextReceipt)
    const preparedReceipt = context.data.contextReceipt as ContextReceipt
    const maxDraftChars = maxDraftCharsForTarget(targetChars)

    callbacks.log('调用 AI 生成章节草稿...')
    let draftPersisted = false
    try {
      this.assertNotCancelled(context)
      if (!sameProjectSessionContext(projectSession, projectSessionContextFromProject(useProjectStore.getState().currentProject))) {
        throw new Error('当前项目已切换，章节生成已停止')
      }
      const cancellation = observeWorkflowCancellation(context)
      let runtime: GenerationRuntime | null = null
      let cleanDraftText: string
      try {
        const generationModelId = workflowGenerationModelId(context)
        runtime = await this.dependencies.createRuntime({
          budget: { ...DRAFT_GENERATION_BUDGET, respectIntentOutputCaps: true,
            maxRequestedOutputTokensPerAttempt: draftOutputReservation(targetChars) },
          ...(generationModelId ? { modelId: generationModelId } : {}),
        })
        cleanDraftText = await runtime.execute(async ({ session }) => {
          this.assertNotCancelled(context)
          assertDraftProjectSession(projectSession)
          callbacks.setProgress(10)
          let rawPreview = ''
          let previewActive = true
          let initialOutcome: GenerationOutcome
          try {
            initialOutcome = await session.complete({
              purpose: 'chapter-draft',
              reasoningStage: 'drafting',
              output: 'visible-text',
              messages: [
                { role: 'system', content: draftSystemRole },
                { role: 'user', content: prompt },
              ],
              promptBudget,
            }, {
              signal: cancellation.signal,
              onPromptBudgetPreflight: report => {
                const finalReceipt = applyContextBudgetReceipt(preparedReceipt, report, allBudgetBindings)
                context.data.contextReceipt = finalReceipt
                callbacks.setContextReceipt?.(finalReceipt)
                callbacks.setPromptBudgetReport?.(report)
                callbacks.log(formatAdaptivePromptBudgetNotice(report, context.uiLocale))
                if (report.compaction) callbacks.log(formatPromptBudgetCompactionNotice(report, context.uiLocale))
              },
              onChunk: chunk => {
                if (!previewActive || context.cancelled) return
                rawPreview += chunk
                callbacks.replaceText?.(visibleDraftStreamText(rawPreview))
              },
            })
          } finally {
            previewActive = false
          }
          const initialCompletion = completionFromOutcome(initialOutcome)
          logDraftAttempt(callbacks, '初始生成', initialOutcome.receipt)
          callbacks.log(`  初始生成响应结束：finishReason=${initialCompletion.finishReason}`)
          const initialVisibleDraft = sanitizeDraftText(this.stripThinkingTags(initialCompletion.content))
          callbacks.log(`  初始生成可见单位：visibleUnits=${countDraftUnits(initialVisibleDraft)}`)
          callbacks.replaceText?.(initialVisibleDraft)
          callbacks.setProgress(90)
          this.assertNotCancelled(context)
          return this.extendDraftIfNeeded({
            session,
            signal: cancellation.signal,
            initialDraft: initialVisibleDraft,
            initialFinishReason: initialCompletion.finishReason,
            targetChars,
            callbacks,
            context,
            systemRole: draftSystemRole,
            coreContext: [draftArchitecture.text, !isFirstChapter ? characterContext.text : '', JSON.stringify(draftNovelConfig, null, 2)].filter(Boolean).join('\n\n'),
            coreSections: [...draftArchitecture.sections, ...(!isFirstChapter ? characterBudgetSections(characterContext) : []),
              { sectionName: 'novel-configuration', label: '', text: JSON.stringify(draftNovelConfig, null, 2) }],
            contextBudgetBindings: allBudgetBindings,
            guidanceSections,
            preparedContextReceipt: preparedReceipt,
            chapterInfo: this.chapterInfo,
            futureBlueprints: futureBlueprintsStr,
            globalGuidance: mergedGuidance,
            writingStyle: novelConfig.writingStyle || '',
            writingLanguage,
            // 续写过去只带蓝图与已写结尾，模型看不到要点时间线与上一章交接，
            // 场景容易漂移或注水；把首次请求的连续性锚点一并带上。
            continuityContext,
            reasoning: initialOutcome.receipt.capabilities.reasoning === true,
          })
        })
      } catch (error) {
        if (context.cancelled) throw new Error('工作流已取消')
        throw error
      } finally {
        cancellation.dispose()
        if (runtime) {
          try { await runtime.close() } catch { /* execute close failure already fails before persistence */ }
        }
      }
      this.assertNotCancelled(context)
      const boundedDraftText = capDraftAtNaturalBoundary(cleanDraftText, maxDraftChars)
      if (!boundedDraftText) {
        throw new Error('草稿超过目标字数容差，且无法在自然句或段落边界内安全截断，结果未保存。')
      }
      if (boundedDraftText !== cleanDraftText) {
        callbacks.log(`  草稿超过目标容差，已在自然边界收束至约 ${countDraftUnits(boundedDraftText)}/${targetChars} 字`)
      }

      // 落于数据库
      if (!sameProjectSessionContext(
        projectSession,
        projectSessionContextFromProject(useProjectStore.getState().currentProject),
      )) {
        throw new Error('当前项目已切换，已拒绝保存章节草稿')
      }
      this.assertNotCancelled(context)
      const nextVersion: number = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-next-version',
        this.chapterInfo.chapterNumber,
        expectedProjectPath,
      )
      this.assertNotCancelled(context)
      const draftContentHash = await sha256Hex(boundedDraftText)
      this.assertNotCancelled(context)
      const createResult = await ipc.invokeWithProjectSession(projectSession, 'db:draft-create', {
        chapterNumber: this.chapterInfo.chapterNumber,
        version: nextVersion,
        source: 'write',
        content: boundedDraftText,
        wordCount: countDraftUnits(boundedDraftText),
      }, expectedProjectPath)
      if (!createResult.success || !createResult.id) {
        throw new Error(createResult.error || '章节草稿保存失败')
      }
      draftPersisted = true
      callbacks.replaceText?.(boundedDraftText)

      const pseudoPath = createResult.id ? `vela://draft/${createResult.id}` : `vela://draft/ch${this.chapterInfo.chapterNumber}/v${nextVersion}`

      context.data.draft = boundedDraftText
      context.data.draftContent = boundedDraftText
      context.data.draftPath = pseudoPath
      context.data.chapterNumber = this.chapterInfo.chapterNumber
      context.data.chapterInfo = this.chapterInfo
      context.data.mergedGuidance = mergedGuidance
      context.data.shortSummary = ''
      callbacks.setResumeMetadata?.({
        [`draftId_${this.chapterInfo.chapterNumber}`]: Number(createResult.id),
        [`draftContentHash_${this.chapterInfo.chapterNumber}`]: draftContentHash,
      })
      this.assertNotCancelled(context)

      await useProjectStore.getState().refreshFileTree(expectedProjectPath, undefined, projectSession)
      try {
        const { useDraftStore } = await import('../../../stores/draft-store')
        await useDraftStore.getState().loadAllDrafts(expectedProjectPath, projectSession)
      } catch { /* 忽略 */ }

      try {
        if (!sameProjectSessionContext(
          projectSession,
          projectSessionContextFromProject(useProjectStore.getState().currentProject),
        )) throw new Error('当前项目已切换，已拒绝打开旧草稿')
        const { useEditorStore } = await import('../../../stores/editor-store')
        useEditorStore.getState().openFile({
          id: pseudoPath,
          name: `第${this.chapterInfo.chapterNumber}章 ${this.chapterInfo.title} v${nextVersion}`,
          type: 'chapter',
          filePath: pseudoPath,
          content: boundedDraftText,
          savedContent: boundedDraftText,
          projectKey: expectedProjectPath,
        })
      } catch { /* 忽略 */ }

      callbacks.log(`✅ 草稿已自动入库保存为版本 v${nextVersion}（${countDraftUnits(boundedDraftText)} 字）`)
      return boundedDraftText
    } catch (error) {
      if (!draftPersisted) callbacks.replaceText?.('')
      throw error
    }
  }

  private shouldAutoContinue(
    currentText: string,
    targetChars: number,
    rounds: number,
    finishReason: LLMCompletion['finishReason'],
  ): boolean {
    if (rounds >= MAX_AUTO_CONTINUE_ROUNDS) return false
    const currentChars = countDraftUnits(currentText)
    if (finishReason === 'stop') {
      return currentChars < Math.floor(targetChars * MIN_TARGET_COMPLETION_RATIO)
    }
    if (finishReason !== 'length') return false
    return currentChars < maxDraftCharsForTarget(targetChars)
  }

  private async extendDraftIfNeeded(params: {
    session: GenerationSession
    signal: AbortSignal
    initialDraft: string
    initialFinishReason: LLMCompletion['finishReason']
    targetChars: number
    callbacks: CommandExecuteParams['callbacks']
    context: CommandExecuteParams['context']
    systemRole: string
    coreContext: string
    coreSections: readonly DraftArchitectureSection[]
    contextBudgetBindings: readonly ContextBudgetBinding[]
    preparedContextReceipt: ContextReceipt
    guidanceSections: readonly DraftArchitectureSection[]
    chapterInfo: ChapterInfo
    futureBlueprints: string
    globalGuidance: string
    writingStyle: string
    continuityContext: string
    writingLanguage: WritingLanguage
    reasoning: boolean
  }): Promise<string> {
    let draft = params.initialDraft
    let rounds = 0
    let lastFinishReason = params.initialFinishReason
    let noProgressRecoveryUsed = false
    let recoveryPending = false

    if (
      params.reasoning
      && lastFinishReason === 'length'
      && countDraftUnits(draft) < 100
    ) {
      throw new Error(
        '模型的输出预算主要消耗在推理阶段，尚未产生足够正文。无法安全续接隐藏推理过程；' +
        '请关闭模型思考模式、提高最大输出 Tokens，或改用更适合正文创作的非推理模型。',
      )
    }

    while (this.shouldAutoContinue(draft, params.targetChars, rounds, lastFinishReason)) {
      if (params.context.cancelled) break
      assertDraftProjectSession(requireWorkflowProjectSession(params.context))
      rounds += 1
      const currentChars = countDraftUnits(draft)
      params.callbacks.log(`  自动续写第 ${rounds} 段：当前约 ${currentChars}/${params.targetChars} 字`)

      const remaining = Math.max(0, params.targetChars - currentChars)
      const visibleTail = sanitizeDraftText(draft).slice(-CONTINUE_PROMPT_MAX_CHARS)
      const continuationLayers = new Set(['fixed-rules', 'author-task', 'character-state', 'future-plan', 'planning-material'])
      const continuationReceipt: ContextReceipt = { ...params.preparedContextReceipt,
        entries: [...params.preparedContextReceipt.entries.map(entry => continuationLayers.has(entry.layer) ? { ...entry }
          : { ...entry, included: false, charCount: 0, representation: 'omitted' as const, reason: 'not-in-continuation' as const }),
          { id: 'adjacent-prose:current-tail', layer: 'adjacent-prose', label: '本章已写结尾', included: true, required: true,
            charCount: visibleTail.length, sourceKind: 'unfinished-prose', representation: 'full' }],
      }
      params.context.data.contextReceipt = continuationReceipt
      params.callbacks.setContextReceipt?.(continuationReceipt)
      const recoveryInstruction = recoveryPending
        ? promptLanguageText(
            params.writingLanguage,
            '上一轮续写达到输出上限且没有增加足够的新正文，已被全部丢弃。\n'
              + '这是本次任务唯一一次无进展恢复机会：请直接推进下一事件、动作或对话，禁止复述已写末尾。\n\n',
            'The previous continuation reached the output limit without adding enough new prose, so it was discarded in full.\n'
              + 'This is the only no-progress recovery attempt: advance directly to the next event, action, or line of dialogue without repeating the existing ending.\n\n',
          )
        : ''
      const continuationPrompt = promptLanguageText(
        params.writingLanguage,
        `${recoveryInstruction}请无缝续写当前章节正文。

【硬性要求】
- 只输出新增正文，不要复述已写内容。
- 从“已写正文末尾”自然接下去，保持同一场景逻辑或合理转场。
- 本次续写尽可能完成剩余约 ${remaining} 字；如果无法达到，停在自然段落末尾。
- 不要输出标题、解释、总结、Markdown、思考过程或“点我继续”。
- 避免重复已写正文中的整句、整段、动作链和意象。
- 不提前写后续章节，只完成本章蓝图允许的内容。

【本章蓝图】
${JSON.stringify(params.chapterInfo, null, 2)}

【前文要点与上一章交接】
${params.continuityContext || '（无）'}

【后续章节大纲预告】
${params.futureBlueprints}

【全局写作要求】
${params.globalGuidance}

【人物核心与全书设定（沿用本次写作资料）】
${params.coreContext}

【文风要求】
${params.writingStyle || '（无）'}

【已写正文末尾】
${visibleTail}`,
        `${recoveryInstruction}Continue the current chapter seamlessly.

[Requirements]
- Output only new manuscript prose; do not repeat existing text.
- Continue naturally from the existing ending, preserving the same scene logic or making a justified transition.
- Complete as much as possible of the remaining approximately ${remaining} words; if that is not possible, stop at a natural paragraph boundary.
- Do not output a title, explanation, summary, Markdown, reasoning, or an interface continuation prompt.
- Avoid repeating complete sentences, paragraphs, action sequences, or imagery from the existing manuscript.
- Complete only the current chapter blueprint; do not advance later chapters.

[Current chapter blueprint]
${JSON.stringify(params.chapterInfo, null, 2)}

[Story so far and confirmed handoff]
${params.continuityContext || '(none)'}

[Upcoming chapter blueprints]
${params.futureBlueprints}

[Project-wide writing guidance]
${params.globalGuidance}

[Core cast and novel settings from this writing session]
${params.coreContext}

[Writing style]
${params.writingStyle || '(none)'}

[End of existing manuscript]
${visibleTail}`,
      )

      let rawPreview = ''
      let previewActive = true
      let outcome: GenerationOutcome
      try {
        outcome = await params.session.complete({
          purpose: recoveryPending
            ? 'chapter-draft-no-progress-recovery'
            : 'chapter-draft-continuation',
          reasoningStage: 'drafting',
          output: 'visible-text',
          messages: [
            { role: 'system', content: params.systemRole },
            { role: 'user', content: continuationPrompt },
          ],
          promptBudget: promptBudgetSectionsForDraft({ systemPrompt: params.systemRole, prompt: continuationPrompt,
            targetChapterText: JSON.stringify(params.chapterInfo, null, 2), contexts: [
              ...params.coreSections,
              ...params.guidanceSections.map(section => ({ ...section, startOffset: undefined })),
              { sectionName: 'writing-style', label: '', text: params.writingStyle },
              { sectionName: 'story-so-far', label: '', text: params.continuityContext,
                degradation: { priority: 15, strategy: 'complete-lines' } },
              { sectionName: 'existing-ending', label: '', text: visibleTail },
              { sectionName: 'distant-blueprints', label: '', text: params.futureBlueprints,
                degradation: { priority: 10, strategy: 'complete-lines' } },
            ] }),
        }, {
          onPromptBudgetPreflight: report => {
            const finalReceipt = applyContextBudgetReceipt(continuationReceipt, report, params.contextBudgetBindings)
            params.context.data.contextReceipt = finalReceipt
            params.callbacks.setContextReceipt?.(finalReceipt)
            params.callbacks.setPromptBudgetReport?.(report)
            params.callbacks.log(formatAdaptivePromptBudgetNotice(report, params.context.uiLocale))
            if (report.compaction) params.callbacks.log(formatPromptBudgetCompactionNotice(report, params.context.uiLocale))
          },
          signal: params.signal,
          onChunk: chunk => {
            if (!previewActive || params.context.cancelled) return
            rawPreview += chunk
            params.callbacks.replaceText?.(appendVisibleDraftContinuation(
              draft,
              visibleDraftStreamText(rawPreview),
            ))
          },
        })
      } finally {
        previewActive = false
      }
      const addition = completionFromOutcome(outcome)
      logDraftAttempt(params.callbacks, `自动续写第 ${rounds} 段`, outcome.receipt)
      params.callbacks.log(`  自动续写第 ${rounds} 段响应结束：finishReason=${addition.finishReason}`)
      this.assertNotCancelled(params.context)
      const beforeChars = countDraftUnits(draft)
      const visibleAddition = sanitizeDraftText(this.stripThinkingTags(addition.content))
      const candidateDraft = appendVisibleDraftContinuation(
        draft,
        visibleAddition,
      )
      const mergedDelta = countDraftUnits(candidateDraft) - beforeChars
      const accepted = addition.finishReason === 'stop' || mergedDelta >= 300
      params.callbacks.log(
        `  自动续写可见单位：visibleUnitsBefore=${beforeChars} `
        + `candidateVisibleUnits=${countDraftUnits(visibleAddition)} `
        + `mergedDelta=${mergedDelta} accepted=${accepted}`,
      )
      if (addition.finishReason === 'length' && mergedDelta < 300) {
        params.callbacks.replaceText?.(draft)
        if (noProgressRecoveryUsed) {
          throw new Error('唯一一次无进展恢复请求仍未增加足够的新正文，结果未保存。请缩短章节目标后重试。')
        }
        noProgressRecoveryUsed = true
        recoveryPending = true
        lastFinishReason = addition.finishReason
        params.callbacks.log('  本轮低增量截断内容已丢弃，将使用剩余预算执行一次无进展恢复请求')
        continue
      }
      draft = candidateDraft
      params.callbacks.replaceText?.(draft)
      lastFinishReason = addition.finishReason
      recoveryPending = false
      if (mergedDelta < 300) break
    }

    this.assertNotCancelled(params.context)
    // A length finish is always an incomplete physical response. Reaching a
    // word-count threshold is not proof that the model completed its sentence
    // or scene, so never persist it as a successful chapter.
    if (lastFinishReason !== 'stop') {
      throw this.createIncompleteCompletionError(lastFinishReason)
    }

    const lowerBound = Math.floor(params.targetChars * MIN_TARGET_COMPLETION_RATIO)
    if (countDraftUnits(draft) < lowerBound) {
      throw new Error(
        `模型已声明生成结束，但正文仅约 ${countDraftUnits(draft)}/${params.targetChars} 字，明显未达到章节目标，结果未保存。` +
        '请提高最大输出 Tokens、降低本章目标字数，或改用输出能力更强的模型后重试。',
      )
    }

    return draft
  }

  // --- 抽取自原文件的辅助方法 ---
  private async readArchitecture(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: WritingLanguage,
  ): Promise<DraftArchitectureContext> {
    const core = await ipc.invokeWithProjectSession(projectSession, 'db:project-core-get', projectPath)
    const candidates: DraftArchitectureSection[] = [
      {
        sectionName: 'story-premise',
        label: promptLanguageText(writingLanguage, '故事前提', 'Story premise'),
        text: core?.premise?.trim() || '',
        degradation: { priority: DRAFT_PROMPT_DEGRADATION_PRIORITY.premise, strategy: 'utf8-prefix' },
      },
      {
        sectionName: 'worldbuilding',
        label: promptLanguageText(writingLanguage, '世界观', 'Worldbuilding'),
        text: core?.worldbuilding?.trim() || '',
      },
      {
        sectionName: 'synopsis',
        label: promptLanguageText(writingLanguage, '剧情概要', 'Synopsis'),
        text: core?.synopsis?.trim() || '',
        degradation: { priority: DRAFT_PROMPT_DEGRADATION_PRIORITY.synopsis, strategy: 'utf8-prefix' },
      },
    ]
    const sections: DraftArchitectureSection[] = []
    const entries: ContextReceiptEntry[] = []
    for (const candidate of candidates.filter(section => section.text)) {
      const summary = await cachedContextSummary(projectSession, 'architecture', candidate.sectionName, candidate.text,
        { maxChars: candidate.sectionName === 'worldbuilding' ? 2_400 : 1_600,
          terms: this.chapterInfo.characters, chapterNumber: this.chapterInfo.chapterNumber })
      sections.push({ ...candidate, text: summary.text, degradation: undefined })
      entries.push({ id: `architecture:${candidate.sectionName}`, layer: 'fixed-rules', label: candidate.label,
        included: true, required: true, sourceKind: 'project-setting', cacheHit: summary.cacheHit,
        charCount: summary.retainedChars, originalCharCount: summary.originalChars,
        representation: summary.retainedChars < summary.originalChars ? 'summary' : 'full' })
    }
    return {
      sections, entries, legacyCharactersPresent: !!core?.charactersArch?.trim(),
      text: sections.map(section => `【${section.label}】\n${section.text}`).join('\n\n---\n\n'),
    }
  }

  private async readProjectPrompts(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: WritingLanguage,
  ): Promise<string> {
    try {
      const files = await ipc.invokeWithProjectSession(
        projectSession,
        'fs:list-dir',
        `${projectPath}/${DIR_PROMPTS}`,
        projectPath,
      )
      const mdFiles = files.filter((f: { isDir: boolean; name: string }) => !f.isDir && f.name.endsWith('.md'))
      if (mdFiles.length === 0) return ''
      const parts: string[] = []
      for (const f of mdFiles) {
        const result = await ipc.invokeWithProjectSession(projectSession, 'fs:read-file', f.path, projectPath)
        if (result.success && result.content.trim()) {
          parts.push(promptLanguageText(
            writingLanguage,
            `## 项目专属指导（${f.name.replace(/\.md$/, '')}）\n${result.content.trim()}`,
            `## Project-specific guidance (${f.name.replace(/\.md$/, '')})\n${result.content.trim()}`,
          ))
        }
      }
      return parts.join('\n\n')
    } catch { return '' }
  }

  private async readPlanningMaterials(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: WritingLanguage,
  ): Promise<{ text: string; sections: string[]; count: number }> {
    try {
      const materials = await ipc.invokeWithProjectSession(
        projectSession,
        'db:planning-material-list',
        'confirmed',
        projectPath,
      )
      const selected = materials
        .filter(material => material.status === 'confirmed' && material.content.trim())
        .slice(0, 12)
      const sections = selected.map(material => normalizePromptNewlineRuns(promptLanguageText(
        writingLanguage,
        `【已确认规划资料：${material.name}】\n${material.content.slice(0, 4_000)}`,
        `[Confirmed planning material: ${material.name}]\n${material.content.slice(0, 4_000)}`,
      )))
      return { text: sections.join('\n\n'), sections, count: selected.length }
    } catch {
      return { text: '', sections: [], count: 0 }
    }
  }

  private async readCharacterStates(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: WritingLanguage,
    linkedNames: readonly string[],
  ): Promise<DraftCharacterContext> {
    const cards = await ipc.invokeWithProjectSession(projectSession, 'db:character-get-all', projectPath)
    const input = { chapterNumber: this.chapterInfo.chapterNumber, characters: linkedNames,
      keyEvents: this.chapterInfo.keyEvents, writingLanguage }
    const initial = planDraftCharacterContext(cards, input)
    const summaries = new Map<string, string>()
    const cacheHits = new Map<string, boolean>()
    for (const card of cards.filter(card => initial.selectedCoreNames.includes(card.name))) {
      const summary = await cachedContextSummary(projectSession, 'character-detail', `card:${card.name}`,
        [card.appearance, card.background, card.arc].filter(Boolean).join('\n'),
        { maxChars: 800, terms: linkedNames, chapterNumber: this.chapterInfo.chapterNumber })
      summaries.set(card.name, summary.text)
      cacheHits.set(card.name, summary.cacheHit)
    }
    const plan = planDraftCharacterContext(cards, input, summaries)
    const text = [plan.core, plan.details, plan.secondary].filter(Boolean).join('\n\n')
    return {
      linked: plan.core, details: plan.details, detailSummary: plan.detailSummary, secondary: plan.secondary,
      cardCount: cards.length,
      budgetBindings: plan.budgetBindings.map(binding => ({ ...binding,
        summaryCacheHit: binding.entryId.startsWith('cast-details:') ? cacheHits.get(cards[Number(binding.entryId.split(':')[1])]!.name) : undefined })),
      text: text || promptLanguageText(writingLanguage, '（暂无角色状态档案，未知资料需与本章蓝图保持一致）', '(no character state records) Unknown details must follow the chapter blueprint.'),
      entries: plan.entries,
    }
  }
  /**
   * 从 finalized 定稿连续性投影读取章节要点时间线，旧蓝图 notes 仅作兼容回退。
   * 近 5 章完整收录；更早期仅保留标题行，控制总量 ≤ 3000 字。
   * 按序拼装保证前缀稳定，最大化 LLM 上下文缓存命中。
   */
  private async readChapterNotesTimeline(
    projectPath: string, currentChapter: number, projectSession: ProjectSessionContext,
    writingLanguage: WritingLanguage, currentEntities: readonly string[],
  ): Promise<{ text: string; factCount: number; receipt: ContextReceipt }> {
    const entries: ContextSelectionEntry[] = []
    let continuity: FinalizedContinuityProjection[] = []
    try { continuity = await ipc.invokeWithProjectSession(projectSession, 'db:continuity-list-before', currentChapter, projectPath) } catch { /* actual prose fallback below */ }
    let drafts: DraftMeta[] = []
    try { drafts = await ipc.invokeWithProjectSession(projectSession, 'db:draft-list-all', projectPath) } catch { /* no reference-note fallback */ }
    const byChapter = new Map<number, (typeof drafts)[number]>()
    for (const draft of drafts.filter(draft => draft.chapterNumber < currentChapter && ['draft', 'reviewing', 'finalized'].includes(draft.status))) {
      const existing = byChapter.get(draft.chapterNumber)
      if (!existing || (draft.status === 'finalized' && existing.status !== 'finalized')
        || (draft.status === existing.status && (draft.version ?? draft.id) > (existing.version ?? existing.id))) byChapter.set(draft.chapterNumber, draft)
    }
    const projections = new Map(continuity.filter(row => row.chapterNumber < currentChapter).map(row => [row.chapterNumber, row]))
    const chapters = [...new Set([...projections.keys(), ...byChapter.keys()])].sort((a, b) => a - b)
    for (const chapter of chapters) {
      const projection = projections.get(chapter)
      const recent = chapter >= currentChapter - 5
      if (projection) {
        for (const [index, fact] of (projection.facts ?? []).entries()) {
          if (!factAppliesAtChapter(fact, currentChapter)) continue
          const related = fact.entities.some(name => currentEntities.includes(name))
          entries.push({ id: `fact:${chapter}:${index}`, layer: 'finalized-history', label: `第${chapter}章${fact.category}`,
            content: promptLanguageText(writingLanguage, `- [${fact.category}] ${fact.statement}（来源第${chapter}章；证据：${fact.evidence}）`,
              `- [${fact.category}] ${fact.statement} (source: Chapter ${chapter}; evidence: ${fact.evidence})`), sourceChapter: chapter,
            sourceKind: 'finalized-prose', representation: 'full', required: recent && related && fact.category === 'character-state',
            priority: related ? 100 : recent ? 70 : 20, order: chapter * 100 + index,
            ...(!recent && !related ? { excludedReason: 'not-relevant' as const } : {}) })
        }
        if (projection.chapterNotes.trim()) entries.push({ id: `chapter-notes:${chapter}`, layer: 'finalized-history',
          label: `第${chapter}章 ${projection.chapterTitle}`, content: projection.chapterNotes, sourceChapter: chapter,
          sourceKind: 'finalized-prose', representation: 'summary', priority: recent ? 80 : 25, order: chapter * 100 })
        continue
      }
      const draft = byChapter.get(chapter)!
      try {
        const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', draft.id, projectPath)
        if (!full?.content?.trim()) continue
        const summary = await cachedContextSummary(projectSession, 'chapter-summary', `draft:${draft.id}`, full.content,
          { maxChars: recent ? 1_800 : 600, terms: currentEntities, chapterNumber: currentChapter })
        const finalized = draft.status === 'finalized'
        entries.push({ id: `prose-summary:${draft.id}`, layer: finalized ? 'finalized-history' : 'unfinished-candidate',
          label: `${writingLanguage === 'en-US' ? 'Chapter' : '第'}${chapter} ${finalized ? '定稿' : '草稿候选'}`,
          content: `${finalized ? '[Finalized prose summary]' : '[Unfinished candidate summary; unconfirmed]'}\n${summary.text}`,
          sourceChapter: chapter, sourceKind: finalized ? 'finalized-prose' : 'unfinished-prose',
          representation: 'summary', cacheHit: summary.cacheHit, originalCharCount: full.content.length,
          priority: recent ? 80 : 25, order: chapter * 100 })
      } catch { entries.push({ id: `prose-unavailable:${draft.id}`, layer: 'historical-fact', label: `第${chapter}章正文`,
        content: '', priority: 0, order: chapter * 100, excludedReason: 'unavailable' }) }
    }
    const selection = selectContextEntries(currentChapter, entries, { maxChars: 6_000 })
    return { text: selection.text || promptLanguageText(writingLanguage, '（无章节要点：没有可核实的已写前文；未写蓝图仅作规划）', '(no chapter notes) Only actual manuscripts establish history; unwritten blueprints are plans.'),
      factCount: selection.selectedIds.filter(id => id.startsWith('fact:')).length, receipt: selection.receipt }
  }
  private async readActiveNarrativeThreads(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: WritingLanguage,
  ): Promise<{ text: string; count: number }> {
    let threads: NarrativeThreadView[] = []
    try {
      threads = await ipc.invokeWithProjectSession(
        projectSession,
        'db:narrative-thread-list-relevant',
        {
          chapterNumber: this.chapterInfo.chapterNumber,
          title: this.chapterInfo.title,
          keyEvents: this.chapterInfo.keyEvents,
          characters: [...this.chapterInfo.characters],
        },
        projectPath,
      )
    } catch {
      return { text: '', count: 0 }
    }

    const header = promptLanguageText(
      writingLanguage,
      '【当前相关活跃叙事线索】',
      '[Relevant active narrative threads]',
    )
    const lines: string[] = []
    let usedChars = header.length + 1
    for (const thread of threads.slice(0, ACTIVE_THREAD_CONTEXT_MAX_ITEMS)) {
      const source = thread.events.at(-1)
      const line = promptLanguageText(
        writingLanguage,
        `- ${thread.title} [${thread.status}]（目标第${thread.targetStartChapter}–${thread.targetEndChapter}章；作者意图：${thread.authorIntent}${source ? `；来源第${source.chapterNumber}章：${source.evidence}` : ''}）`,
        `- ${thread.title} [${thread.status}] (target Chapters ${thread.targetStartChapter}–${thread.targetEndChapter}; author intent: ${thread.authorIntent}${source ? `; source Chapter ${source.chapterNumber}: ${source.evidence}` : ''})`,
      )
      const nextLength = line.length + (lines.length > 0 ? 1 : 0)
      if (usedChars + nextLength > ACTIVE_THREAD_CONTEXT_MAX_CHARS) break
      lines.push(line)
      usedChars += nextLength
    }
    if (lines.length === 0) return { text: '', count: 0 }
    return {
      text: `${header}\n${lines.join('\n')}`,
      count: lines.length,
    }
  }

  private async readKnowledgeEvents(
    projectPath: string,
    projectSession: ProjectSessionContext,
    writingLanguage: WritingLanguage,
  ): Promise<{ text: string; count: number }> {
    if (this.chapterInfo.characters.length === 0) return { text: '', count: 0 }
    try {
      const events = await ipc.invokeWithProjectSession(
        projectSession,
        'db:knowledge-event-list-for-chapter',
        [...this.chapterInfo.characters],
        this.chapterInfo.chapterNumber,
        projectPath,
      ) as KnowledgeEvent[]
      if (!Array.isArray(events) || events.length === 0) return { text: '', count: 0 }
      const header = promptLanguageText(
        writingLanguage,
        '【当前角色知情范围（已确认）】',
        '[Confirmed character knowledge boundaries]',
      )
      return {
        text: `${header}\n${events.slice(0, 12).map(event => formatKnowledgeEventForPrompt(event, writingLanguage)).join('\n')}`,
        count: Math.min(events.length, 12),
      }
    } catch {
      return { text: '', count: 0 }
    }
  }
}
