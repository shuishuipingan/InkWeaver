export interface CharacterRenameRow {
  from: string
  to: string
  reason: string
}

export class CharacterRenameLengthError extends Error {}

export function chunkCharacterRenameRoster<T>(roster: T[], size = 8): T[][] {
  const batches: T[][] = []
  for (let offset = 0; offset < roster.length; offset += size) {
    batches.push(roster.slice(offset, offset + size))
  }
  return batches
}

export function validateCharacterRenameBatch(
  expectedNames: string[],
  rows: CharacterRenameRow[],
  originalNames: Set<string>,
  reservedNames = new Set<string>(),
): CharacterRenameRow[] {
  const expected = new Set(expectedNames)
  const bySource = new Map<string, CharacterRenameRow>()
  const targets = new Set(reservedNames)
  for (const row of rows) {
    if (!expected.has(row.from) || bySource.has(row.from)) throw new Error('AI 返回了未知或重复的原名')
    const target = row.to.trim()
    if (!target || originalNames.has(target)) throw new Error('AI 返回了空名字或已存在的角色名')
    if (targets.has(target)) throw new Error('AI 返回了重复的新角色名')
    targets.add(target)
    bySource.set(row.from, { ...row, to: target })
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
      candidates = await request(batch, forbidden)
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
