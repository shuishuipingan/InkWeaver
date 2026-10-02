export const CONTEXT_SUMMARY_VERSION = 'extractive-v2'
export type ContextSummaryKind = 'architecture' | 'character-detail' | 'chapter-summary'
export interface ContextSummaryCacheKey { kind: ContextSummaryKind; sourceKey: string; sourceHash: string; version: string }
export interface ContextSummaryCacheEntry extends ContextSummaryCacheKey { text: string }
export const CONSTRAINT_PATTERN = /必须|不得|不能|禁止|始终|绝不|不可|务必|\bnever\b|\bmust\b|\bcannot\b|\bforbidden\b/iu

/** 与本章角色相关、或约束句之外的“氛围/描写”保留比例（占可选用预算）。 */
const SUMMARY_COVERAGE_SHARE = 0.5
const SUMMARY_COVERAGE_UNIT_TARGET = 60

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
  const pickedIndexes = new Set<number>()
  let count = 0
  for (const row of ranked) {
    if (!row.required) continue
    selected.push(row)
    pickedIndexes.add(row.index)
    count += row.unit.length + 1
  }
  // 只按“是否含角色名/约束词”排序会把世界观、场景与铺垫句整段丢掉，摘要就只剩
  // 规则和人物清单，草稿随之变得干巴。因此在相关句之外，把剩余预算按全文位置
  // 均匀取样，保住氛围与因果铺垫。
  const relevant = ranked.filter(row => !row.required && row.score > 0)
  const orderedOptional = ranked.filter(row => !row.required).sort((a, b) => a.index - b.index)
  const optionalBudget = Math.max(0, options.maxChars - count)
  // 预算很小时优先保证相关句能进（半预算连一句都放不下），预算充足时才给
  // 均匀取样留出份额。
  const relevanceBudget = optionalBudget <= SUMMARY_COVERAGE_UNIT_TARGET * 2
    ? optionalBudget
    : Math.ceil(optionalBudget * (1 - SUMMARY_COVERAGE_SHARE))
  let relevanceCount = 0
  for (const row of relevant) {
    const cost = row.unit.length + 1
    if (relevanceCount + cost > relevanceBudget) continue
    selected.push(row)
    pickedIndexes.add(row.index)
    relevanceCount += cost
  }
  const coverageBudget = optionalBudget - relevanceCount
  if (coverageBudget > 0) {
    const remaining = orderedOptional.filter(row => !pickedIndexes.has(row.index))
    const expectedUnits = Math.max(1, Math.floor(coverageBudget / SUMMARY_COVERAGE_UNIT_TARGET))
    const stride = Math.max(1, Math.ceil(remaining.length / expectedUnits))
    let coverageCount = 0
    for (let index = 0; index < remaining.length; index += stride) {
      const row = remaining[index]!
      const cost = row.unit.length + 1
      if (coverageCount + cost > coverageBudget) continue
      selected.push(row)
      pickedIndexes.add(row.index)
      coverageCount += cost
    }
    // 均匀取样一句都没放下时，按顺序补上一句，保证摘要不会只剩规则与角色名。
    if (coverageCount === 0 && remaining[0] && remaining[0].unit.length + 1 <= coverageBudget + relevanceBudget - relevanceCount) {
      selected.push(remaining[0])
      pickedIndexes.add(remaining[0].index)
    }
  }
  // A single indivisible paragraph cannot be safely abbreviated. Keep it and
  // let the normal budget guard decide; do not fabricate an empty summary.
  if (selected.length === 0 && ranked[0]) selected.push(ranked[0])
  const summary = selected.sort((a, b) => a.index - b.index).map(row => row.unit).join('\n')
  return { text: summary, originalChars: source.length, retainedChars: summary.length }
}
