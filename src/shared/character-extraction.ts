import type { CharacterRosterRole } from './character-roster'

export type CharacterExtractionSourceKind = 'selection' | 'chapter' | 'chapter-range' | 'import'
export type CharacterExtractionDisposition = 'new' | 'update' | 'ambiguous'
export type CharacterExtractionCandidateStatus = 'pending' | 'accepted' | 'rejected' | 'stale'

export interface CharacterExtractionSource {
  sourceId: string
  sourceHash: string
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
