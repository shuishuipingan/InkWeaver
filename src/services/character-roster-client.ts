import type { CharacterData } from '../../electron/repositories/character-repository'
import type {
  CharacterRosterEntry,
  CharacterRosterRelationship,
} from '../shared/character-roster'
import { normalizeCharacterRole } from '../shared/character-role'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 关系除端点与类型外还带方向、来源章节与证据，手工保存不能顺手丢掉它们。 */
function structuredRelationship(raw: Record<string, unknown>): CharacterRosterRelationship | null {
  if (typeof raw.target !== 'string' || typeof raw.relation !== 'string') return null
  const target = raw.target.trim()
  const relation = raw.relation.trim()
  if (!target || !relation) return null
  const direction = raw.direction === 'outgoing' || raw.direction === 'incoming' || raw.direction === 'mutual'
    ? raw.direction
    : undefined
  const sourceChapter = typeof raw.sourceChapter === 'number'
    && Number.isSafeInteger(raw.sourceChapter)
    && raw.sourceChapter >= 1
    ? raw.sourceChapter
    : undefined
  const evidence = typeof raw.evidence === 'string' && raw.evidence.trim()
    ? raw.evidence.trim().slice(0, 300)
    : undefined
  return {
    target,
    relation,
    ...(direction ? { direction } : {}),
    ...(sourceChapter === undefined ? {} : { sourceChapter }),
    ...(evidence ? { evidence } : {}),
  }
}

function parseStructuredRelationships(value: string): CharacterRosterRelationship[] | null {
  const text = value.trim()
  if (!text) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) {
    const relationships: CharacterRosterRelationship[] = []
    for (const raw of parsed) {
      if (!isRecord(raw)) return null
      const relationship = structuredRelationship(raw)
      if (!relationship) return null
      relationships.push(relationship)
    }
    return relationships
  }
  if (!isRecord(parsed) || 'target' in parsed || 'relation' in parsed) return null
  return Object.entries(parsed).flatMap(([target, relation]) => (
    target.trim() && typeof relation === 'string' && relation.trim()
      ? [{ target: target.trim(), relation: relation.trim() }]
      : []
  ))
}

/**
 * Renderer/workflow 侧只负责把现有角色卡形状送入唯一 roster seam；最终
 * schema、闭包与事务校验都留在主进程 CharacterRosterRepository。
 */
export function characterRosterEntryFromCard(card: CharacterData): CharacterRosterEntry {
  const relationships = parseStructuredRelationships(card.relationships)
  return {
    name: card.name.trim(),
    role: card.role,
    gender: card.gender,
    age: card.age,
    appearance: card.appearance,
    personality: card.personality,
    background: card.background,
    abilities: card.abilities,
    motivation: card.motivation,
    relationships: relationships ?? [],
    arc: card.arc,
    notes: card.notes,
    ...(card.currentState ? { currentState: card.currentState } : {}),
    ...(relationships === null && card.relationships.trim()
      ? { legacyRelationshipNotes: card.relationships.trim() }
      : {}),
  }
}

export function characterCardFromRosterEntry(entry: CharacterRosterEntry): CharacterData {
  return {
    name: entry.name,
    role: normalizeCharacterRole(entry.role),
    gender: entry.gender,
    age: entry.age,
    appearance: entry.appearance,
    personality: entry.personality,
    background: entry.background,
    abilities: entry.abilities,
    motivation: entry.motivation,
    relationships: entry.legacyRelationshipNotes
      ?? (entry.relationships.length > 0 ? JSON.stringify(entry.relationships) : ''),
    arc: entry.arc,
    notes: entry.notes,
    ...(entry.currentState ? { currentState: entry.currentState } : {}),
  }
}

export function characterRosterEntriesFromCards(cards: readonly CharacterData[]): CharacterRosterEntry[] {
  return cards.map(characterRosterEntryFromCard)
}
