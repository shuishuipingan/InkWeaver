import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ContextReceiptSummary, AdaptiveBudgetSummary } from '../AIOutputPanel'
import '../../../index.css'
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let host: HTMLDivElement | undefined
it('shows source classes, compacted material and protected-core budget before model output exists', async () => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root!.render(<>
    <AdaptiveBudgetSummary locale="zh-CN" report={{ modelId: 'model', totalUtf8Bytes: 1000, limitUtf8Bytes: 2000,
      estimatedInputTokens: 500, limitInputTokens: 1000, reservedOutputTokens: 8192, contextWindowTokens: null, capacityKnown: false,
      errorCode: 'OK', sections: [], protectedSections: ['core-cast'] }} />
    <ContextReceiptSummary locale="zh-CN" receipt={{ version: 1, chapterNumber: 2, budgetChars: 1000, selectedChars: 100, entries: [
      { id: 'cast', layer: 'character-state', label: '林舟', included: true, required: true, charCount: 100, representation: 'full', sourceKind: 'character-profile' },
      { id: 'ref', layer: 'knowledge-search', label: '参考片段', included: true, charCount: 50, representation: 'summary', sourceKind: 'reference-material', cacheHit: true },
      { id: 'old', layer: 'character-state', label: '远期角色', included: false, reason: 'not-relevant', charCount: 0, representation: 'omitted' },
    ] }} />
  </>))
  await expect.element(page.getByText(/估算输入 500\/1,000/u)).toBeVisible()
  await page.getByText(/写前上下文收据/u).click()
  await expect.element(page.getByText('核心完整')).toBeVisible()
  await expect.element(page.getByText('参考资料', { exact: true })).toBeVisible()
  await expect.element(page.getByText('与本章无关')).toBeVisible()
  await expect.element(page.getByText('摘要缓存命中')).toBeVisible()
})
afterEach(async () => { await act(async () => root?.unmount()); host?.remove() })
