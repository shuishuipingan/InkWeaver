import { describe, expect, it } from 'vitest'
import { aggregateGenerationReceipts } from '../generation-receipt-aggregation'
import type { GenerationReceiptSummary } from '../generation-receipt'

function receipt(modelId: string, usage?: GenerationReceiptSummary['usage']): GenerationReceiptSummary {
  return {
    modelId,
    attempt: 1,
    cumulativeRequestedOutputTokens: 2000,
    maxRequestedOutputTokens: 4000,
    maxRequestedOutputTokensPerAttempt: 4000,
    ...(usage ? { usage } : {}),
  }
}

describe('aggregateGenerationReceipts', () => {
  it('returns null for buckets that were missing in any attempt', () => {
    const result = aggregateGenerationReceipts([
      receipt('model-a', { promptTokens: 100, completionTokens: 50, totalTokens: 150, promptCacheHitTokens: 20, promptCacheMissTokens: 130 }),
      receipt('model-a', { promptTokens: 200, completionTokens: 60, totalTokens: 260, promptCacheHitTokens: null, promptCacheMissTokens: null }),
      receipt('model-b'),
    ])
    expect(result).toEqual([
      {
        modelId: 'model-a',
        attempts: 2,
        totalTokens: 410,
        promptTokens: 300,
        completionTokens: 110,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null,
        cumulativeRequestedOutputTokens: 4000,
      },
      {
        modelId: 'model-b',
        attempts: 1,
        totalTokens: null,
        promptTokens: null,
        completionTokens: null,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null,
        cumulativeRequestedOutputTokens: 2000,
      },
    ])
  })

  it('totals every bucket when all attempts report complete usage', () => {
    const result = aggregateGenerationReceipts([
      receipt('model-a', { promptTokens: 100, completionTokens: 50, totalTokens: 150, promptCacheHitTokens: 20, promptCacheMissTokens: 130 }),
      receipt('model-a', { promptTokens: 200, completionTokens: 60, totalTokens: 260, promptCacheHitTokens: 30, promptCacheMissTokens: 230 }),
    ])
    expect(result[0]).toEqual({
      modelId: 'model-a',
      attempts: 2,
      totalTokens: 410,
      promptTokens: 300,
      completionTokens: 110,
      promptCacheHitTokens: 50,
      promptCacheMissTokens: 360,
      cumulativeRequestedOutputTokens: 4000,
    })
  })
})