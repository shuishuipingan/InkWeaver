import { describe, expect, it } from 'vitest'
import { applyContextBudgetReceipt } from '../context-budget-receipt'
import type { ContextReceipt } from '../context-receipt'
import type { PromptBudgetReport } from '../prompt-budget'
describe('final context budget receipts', () => {
  it('reports summaries and omits only rows that did not survive the final prompt', () => {
    const receipt: ContextReceipt = { version: 1, chapterNumber: 2, selectedChars: 500, budgetChars: 500, entries: [
      { id: 'core', layer: 'character-state', label: '核心人物', included: true, required: true, charCount: 100 },
      { id: 'detail', layer: 'character-state', label: '背景', included: true, charCount: 300 },
      { id: 'related', layer: 'character-state', label: '相关人物', included: true, charCount: 100 },
    ] }
    const report: PromptBudgetReport = { modelId: 'a', totalUtf8Bytes: 180, limitUtf8Bytes: 200, reservedOutputTokens: 8_192,
      errorCode: 'OK', sections: [{ sectionName: 'linked-cast', utf8Bytes: 50 }, { sectionName: 'secondary-cast', utf8Bytes: 0 }] }
    const result = applyContextBudgetReceipt(receipt, report, [
      { entryId: 'detail', sectionName: 'linked-cast', fullSectionBytes: 400, fullEndBytes: 400, summaryEndBytes: 50, summaryChars: 25, summaryCacheHit: true },
      { entryId: 'related', sectionName: 'secondary-cast', fullSectionBytes: 150, fullEndBytes: 150 },
    ])
    expect(result.entries[0]).toMatchObject({ included: true, required: true })
    expect(result.entries[1]).toMatchObject({ included: true, representation: 'summary', charCount: 25, cacheHit: true })
    expect(result.entries[2]).toMatchObject({ included: false, representation: 'omitted', reason: 'budget-exceeded' })
    expect(receipt.entries[1]!.charCount).toBe(300)
  })
})
