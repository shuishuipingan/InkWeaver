/**
 * Safe reference rewriting after a character rename.
 *
 * Only unambiguous persisted relationship targets are rewritten:
 * - JSON array records where `target` equals an original name;
 * - plain text lines of the form `Target：relationship` where the leading
 *   target is an exact original name.
 * Free-form author notes, arbitrary prose, and unrecognized storage stay
 * untouched so a rename never silently edits human text.
 */

export interface CharacterRenamePair {
  readonly originalName: string
  readonly newName: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const COLON_SEPARATOR = /[:：]/

/** Rewrite one structured edge record's target when it is an exact old name. */
function rewrittenStructuredValue(value: unknown, renameByOriginal: ReadonlyMap<string, string>): unknown {
  if (!isRecord(value)) return value
  const target = textValue(value.target) ?? textValue(value.name)
  if (target === null) return value
  const replacement = renameByOriginal.get(target)
  if (!replacement) return value
  const next = { ...value }
  if (typeof value.target === 'string') next.target = replacement
  else if (typeof value.name === 'string') next.name = replacement
  return next
}

/** Rewrite a persisted relationships value after a rename, preserving storage shape. */
export function rewriteRelationshipsAfterRename(
  value: string,
  renames: readonly CharacterRenamePair[],
): string {
  const renameByOriginal = new Map(
    renames
      .map(rename => [rename.originalName.trim(), rename.newName.trim()] as const)
      .filter(pair => pair[0] && pair[1] && pair[0] !== pair[1]),
  )
  if (renameByOriginal.size === 0 || !value.trim()) return value

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    parsed = undefined
  }

  if (Array.isArray(parsed)) {
    return JSON.stringify(parsed.map(record => rewrittenStructuredValue(record, renameByOriginal)), null, 2)
  }
  if (isRecord(parsed)) {
    return JSON.stringify(rewrittenStructuredValue(parsed, renameByOriginal), null, 2)
  }

  // Plain legacy text: only rewrite exact leading targets in `Target：relationship` lines.
  const nextLines = value.split(/\r?\n/).map(line => {
    const trimmed = line.trim()
    const index = trimmed.search(COLON_SEPARATOR)
    if (index <= 0) return line
    const target = trimmed.slice(0, index).trim()
    const replacement = renameByOriginal.get(target)
    if (!replacement) return line
    const leading = line.slice(0, line.indexOf(trimmed))
    return leading + replacement + line.slice(line.indexOf(trimmed) + index)
  })
  return nextLines.join('\n')
}

/** Verify that no persisted relationship target still refers to any original name. */
export function renameReferencesClean(
  value: string,
  originalNames: readonly string[],
): boolean {
  const originals = new Set(originalNames.map(name => name.trim()).filter(Boolean))
  if (originals.size === 0 || !value.trim()) return true

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    parsed = undefined
  }
  const targets: string[] = []
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const record = isRecord(item) ? item : null
      const target = record === null ? null : textValue(record.target) ?? textValue(record.name)
      if (target !== null) targets.push(target)
    }
  } else {
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim()
      const index = trimmed.search(COLON_SEPARATOR)
      if (index > 0) targets.push(trimmed.slice(0, index).trim())
    }
  }
  return targets.every(target => !originals.has(target))
}