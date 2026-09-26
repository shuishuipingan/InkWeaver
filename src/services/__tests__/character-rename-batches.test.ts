import { describe, expect, it } from 'vitest'
import { chunkCharacterRenameRoster, validateCharacterRenameBatch } from '../character-rename-batches'

describe('character rename batches', () => {
  it('includes every character beyond the former 40-character cutoff', () => {
    const roster = Array.from({ length: 43 }, (_, index) => `角色${index + 1}`)
    expect(chunkCharacterRenameRoster(roster).flat()).toEqual(roster)
    expect(chunkCharacterRenameRoster(roster).every(batch => batch.length <= 8)).toBe(true)
  })

  it('rejects incomplete and colliding mappings before any rename is applied', () => {
    const expected = ['甲', '乙']
    expect(() => validateCharacterRenameBatch(expected, [{ from: '甲', to: '丙', reason: '' }], new Set(expected)))
      .toThrow(/缺少/)
    expect(() => validateCharacterRenameBatch(expected, [
      { from: '甲', to: '丙', reason: '' }, { from: '乙', to: '丙', reason: '' },
    ], new Set(expected))).toThrow(/重复/)
  })
})
