import { describe, expect, it } from 'vitest'
import {
  omittedContextReceiptEntries,
  selectContextEntries,
} from '../context-receipt'

describe('selectContextEntries', () => {
  it('keeps required entries whole even when optional history competes for budget', () => {
    const result = selectContextEntries(4, [
      {
        id: 'rules:canon', layer: 'fixed-rules', label: '固定规则',
        content: '规则：魔法不能复活死者。', priority: 1, order: 0, required: true,
      },
      {
        id: 'fact:1', layer: 'historical-fact', label: '历史事实',
        content: '林岚在雨夜受伤。', priority: 100, order: 1,
      },
    ], { maxChars: 12 })

    expect(result.text).toContain('规则：魔法不能复活死者。')
    expect(result.text).not.toContain('林岚在雨夜受伤。')
    expect(result.receipt.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fact:1', included: false, reason: 'budget-exceeded' }),
    ]))
  })

  it('does not slice an entry in the middle and renders selected entries in stable order', () => {
    const result = selectContextEntries(2, [
      {
        id: 'late', layer: 'historical-fact', label: '后段',
        content: '后段完整证据。', priority: 90, order: 2,
      },
      {
        id: 'early', layer: 'current-arc', label: '前段',
        content: '前段完整证据。', priority: 10, order: 1,
      },
    ], { maxChars: 20 })

    expect(result.text).toBe('前段完整证据。\n\n后段完整证据。')
    expect(result.text).toContain('前段完整证据。')
    expect(result.text).toContain('后段完整证据。')
    expect(result.receipt.selectedChars).toBe(result.text.length)
  })

  it('records duplicate identifiers and exposes omission reasons without private prose', () => {
    const result = selectContextEntries(3, [
      {
        id: 'handoff:2', layer: 'immediate-handoff', label: '上一章交接',
        content: '门后传来呼唤。', priority: 10, order: 0,
      },
      {
        id: 'handoff:2', layer: 'immediate-handoff', label: '重复交接',
        content: '不应重复发送的正文。', priority: 20, order: 1,
      },
    ], { maxChars: 100 })

    expect(result.selectedIds).toEqual(['handoff:2'])
    expect(omittedContextReceiptEntries(result.receipt)).toEqual([
      expect.objectContaining({ id: 'handoff:2', reason: 'duplicate', included: false }),
    ])
    expect(JSON.stringify(result.receipt)).not.toContain('门后传来')
    expect(JSON.stringify(result.receipt)).not.toContain('不应重复')
  })
})
