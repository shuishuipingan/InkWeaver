import { describe, expect, it } from 'vitest'
import { CONSTRAINT_PATTERN, summarizeContextText } from '../context-summary'

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

  it('keeps ambient description across the document instead of only rules and cast mentions', () => {
    const ambient = Array.from({ length: 12 }, (_, index) => (
      index === 3 ? '凤凰守护山门。' : `山谷第${index}段雾气不散，石阶上长满青苔。`
    ))
    const source = `${ambient.join('')}主角不得透露第二人格。`
    const summary = summarizeContextText(source, { maxChars: 200, terms: ['凤凰'] })

    expect(summary.text).toContain('凤凰守护山门。')
    expect(summary.text).toContain('主角不得透露第二人格。')
    // 至少一句与角色名和约束都无关的环境描写要活下来，摘要才不会只剩清单。
    const ambientSurvivors = summary.text.split('\n')
      .filter(sentence => sentence.includes('雾气不散') && !CONSTRAINT_PATTERN.test(sentence))
    expect(ambientSurvivors.length).toBeGreaterThan(0)
    expect(summary.text.length).toBeLessThan(summary.originalChars)
  })
})
