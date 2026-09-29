export interface CharacterRenameRow {
  from: string
  to: string
  reason: string
  /** Stable one-based slot within the current request batch. */
  slotId?: string
}

function unquoteCharacterName(name: string): string {
  const trimmed = name.trim()
  const quotePairs: ReadonlyArray<readonly [string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
    ['「', '」'],
    ['『', '』'],
    ['《', '》'],
    ['〈', '〉'],
  ]
  const pair = quotePairs.find(([open, close]) => (
    trimmed.startsWith(open) && trimmed.endsWith(close) && trimmed.length > open.length + close.length
  ))
  return pair ? trimmed.slice(pair[0].length, -pair[1].length).trim() : trimmed
}

export class CharacterRenameLengthError extends Error {}

/** Diagnostic only: never silently merges persisted character cards. */
export function findQuoteWrappedNameCollisions(names: string[]): string[] {
  const existing = new Set(names.map(name => name.trim()))
  return names.filter(name => {
    const trimmed = name.trim()
    const unquoted = trimmed.replace(/^["“‘]/u, '').replace(/["”’]$/u, '')
    return unquoted !== trimmed && existing.has(unquoted)
  })
}

export function chunkCharacterRenameRoster<T>(roster: T[], size = 8): T[][] {
  const batches: T[][] = []
  for (let offset = 0; offset < roster.length; offset += size) {
    batches.push(roster.slice(offset, offset + size))
  }
  return batches
}

/**
 * Bind model rows to the exact roster entries named by their batch-local IDs.
 * Names may be quoted, repeated as aliases, or echoed with incidental spacing;
 * stable slots prevent those display strings from changing a source identity.
 * Legacy responses without slot IDs remain supported and are validated by name.
 */
export function bindCharacterRenameBatchSlots<T extends { name: string }>(
  roster: T[],
  rows: CharacterRenameRow[],
): CharacterRenameRow[] {
  const hasSlotIds = rows.some(row => typeof row.slotId === 'string' && row.slotId.trim().length > 0)
  if (!hasSlotIds) return rows

  const expectedSlots = new Map(roster.map((character, index) => [`R${index + 1}`, character.name]))
  const rowsBySlot = new Map<string, CharacterRenameRow>()
  for (const row of rows) {
    const slotId = row.slotId?.trim().toUpperCase() ?? ''
    if (!slotId) throw new Error('AI 返回的角色编号不完整')
    const sourceName = expectedSlots.get(slotId)
    if (!sourceName) throw new Error('AI 返回了未知的角色编号')
    if (rowsBySlot.has(slotId)) throw new Error('AI 返回了重复的角色编号')
    rowsBySlot.set(slotId, { ...row, from: sourceName, slotId })
  }

  if (rowsBySlot.size !== roster.length) throw new Error('AI 改名映射缺少角色编号，请重试')
  return roster.map((_, index) => rowsBySlot.get(`R${index + 1}`)!)
}

export function validateCharacterRenameBatch(
  expectedNames: string[],
  rows: CharacterRenameRow[],
  originalNames: Set<string>,
  reservedNames = new Set<string>(),
): CharacterRenameRow[] {
  const expected = new Set(expectedNames)
  if (expected.size !== expectedNames.length) throw new Error('原名存在重复角色卡，无法安全改名')
  const bySource = new Map<string, CharacterRenameRow>()
  const targets = new Set(reservedNames)
  for (const row of rows) {
    const exactSource = expected.has(row.from) ? row.from : undefined
    const trimmedSource = row.from.trim()
    const trimmedCandidates = expectedNames.filter(name => (
      !bySource.has(name) && name.trim() === trimmedSource
    ))
    const unquotedSource = unquoteCharacterName(trimmedSource)
    const unquotedCandidates = expectedNames.filter(name => (
      unquoteCharacterName(name) === unquotedSource
    ))
    const source = exactSource && !bySource.has(exactSource)
      ? exactSource
      : trimmedCandidates.length === 1
        ? trimmedCandidates[0]
        : unquotedCandidates.length === 1 && !bySource.has(unquotedCandidates[0]!)
          ? unquotedCandidates[0]
          : undefined
    if (!source || bySource.has(source)) throw new Error('AI 返回了未知或重复的原名')
    const target = row.to.trim()
    if (!target || originalNames.has(target)) throw new Error('AI 返回了空名字或已存在的角色名')
    if (targets.has(target)) throw new Error('AI 返回了重复的新角色名')
    targets.add(target)
    bySource.set(source, { ...row, from: source, to: target })
  }
  if (bySource.size !== expected.size) throw new Error('AI 改名映射缺少角色，请重试')
  return expectedNames.map(name => bySource.get(name)!)
}

/** Retry a rejected mapping without repeating batches already accepted by the caller. */
export async function generateUniqueCharacterRenameBatch<T extends { name: string }>(
  batch: T[],
  originalNames: Set<string>,
  reservedNames: Set<string>,
  request: (characters: T[], forbiddenNames: Set<string>) => Promise<CharacterRenameRow[]>,
): Promise<CharacterRenameRow[]> {
  const batchNames = batch.map(character => character.name)
  if (new Set(batchNames).size !== batchNames.length) {
    throw new Error('当前批次包含重名角色卡，请先修正重名后再改名')
  }

  const split = async (characters: T[], forbidden: Set<string>): Promise<CharacterRenameRow[]> => {
    if (characters.length < 2) throw new Error('单个角色的改名映射仍不完整，请稍后重试')
    const middle = Math.ceil(characters.length / 2)
    const first = await generateUniqueCharacterRenameBatch(characters.slice(0, middle), originalNames, forbidden, request)
    const second = await generateUniqueCharacterRenameBatch(
      characters.slice(middle), originalNames,
      new Set([...forbidden, ...first.map(row => row.to)]), request,
    )
    return [...first, ...second]
  }

  let forbidden = new Set(reservedNames)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let candidates: CharacterRenameRow[]
    try {
      candidates = bindCharacterRenameBatchSlots(batch, await request(batch, forbidden))
    } catch (error) {
      if (error instanceof CharacterRenameLengthError && batch.length > 1) return split(batch, forbidden)
      throw error
    }
    try {
      return validateCharacterRenameBatch(batch.map(character => character.name), candidates, originalNames, reservedNames)
    } catch (error) {
      if (attempt === 2) {
        if (batch.length > 1) return split(batch, forbidden)
        throw error
      }
      forbidden = new Set([...forbidden, ...candidates.map(row => row.to.trim()).filter(Boolean)])
    }
  }
  throw new Error('AI 改名映射未能通过校验')
}
