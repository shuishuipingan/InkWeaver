import type { CharacterRosterEntry } from './character-roster'

export type CharacterFieldChange =
  | { kind: 'added'; field: string; value: string }
  | { kind: 'removed'; field: string; previousValue: string }
  | { kind: 'changed'; field: string; previousValue: string; nextValue: string }

export interface CharacterEntryDiff {
  name: string
  changes: CharacterFieldChange[]
  relationshipAdded: number
  relationshipRemoved: number
}

const COMPARABLE_TEXT_FIELDS = [
  'gender', 'age', 'appearance', 'personality', 'background',
  'abilities', 'motivation', 'arc', 'notes',
] as const

function comparableText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 字段级差异回顾：只对比结构化字段的实际前后值，未提及/未变化字段不产生
 * 猜测性 change。关系数组按 target+relation+direction 做集合差。
 */
export function diffCharacterRosterEntries(
  before: CharacterRosterEntry,
  after: CharacterRosterEntry,
): CharacterEntryDiff {
  const changes: CharacterFieldChange[] = []
  for (const field of COMPARABLE_TEXT_FIELDS) {
    const previousValue = comparableText(before[field])
    const nextValue = comparableText(after[field])
    if (!previousValue && nextValue) changes.push({ kind: 'added', field, value: nextValue })
    else if (previousValue && !nextValue) changes.push({ kind: 'removed', field, previousValue })
    else if (previousValue && nextValue && previousValue !== nextValue) {
      changes.push({ kind: 'changed', field, previousValue, nextValue })
    }
  }
  if (before.role !== after.role) {
    changes.push({
      kind: 'changed',
      field: 'role',
      previousValue: before.role,
      nextValue: after.role,
    })
  }

  const keyOf = (relationship: { target: string; relation: string; direction?: string }) =>
    `${relationship.target}\u0000${relationship.relation}\u0000${relationship.direction ?? ''}`
  const previousKeys = new Set((before.relationships ?? []).map(keyOf))
  const nextKeys = new Set((after.relationships ?? []).map(keyOf))
  const relationshipRemoved = (before.relationships ?? []).filter(relationship => !nextKeys.has(keyOf(relationship))).length
  const relationshipAdded = (after.relationships ?? []).filter(relationship => !previousKeys.has(keyOf(relationship))).length

  return {
    name: after.name,
    changes,
    relationshipAdded,
    relationshipRemoved,
  }
}

export function diffCharacterRoster(
  before: readonly CharacterRosterEntry[],
  after: readonly CharacterRosterEntry[],
): CharacterEntryDiff[] {
  const afterById = new Map(after.map(entry => [entry.characterId ?? entry.name, entry]))
  return before
    .map(entry => {
      const next = afterById.get(entry.characterId ?? entry.name)
      return next ? diffCharacterRosterEntries(entry, next) : null
    })
    .filter((diff): diff is CharacterEntryDiff => diff !== null && (
      diff.changes.length > 0 || diff.relationshipAdded > 0 || diff.relationshipRemoved > 0
    ))
}