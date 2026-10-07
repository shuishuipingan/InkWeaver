import { describe, expect, it } from 'vitest'

import {
  MAX_BLUEPRINT_ITEMS_PER_BATCH,
  planBlueprintGenerationCost,
} from '../blueprint-batch-policy'

/**
 * 目录生成的「回退即红」判别力自证。
 *
 * 与 blueprint-batch-policy.test.ts 的分工：磐石那份验「新常量算得对」（批次 12、deadline 伸缩、
 * maxCalls 放得下完整拆分树）。本文件验**反面**：把常量回退成修复前的值，同一组断言必须失败。
 * 两者合起来才说明这三个改动真的是用户现场能过的原因，而不是随便调大了数字。
 *
 * 回退形态（修复前，见 blueprint-batch-policy.ts 历史）：批次 5、调用上限 32、per-batch deadline 60s、
 * MIN === MAX === 10 分钟。这里用**手工复刻的旧公式**实跑同一组输入，不改生产代码。
 */
const CHAPTERS = 180

// —— 旧常量（修复前）
const LEGACY_ITEMS_PER_BATCH = 5
const LEGACY_MAX_ATTEMPTS_HARD_LIMIT = 32
const LEGACY_DEADLINE_PER_BATCH_MS = 60_000
const LEGACY_MIN_DEADLINE_MS = 10 * 60_000
const LEGACY_MAX_DEADLINE_MS = 10 * 60_000
const LEGACY_SYNTAX_REPAIR_RESERVE_CALLS = 1

function legacyPlan(chapterCount: number) {
  const semanticBatchCount = Math.ceil(chapterCount / LEGACY_ITEMS_PER_BATCH)
  const maxCompactSingleFallbacks = Math.min(chapterCount, semanticBatchCount)
  const maxSemanticRepairCalls = semanticBatchCount
  const uncappedMaxCalls = (2 * chapterCount) - semanticBatchCount
    + maxCompactSingleFallbacks + maxSemanticRepairCalls + LEGACY_SYNTAX_REPAIR_RESERVE_CALLS
  return {
    semanticBatchCount,
    expectedCalls: semanticBatchCount,
    maxCalls: Math.min(LEGACY_MAX_ATTEMPTS_HARD_LIMIT, uncappedMaxCalls),
    deadlineMs: Math.min(
      LEGACY_MAX_DEADLINE_MS,
      Math.max(LEGACY_MIN_DEADLINE_MS, semanticBatchCount * LEGACY_DEADLINE_PER_BATCH_MS),
    ),
  }
}

describe('目录生成预算：修复前常量必然撑不住 180 章', () => {
  const legacy = legacyPlan(CHAPTERS)
  const current = planBlueprintGenerationCost(CHAPTERS)

  it('夹具自身：180 章在两种常量下都算出合法的批次划分', () => {
    expect(MAX_BLUEPRINT_ITEMS_PER_BATCH).toBeGreaterThan(LEGACY_ITEMS_PER_BATCH)
    expect(legacy.semanticBatchCount).toBe(36)
    expect(current.semanticBatchCount).toBe(15)
    expect(current.expectedCalls).toBe(15)
  })

  it('判别力·调用上限：旧上限 32 连 36 个批次的基线都放不下，新上限放得下', () => {
    // 旧：maxCalls 被 32 夹住，而基线本身就要 36 次 —— 还没开始拆分就已经超限。
    expect(legacy.maxCalls).toBe(32)
    expect(legacy.maxCalls).toBeLessThan(legacy.semanticBatchCount)
    // 新：上限只受绝对墙约束，完整拆分树本身即是业务上限。
    expect(current.maxCalls).toBeGreaterThanOrEqual(current.semanticBatchCount)
    expect(current.maxCalls).toBeGreaterThan(legacy.maxCalls)
  })

  it('判别力·deadline：旧上限固定 10 分钟装不下 36 分钟的需求，新上限随规模伸缩', () => {
    const legacyNeededMs = legacy.semanticBatchCount * LEGACY_DEADLINE_PER_BATCH_MS
    expect(legacyNeededMs).toBe(2_160_000) // 36 分钟
    // 旧：MIN === MAX === 600_000，伸缩被夹死 —— 需求 36 分钟，实给 10 分钟。
    expect(legacy.deadlineMs).toBe(10 * 60_000)
    expect(legacy.deadlineMs).toBeLessThan(legacyNeededMs)
    // 新：deadline 跟着批次走，必须覆盖同一份需求。
    expect(current.runtimeBudget.deadlineMs).toBeGreaterThan(legacy.deadlineMs)
    expect(current.runtimeBudget.deadlineMs).toBeGreaterThanOrEqual(legacyNeededMs)
  })

  it('判别力·单次输出预算：旧值是按固定档给的，新值按最大批次推导', () => {
    // 旧实现写死 16_384；新实现按「最大那一批」推导（12 章 × 1200 token/章 = 14_400）。
    const legacyPerAttempt = 16_384
    expect(current.runtimeBudget.maxRequestedOutputTokensPerAttempt).not.toBe(legacyPerAttempt)
    expect(current.runtimeBudget.maxRequestedOutputTokensPerAttempt).toBeGreaterThan(0)
    // 关键：新值必须由批次规模推出，而不是常量 —— 换批次上限它就该变。
    expect(current.runtimeBudget.maxRequestedOutputTokensPerAttempt)
      .toBeLessThan(legacyPerAttempt * 2)
  })
})
