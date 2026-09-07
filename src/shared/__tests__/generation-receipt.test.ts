import { describe, expect, it } from 'vitest'
import { generationReceiptFromAttempt } from '../generation-receipt'

describe('generation receipt', () => {
  it('keeps model and budget attribution while omitting private request data', () => {
    const result = generationReceiptFromAttempt({
      model: { id: 'model-a' },
      budget: { attempt: 2, cumulativeRequestedOutputTokens: 4096, maxRequestedOutputTokens: 8192, maxRequestedOutputTokensPerAttempt: 4096 },
      usage: { promptTokens: null, completionTokens: 120, totalTokens: 120, promptCacheHitTokens: null, promptCacheMissTokens: null },
    })
    expect(result).toMatchObject({ modelId: 'model-a', attempt: 2, cumulativeRequestedOutputTokens: 4096, usage: { totalTokens: 120 } })
    expect(JSON.stringify(result)).not.toContain('private prose')
  })
})
