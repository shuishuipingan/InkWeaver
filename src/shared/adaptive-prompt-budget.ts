import type { PromptBudgetPolicy } from './prompt-budget'

export const DRAFT_CONTEXT_INPUT_LIMIT = 96_000
export const UNKNOWN_CONTEXT_INPUT_LIMIT = 16_384
const MESSAGE_TOKEN_RESERVE = 16
const CONTEXT_TOKEN_RESERVE = 512

/** An estimate, not a claim to reproduce a provider's tokenizer. */
export function estimatePromptTokens(messages: readonly { content: string }[]): number {
  return Math.max(1, messages.reduce((total, message) => total
    + Math.ceil(new TextEncoder().encode(message.content).byteLength / 2) + MESSAGE_TOKEN_RESERVE, 0))
}

export function draftOutputReservation(targetWords: number): number {
  if (!Number.isFinite(targetWords) || targetWords < 1) throw new Error('章节目标字数无效')
  // 1.2 时代单次输出直接给到模型能力上限（≥65536），1.3.10 起按目标字数预留。
  // 预留过小会挤掉细节描写并触发多轮薄上下文续写；下限抬高到 16384
  // （约 1.1 万汉字），上限仍受 65536 与模型能力约束。
  return Math.min(65_536, Math.max(16_384, Math.ceil(targetWords * 3 + 8_192)))
}

export function resolveAdaptivePromptBudget(
  policy: PromptBudgetPolicy,
  contextWindowTokens: number | null,
  reservedOutputTokens: number,
  messageCount: number,
): { limitUtf8Bytes: number; limitInputTokens: number; capacityKnown: boolean } {
  const adaptive = policy.adaptive
  if (!adaptive || ![adaptive.maxInputTokens, adaptive.unknownInputTokens].every(value => Number.isSafeInteger(value) && value > 0)
    || adaptive.maxInputTokens > DRAFT_CONTEXT_INPUT_LIMIT || adaptive.unknownInputTokens > UNKNOWN_CONTEXT_INPUT_LIMIT
    || !Number.isSafeInteger(reservedOutputTokens) || reservedOutputTokens < 0
    || !Number.isSafeInteger(messageCount) || messageCount < 1
    || (contextWindowTokens !== null && (!Number.isSafeInteger(contextWindowTokens) || contextWindowTokens < 1))) {
    throw new Error('动态提示词预算参数无效')
  }
  const capacityKnown = contextWindowTokens !== null
  const limitInputTokens = Math.max(0, Math.min(adaptive.maxInputTokens,
    capacityKnown ? contextWindowTokens - reservedOutputTokens - CONTEXT_TOKEN_RESERVE : adaptive.unknownInputTokens))
  return { limitInputTokens, capacityKnown, limitUtf8Bytes: Math.max(1, (limitInputTokens - messageCount * MESSAGE_TOKEN_RESERVE) * 2 - messageCount) }
}
