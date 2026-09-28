import type {
  LLMFinishReason,
  ModelExecutionCapabilityEvidenceSource,
  ModelProfile,
  TokenUsage,
} from '../../shared/ipc-channels'
import type { CreativeStrategy, GenerationReasoningStage } from '../../shared/reasoning-types'
import type {
  PromptBudgetCompactionReport,
  PromptBudgetPolicy,
  PromptBudgetReport,
  PromptBudgetResultCode,
  PromptBudgetSection,
  PromptBudgetSectionReport,
} from '../../shared/prompt-budget'

export type {
  PromptBudgetCompactionReport,
  PromptBudgetCompactionSectionReport,
  PromptBudgetPolicy,
  PromptBudgetReport,
  PromptBudgetResultCode,
  PromptBudgetSection,
  PromptBudgetSectionReport,
} from '../../shared/prompt-budget'

export type GenerationOutput = 'visible-text' | 'structured-data'

export interface GenerationMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** A semantic generation contract. Physical provider parameters are deliberately absent. */
export interface GenerationTask {
  purpose: string
  /** Explicit product semantics; omitted stages derive only from output shape. */
  reasoningStage?: GenerationReasoningStage
  output: GenerationOutput
  messages: readonly GenerationMessage[]
  /** Optional byte-exact safety policy for protected structured prompts. */
  promptBudget?: PromptBudgetPolicy
  /** Physical request controls belong exclusively to this module's plan. */
  maxTokens?: never
  maxOutputTokens?: never
  responseFormat?: never
  thinking?: never
  plan?: never
}

export interface DefaultModelSnapshot {
  revision: string
  model: Pick<
    ModelProfile,
    'id' | 'provider' | 'protocol' | 'modelName' | 'baseUrl' | 'maxTokens' | 'capabilities'
  >
  /** Main-process lease identity; the renderer never receives its model secret snapshot. */
  modelExecutionLeaseId?: string
  /** Authoritative non-secret identity supplied by the main-process lease receipt. */
  endpointFingerprint?: string
  /** Authoritative non-secret capability evidence supplied by the main-process lease receipt. */
  resolvedCapabilities?: ResolvedCapabilityEvidence
}

export interface DefaultModelSource {
  snapshotDefaultModel(): DefaultModelSnapshot | null
}

export interface GenerationHarnessPolicy {
  maxAttempts: number
  maxRequestedOutputTokens: number
  /** Intent-level cost cap for one physical request; independent of model identity. */
  maxRequestedOutputTokensPerAttempt: number
  /** Multi-step extraction can reserve a bounded slice per request. */
  respectIntentOutputCaps?: boolean
  deadlineMs: number
}

/**
 * Application-wide safety ceiling. Workflows may choose smaller intent budgets,
 * but no model capability or caller may enlarge one run beyond these bounds.
 */
export const GENERATION_ABSOLUTE_BUDGET_LIMITS = Object.freeze({
  maxAttempts: 32,
  maxRequestedOutputTokens: 393_216,
  maxRequestedOutputTokensPerAttempt: 131_072,
  deadlineMs: 60 * 60_000,
})

export type CapabilityEvidenceSource = ModelExecutionCapabilityEvidenceSource

export interface ResolvedCapabilityEvidence {
  contextWindowTokens: number | null
  maxOutputTokens: number
  reasoning: boolean | null
  structuredOutput: boolean | null
  usage: boolean | null
  source: {
    contextWindowTokens: CapabilityEvidenceSource
    maxOutputTokens: CapabilityEvidenceSource
    featureFlags: CapabilityEvidenceSource
  }
}

export interface FrozenGenerationModelIdentity {
  id: string
  configurationRevision: string
  endpointFingerprint: string
}

export interface PhysicalGenerationPlan {
  attempt: number
  output: GenerationOutput
  maxOutputTokens: number
  contextWindowTokens: number | null
  estimatedInputTokens: number
  deadlineAt: number
  responseFormat?: { type: 'json_object' }
}

export interface PhysicalGenerationRequest {
  /** The only model authorization crossing the completion seam. */
  modelExecutionLeaseId: string | null
  purpose: string
  creativeStrategy: CreativeStrategy
  reasoningStage: GenerationReasoningStage
  messages: readonly GenerationMessage[]
  plan: Readonly<PhysicalGenerationPlan>
  signal: AbortSignal
  /** Provisional provider text. Callers must reconcile it with the terminal completion. */
  onChunk?: (chunk: string) => void
}

export interface ProviderCompletion {
  content: string
  finishReason?: LLMFinishReason
  usage?: TokenUsage
}

/** The only true-external seam owned by the generation module. */
export interface CompletionPort {
  complete(request: PhysicalGenerationRequest): Promise<ProviderCompletion>
}

export interface GenerationAttemptReceipt {
  /** Safe semantic task label; never contains prompt, output, endpoint, or credentials. */
  purpose?: string
  model: FrozenGenerationModelIdentity
  capabilities: ResolvedCapabilityEvidence
  budget: {
    attempt: number
    maxAttempts: number
    requestedOutputTokens: number
    cumulativeRequestedOutputTokens: number
    maxRequestedOutputTokens: number
    maxRequestedOutputTokensPerAttempt: number
    deadlineAt: number
  }
  finishReason: LLMFinishReason
  usage?: TokenUsage
  promptBudget?: PromptBudgetReport
}

export type GenerationOutcome =
  | {
      status: 'completed'
      content: string
      finishReason: 'stop'
      receipt: GenerationAttemptReceipt
    }
  | {
      status: 'incomplete'
      content: string
      finishReason: Exclude<LLMFinishReason, 'stop'>
      receipt: GenerationAttemptReceipt
    }

export interface GenerationExecutionOptions {
  signal?: AbortSignal
  /** Provisional provider text. It is never terminal or persistence evidence. */
  onChunk?: (chunk: string) => void
  /** Safe preflight receipt, delivered before provider dispatch when compaction occurs. */
  onPromptBudgetPreflight?: (report: PromptBudgetReport) => void
}

export interface GenerationSessionBudget {
  maxAttempts: number
  maxRequestedOutputTokens: number
  maxRequestedOutputTokensPerAttempt: number
  deadlineAt: number
}

export interface GenerationSession {
  readonly budget: Readonly<GenerationSessionBudget>
  complete(task: GenerationTask, options?: GenerationExecutionOptions): Promise<GenerationOutcome>
}

export interface GenerationHarness {
  openSession(): GenerationSession
}

export class GenerationHarnessError extends Error {
  constructor(
    readonly code:
      | 'NO_DEFAULT_MODEL'
      | 'INVALID_MODEL_REVISION'
      | 'UNTRUSTED_CAPABILITY_EVIDENCE'
      | 'INVALID_POLICY'
      | 'ATTEMPT_BUDGET_EXHAUSTED'
      | 'REQUESTED_TOKEN_BUDGET_EXHAUSTED'
      | 'CONTEXT_BUDGET_EXHAUSTED'
      | 'PROMPT_BUDGET_EXHAUSTED'
      | 'DEADLINE_EXHAUSTED'
      | 'CANCELLED'
      | 'PROVIDER_REQUEST_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationHarnessError'
  }
}

/** Pre-request failure with a safe report and no physical-attempt receipt. */
export class PromptBudgetExceededError extends GenerationHarnessError {
  constructor(
    readonly report: PromptBudgetReport,
    message = '提示词预算不足，请缩短主要占用区段后重试。',
  ) {
    super('PROMPT_BUDGET_EXHAUSTED', message)
    this.name = 'PromptBudgetExceededError'
  }
}

/** Failed physical attempt with a non-sensitive budget receipt for orchestration and audit. */
export class GenerationAttemptError extends GenerationHarnessError {
  constructor(
    code: 'CANCELLED' | 'DEADLINE_EXHAUSTED' | 'PROVIDER_REQUEST_FAILED',
    message: string,
    readonly receipt: GenerationAttemptReceipt,
  ) {
    super(code, message)
    this.name = 'GenerationAttemptError'
  }
}

export function safeReceiptPurpose(purpose: string): string {
  return /^[a-z0-9][a-z0-9:_-]{0,127}$/u.test(purpose) ? purpose : 'unknown'
}

const CONTEXT_SAFETY_RESERVE_TOKENS = 512

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

interface LocatedPromptBudgetSection {
  policy: PromptBudgetSection
  start: number
  end: number
  text: string
}

function locatePromptBudgetSections(
  messages: readonly GenerationMessage[],
  policy: PromptBudgetPolicy,
): LocatedPromptBudgetSection[] {
  const occupied = new Map<number, Array<{ start: number; end: number }>>()
  return policy.sections.map((section) => {
    if (
      !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(section.sectionName)
      || !Number.isSafeInteger(section.messageIndex)
      || section.messageIndex < 0
      || !section.finalText
      || (section.limitUtf8Bytes !== undefined
        && (!Number.isSafeInteger(section.limitUtf8Bytes) || section.limitUtf8Bytes <= 0))
      || (section.degradation !== undefined && (
        !Number.isSafeInteger(section.degradation.priority)
        || section.degradation.priority < 0
        || !['utf8-prefix', 'complete-lines', 'whole-section', 'json-string'].includes(section.degradation.strategy)
      ))
    ) {
      throw new GenerationHarnessError('INVALID_POLICY', '提示词预算区段定义无效。')
    }
    const message = messages[section.messageIndex]
    if (!message) {
      throw new GenerationHarnessError('INVALID_POLICY', '提示词预算区段未绑定最终请求消息。')
    }
    let searchFrom = 0
    let start = -1
    while (searchFrom <= message.content.length) {
      const candidate = message.content.indexOf(section.finalText, searchFrom)
      if (candidate < 0) break
      const end = candidate + section.finalText.length
      const overlapsLocatedSection = (occupied.get(section.messageIndex) ?? []).some(located => (
        candidate < located.end && end > located.start
      ))
      if (!overlapsLocatedSection) {
        start = candidate
        break
      }
      searchFrom = candidate + 1
    }
    if (start < 0) {
      throw new GenerationHarnessError(
        'INVALID_POLICY',
        `提示词预算区段「${section.sectionName}」与最终请求不一致。`,
      )
    }
    const end = start + section.finalText.length
    const intervals = occupied.get(section.messageIndex) ?? []
    intervals.push({ start, end })
    occupied.set(section.messageIndex, intervals)
    return { policy: section, start, end, text: section.finalText }
  })
}

function utf8Prefix(value: string, maxUtf8Bytes: number): string {
  let retained = ''
  let retainedBytes = 0
  for (const character of value) {
    const characterBytes = utf8Bytes(character)
    if (retainedBytes + characterBytes > maxUtf8Bytes) break
    retained += character
    retainedBytes += characterBytes
  }
  return retained
}

function completeLinePrefix(value: string, maxUtf8Bytes: number): string {
  const lines = value.match(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)?.filter(Boolean) ?? []
  let retained = ''
  let retainedBytes = 0
  for (const line of lines) {
    const lineBytes = utf8Bytes(line)
    if (retainedBytes + lineBytes > maxUtf8Bytes) break
    retained += line
    retainedBytes += lineBytes
  }
  return retained
}

function jsonStringPrefix(value: string, maxUtf8Bytes: number): string {
  let source: unknown
  try {
    source = JSON.parse(value)
  } catch {
    return value
  }
  if (typeof source !== 'string') return value

  let inner = ''
  let retainedBytes = 2
  for (const character of source) {
    const escapedCharacter = JSON.stringify(character).slice(1, -1)
    const characterBytes = utf8Bytes(escapedCharacter)
    if (retainedBytes + characterBytes > maxUtf8Bytes) break
    inner += escapedCharacter
    retainedBytes += characterBytes
  }
  return `"${inner}"`
}

function compactTextForSection(
  section: PromptBudgetSection,
  text: string,
  maxUtf8Bytes: number,
): string {
  switch (section.degradation?.strategy) {
    case 'utf8-prefix':
      return utf8Prefix(text, maxUtf8Bytes)
    case 'complete-lines':
      return completeLinePrefix(text, maxUtf8Bytes)
    case 'whole-section':
      return utf8Bytes(text) <= maxUtf8Bytes ? text : ''
    case 'json-string':
      return jsonStringPrefix(text, maxUtf8Bytes)
    default:
      return text
  }
}

function compactPromptBudgetSections(input: {
  messages: readonly GenerationMessage[]
  policy: PromptBudgetPolicy
  sections: LocatedPromptBudgetSection[]
}): {
  messages: readonly GenerationMessage[]
  sectionTexts: readonly string[]
  compaction?: PromptBudgetCompactionReport
} {
  const originalTotalUtf8Bytes = input.messages.reduce(
    (total, message) => total + utf8Bytes(message.content),
    0,
  )
  const originalSectionTexts = input.sections.map(section => section.text)
  const currentTexts = [...originalSectionTexts]
  const candidates = input.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.policy.degradation !== undefined)
    .sort((left, right) => (
      left.section.policy.degradation!.priority - right.section.policy.degradation!.priority
      || left.index - right.index
    ))
  let currentTotalUtf8Bytes = originalTotalUtf8Bytes

  const compactSection = (index: number, targetBytes: number): void => {
    const section = input.sections[index]!
    const currentText = currentTexts[index]!
    const currentBytes = utf8Bytes(currentText)
    if (!section.policy.degradation || targetBytes >= currentBytes) return
    const nextText = compactTextForSection(section.policy, currentText, targetBytes)
    const nextBytes = utf8Bytes(nextText)
    if (nextBytes >= currentBytes) return
    currentTexts[index] = nextText
    currentTotalUtf8Bytes -= currentBytes - nextBytes
  }

  // Enforce explicit per-section ceilings first, while preserving the same
  // low-priority-first order used for the overall request ceiling.
  for (const { section, index } of candidates) {
    const limit = section.policy.limitUtf8Bytes
    if (limit !== undefined && utf8Bytes(currentTexts[index]!) > limit) {
      compactSection(index, limit)
    }
  }

  if (currentTotalUtf8Bytes > input.policy.limitUtf8Bytes) {
    for (const { index } of candidates) {
      if (currentTotalUtf8Bytes <= input.policy.limitUtf8Bytes) break
      const currentBytes = utf8Bytes(currentTexts[index]!)
      const excessBytes = currentTotalUtf8Bytes - input.policy.limitUtf8Bytes
      compactSection(index, Math.max(0, currentBytes - excessBytes))
    }
  }

  const compactedSections = input.sections.flatMap((section, index) => {
    const originalUtf8Bytes = utf8Bytes(originalSectionTexts[index]!)
    const retainedUtf8Bytes = utf8Bytes(currentTexts[index]!)
    if (originalUtf8Bytes === retainedUtf8Bytes) return []
    return [{
      sectionName: section.policy.sectionName,
      originalUtf8Bytes,
      retainedUtf8Bytes,
      removedUtf8Bytes: originalUtf8Bytes - retainedUtf8Bytes,
    }]
  })
  const compaction = compactedSections.length > 0
    ? Object.freeze({
        originalTotalUtf8Bytes,
        retainedTotalUtf8Bytes: currentTotalUtf8Bytes,
        removedUtf8Bytes: originalTotalUtf8Bytes - currentTotalUtf8Bytes,
        sections: Object.freeze(compactedSections),
      })
    : undefined

  if (!compaction) {
    return { messages: input.messages, sectionTexts: currentTexts }
  }

  const replacements = input.sections
    .map((section, index) => ({ section, text: currentTexts[index]! }))
    .filter(({ section, text }) => section.text !== text)
    .sort((left, right) => (
      right.section.policy.messageIndex - left.section.policy.messageIndex
      || right.section.start - left.section.start
    ))
  const messages = input.messages.map(message => ({ ...message }))
  for (const { section, text } of replacements) {
    const message = messages[section.policy.messageIndex]!
    message.content = message.content.slice(0, section.start)
      + text
      + message.content.slice(section.end)
  }
  return {
    messages,
    sectionTexts: currentTexts,
    compaction,
  }
}

function createPromptBudgetReport(input: {
  messages: readonly GenerationMessage[]
  policy: PromptBudgetPolicy
  sections: readonly LocatedPromptBudgetSection[]
  sectionTexts: readonly string[]
  reservedOutputTokens: number
  modelId: string
  compaction?: PromptBudgetCompactionReport
}): PromptBudgetReport {
  if (!Number.isSafeInteger(input.policy.limitUtf8Bytes) || input.policy.limitUtf8Bytes <= 0) {
    throw new GenerationHarnessError('INVALID_POLICY', '提示词字节上限必须是正整数。')
  }

  const sectionEvaluations = input.sections.map((section, index) => ({
    report: Object.freeze({
      sectionName: section.policy.sectionName,
      utf8Bytes: utf8Bytes(input.sectionTexts[index]!),
    }),
    limitUtf8Bytes: section.policy.limitUtf8Bytes,
  }))
  const sections: PromptBudgetSectionReport[] = sectionEvaluations.map(section => section.report)

  const totalUtf8Bytes = input.messages.reduce(
    (total, message) => total + utf8Bytes(message.content),
    0,
  )
  const attributedUtf8Bytes = sections.reduce((total, section) => total + section.utf8Bytes, 0)
  const overheadUtf8Bytes = totalUtf8Bytes - attributedUtf8Bytes
  if (overheadUtf8Bytes < 0) {
    throw new GenerationHarnessError('INVALID_POLICY', '提示词预算区段发生重叠。')
  }
  if (overheadUtf8Bytes > 0) {
    sections.push(Object.freeze({
      sectionName: 'prompt-overhead',
      utf8Bytes: overheadUtf8Bytes,
    }))
  }
  const exceededSectionLimits = sectionEvaluations.filter(section => (
    section.limitUtf8Bytes !== undefined
    && section.report.utf8Bytes > section.limitUtf8Bytes
  ))
  const effectiveLimitUtf8Bytes = exceededSectionLimits.length > 0
    ? Math.min(
        input.policy.limitUtf8Bytes,
        ...exceededSectionLimits.map(section => (
          totalUtf8Bytes - section.report.utf8Bytes + section.limitUtf8Bytes!
        )),
      )
    : input.policy.limitUtf8Bytes
  const errorCode: PromptBudgetResultCode = totalUtf8Bytes > effectiveLimitUtf8Bytes
    ? 'PROMPT_BUDGET_EXHAUSTED'
    : 'OK'
  return Object.freeze({
    totalUtf8Bytes,
    limitUtf8Bytes: effectiveLimitUtf8Bytes,
    reservedOutputTokens: input.reservedOutputTokens,
    sections: Object.freeze(sections),
    ...(input.compaction ? { compaction: input.compaction } : {}),
    modelId: input.modelId,
    errorCode,
  })
}

function logPromptBudgetReport(report: PromptBudgetReport): void {
  console.info('[GenerationPromptBudget]', report)
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

export function assertGenerationHarnessPolicy(policy: GenerationHarnessPolicy): void {
  if (
    positiveInteger(policy.maxAttempts) === null
    || positiveInteger(policy.maxRequestedOutputTokens) === null
    || positiveInteger(policy.maxRequestedOutputTokensPerAttempt) === null
    || positiveInteger(policy.deadlineMs) === null
  ) {
    throw new GenerationHarnessError('INVALID_POLICY', '生成会话预算必须是正整数。')
  }
  if (
    policy.maxAttempts > GENERATION_ABSOLUTE_BUDGET_LIMITS.maxAttempts
    || policy.maxRequestedOutputTokens > GENERATION_ABSOLUTE_BUDGET_LIMITS.maxRequestedOutputTokens
    || policy.maxRequestedOutputTokensPerAttempt
      > GENERATION_ABSOLUTE_BUDGET_LIMITS.maxRequestedOutputTokensPerAttempt
    || policy.deadlineMs > GENERATION_ABSOLUTE_BUDGET_LIMITS.deadlineMs
  ) {
    throw new GenerationHarnessError('INVALID_POLICY', '生成会话预算超过应用安全上限。')
  }
}

type GenerationModelDescriptor = DefaultModelSnapshot['model']

function freezeModel(model: GenerationModelDescriptor): Readonly<GenerationModelDescriptor> {
  const clone: GenerationModelDescriptor = {
    id: model.id,
    provider: model.provider,
    protocol: model.protocol,
    modelName: model.modelName,
    baseUrl: model.baseUrl,
    maxTokens: model.maxTokens,
    ...(model.capabilities ? { capabilities: { ...model.capabilities } } : {}),
  }
  if (clone.capabilities) Object.freeze(clone.capabilities)
  return Object.freeze(clone)
}

function normalizedBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, '')
  try {
    const endpoint = new URL(trimmed)
    endpoint.username = ''
    endpoint.password = ''
    endpoint.hash = ''
    endpoint.search = ''
    return endpoint.toString().replace(/\/+$/u, '')
  } catch {
    return trimmed
  }
}

function endpointFingerprint(model: GenerationModelDescriptor): string {
  return [
    model.protocol,
    model.provider,
    normalizedBaseUrl(model.baseUrl),
    model.modelName.trim(),
  ].join('|')
}

function resolveInitialCapabilities(model: Readonly<GenerationModelDescriptor>): ResolvedCapabilityEvidence {
  const legacyMaxOutputTokens = positiveInteger(model.maxTokens)
  const maxOutputTokens = legacyMaxOutputTokens ?? 1
  return {
    contextWindowTokens: null,
    maxOutputTokens,
    reasoning: null,
    structuredOutput: null,
    usage: null,
    source: {
      contextWindowTokens: 'unknown',
      maxOutputTokens: legacyMaxOutputTokens ? 'legacy-profile' : 'unknown',
      featureFlags: 'unknown',
    },
  }
}

function estimateInputTokens(messages: readonly GenerationMessage[]): number {
  return Math.max(1, Math.ceil(messages.reduce((total, message) => total + message.content.length, 0)))
}

function copyCapabilities(capabilities: ResolvedCapabilityEvidence): ResolvedCapabilityEvidence {
  return {
    ...capabilities,
    source: { ...capabilities.source },
  }
}

export function createGenerationHarness(dependencies: {
  modelSource: DefaultModelSource
  completionPort: CompletionPort
  policy: GenerationHarnessPolicy
  creativeStrategy?: CreativeStrategy
  now?: () => number
}): GenerationHarness {
  const { modelSource, completionPort } = dependencies
  const policy = Object.freeze({ ...dependencies.policy })
  const now = dependencies.now ?? Date.now
  const creativeStrategy = dependencies.creativeStrategy ?? 'auto'
  assertGenerationHarnessPolicy(policy)

  return {
    openSession(): GenerationSession {
      const selected = modelSource.snapshotDefaultModel()
      if (!selected) {
        throw new GenerationHarnessError('NO_DEFAULT_MODEL', '未配置默认生成模型。')
      }
      if (!selected.revision.trim()) {
        throw new GenerationHarnessError('INVALID_MODEL_REVISION', '默认模型配置缺少 revision。')
      }

      const modelExecutionLeaseId = selected.modelExecutionLeaseId?.trim() || null
      if (selected.resolvedCapabilities && !modelExecutionLeaseId) {
        throw new GenerationHarnessError(
          'UNTRUSTED_CAPABILITY_EVIDENCE',
          '已解析模型能力必须来自主进程执行租约。',
        )
      }

      const frozenModel = freezeModel(selected.model)
      const frozenIdentity = Object.freeze({
        id: frozenModel.id,
        configurationRevision: selected.revision,
        endpointFingerprint: selected.endpointFingerprint ?? endpointFingerprint(frozenModel),
      })
      const capabilities = selected.resolvedCapabilities
        ? copyCapabilities(selected.resolvedCapabilities)
        : resolveInitialCapabilities(frozenModel)
      // Large creative generations retain the model cap. Multi-step extraction
      // opts into bounded slices so its first request cannot reserve the run.
      const modelOutputCap = capabilities.maxOutputTokens ?? 0
      const effectiveTotalTokens = policy.respectIntentOutputCaps
        ? policy.maxRequestedOutputTokens
        : Math.max(policy.maxRequestedOutputTokens, modelOutputCap)
      const sessionBudget = Object.freeze({
        maxAttempts: policy.maxAttempts,
        maxRequestedOutputTokens: effectiveTotalTokens,
        maxRequestedOutputTokensPerAttempt: policy.respectIntentOutputCaps
          ? policy.maxRequestedOutputTokensPerAttempt
          : Math.max(policy.maxRequestedOutputTokensPerAttempt, modelOutputCap),
        deadlineAt: now() + policy.deadlineMs,
      })
      let attempts = 0
      let cumulativeRequestedOutputTokens = 0

      const attemptReceipt = (
        purpose: string,
        attempt: number,
        requestedOutputTokens: number,
        finishReason: LLMFinishReason,
        usage?: TokenUsage,
        promptBudget?: PromptBudgetReport,
      ): GenerationAttemptReceipt => ({
        purpose: safeReceiptPurpose(purpose),
        model: { ...frozenIdentity },
        capabilities: copyCapabilities(capabilities),
        budget: {
          attempt,
          maxAttempts: sessionBudget.maxAttempts,
          requestedOutputTokens,
          cumulativeRequestedOutputTokens,
          maxRequestedOutputTokens: sessionBudget.maxRequestedOutputTokens,
          maxRequestedOutputTokensPerAttempt: sessionBudget.maxRequestedOutputTokensPerAttempt,
          deadlineAt: sessionBudget.deadlineAt,
        },
        finishReason,
        ...(usage ? { usage: { ...usage } } : {}),
        ...(promptBudget ? { promptBudget } : {}),
      })

      return {
        budget: sessionBudget,
        async complete(
          task: GenerationTask,
          options?: GenerationExecutionOptions,
        ): Promise<GenerationOutcome> {
          if (options?.signal?.aborted) {
            throw new GenerationHarnessError('CANCELLED', '生成请求已取消。')
          }
          if (now() >= sessionBudget.deadlineAt) {
            throw new GenerationHarnessError('DEADLINE_EXHAUSTED', '生成会话已超过截止时间。')
          }
          if (attempts >= sessionBudget.maxAttempts) {
            throw new GenerationHarnessError('ATTEMPT_BUDGET_EXHAUSTED', '生成会话已用尽请求次数。')
          }

          const remainingRequestedTokens = sessionBudget.maxRequestedOutputTokens
            - cumulativeRequestedOutputTokens
          if (remainingRequestedTokens <= 0) {
            throw new GenerationHarnessError(
              'REQUESTED_TOKEN_BUDGET_EXHAUSTED',
              '生成会话已用尽请求 Token 预算。',
            )
          }

          // 单次输出上限不压制模型能力：意图预算只作为"应用想限制的软上限"，
          // 当模型能力更大时按模型能力走（max() 使 min() 中由模型能力主导）。
          // 这保证配置了 384K 输出上限的模型真正能用到它的能力。
          const effectivePerAttemptCap = sessionBudget.maxRequestedOutputTokensPerAttempt
          const intentOutputTokens = Math.min(
            capabilities.maxOutputTokens,
            remainingRequestedTokens,
            effectivePerAttemptCap,
          )
          let requestMessages: readonly GenerationMessage[] = task.messages
          let promptBudgetCandidate: PromptBudgetReport | undefined
          let promptBudgetSections: LocatedPromptBudgetSection[] | undefined
          let promptBudgetCompaction: ReturnType<typeof compactPromptBudgetSections> | undefined
          if (task.promptBudget) {
            promptBudgetSections = locatePromptBudgetSections(task.messages, task.promptBudget)
            promptBudgetCompaction = compactPromptBudgetSections({
              messages: task.messages,
              policy: task.promptBudget,
              sections: promptBudgetSections,
            })
            requestMessages = promptBudgetCompaction.messages
          }
          const estimatedInputTokens = estimateInputTokens(requestMessages)
          const contextAvailableOutputTokens = capabilities.contextWindowTokens === null
            ? null
            : capabilities.contextWindowTokens - estimatedInputTokens - CONTEXT_SAFETY_RESERVE_TOKENS
          const maxOutputTokens = Math.max(0, Math.min(
            intentOutputTokens,
            contextAvailableOutputTokens ?? Number.POSITIVE_INFINITY,
          ))
          if (task.promptBudget) {
            const sections = promptBudgetSections!
            const compacted = promptBudgetCompaction!
            promptBudgetCandidate = createPromptBudgetReport({
              messages: requestMessages,
              policy: task.promptBudget,
              sections,
              sectionTexts: compacted.sectionTexts,
              reservedOutputTokens: maxOutputTokens,
              modelId: frozenIdentity.id,
              ...(compacted.compaction ? { compaction: compacted.compaction } : {}),
            })
            if (compacted.compaction) options?.onPromptBudgetPreflight?.(promptBudgetCandidate)
          }
          if (promptBudgetCandidate?.errorCode === 'PROMPT_BUDGET_EXHAUSTED') {
            logPromptBudgetReport(promptBudgetCandidate)
            throw new PromptBudgetExceededError(promptBudgetCandidate)
          }
          if (contextAvailableOutputTokens !== null && contextAvailableOutputTokens <= 0) {
            throw new GenerationHarnessError(
              'CONTEXT_BUDGET_EXHAUSTED',
              '当前生成输入没有安全的输出空间。',
            )
          }
          const promptBudget = promptBudgetCandidate
          if (promptBudget) {
            logPromptBudgetReport(promptBudget)
          }
          const attempt = attempts + 1
          // Gemini's GenerateContent wire protocol supports JSON MIME output.
          // When feature capabilities are unknown, still ask for JSON on that
          // protocol; contract validation remains authoritative downstream.
          const geminiJsonModeAvailable = frozenModel.protocol === 'gemini'
            && capabilities.structuredOutput === null
          const plan = Object.freeze({
            attempt,
            output: task.output,
            maxOutputTokens,
            contextWindowTokens: capabilities.contextWindowTokens,
            estimatedInputTokens,
            deadlineAt: sessionBudget.deadlineAt,
            ...(task.output === 'structured-data' && (
              capabilities.structuredOutput === true || geminiJsonModeAvailable
            )
              ? { responseFormat: { type: 'json_object' as const } }
              : {}),
          })
          attempts = attempt
          cumulativeRequestedOutputTokens += maxOutputTokens

          const controller = new AbortController()
          const remainingMs = Math.max(1, sessionBudget.deadlineAt - now())
          let timeoutId: ReturnType<typeof setTimeout> | undefined
          let termination: 'cancelled' | 'deadline' | null = null
          let rejectTermination: ((reason: GenerationHarnessError) => void) | undefined
          const terminationPromise = new Promise<never>((_resolve, reject) => {
            rejectTermination = reject
            timeoutId = setTimeout(() => {
              termination = 'deadline'
              controller.abort()
              reject(new GenerationHarnessError('DEADLINE_EXHAUSTED', '生成请求超过会话截止时间。'))
            }, remainingMs)
          })
          const cancel = () => {
            termination = 'cancelled'
            controller.abort()
            rejectTermination?.(new GenerationHarnessError('CANCELLED', '生成请求已取消。'))
          }
          options?.signal?.addEventListener('abort', cancel, { once: true })

          let completion: ProviderCompletion
          try {
            completion = await Promise.race([
              completionPort.complete({
                modelExecutionLeaseId,
                purpose: task.purpose,
                creativeStrategy,
                reasoningStage: task.reasoningStage
                  ?? (task.output === 'structured-data' ? 'planning' : 'drafting'),
                messages: requestMessages.map(message => Object.freeze({ ...message })),
                plan,
                signal: controller.signal,
                onChunk: options?.onChunk,
              }),
              terminationPromise,
            ])
          } catch {
            const cancellationCode = termination === 'cancelled'
              ? 'CANCELLED'
              : termination === 'deadline'
                ? 'DEADLINE_EXHAUSTED'
                : 'PROVIDER_REQUEST_FAILED'
            throw new GenerationAttemptError(
              cancellationCode,
              cancellationCode === 'CANCELLED'
                ? '生成请求已取消。'
                : cancellationCode === 'DEADLINE_EXHAUSTED'
                  ? '生成请求超过会话截止时间。'
                  : '模型请求失败。',
              attemptReceipt(
                task.purpose,
                attempt,
                maxOutputTokens,
                cancellationCode === 'CANCELLED' ? 'cancelled' : 'error',
                undefined,
                promptBudget,
              ),
            )
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId)
            options?.signal?.removeEventListener('abort', cancel)
          }

          // Missing terminal evidence is never equivalent to a completed
          // creative fact. Provider adapters may preserve omitted values and
          // this seam normalizes them fail-closed.
          const finishReason = completion.finishReason ?? 'unknown'
          const receipt = attemptReceipt(
            task.purpose,
            attempt,
            maxOutputTokens,
            finishReason,
            completion.usage,
            promptBudget,
          )

          if (finishReason === 'stop') {
            return {
              status: 'completed',
              content: completion.content,
              finishReason,
              receipt,
            }
          }
          return {
            status: 'incomplete',
            content: completion.content,
            finishReason,
            receipt,
          }
        },
      }
    },
  }
}
