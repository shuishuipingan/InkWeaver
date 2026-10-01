import type { ContextReceipt } from './context-receipt'
import type { PromptBudgetReport } from './prompt-budget'
export interface ContextBudgetBinding {
  entryId: string; sectionName: string; fullSectionBytes: number; fullEndBytes: number
  summaryEndBytes?: number; summaryChars?: number; summaryCacheHit?: boolean
}
export function applyContextBudgetReceipt(receipt: ContextReceipt, report: PromptBudgetReport, bindings: readonly ContextBudgetBinding[]): ContextReceipt {
  const retained = new Map<string, number>()
  for (const section of report.sections) retained.set(section.sectionName, Math.max(retained.get(section.sectionName) ?? 0, section.utf8Bytes))
  const byId = new Map(bindings.map(binding => [binding.entryId, binding]))
  const entries = receipt.entries.map(entry => {
    const binding = byId.get(entry.id)
    if (!binding || entry.required || !entry.included || !retained.has(binding.sectionName)) return { ...entry }
    const bytes = retained.get(binding.sectionName)!
    const summary = binding.summaryEndBytes !== undefined && bytes < binding.fullSectionBytes
    const present = bytes >= (summary ? binding.summaryEndBytes! : binding.fullEndBytes)
    return { ...entry, included: present, representation: present ? summary ? 'summary' as const : 'full' as const : 'omitted' as const,
      charCount: present ? summary ? binding.summaryChars ?? entry.charCount : entry.charCount : 0,
      cacheHit: present && summary && binding.summaryCacheHit === true,
      ...(!present ? { reason: 'budget-exceeded' as const } : {}) }
  })
  return { ...receipt, entries, selectedChars: entries.filter(entry => entry.included).reduce((n, entry) => n + entry.charCount, 0) }
}
