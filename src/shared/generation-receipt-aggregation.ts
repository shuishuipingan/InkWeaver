import type { GenerationReceiptSummary } from './generation-receipt'

export interface ModelGenerationAggregate {
  modelId: string
  attempts: number
  /** Provider-reported totals; null when any attempt lacked usage. */
  totalTokens: number | null
  promptTokens: number | null
  completionTokens: number | null
  promptCacheHitTokens: number | null
  promptCacheMissTokens: number | null
  cumulativeRequestedOutputTokens: number
}

/**
 * Aggregates provider-reported usage across workflow attempts and models.
 * Missing usage is never guessed and never converted into zero: if any attempt
 * lacks usage for a token bucket, that bucket becomes null for the model.
 */
export function aggregateGenerationReceipts(
  receipts: readonly GenerationReceiptSummary[],
): ModelGenerationAggregate[] {
  const byModel = new Map<string, ModelGenerationAggregate>()
  const missing = new Map<string, Set<keyof ModelGenerationAggregate>>()
  for (const receipt of receipts) {
    let aggregate = byModel.get(receipt.modelId)
    if (!aggregate) {
      aggregate = {
        modelId: receipt.modelId,
        attempts: 0,
        totalTokens: null,
        promptTokens: null,
        completionTokens: null,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null,
        cumulativeRequestedOutputTokens: 0,
      }
      byModel.set(receipt.modelId, aggregate)
      missing.set(receipt.modelId, new Set())
    }
    const usage = receipt.usage
    const missingKeys = missing.get(receipt.modelId)!
    aggregate.attempts += 1
    aggregate.cumulativeRequestedOutputTokens += receipt.cumulativeRequestedOutputTokens

    const accumulate = (key: 'totalTokens' | 'promptTokens' | 'completionTokens' | 'promptCacheHitTokens' | 'promptCacheMissTokens', value: number | null | undefined) => {
      if (value === null || value === undefined) {
        missingKeys.add(key)
        return
      }
      aggregate![key] = (aggregate![key] ?? 0) + value
    }
    accumulate('totalTokens', usage?.totalTokens)
    accumulate('promptTokens', usage?.promptTokens)
    accumulate('completionTokens', usage?.completionTokens)
    accumulate('promptCacheHitTokens', usage?.promptCacheHitTokens)
    accumulate('promptCacheMissTokens', usage?.promptCacheMissTokens)
  }
  return [...byModel.values()].sort((left, right) => left.modelId.localeCompare(right.modelId))
    .map(aggregate => {
      const missingKeys = missing.get(aggregate.modelId) ?? new Set()
      if (missingKeys.has('totalTokens')) aggregate.totalTokens = null
      if (missingKeys.has('promptTokens')) aggregate.promptTokens = null
      if (missingKeys.has('completionTokens')) aggregate.completionTokens = null
      if (missingKeys.has('promptCacheHitTokens')) aggregate.promptCacheHitTokens = null
      if (missingKeys.has('promptCacheMissTokens')) aggregate.promptCacheMissTokens = null
      return aggregate
    })
}