import { replaceCharacterNamesSimultaneously } from './character-rename-references'

export interface StoryDirectionTerminologyReplacement {
  from: string
  to: string
}

const EXPLICIT_REPLACEMENT_PATTERN = /["“「『]?([\p{L}\p{N}·_-]{1,80})["”」』]?\s*(?:替换成|替换为|换成|换为|改成|改为|变成|→|->|=>)\s*["“「『]?([\p{L}\p{N}·_-]{1,80})["”」』]?/gu

function replacementFromRecord(value: Record<string, unknown>): StoryDirectionTerminologyReplacement | undefined {
  const from = value.from ?? value.source ?? value.originalName
  const to = value.to ?? value.target ?? value.newName
  return typeof from === 'string' && typeof to === 'string' ? { from, to } : undefined
}

export function normalizeTerminologyReplacements(value: unknown): StoryDirectionTerminologyReplacement[] {
  if (typeof value === 'string') return parseExplicitTerminologyReplacements(value)
  let pairs: StoryDirectionTerminologyReplacement[]
  if (Array.isArray(value)) {
    pairs = value.flatMap(item => (
      item && typeof item === 'object' && !Array.isArray(item)
        ? [replacementFromRecord(item as Record<string, unknown>)].filter((pair): pair is StoryDirectionTerminologyReplacement => Boolean(pair))
        : []
    ))
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entryPair = replacementFromRecord(record)
    pairs = entryPair
      ? [entryPair]
      : Object.entries(record).flatMap(([from, to]) => typeof to === 'string' ? [{ from, to }] : [])
  } else {
    return []
  }
  return validateReplacements(pairs)
}

export function parseExplicitTerminologyReplacements(text: string): StoryDirectionTerminologyReplacement[] {
  const pairs: StoryDirectionTerminologyReplacement[] = []
  for (const match of text.matchAll(EXPLICIT_REPLACEMENT_PATTERN)) {
    pairs.push({ from: match[1]!, to: match[2]! })
  }
  return validateReplacements(pairs)
}

function validateReplacements(
  pairs: readonly StoryDirectionTerminologyReplacement[],
): StoryDirectionTerminologyReplacement[] {
  const normalized = pairs.map(pair => ({ from: pair.from.trim(), to: pair.to.trim() }))
    .filter(pair => pair.from && pair.to && pair.from !== pair.to)
  if (normalized.length > 100) throw new Error('术语替换数量无效')
  if (normalized.some(pair => Array.from(pair.from).length > 80 || Array.from(pair.to).length > 80)) {
    throw new Error('术语替换名称超过长度限制')
  }
  if (
    new Set(normalized.map(pair => pair.from)).size !== normalized.length
    || new Set(normalized.map(pair => pair.to)).size !== normalized.length
  ) {
    throw new Error('术语替换存在重复的原名或新名')
  }
  return normalized
}

export function replaceTerminologyText(
  text: string,
  replacements: readonly StoryDirectionTerminologyReplacement[],
  protectedNames: readonly string[] = [],
): string {
  return replaceCharacterNamesSimultaneously(text, replacements.map(({ from, to }) => ({
    originalName: from,
    newName: to,
  })), protectedNames)
}

export function replaceTerminologyNameArray(
  names: readonly string[],
  replacements: readonly StoryDirectionTerminologyReplacement[],
): string[] {
  const byName = new Map(replacements.map(({ from, to }) => [from, to]))
  return names.map(name => byName.get(name) ?? name)
}
