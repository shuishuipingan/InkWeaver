export const CONTEXT_SUMMARY_VERSION = 'extractive-v1'
export type ContextSummaryKind = 'architecture' | 'character-detail' | 'chapter-summary'
export interface ContextSummaryCacheKey { kind: ContextSummaryKind; sourceKey: string; sourceHash: string; version: string }
export interface ContextSummaryCacheEntry extends ContextSummaryCacheKey { text: string }
export const CONSTRAINT_PATTERN = /必须|不得|不能|禁止|始终|绝不|不可|务必|\bnever\b|\bmust\b|\bcannot\b|\bforbidden\b/iu

export function summarizeContextText(text: string, options: { maxChars: number; terms: readonly string[] }) {
  if (!Number.isSafeInteger(options.maxChars) || options.maxChars < 1) throw new Error('上下文摘要预算无效')
  const source = text.trim()
  if (source.length <= options.maxChars) return { text: source, originalChars: source.length, retainedChars: source.length }
  const units = source.split(/(?<=[。！？!?])|(?<=\.)\s+|\r?\n+/u).map(value => value.trim()).filter(Boolean)
  const terms = [...new Set(options.terms.filter(term => term.trim()))]
  const ranked = units.map((unit, index) => ({ unit, index, required: CONSTRAINT_PATTERN.test(unit),
    score: terms.reduce((score, term) => score + (unit.includes(term) ? 1 : 0), 0) }))
    .sort((a, b) => Number(b.required) - Number(a.required) || b.score - a.score || a.index - b.index)
  const selected: typeof ranked = []
  let count = 0
  for (const row of ranked) {
    const cost = row.unit.length + (selected.length ? 1 : 0)
    if (row.required || count + cost <= options.maxChars) { selected.push(row); count += cost }
  }
  // A single indivisible paragraph cannot be safely abbreviated. Keep it and
  // let the normal budget guard decide; do not fabricate an empty summary.
  if (selected.length === 0 && ranked[0]) selected.push(ranked[0])
  const summary = selected.sort((a, b) => a.index - b.index).map(row => row.unit).join('\n')
  return { text: summary, originalChars: source.length, retainedChars: summary.length }
}
