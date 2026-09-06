import type { CharacterExtractionCandidate } from '../shared/character-extraction'
import type { CharacterRosterEntry, CharacterRosterSnapshot } from '../shared/character-roster'

const TEXT_FIELDS = [
  'gender', 'age', 'appearance', 'personality', 'background',
  'abilities', 'motivation', 'arc', 'notes',
] as const

function key(value: string): string {
  return value.trim().replace(/\s+/gu, '').toLocaleLowerCase('en-US')
}

function emptyEntry(candidate: CharacterExtractionCandidate): CharacterRosterEntry {
  return {
    name: candidate.name.trim(),
    ...(candidate.aliases.length > 0 ? { aliases: [...new Set(candidate.aliases)] } : {}),
    role: candidate.role ?? 'supporting',
    gender: candidate.fields.gender ?? '',
    age: candidate.fields.age ?? '',
    appearance: candidate.fields.appearance ?? '',
    personality: candidate.fields.personality ?? '',
    background: candidate.fields.background ?? '',
    abilities: candidate.fields.abilities ?? '',
    motivation: candidate.fields.motivation ?? '',
    relationships: candidate.relationships ?? [],
    arc: candidate.fields.arc ?? '',
    notes: candidate.fields.notes ?? '',
    ...(candidate.currentState ? {
      currentState: {
        location: candidate.currentState.location ?? '',
        powerLevel: candidate.currentState.powerLevel ?? '',
        physicalState: candidate.currentState.physicalState ?? '',
        mentalState: candidate.currentState.mentalState ?? '',
        keyItems: candidate.currentState.keyItems ?? '',
        recentEvents: candidate.currentState.recentEvents ?? '',
        updatedAtChapter: 0,
      },
    } : {}),
  }
}

export function mergeAcceptedCharacterCandidates(
  snapshot: CharacterRosterSnapshot,
  candidates: readonly CharacterExtractionCandidate[],
): CharacterRosterEntry[] {
  const entries = snapshot.entries.map(entry => ({
    ...entry,
    relationships: entry.relationships.map(relationship => ({ ...relationship })),
    ...(entry.currentState ? { currentState: { ...entry.currentState } } : {}),
  }))

  for (const candidate of candidates) {
    if (candidate.status !== 'accepted' || candidate.disposition === 'ambiguous') continue
    const possibleNames = [candidate.name, ...candidate.aliases]
    const index = entries.findIndex(entry => (
      possibleNames.some(name => key(name) === key(entry.name))
      || candidate.matchedCharacterName !== undefined && key(candidate.matchedCharacterName) === key(entry.name)
    ))
    if (index < 0) {
      entries.push(emptyEntry(candidate))
      continue
    }

    const current = entries[index]!
    const merged: CharacterRosterEntry = { ...current }
    merged.aliases = [...new Set([
      ...(current.aliases ?? []),
      ...candidate.aliases,
      ...(candidate.name.trim() !== current.name.trim() ? [candidate.name.trim()] : []),
    ].filter(alias => key(alias) !== key(current.name)))]
    if (candidate.role) merged.role = candidate.role
    for (const field of TEXT_FIELDS) {
      const value = candidate.fields[field]
      if (value) merged[field] = value
    }
    if (candidate.currentState) {
      merged.currentState = {
        ...(current.currentState ?? {
          location: '', powerLevel: '', physicalState: '', mentalState: '',
          keyItems: '', recentEvents: '', updatedAtChapter: 0,
        }),
        ...candidate.currentState,
      }
    }
    entries[index] = merged
  }

  const names = new Set(entries.map(entry => entry.name))
  return entries.map(entry => ({
    ...entry,
    relationships: (entry.relationships ?? []).filter(relationship => (
      names.has(relationship.target) && relationship.target !== entry.name
    )).filter((relationship, index, relationships) => (
      relationships.findIndex(item => item.target === relationship.target && item.relation === relationship.relation) === index
    )),
  }))
}
