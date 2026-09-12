/**
 * A bounded, privacy-safe receipt for the context assembled for one writing
 * request.  The receipt contains identifiers and reasons only; it never
 * stores the private prose that was sent to a model.
 */
export type ContextLayer =
  | 'fixed-rules'
  | 'current-arc'
  | 'character-state'
  | 'historical-fact'
  | 'active-thread'
  | 'immediate-handoff'
  | 'knowledge-search'

export type ContextOmissionReason =
  | 'budget-exceeded'
  | 'not-relevant'
  | 'unavailable'
  | 'expired'
  | 'duplicate'

export interface ContextSelectionEntry {
  /** Stable, non-content identifier such as `fact:12:3`. */
  id: string
  layer: ContextLayer
  label: string
  content: string
  /** Higher priority entries are selected first when the budget is tight. */
  priority: number
  /** Stable presentation order after selection. */
  order: number
  sourceChapter?: number
  required?: boolean
  /** The caller deliberately excluded this complete item before budgeting. */
  excludedReason?: ContextOmissionReason
}

export interface ContextReceiptEntry {
  id: string
  layer: ContextLayer
  label: string
  sourceChapter?: number
  included: boolean
  reason?: ContextOmissionReason
  charCount: number
}

export interface ContextReceipt {
  version: 1
  chapterNumber: number
  budgetChars: number
  selectedChars: number
  entries: ContextReceiptEntry[]
}

export interface ContextSelectionResult {
  text: string
  receipt: ContextReceipt
  selectedIds: string[]
}

function normalizedText(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim()
}

function compareEntries(left: ContextSelectionEntry, right: ContextSelectionEntry): number {
  return Number(right.required ?? false) - Number(left.required ?? false)
    || right.priority - left.priority
    || left.order - right.order
    || left.id.localeCompare(right.id)
}

/**
 * Selects complete context entries under a character budget.
 *
 * Required entries are never silently truncated or dropped. Optional entries
 * are considered by priority, then rendered in their stable order so the
 * prompt remains readable and cache-friendly. Duplicate identifiers are kept
 * as an explicit omission in the receipt rather than being sent twice.
 */
export function selectContextEntries(
  chapterNumber: number,
  entries: readonly ContextSelectionEntry[],
  options: { maxChars: number; now?: string } = { maxChars: 0 },
): ContextSelectionResult {
  if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error('上下文收据章节号无效')
  }
  if (!Number.isSafeInteger(options.maxChars) || options.maxChars < 0) {
    throw new Error('上下文收据预算无效')
  }

  const receiptEntries: ContextReceiptEntry[] = []
  const unique = new Map<string, ContextSelectionEntry>()
  for (const input of entries) {
    const id = input.id.trim()
    const label = normalizedText(input.label)
    const content = normalizedText(input.content)
    if (!id || !label) continue
    if (input.excludedReason) {
      receiptEntries.push({
        id,
        layer: input.layer,
        label,
        sourceChapter: input.sourceChapter,
        included: false,
        reason: input.excludedReason,
        charCount: content.length,
      })
      continue
    }
    if (!content) continue
    const normalized: ContextSelectionEntry = {
      ...input,
      id,
      label,
      content,
      priority: Number.isFinite(input.priority) ? input.priority : 0,
      order: Number.isFinite(input.order) ? input.order : 0,
    }
    if (unique.has(id)) {
      receiptEntries.push({
        id,
        layer: normalized.layer,
        label,
        sourceChapter: normalized.sourceChapter,
        included: false,
        reason: 'duplicate',
        charCount: content.length,
      })
      continue
    }
    unique.set(id, normalized)
  }

  let selectedChars = 0
  const selected = new Set<string>()
  for (const entry of [...unique.values()].sort(compareEntries)) {
    const separatorChars = selected.size > 0 ? 2 : 0
    const nextChars = selectedChars + separatorChars + entry.content.length
    const canFit = nextChars <= options.maxChars
    if (entry.required || canFit) {
      selected.add(entry.id)
      selectedChars = nextChars
      receiptEntries.push({
        id: entry.id,
        layer: entry.layer,
        label: entry.label,
        sourceChapter: entry.sourceChapter,
        included: true,
        charCount: entry.content.length,
      })
      continue
    }
    receiptEntries.push({
      id: entry.id,
      layer: entry.layer,
      label: entry.label,
      sourceChapter: entry.sourceChapter,
      included: false,
      reason: 'budget-exceeded',
      charCount: entry.content.length,
    })
  }

  const selectedEntries = [...unique.values()]
    .filter(entry => selected.has(entry.id))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  return {
    text: selectedEntries.map(entry => entry.content).join('\n\n'),
    selectedIds: selectedEntries.map(entry => entry.id),
    receipt: {
      version: 1,
      chapterNumber,
      budgetChars: options.maxChars,
      selectedChars,
      entries: receiptEntries.sort((left, right) => (
        left.id.localeCompare(right.id) || Number(left.included) - Number(right.included)
      )),
    },
  }
}

export function includedContextReceiptEntries(receipt: ContextReceipt): ContextReceiptEntry[] {
  return receipt.entries.filter(entry => entry.included)
}

export function omittedContextReceiptEntries(receipt: ContextReceipt): ContextReceiptEntry[] {
  return receipt.entries.filter(entry => !entry.included)
}
