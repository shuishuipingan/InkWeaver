import { describe, expect, it } from 'vitest'
import {
  DRAFT_CONTEXT_INPUT_LIMIT,
  UNKNOWN_CONTEXT_INPUT_LIMIT,
  draftOutputReservation,
  estimatePromptTokens,
  resolveAdaptivePromptBudget,
} from '../adaptive-prompt-budget'
import type { PromptBudgetPolicy } from '../prompt-budget'

describe('adaptive draft input budget', () => {
  const policy = { limitUtf8Bytes: 65_536, sections: [], adaptive: { maxInputTokens: 96_000, unknownInputTokens: 16_384 } }
  it('uses confirmed model capacity and reserves output and framing', () => {
    expect(resolveAdaptivePromptBudget(policy, 1_000_000, 10_096, 2)).toMatchObject({ limitInputTokens: 96_000, capacityKnown: true, limitUtf8Bytes: 191_934 })
    expect(resolveAdaptivePromptBudget(policy, 32_768, 10_096, 2).limitInputTokens).toBe(22_160)
  })
  it('bounds unknown capacity and refuses impossible output reservations', () => {
    expect(resolveAdaptivePromptBudget(policy, null, 10_096, 2)).toMatchObject({ limitInputTokens: 16_384, capacityKnown: false })
    expect(resolveAdaptivePromptBudget(policy, 1_000, 1_000, 2).limitUtf8Bytes).toBe(1)
  })
  it('leaves room for per-message rounding at the exact input boundary', () => {
    const budget = resolveAdaptivePromptBudget(policy, 1_000_000, 10_096, 2)
    expect(estimatePromptTokens([{ content: 'x' }, { content: 'y'.repeat(budget.limitUtf8Bytes - 1) }])).toBeLessThanOrEqual(budget.limitInputTokens)
  })
  it('counts UTF-8 and message framing, including emoji, and sizes output by task', () => {
    expect(estimatePromptTokens([{ content: '汉字😀' }])).toBe(21)
    expect(draftOutputReservation(3_000)).toBe(17_192)
    expect(draftOutputReservation(100)).toBe(16_384)
    expect(draftOutputReservation(100_000)).toBe(65_536)
  })
})

/**
 * 架构链路的自适应预算（用户场景回归）。
 *
 * 症状：一份 41,516 字节的世界观设定被拦为超限，而用户模型有 100 万 tokens 上下文。
 * 根因：architecture.command.ts 的两处 promptBudget 没接 adaptive，直接吃固定 24,000 字节上限。
 * 本组用 harness 判定的**同一组导出函数**复现该判定链：
 *   generation-harness.ts:807  resolveAdaptivePromptBudget(policy, capabilities.contextWindowTokens, intentOutputTokens, messages.length)
 *   generation-harness.ts:810  用返回的 limitUtf8Bytes 覆盖 policy.limitUtf8Bytes
 *   generation-harness.ts:844  estimatedInputTokens > adaptiveBudget.limitInputTokens ⇒ PROMPT_BUDGET_EXHAUSTED
 */
describe('架构链路自适应预算（用户场景）', () => {
  const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

  // 与 architecture.command.ts 的回退值/契约参数一致。
  const architecturePolicy = {
    limitUtf8Bytes: 24_000,
    adaptive: { maxInputTokens: DRAFT_CONTEXT_INPUT_LIMIT, unknownInputTokens: UNKNOWN_CONTEXT_INPUT_LIMIT },
    sections: [],
  }

  // Lead 报告的分段字节数：全局指导 21,760 + 主角设定 15,434 + 故事前提 1,800，
  // 其余为固定框架文本，合计 41,516 字节。
  const scenarioSegments = { framing: 2_522, globalGuidance: 21_760, protagonistProfile: 15_434, premise: 1_800 }
  const scenarioTotalBytes = scenarioSegments.framing + scenarioSegments.globalGuidance
    + scenarioSegments.protagonistProfile + scenarioSegments.premise
  const scenarioMessages = [
    { role: 'system' as const, content: 's'.repeat(scenarioSegments.framing) },
    {
      role: 'user' as const,
      content: 'u'.repeat(
        scenarioSegments.globalGuidance + scenarioSegments.protagonistProfile + scenarioSegments.premise,
      ),
    },
  ]
  const scenarioContext = { contextWindowTokens: 1_000_000, reservedOutputTokens: 32_768, messageCount: scenarioMessages.length }

  /** 复现 harness 的判定：chunk 810 覆盖上限，chunk 844 决定错误码。 */
  function harnessVerdict(
    policy: PromptBudgetPolicy,
    messages: readonly { content: string }[],
    context: { contextWindowTokens: number | null; reservedOutputTokens: number; messageCount: number },
  ): { errorCode: 'OK' | 'PROMPT_BUDGET_EXHAUSTED'; limitUtf8Bytes: number; estimatedInputTokens: number; limitInputTokens: number } {
    const adaptive = policy.adaptive
      ? resolveAdaptivePromptBudget(policy, context.contextWindowTokens, context.reservedOutputTokens, context.messageCount)
      : undefined
    const effectiveLimitUtf8Bytes = adaptive ? adaptive.limitUtf8Bytes : policy.limitUtf8Bytes
    const totalUtf8Bytes = messages.reduce((total, message) => total + utf8Bytes(message.content), 0)
    const estimatedInputTokens = adaptive ? estimatePromptTokens(messages) : estimatePromptTokens(messages)
    const errorCode: 'OK' | 'PROMPT_BUDGET_EXHAUSTED' = adaptive
      ? (estimatedInputTokens > adaptive.limitInputTokens ? 'PROMPT_BUDGET_EXHAUSTED' : 'OK')
      : (totalUtf8Bytes > effectiveLimitUtf8Bytes ? 'PROMPT_BUDGET_EXHAUSTED' : 'OK')
    return {
      errorCode,
      limitUtf8Bytes: effectiveLimitUtf8Bytes,
      estimatedInputTokens,
      limitInputTokens: adaptive ? adaptive.limitInputTokens : policy.limitUtf8Bytes,
    }
  }

  it('夹具与用户报告一致：41,516 字节、2 条消息', () => {
    expect(scenarioTotalBytes).toBe(41_516)
    expect(scenarioMessages.reduce((total, message) => total + utf8Bytes(message.content), 0)).toBe(41_516)
    expect(scenarioMessages).toHaveLength(2)
  })

  it('1,000,000 上下文 + 32,768 输出预留下不再产生 PROMPT_BUDGET_EXHAUSTED', () => {
    const verdict = harnessVerdict(architecturePolicy, scenarioMessages, scenarioContext)

    expect(verdict.errorCode).toBe('OK')
    // 预算按模型能力算：min(96,000, 1,000,000 − 32,768 − 512) = 96,000 tokens。
    expect(verdict.limitInputTokens).toBe(96_000)
    expect(verdict.estimatedInputTokens).toBeLessThanOrEqual(verdict.limitInputTokens)
    expect(verdict.limitUtf8Bytes).toBeGreaterThan(scenarioTotalBytes)
  })

  it('判别力：同一夹具走旧实现（固定 24,000 字节、无 adaptive）必然超限', () => {
    const legacyVerdict = harnessVerdict({ limitUtf8Bytes: 24_000, sections: [] }, scenarioMessages, scenarioContext)

    expect(legacyVerdict.errorCode).toBe('PROMPT_BUDGET_EXHAUSTED')
    expect(legacyVerdict.limitUtf8Bytes).toBe(24_000)
    // 两组结果相反，正是本文件的判别力来源。
    expect(scenarioTotalBytes).toBeGreaterThan(24_000)
  })

  it('判别力自证：抹掉 adaptive 后，用户场景必然退回超限', () => {
    const withoutAdaptive = { ...architecturePolicy, adaptive: undefined }
    const applied = harnessVerdict(withoutAdaptive, scenarioMessages, scenarioContext)

    expect(applied.limitUtf8Bytes).toBe(24_000)
    expect(applied.errorCode).toBe('PROMPT_BUDGET_EXHAUSTED')
  })

  it('容量未知时回退 UNKNOWN_CONTEXT_INPUT_LIMIT，且超限仍被拦下', () => {
    const unknownCapacity = harnessVerdict(
      architecturePolicy,
      scenarioMessages,
      { ...scenarioContext, contextWindowTokens: null },
    )

    expect(unknownCapacity.limitInputTokens).toBe(UNKNOWN_CONTEXT_INPUT_LIMIT)
    // 41,516 字节 ≈ 20K tokens，已超出 16,384 的回退上限 —— 不能因为修了有容量分支就丢掉拦截能力。
    expect(unknownCapacity.errorCode).toBe('PROMPT_BUDGET_EXHAUSTED')

    // 远超回退值的情形同样必须拦。
    const huge = [{ role: 'user' as const, content: 'z'.repeat(UNKNOWN_CONTEXT_INPUT_LIMIT * 4) }]
    expect(harnessVerdict(architecturePolicy, huge, { ...scenarioContext, contextWindowTokens: null, messageCount: 1 }).errorCode)
      .toBe('PROMPT_BUDGET_EXHAUSTED')
  })
})