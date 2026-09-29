import { describe, expect, it } from 'vitest'
import { CharacterRenameLengthError, bindCharacterRenameBatchSlots, chunkCharacterRenameRoster, findQuoteWrappedNameCollisions, generateUniqueCharacterRenameBatch, validateCharacterRenameBatch } from '../character-rename-batches'

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

  it('matches source names after trimming incidental model whitespace', () => {
    const expected = ['沈笑笑', '任双']

    expect(validateCharacterRenameBatch(expected, [
      { from: ' 沈笑笑 ', to: '顾长宁', reason: '' },
      { from: '\n任双\t', to: '温照野', reason: '' },
    ], new Set(expected)).map(row => row.from)).toEqual(expected)
  })

  it('matches a uniquely quoted source echo but rejects ambiguous quote aliases', () => {
    expect(validateCharacterRenameBatch(['“云花”'], [
      { from: '云花', to: '谢临川', reason: '' },
    ], new Set(['“云花”'])).map(row => row.from)).toEqual(['“云花”'])

    expect(() => validateCharacterRenameBatch(['云花', '“云花”'], [
      { from: '云花', to: '谢临川', reason: '' },
      { from: '云花', to: '顾星野', reason: '' },
    ], new Set(['云花', '“云花”']))).toThrow(/未知或重复的原名/u)
  })

  it('binds response rows by stable batch slot when quote-wrapped names are ambiguous', () => {
    const roster = [{ name: '沈笑笑' }, { name: '"沈笑笑"' }, { name: '“云花”' }]
    const rows = bindCharacterRenameBatchSlots(roster, [
      { slotId: 'R2', from: '沈笑笑', to: '贺兰清', reason: '' },
      { slotId: 'R1', from: '沈笑笑', to: '云知微', reason: '' },
      { slotId: 'R3', from: '云花', to: '谢临川', reason: '' },
    ])

    expect(rows.map(row => row.from)).toEqual(['沈笑笑', '"沈笑笑"', '“云花”'])
    expect(rows.map(row => row.to)).toEqual(['云知微', '贺兰清', '谢临川'])
  })

  it('uses stable slots before validating model rows with aliased original names', async () => {
    const roster = [{ name: '沈笑笑' }, { name: '"沈笑笑"' }]
    const rows = await generateUniqueCharacterRenameBatch(
      roster,
      new Set(roster.map(character => character.name)),
      new Set(),
      async () => [
        { slotId: 'R2', from: '沈笑笑', to: '贺兰清', reason: '' },
        { slotId: 'R1', from: '沈笑笑', to: '云知微', reason: '' },
      ],
    )

    expect(rows.map(row => row.from)).toEqual(['沈笑笑', '"沈笑笑"'])
    expect(rows.map(row => row.to)).toEqual(['云知微', '贺兰清'])
  })

  it('rejects unknown, duplicate, or incomplete stable batch slots', () => {
    const roster = [{ name: '甲' }, { name: '乙' }]
    expect(() => bindCharacterRenameBatchSlots(roster, [
      { slotId: 'R1', from: '甲', to: '丙', reason: '' },
      { slotId: 'R3', from: '乙', to: '丁', reason: '' },
    ])).toThrow(/未知/u)
    expect(() => bindCharacterRenameBatchSlots(roster, [
      { slotId: 'R1', from: '甲', to: '丙', reason: '' },
      { slotId: 'R1', from: '乙', to: '丁', reason: '' },
    ])).toThrow(/重复/u)
    expect(() => bindCharacterRenameBatchSlots(roster, [
      { slotId: 'R1', from: '甲', to: '丙', reason: '' },
    ])).toThrow(/缺少/u)
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
