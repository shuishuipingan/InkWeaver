export interface CharacterRenameRow {
  from: string
  to: string
  reason: string
}

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
