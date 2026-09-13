import type { CharacterExtractionCandidate } from '../shared/character-extraction'
import type { CharacterRosterEntry, CharacterRosterSnapshot } from '../shared/character-roster'

const TEXT_FIELDS = [
  'gender', 'age', 'appearance', 'personality', 'background',
  'abilities', 'motivation', 'arc', 'notes',
] as const

function key(value: string): string {
  return value.trim().replace(/\s+/gu, '').toLocaleLowerCase('en-US')
}

export type CharacterCandidateFieldSelection = Readonly<Record<string, readonly string[]>>
export type CharacterCandidateMatchSelection = Readonly<Record<string, string>>

function candidateStateProvenance(candidate: CharacterExtractionCandidate) {
  const draftId = /^chapter:\d+:draft:(\d+)$/u.exec(candidate.source.sourceId)?.[1]
  const evidence = candidate.fieldEvidence.find(item => item.field.startsWith('currentState.'))?.excerpt
    ?? candidate.fieldEvidence.find(item => item.field === 'character')?.excerpt
  return draftId && candidate.source.contentHash && evidence
    ? {
        source: 'model' as const,
        sourceDraftId: Number(draftId),
        sourceContentHash: candidate.source.contentHash,
        evidence,
      }
    : { source: 'legacy-unknown' as const }
}

function emptyEntry(candidate: CharacterExtractionCandidate, selected: ReadonlySet<string>): CharacterRosterEntry {
  return {
    name: candidate.name.trim(),
    ...(selected.has('aliases') && candidate.aliases.length > 0 ? { aliases: [...new Set(candidate.aliases)] } : {}),
    role: selected.has('role') ? candidate.role ?? 'supporting' : 'supporting',
    gender: selected.has('gender') ? candidate.fields.gender ?? '' : '',
    age: selected.has('age') ? candidate.fields.age ?? '' : '',
    appearance: selected.has('appearance') ? candidate.fields.appearance ?? '' : '',
    personality: selected.has('personality') ? candidate.fields.personality ?? '' : '',
    background: selected.has('background') ? candidate.fields.background ?? '' : '',
    abilities: selected.has('abilities') ? candidate.fields.abilities ?? '' : '',
    motivation: selected.has('motivation') ? candidate.fields.motivation ?? '' : '',
    relationships: selected.has('relationships') ? candidate.relationships ?? [] : [],
    arc: selected.has('arc') ? candidate.fields.arc ?? '' : '',
    notes: selected.has('notes') ? candidate.fields.notes ?? '' : '',
    ...(selected.has('currentState') && candidate.currentState ? {
      currentState: {
        location: candidate.currentState.location ?? '',
        powerLevel: candidate.currentState.powerLevel ?? '',
        physicalState: candidate.currentState.physicalState ?? '',
        mentalState: candidate.currentState.mentalState ?? '',
        keyItems: candidate.currentState.keyItems ?? '',
        recentEvents: candidate.currentState.recentEvents ?? '',
        updatedAtChapter: 0,
        provenance: candidateStateProvenance(candidate),
      },
    } : {}),
  }
}

export function mergeAcceptedCharacterCandidates(
  snapshot: CharacterRosterSnapshot,
  candidates: readonly CharacterExtractionCandidate[],
  fieldSelection: CharacterCandidateFieldSelection = {},
  matchSelection: CharacterCandidateMatchSelection = {},
): CharacterRosterEntry[] {
  const entries = snapshot.entries.map(entry => ({
    ...entry,
    relationships: entry.relationships.map(relationship => ({ ...relationship })),
    ...(entry.currentState ? { currentState: { ...entry.currentState } } : {}),
  }))

  for (const candidate of candidates) {
    if (candidate.status !== 'accepted') continue
    const explicitMatch = matchSelection[candidate.candidateId]?.trim()
    if (candidate.disposition === 'ambiguous' && !explicitMatch) continue
    const allFields = new Set([
      ...(candidate.role ? ['role'] : []),
      ...Object.keys(candidate.fields),
      ...(candidate.aliases.length > 0 ? ['aliases'] : []),
      ...(candidate.relationships && candidate.relationships.length > 0 ? ['relationships'] : []),
      ...(candidate.currentState && Object.keys(candidate.currentState).length > 0 ? ['currentState'] : []),
    ])
    const selected = new Set(fieldSelection[candidate.candidateId] ?? [...allFields])
    if (selected.size === 0) continue
    const possibleNames = explicitMatch ? [explicitMatch] : [candidate.name, ...candidate.aliases]
    const index = entries.findIndex(entry => (
      possibleNames.some(name => key(name) === key(entry.name))
      || candidate.matchedCharacterName !== undefined && key(candidate.matchedCharacterName) === key(entry.name)
    ))
    if (candidate.disposition === 'ambiguous' && index < 0) continue
    if (index < 0) {
      entries.push(emptyEntry(candidate, selected))
      continue
    }

    const current = entries[index]!
    const merged: CharacterRosterEntry = { ...current }
    if (selected.has('aliases')) merged.aliases = [...new Set([
      ...(current.aliases ?? []),
      ...candidate.aliases,
      ...(candidate.name.trim() !== current.name.trim() ? [candidate.name.trim()] : []),
    ].filter(alias => key(alias) !== key(current.name)))]
    if (selected.has('role') && candidate.role) merged.role = candidate.role
    for (const field of TEXT_FIELDS) {
      const value = candidate.fields[field]
      if (selected.has(field) && value) merged[field] = value
    }
    if (selected.has('currentState') && candidate.currentState) {
      merged.currentState = {
        ...(current.currentState ?? {
          location: '', powerLevel: '', physicalState: '', mentalState: '',
          keyItems: '', recentEvents: '', updatedAtChapter: 0,
        }),
        ...candidate.currentState,
        provenance: candidateStateProvenance(candidate),
      }
    }
    if (selected.has('relationships') && candidate.relationships?.length) merged.relationships = [...merged.relationships, ...candidate.relationships]
    entries[index] = merged
  }

  const names = new Set(entries.map(entry => entry.name))
  return entries.map(entry => ({
    ...entry,
    relationships: (entry.relationships ?? []).filter(relationship => (
      names.has(relationship.target) && relationship.target !== entry.name
    )).filter((relationship, index, relationships) => (
      relationships.findIndex(item => item.target === relationship.target && item.relation === relationship.relation && item.direction === relationship.direction) === index
    )),
  }))
}
