import type { PromptBudgetPolicy } from './prompt-budget'

export const UNKNOWN_CONTEXT_INPUT_LIMIT = 16_384
const MESSAGE_TOKEN_RESERVE = 16
export const CONTEXT_TOKEN_RESERVE = 512

/**
 * 一次请求可安全使用的输入上限 —— **由模型能力推导，不是常量**。
 *
 * 历史教训（同一类缺陷第三次出现）：v1.3.20 把硬编码的 24,000/16,384 字节上限改成"自适应"，
 * 但天花板换成了一个固定数字（96,000 tokens），于是 1M 上下文的模型也只能发 96k。
 * 只要上限还是常量，换多大的模型都会被挡。
 *
 * 依据：可用输入 = **窗口 − 输出预留 − 协议余量**。有界性由窗口本身保证，
 * 因此这里刻意**不再设任何绝对上限**——再设一个数就是又一次"换个更大的魔数"。
 * 容量未知时由调用方走 unknownInputTokens（保守值）。
 */
export function draftContextInputLimit(contextWindowTokens: number, reservedOutputTokens: number): number {
  return Math.max(0, contextWindowTokens - reservedOutputTokens - CONTEXT_TOKEN_RESERVE)
}

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
  // 校验只看"是不是合法的正数"：把某个固定数字当硬上限正是这次要修掉的缺陷
  // （它会让想放宽策略的调用方直接被判"参数无效"）。
  if (!adaptive
    || (adaptive.maxInputTokens !== undefined
      && !(Number.isSafeInteger(adaptive.maxInputTokens) && adaptive.maxInputTokens > 0))
    || !(Number.isSafeInteger(adaptive.unknownInputTokens) && adaptive.unknownInputTokens > 0)
    || !Number.isSafeInteger(reservedOutputTokens) || reservedOutputTokens < 0
    || !Number.isSafeInteger(messageCount) || messageCount < 1
    || (contextWindowTokens !== null && (!Number.isSafeInteger(contextWindowTokens) || contextWindowTokens < 1))) {
    throw new Error('动态提示词预算参数无效')
  }
  const capacityKnown = contextWindowTokens !== null
  // 容量已知 → 按窗口推导（随模型变大而变大）；未知 → 保守回退。
  // adaptive.maxInputTokens 若给了，只作为**调用方的额外收紧**（永远不可能放宽推导值）。
  const derivedLimit = capacityKnown
    ? draftContextInputLimit(contextWindowTokens, reservedOutputTokens)
    : adaptive.unknownInputTokens
  const limitInputTokens = Math.max(0, Math.min(derivedLimit, adaptive.maxInputTokens ?? derivedLimit))
  return { limitInputTokens, capacityKnown, limitUtf8Bytes: Math.max(1, (limitInputTokens - messageCount * MESSAGE_TOKEN_RESERVE) * 2 - messageCount) }
}
