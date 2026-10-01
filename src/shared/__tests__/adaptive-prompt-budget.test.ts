import { describe, expect, it } from 'vitest'
import { estimatePromptTokens, resolveAdaptivePromptBudget, draftOutputReservation } from '../adaptive-prompt-budget'

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
    expect(draftOutputReservation(3_000)).toBe(10_096)
    expect(draftOutputReservation(100)).toBe(8_192)
    expect(draftOutputReservation(100_000)).toBe(65_536)
  })
})
