import type { CharacterRosterRelationship, CharacterRosterRole } from './character-roster'

export type CharacterExtractionSourceKind = 'selection' | 'chapter' | 'chapter-range' | 'import'
export type CharacterExtractionDisposition = 'new' | 'update' | 'ambiguous'
export type CharacterExtractionCandidateStatus = 'pending' | 'accepted' | 'rejected' | 'stale' | 'applied'

export interface CharacterExtractionSource {
  sourceId: string
  sourceHash: string
  /** Cryptographic hash of the finalized source when available. */
  contentHash?: string
  kind: CharacterExtractionSourceKind
  chapterNumbers: number[]
}

export interface CharacterFieldEvidence {
  field: string
  value: string
  excerpt: string
  sourceChapter?: number
}

export interface CharacterExtractionCandidate {
  candidateId: string
  source: CharacterExtractionSource
  name: string
  aliases: string[]
  matchedCharacterName?: string
  disposition: CharacterExtractionDisposition
  status: CharacterExtractionCandidateStatus
  role?: CharacterRosterRole
  fields: Partial<Record<'gender' | 'age' | 'appearance' | 'personality' | 'background' | 'abilities' | 'motivation' | 'arc' | 'notes', string>>
  relationships?: CharacterRosterRelationship[]
  currentState?: Partial<Record<'location' | 'powerLevel' | 'physicalState' | 'mentalState' | 'keyItems' | 'recentEvents', string>>
  fieldEvidence: CharacterFieldEvidence[]
}

export interface CharacterExtractionChunk {
  chunkId: string
  sourceId: string
  sourceHash: string
  index: number
  start: number
  end: number
  text: string
}

export interface CharacterExtractionChunkOptions {
  sourceId: string
  kind: CharacterExtractionSourceKind
  chapterNumbers?: readonly number[]
  maxCharacters?: number
  overlapCharacters?: number
}

const CHARACTER_FIELD_KEYS = [
  'gender', 'age', 'appearance', 'personality', 'background',
  'abilities', 'motivation', 'arc', 'notes',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/gu, '').toLocaleLowerCase('en-US')
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseJsonRoot(text: string): unknown {
  const cleaned = text.replace(/```json?\s*/giu, '').replace(/```/gu, '').trim()
  const start = cleaned.search(/[\[{]/u)
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  if (start < 0 || end <= start) throw new Error('人物提取结果不是 JSON')
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown
}

function fieldEvidenceFrom(value: unknown): CharacterFieldEvidence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const field = textValue(item.field)
    const fieldValue = textValue(item.value)
    const excerpt = textValue(item.excerpt)
    if (!field || !fieldValue || !excerpt || excerpt.length > 500) return []
    const sourceChapter = Number.isSafeInteger(item.sourceChapter) ? Number(item.sourceChapter) : undefined
    return [{ field, value: fieldValue, excerpt, ...(sourceChapter ? { sourceChapter } : {}) }]
  })
}

/** Decode one model response; only field values with matching evidence survive. */
export function parseCharacterExtractionResponse(
  text: string,
  source: CharacterExtractionSource,
  existingNames: readonly string[] = [],
): CharacterExtractionCandidate[] {
  const root = parseJsonRoot(text)
  const rawCharacters = isRecord(root) && Array.isArray(root.characters)
    ? root.characters
    : Array.isArray(root) ? root : []
  return rawCharacters.flatMap((raw, index) => {
    if (!isRecord(raw)) return []
    const name = textValue(raw.name)
    const evidence = fieldEvidenceFrom(raw.evidence)
    if (!name || evidence.length === 0) return []
    const aliases = Array.isArray(raw.aliases)
      ? raw.aliases.flatMap(item => textValue(item) ? [textValue(item)!] : [])
      : []
    const rawFields = isRecord(raw.fields) ? raw.fields : raw
    const fields: CharacterExtractionCandidate['fields'] = {}
    for (const field of CHARACTER_FIELD_KEYS) {
      const value = textValue(rawFields[field])
      if (!value) continue
      const supported = evidence.some(item => item.field === field && item.value === value)
      if (supported) fields[field] = value
    }
    const state = isRecord(raw.currentState) ? raw.currentState : undefined
    const currentState: CharacterExtractionCandidate['currentState'] = {}
    if (state) {
      for (const field of ['location', 'powerLevel', 'physicalState', 'mentalState', 'keyItems', 'recentEvents'] as const) {
        const value = textValue(state[field])
        if (value && evidence.some(item => item.field === `currentState.${field}` && item.value === value)) {
          currentState[field] = value
        }
      }
    }
    const role = ['protagonist', 'antagonist', 'supporting', 'minor'].includes(String(raw.role))
      ? raw.role as CharacterRosterRole
      : undefined
    const relationships = Array.isArray(raw.relationships)
      ? raw.relationships.flatMap((item) => {
          if (!isRecord(item)) return []
          const target = textValue(item.target)
          const relation = textValue(item.relation)
          if (!target || !relation) return []
          const evidenceSupported = evidence.some(candidate => (
            (candidate.field === 'relationship' || candidate.field.startsWith('relationship.'))
            && candidate.value.includes(target)
            && candidate.excerpt
          ))
          return evidenceSupported ? [{ target, relation }] : []
        })
      : []
    const matchedIndices = [name, ...aliases].flatMap(item => (
      existingNames.flatMap((existing, existingIndex) => normalizedName(existing) === normalizedName(item) ? [existingIndex] : [])
    ))
    const uniqueMatchedIndices = [...new Set(matchedIndices)]
    const sameNameAmbiguity = uniqueMatchedIndices.length > 1
    const matchedName = uniqueMatchedIndices.length === 1 ? existingNames[uniqueMatchedIndices[0]] : undefined
    return [{
      candidateId: `${source.sourceId}:${source.sourceHash.slice(0, 16)}:${index}:${normalizedName(name)}`,
      source,
      name,
      aliases: [...new Set(aliases.filter(alias => normalizedName(alias) !== normalizedName(name)))],
      ...(matchedName && !sameNameAmbiguity ? { matchedCharacterName: matchedName } : {}),
      disposition: sameNameAmbiguity ? 'ambiguous' : matchedName ? 'update' : 'new',
      status: 'pending',
      ...(role ? { role } : {}),
      fields,
      ...(relationships.length > 0 ? { relationships } : {}),
      ...(Object.keys(currentState).length > 0 ? { currentState } : {}),
      fieldEvidence: evidence,
    }]
  })
}

/** Merge chunk candidates without silently choosing between conflicting values. */
export function mergeCharacterExtractionCandidates(
  candidates: readonly CharacterExtractionCandidate[],
): CharacterExtractionCandidate[] {
  const merged: CharacterExtractionCandidate[] = []
  for (const candidate of candidates) {
    const candidateNames = new Set([candidate.name, ...candidate.aliases].map(normalizedName))
    const existing = merged.find(item => (
      [item.name, ...item.aliases].some(name => candidateNames.has(normalizedName(name)))
    ))
    if (!existing) {
      merged.push({ ...candidate, aliases: [...candidate.aliases] })
      continue
    }
    existing.aliases = [...new Set([...existing.aliases, candidate.name, ...candidate.aliases])]
      .filter(alias => normalizedName(alias) !== normalizedName(existing.name))
    existing.fieldEvidence = [...existing.fieldEvidence, ...candidate.fieldEvidence]
    if (existing.role && candidate.role && existing.role !== candidate.role) existing.disposition = 'ambiguous'
    else if (!existing.role && candidate.role) existing.role = candidate.role
    for (const field of CHARACTER_FIELD_KEYS) {
      const left = existing.fields[field]
      const right = candidate.fields[field]
      if (!left && right) existing.fields[field] = right
      else if (left && right && left !== right) {
        delete existing.fields[field]
        existing.disposition = 'ambiguous'
      }
    }
    if (candidate.currentState) {
      existing.currentState = { ...existing.currentState, ...candidate.currentState }
    }
    if (candidate.relationships && candidate.relationships.length > 0) {
      const relationships = [...(existing.relationships ?? []), ...candidate.relationships]
      existing.relationships = relationships.filter((relationship, index) => (
        relationships.findIndex(item => item.target === relationship.target && item.relation === relationship.relation) === index
      ))
    }
    if (candidate.disposition === 'ambiguous') existing.disposition = 'ambiguous'
  }
  return merged
}

/** Renderer-safe deterministic fingerprint for chunk identity; persistence seams use SHA-256. */
export function textFingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0').repeat(4)
}

function boundaryAtOrBefore(text: string, start: number, preferredEnd: number): number {
  const windowStart = Math.max(start + 1, preferredEnd - 600)
  const boundary = text.lastIndexOf('\n\n', preferredEnd)
  if (boundary >= windowStart) return boundary + 2
  const sentence = Math.max(
    text.lastIndexOf('。', preferredEnd),
    text.lastIndexOf('！', preferredEnd),
    text.lastIndexOf('？', preferredEnd),
    text.lastIndexOf('.', preferredEnd),
    text.lastIndexOf('!', preferredEnd),
    text.lastIndexOf('?', preferredEnd),
  )
  return sentence >= windowStart ? sentence + 1 : preferredEnd
}

export function planCharacterExtractionChunks(
  text: string,
  options: CharacterExtractionChunkOptions,
): CharacterExtractionChunk[] {
  const maxCharacters = Math.trunc(options.maxCharacters ?? 6_000)
  const overlapCharacters = Math.trunc(options.overlapCharacters ?? 500)
  if (!options.sourceId.trim()) throw new Error('人物提取来源 ID 不能为空')
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1_000) {
    throw new Error('人物提取分块上限必须至少为 1000')
  }
  if (!Number.isSafeInteger(overlapCharacters) || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
    throw new Error('人物提取重叠范围无效')
  }
  if (!text.trim()) return []

  const sourceHash = textFingerprint(text)
  const chunks: CharacterExtractionChunk[] = []
  let start = 0
  let index = 0
  while (start < text.length) {
    const preferredEnd = Math.min(text.length, start + maxCharacters)
    const end = preferredEnd === text.length
      ? text.length
      : boundaryAtOrBefore(text, start, preferredEnd)
    if (end <= start) throw new Error('人物提取分块无法前进')
    chunks.push({
      chunkId: `${options.sourceId}:${index}:${sourceHash.slice(0, 12)}`,
      sourceId: options.sourceId,
      sourceHash,
      index,
      start,
      end,
      text: text.slice(start, end),
    })
    if (end === text.length) break
    start = Math.max(start + 1, end - overlapCharacters)
    index += 1
  }
  return chunks
}
