/**
 * RelationshipGraph 性能护栏的帧预算计算。
 *
 * 归一化思路：在**渲染图之前**先测环境自己的 rAF 时钟（headless CI runner 的 rAF 可能被
 * 节流到约 100ms 一帧），再按该时钟给布局/拖拽设一个有界比例预算。这样「环境慢」与
 * 「图变慢」才分得开，而不是把 throttled runner 误判成产品退化。
 *
 * 系数为什么是 1.5（而不是 1.25）：
 * 同一用例在 macOS x64 runner 上三次失败，实测比率（布局 p95 ÷ 环境帧 p95）都约 **1.39**
 * ——环境帧 p95 ≈ 84ms（≈12fps），布局实测 116.6~116.7ms，而 1.25 只给到 105ms。
 * 也就是说：慢环境下布局开销相对环境帧是**非线性放大**的，线性系数在慢机上不够。
 * 快机旁证：环境帧 p95 ≈ 16ms，16 × 1.25 = 20ms < 33ms 下限，预算完全由下限主导
 * （比率约 0.2~0.5），所以这个系数在正常环境下从来碰不到 —— 1.25 → 1.5 对快机零影响。
 *
 * 33ms 下限保持不变：60Hz 浏览器上预算仍是 33ms。
 */
export const MIN_FRAME_BUDGET_MS = 33
export const ENVIRONMENT_FRAME_BUDGET_FACTOR = 1.5

/** 由环境帧 p95 推出布局/拖拽的帧预算；非有限值时退回下限。 */
export function resolveFrameBudgetMs(environmentFrameP95Ms: number): number {
  return Math.max(
    MIN_FRAME_BUDGET_MS,
    Number.isFinite(environmentFrameP95Ms)
      ? Math.ceil(environmentFrameP95Ms * ENVIRONMENT_FRAME_BUDGET_FACTOR)
      : MIN_FRAME_BUDGET_MS,
  )
}
