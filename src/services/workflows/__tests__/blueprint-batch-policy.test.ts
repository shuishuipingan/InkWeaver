import { describe, expect, it } from 'vitest'

import {
  GENERATION_ABSOLUTE_BUDGET_LIMITS,
  assertGenerationHarnessPolicy,
} from '../../generation/generation-harness'
import {
  DEFAULT_BLUEPRINT_GENERATION_COUNT,
  MAX_BLUEPRINT_CHAPTERS_PER_TASK,
  MAX_BLUEPRINT_ITEMS_PER_BATCH,
  blueprintOutputTokensForBatch,
  getBlueprintBatchAdvice,
  planBlueprintGenerationCost,
  planBlueprintGenerationRuns,
} from '../blueprint-batch-policy'

describe('blueprint batch policy', () => {
  it('caps one semantic batch at twelve chapters while keeping the workflow able to split larger scopes', () => {
    expect(DEFAULT_BLUEPRINT_GENERATION_COUNT).toBe(12)
    expect(MAX_BLUEPRINT_ITEMS_PER_BATCH).toBe(12)
    // 单任务上限 240：用户的 180 章可以一次生成全部；再大的范围走分次引导。
    expect(MAX_BLUEPRINT_CHAPTERS_PER_TASK).toBe(240)
  })

  it('derives task cost from logical scope without consulting a model registry', () => {
    expect(planBlueprintGenerationCost(5)).toEqual({
      chapterCount: 5,
      semanticBatchCount: 1,
      expectedCalls: 1,
      maxCalls: 12,
      maxSemanticRepairCalls: 1,
      maxCompactSingleFallbacks: 1,
      exceedsHardLimit: false,
      runtimeBudget: {
        maxAttempts: 12,
        maxRequestedOutputTokens: 131_072,
        maxRequestedOutputTokensPerAttempt: 14_400,
        respectIntentOutputCaps: true,
        deadlineMs: 600_000,
      },
    })
    expect(planBlueprintGenerationCost(11)).toMatchObject({
      semanticBatchCount: 1,
      expectedCalls: 1,
      maxCalls: 24,
      maxSemanticRepairCalls: 1,
      maxCompactSingleFallbacks: 1,
      exceedsHardLimit: false,
      runtimeBudget: {
        maxAttempts: 24,
        maxRequestedOutputTokens: 131_072,
        maxRequestedOutputTokensPerAttempt: 14_400,
      },
    })
    expect(planBlueprintGenerationCost(50)).toMatchObject({
      semanticBatchCount: 5,
      expectedCalls: 5,
      maxCalls: 106,
      maxSemanticRepairCalls: 5,
      maxCompactSingleFallbacks: 5,
      exceedsHardLimit: false,
      runtimeBudget: {
        maxAttempts: 106,
        maxRequestedOutputTokens: 144_000,
        // 5 批 × 2（拆分成倍）× 150s = 1500s：时间预算按真实产出形态估算
        deadlineMs: 1_500_000,
      },
    })
    expect(planBlueprintGenerationCost(51)).toMatchObject({
      semanticBatchCount: 5,
      expectedCalls: 5,
      maxCalls: 108,
      maxSemanticRepairCalls: 5,
      maxCompactSingleFallbacks: 5,
      // 51 章远未触及新的单任务上限
      exceedsHardLimit: false,
      runtimeBudget: { maxAttempts: 108, maxRequestedOutputTokens: 144_000 },
    })
    expect(planBlueprintGenerationCost(241)).toMatchObject({
      semanticBatchCount: 21,
      exceedsHardLimit: true,
    })
  })

  it('derives per-attempt output budget from the batch size instead of a fixed 16k', () => {
    expect(blueprintOutputTokensForBatch(5)).toBe(8_192)
    expect(blueprintOutputTokensForBatch(12)).toBe(14_400)
    expect(blueprintOutputTokensForBatch(1)).toBe(8_192)
    expect(blueprintOutputTokensForBatch(0)).toBe(8_192)
  })

  it('scales the deadline with the chapter scope and the split factor', () => {
    const deadlineOf = (chapters: number) => planBlueprintGenerationCost(chapters).runtimeBudget.deadlineMs
    // 时间预算按"每批各拆一次"估算（拆分成倍），小范围仍保留 10 分钟下限
    expect(deadlineOf(10)).toBe(600_000)
    expect(deadlineOf(30)).toBe(900_000)
    expect(deadlineOf(60)).toBe(1_500_000)
    expect(deadlineOf(120)).toBe(3_000_000)
    // 180 章：15 批 × 2（拆分成倍）× 150s = 75 分钟 —— 正是用户现场的产出形态
    expect(deadlineOf(180)).toBe(4_500_000)
    // 240 章按同一口径是 100 分钟，被 90 分钟窗口收回
    expect(deadlineOf(240)).toBe(5_400_000)
    expect(deadlineOf(300)).toBe(5_400_000)
  })

  it('the derived policy must stay inside the application-wide safety ceiling', () => {
    // 这条防的是"policy 自己算得很漂亮、却被生成框架的绝对墙原样拒绝"的假绿。
    // 绝对墙现有值：512 次调用 / 120 分钟（必须 ≥ 下面每一档）。
    expect(GENERATION_ABSOLUTE_BUDGET_LIMITS.maxAttempts).toBe(512)
    expect(GENERATION_ABSOLUTE_BUDGET_LIMITS.deadlineMs).toBe(7_200_000)
    for (const chapters of [5, 50, 180, 240]) {
      const plan = planBlueprintGenerationCost(chapters)
      expect(
        () => assertGenerationHarnessPolicy(plan.runtimeBudget),
        `plan(${chapters}) 必须能通过生成框架的应用级安全上限`,
      ).not.toThrow()
    }
  })

  it('keeps the call ceiling large enough for a full split tree at the 180-chapter scale', () => {
    const plan = planBlueprintGenerationCost(180)
    // 完整拆分树：2N − B + fallbacks + repairs + 1 = 2*180 − 15 + 15 + 15 + 1 = 376
    expect(plan.maxCalls).toBe(376)
    expect(plan.expectedCalls).toBe(15)
    // 关键是"maxCalls 不先于 deadline 成为瓶颈"：预算要能装下完整拆分树
    expect(plan.maxCalls).toBeGreaterThanOrEqual(plan.expectedCalls * 4)
    // 用户的 180 章诉求：一次生成全部，不再撞单任务上限
    expect(plan.exceedsHardLimit).toBe(false)
  })

  it('plans how a large scope splits into separate runs', () => {
    expect(planBlueprintGenerationRuns(50)).toEqual({ runs: 1, chaptersPerRun: 50 })
    expect(planBlueprintGenerationRuns(180)).toEqual({ runs: 1, chaptersPerRun: 180 })
    expect(planBlueprintGenerationRuns(500)).toEqual({ runs: 3, chaptersPerRun: 167 })
    expect(planBlueprintGenerationRuns(0)).toEqual({ runs: 0, chaptersPerRun: 0 })
  })

  it('explains batching and throughput tradeoffs in both interface languages', () => {
    expect(getBlueprintBatchAdvice('zh-CN', 7)).toContain('预计至少 1 次模型调用')
    expect(getBlueprintBatchAdvice('zh-CN', 7)).toContain('每个语义批次最多 12 章')
    expect(getBlueprintBatchAdvice('zh-CN', 7)).toContain('最多允许 16 次')
    expect(getBlueprintBatchAdvice('zh-CN', 7)).toContain('达到输出限制时会自动继续拆分')
    expect(getBlueprintBatchAdvice('en-US')).toContain('at most 12 chapters')
    expect(getBlueprintBatchAdvice('en-US')).toContain('more time and API calls')
    expect(getBlueprintBatchAdvice('en-US', 7)).toContain('task allowance: up to 16')
  })
})
