/**
 * Product-level maximum for one semantic blueprint batch.
 *
 * 12 的依据：实测每章蓝图约 800–1200 输出 token（事故现场每次只产 ~2.7k 字符 ≈900 token 就 stop），
 * 12 章 ≈14.4k token，仍在单次请求的合理输出空间内；而 5 章会让 180 章拆成 36 个串行批次，
 * 在有限会话截止时间内根本跑不完。真实输出上限仍由预算机制约束，这里只是"语义批次"上限。
 */
export const MAX_BLUEPRINT_ITEMS_PER_BATCH = 12
export const DEFAULT_BLUEPRINT_GENERATION_COUNT = MAX_BLUEPRINT_ITEMS_PER_BATCH

/**
 * 物理调用的**绝对**硬上限，只作为失控重试的最后一道墙。
 *
 * 它不再承担业务上限职责：真正允许的调用数由 uncappedMaxCalls 给出——那是"完整拆分树
 * （2N−B）+ 每批一次紧凑回退 + 每批一次语义修复 + 一次语法修复"的量级，两者取 min。
 * 旧实现把它固定成 32，使 180 章的 uncapped（376）连放都放不进去：maxCalls 会先于 deadline
 * 成为瓶颈。判据是一个"一次生成 180 章"的任务在合理拆分/修复开销下不该被它卡住；
 * 512 覆盖单任务上限（50 章 → 106）与远大于它的场景，同时仍兜得住无限重试。
 */
const DIRECTORY_MAX_ATTEMPTS_ABSOLUTE_LIMIT = 512
const DIRECTORY_MAX_REQUESTED_TOKENS = 262_144
const DIRECTORY_MIN_REQUESTED_TOKENS = 131_072
const DIRECTORY_SYNTAX_REPAIR_RESERVE_CALLS = 1
/**
 * 单任务章节上限。
 *
 * 240 的推导（与下方 deadline / maxCalls 自洽）：12 章/批、实测每批约 2.5 分钟，
 * ceil(240/12) = 20 批 ≈ 50 分钟 < 60 分钟会话窗口；用户 180 章 = 15 批 ≈ 37.5 分钟，
 * 可以**一次生成全部**。再大的范围（例如 500 章需要 42 批 ≈ 105 分钟）会超出任何合理的
 * 单次会话窗口，因此在 240 之上仍保留硬上限——但超限时给的是明确的分次引导，不是死路。
 */
export const MAX_BLUEPRINT_CHAPTERS_PER_TASK = 240
/** 每章蓝图的输出 token 预留（实测 800–1200，取下限之上取整）。 */
const DIRECTORY_TOKENS_PER_CHAPTER = 1_200
/** 单次请求的最小输出预留：小批次也需要足够空间写完整字段。 */
const DIRECTORY_MIN_REQUESTED_TOKENS_PER_ATTEMPT = 8_192
const DIRECTORY_MIN_DEADLINE_MS = 10 * 60_000
/**
 * 90 分钟会话窗口。
 *
 * 依据不是"初始批数"，而是**真实产出形态**：用户现场是"每次 stop 只产 2-3 章"，
 * 15 个批次几乎每批都会触发一次折半拆分 → 30 批 × 实测 2.5 分钟 ≈ 75 分钟。
 * 90 分钟覆盖它并留约 20% 余量；240 章按同一口径是 40 批 ≈ 100 分钟（会被夹到 90，
 * 那种极端组合下 deadline 先触发，但失败信息带章节进度）。
 */
const DIRECTORY_MAX_DEADLINE_MS = 90 * 60_000
/** 每语义批次的时间预留：实测每批约 2.5 分钟（含一次重试），取 150s。 */
const DIRECTORY_DEADLINE_PER_SEMANTIC_BATCH_MS = 150_000
/**
 * 拆分系数：一次 length 截断会把一批折半。实测最常见的形态是"每批各拆一次"，
 * 只按初始批数估算会低估一半时间——用户撞墙的真实形态正是这一种。
 */
const DIRECTORY_DEADLINE_SPLIT_FACTOR = 2

/**
 * 单次请求的输出预算：按**本批章节数**推导，而不是固定 16k。
 * 12 章 → 14,400；5 章 → 8,192（下限）。
 */
export function blueprintOutputTokensForBatch(batchSize: number): number {
  const normalized = Number.isFinite(batchSize) ? Math.max(0, Math.floor(batchSize)) : 0
  return Math.max(normalized * DIRECTORY_TOKENS_PER_CHAPTER, DIRECTORY_MIN_REQUESTED_TOKENS_PER_ATTEMPT)
}

/**
 * 分次生成计划：范围超过单任务上限时，告知"分几次、每次多少章"，
 * 而不是让作者自己撞上限或撞死循环。
 */
export function planBlueprintGenerationRuns(chapterCount: number): { runs: number; chaptersPerRun: number } {
  const normalized = Number.isFinite(chapterCount) ? Math.max(0, Math.floor(chapterCount)) : 0
  if (normalized <= 0) return { runs: 0, chaptersPerRun: 0 }
  const runs = Math.ceil(normalized / MAX_BLUEPRINT_CHAPTERS_PER_TASK)
  return { runs, chaptersPerRun: Math.ceil(normalized / runs) }
}

export interface BlueprintGenerationCostPlan {
  chapterCount: number
  semanticBatchCount: number
  /** Baseline calls when every semantic batch completes without splitting. */
  expectedCalls: number
  /** Allowed physical-call ceiling after recursive-split/repair planning and the product hard cap. */
  maxCalls: number
  /** One short field-repair reserve per initial chapter batch. */
  maxSemanticRepairCalls: number
  maxCompactSingleFallbacks: number
  /** True means the logical scope must be split into separate workflow runs. */
  exceedsHardLimit: boolean
  runtimeBudget: {
    maxAttempts: number
    maxRequestedOutputTokens: number
    maxRequestedOutputTokensPerAttempt: number
    deadlineMs: number
    respectIntentOutputCaps: true
  }
}

/**
 * Derive a task cost envelope from logical work only. This deliberately does
 * not inspect provider names, model IDs, or a model-specific token registry.
 */
export function planBlueprintGenerationCost(chapterCount: number): BlueprintGenerationCostPlan {
  const normalizedChapterCount = Number.isFinite(chapterCount)
    ? Math.max(0, Math.floor(chapterCount))
    : 0
  const semanticBatchCount = Math.ceil(normalizedChapterCount / MAX_BLUEPRINT_ITEMS_PER_BATCH)
  const maxCompactSingleFallbacks = Math.min(normalizedChapterCount, semanticBatchCount)
  const maxSemanticRepairCalls = semanticBatchCount
  // For a semantic batch of n items, recursively splitting every non-single
  // length result creates a full binary tree with 2n-1 physical calls. Across
  // B initial batches this is 2N-B. The executor additionally permits one
  // compact fallback per semantic batch (at most once per item key) and one
  // global syntax repair.
  const uncappedMaxCalls = normalizedChapterCount === 0
    ? 0
    : (2 * normalizedChapterCount)
      - semanticBatchCount
      + maxCompactSingleFallbacks
      + maxSemanticRepairCalls
      + DIRECTORY_SYNTAX_REPAIR_RESERVE_CALLS
  // 只受绝对墙约束：业务上限就是完整拆分树本身，避免 maxCalls 先于 deadline 成为瓶颈。
  const maxCalls = Math.min(DIRECTORY_MAX_ATTEMPTS_ABSOLUTE_LIMIT, uncappedMaxCalls)

  return {
    chapterCount: normalizedChapterCount,
    semanticBatchCount,
    expectedCalls: semanticBatchCount,
    maxCalls,
    maxSemanticRepairCalls,
    maxCompactSingleFallbacks,
    exceedsHardLimit: normalizedChapterCount > MAX_BLUEPRINT_CHAPTERS_PER_TASK,
    runtimeBudget: {
      maxAttempts: maxCalls,
      maxRequestedOutputTokens: Math.min(
        DIRECTORY_MAX_REQUESTED_TOKENS,
        Math.max(
          DIRECTORY_MIN_REQUESTED_TOKENS,
          (semanticBatchCount + Math.min(semanticBatchCount, 6))
            * blueprintOutputTokensForBatch(MAX_BLUEPRINT_ITEMS_PER_BATCH),
        ),
      ),
      // 按**最大批次**推导：单次请求的预算要能装下最大的那一批（12 章 → 14,400）。
      maxRequestedOutputTokensPerAttempt: blueprintOutputTokensForBatch(MAX_BLUEPRINT_ITEMS_PER_BATCH),
      respectIntentOutputCaps: true,
      deadlineMs: Math.min(
        DIRECTORY_MAX_DEADLINE_MS,
        Math.max(
          DIRECTORY_MIN_DEADLINE_MS,
          semanticBatchCount
            * DIRECTORY_DEADLINE_SPLIT_FACTOR
            * DIRECTORY_DEADLINE_PER_SEMANTIC_BATCH_MS,
        ),
      ),
    },
  }
}

export function getBlueprintBatchAdvice(
  locale: 'zh-CN' | 'en-US',
  chapterCount?: number,
): string {
  const plan = chapterCount === undefined ? null : planBlueprintGenerationCost(chapterCount)
  if (locale === 'en-US') {
    const estimate = plan === null
      ? ''
      : ` Estimated baseline: ${plan.expectedCalls} model call(s); task allowance: up to ${plan.maxCalls}.`
    return `Each semantic batch contains at most ${MAX_BLUEPRINT_ITEMS_PER_BATCH} chapters; more chapters take more time and API calls.${estimate} Output-limited batches split automatically.`
  }
  const estimate = plan === null
    ? ''
    : `预计至少 ${plan.expectedCalls} 次模型调用，本任务最多允许 ${plan.maxCalls} 次；`
  return `每个语义批次最多 ${MAX_BLUEPRINT_ITEMS_PER_BATCH} 章；${estimate}章节越多耗时和调用次数越多，达到输出限制时会自动继续拆分。`
}
