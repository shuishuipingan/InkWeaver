import { describe, expect, it } from 'vitest'
import { summarizeContextText } from '../context-summary'

describe('source-extractive context summaries', () => {
  it('keeps late constraints and relevant complete sentences without creating facts', () => {
    const source = '村里种麦。城里卖布。凤凰守护山门。主角不得透露第二人格。'
    const summary = summarizeContextText(source, { maxChars: 24, terms: ['凤凰'] })
    expect(summary.text).toContain('主角不得透露第二人格。')
    expect(summary.text).toContain('凤凰守护山门。')
    for (const sentence of summary.text.split('\n')) expect(source).toContain(sentence)
    expect(summary.retainedChars).toBeLessThan(summary.originalChars)
  })
  it('preserves all constraints even when they exceed the optional summary target', () => {
    expect(summarizeContextText('主角必须守诺。主角不得杀人。', { maxChars: 4, terms: [] }).text)
      .toBe('主角必须守诺。\n主角不得杀人。')
  })
})
