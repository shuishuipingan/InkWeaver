import { describe, expect, it } from 'vitest'
import { CharacterRenameLengthError, chunkCharacterRenameRoster, findQuoteWrappedNameCollisions, generateUniqueCharacterRenameBatch, validateCharacterRenameBatch } from '../character-rename-batches'

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

  it('regenerates only the conflicting batch with accepted names forbidden', async () => {
    const calls: string[][] = []
    const rows = await generateUniqueCharacterRenameBatch(
      [{ name: '甲' }, { name: '乙' }],
      new Set(['甲', '乙']),
      new Set(['新甲']),
      async (_batch, forbidden) => {
        calls.push([...forbidden])
        return calls.length === 1
          ? [{ from: '甲', to: '新甲', reason: '' }, { from: '乙', to: '新甲', reason: '' }]
          : [{ from: '甲', to: '新乙', reason: '' }, { from: '乙', to: '新丙', reason: '' }]
      },
    )
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('新甲')
    expect(rows.map(row => row.to)).toEqual(['新乙', '新丙'])
  })

  it('splits a truncated batch and reserves names from its first half', async () => {
    const observed: string[][] = []
    const rows = await generateUniqueCharacterRenameBatch(
      [{ name: '甲' }, { name: '乙' }], new Set(['甲', '乙']), new Set(),
      async (batch, forbidden) => {
        if (batch.length === 2) throw new CharacterRenameLengthError('length')
        observed.push([...forbidden])
        return [{ from: batch[0].name, to: batch[0].name === '甲' ? '新甲' : '新乙', reason: '' }]
      },
    )
    expect(rows.map(row => row.to)).toEqual(['新甲', '新乙'])
    expect(observed[1]).toContain('新甲')
  })

  it('flags quote-wrapped aliases that duplicate another character card', () => {
    expect(findQuoteWrappedNameCollisions(['沈笑笑', '"沈笑笑"', '云花', '“云花”', '任双']))
      .toEqual(['"沈笑笑"', '“云花”'])
  })
})
