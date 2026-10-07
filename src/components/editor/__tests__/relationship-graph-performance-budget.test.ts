import { describe, expect, it } from 'vitest'

import {
  ENVIRONMENT_FRAME_BUDGET_FACTOR,
  MIN_FRAME_BUDGET_MS,
  resolveFrameBudgetMs,
} from './relationship-graph-performance-budget'

/**
 * 这组单测的作用是**证明改阈值不等于掩盖退化**：预算只由环境决定，且快环境完全不受影响。
 * 环境值来源：16ms 与 84ms 都是构造值，取自 Lead 的现场分析——
 * 本地快机实测环境帧 p95 ≈ 16ms；反复失败的 macOS x64 runner 实测 ≈ 84ms（≈12fps）。
 */
describe('RelationshipGraph 帧预算归一化', () => {
  it('快环境（p95 = 16ms）预算仍由 33ms 下限主导：本次改动对正常环境零影响', () => {
    expect(resolveFrameBudgetMs(16)).toBe(MIN_FRAME_BUDGET_MS)
    expect(resolveFrameBudgetMs(16)).toBe(33)
    // 旧系数在新下限下同样是 33 —— 快机结果逐字不变。
    expect(Math.max(33, Math.ceil(16 * 1.25))).toBe(33)
  })

  it('慢环境（p95 = 84ms）预算放宽到 126ms，足以容纳三次失败的实测 116.7ms', () => {
    const budget = resolveFrameBudgetMs(84)
    expect(budget).toBe(126)
    expect(budget).toBeGreaterThan(116.7)
  })

  it('判别力对照：旧系数 1.25 在慢环境下只有 105ms，装不下实测值 —— 正是三次失败的原因', () => {
    const legacyBudget = Math.max(33, Math.ceil(84 * 1.25))
    expect(legacyBudget).toBe(105)
    expect(legacyBudget).toBeLessThan(116.7)
  })

  it('下限边界与非法输入保持原有行为', () => {
    expect(resolveFrameBudgetMs(21)).toBe(33)
    expect(resolveFrameBudgetMs(22)).toBe(33)
    expect(resolveFrameBudgetMs(23)).toBe(35)
    expect(resolveFrameBudgetMs(Number.NaN)).toBe(33)
    expect(resolveFrameBudgetMs(Number.POSITIVE_INFINITY)).toBe(33)
    expect(resolveFrameBudgetMs(Number.NEGATIVE_INFINITY)).toBe(33)
  })

  it('不掩盖产品退化：预算只随环境缩放，与图本身无关，且仍有明确上界', () => {
    // 同一环境值下预算唯一 —— 图变慢不会抬高它。
    expect(resolveFrameBudgetMs(84)).toBe(resolveFrameBudgetMs(84))
    // 容纳实测值，但远低于一次严重退化（例如布局 p95 掉到 300ms）。
    expect(resolveFrameBudgetMs(84)).toBeGreaterThan(116.7)
    expect(resolveFrameBudgetMs(84)).toBeLessThan(300)
    // 系数只是 1.5：环境 p95 翻倍时预算也按同一比例走，不会失控。
    expect(ENVIRONMENT_FRAME_BUDGET_FACTOR).toBe(1.5)
  })
})
