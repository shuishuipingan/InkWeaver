import { describe, expect, it } from 'vitest'

import {
  applyCharacterRenameBatch,
  renameCharacterCardsSimultaneously,
} from '../character-rename-ledger'

const persisted = (...names: string[]) => new Set(names)

describe('character rename batch ledger', () => {
  it('keeps an exchange rename instead of cancelling it as a rename-back', () => {
    const next = applyCharacterRenameBatch(
      [],
      [{ originalName: '林舟', newName: '苏绾' }, { originalName: '苏绾', newName: '林舟' }],
      persisted('林舟', '苏绾'),
    )
    expect(next).toEqual([
      { originalName: '林舟', newName: '苏绾' },
      { originalName: '苏绾', newName: '林舟' },
    ])
  })

  it('chains a new target onto the original identity and drops the superseded row', () => {
    const next = applyCharacterRenameBatch(
      [{ originalName: '林舟', newName: '陆舟' }],
      [{ originalName: '陆舟', newName: '沈砚' }],
      persisted('林舟', '苏绾'),
    )
    expect(next).toEqual([{ originalName: '林舟', newName: '沈砚' }])
  })

  it('drops a chained rename that returns the character to its persisted name', () => {
    const next = applyCharacterRenameBatch(
      [{ originalName: '林舟', newName: '陆舟' }],
      [{ originalName: '陆舟', newName: '林舟' }],
      persisted('林舟'),
    )
    expect(next).toEqual([])
  })

  it('keeps unrelated existing renames and ignores unknown or unchanged rows', () => {
    const next = applyCharacterRenameBatch(
      [{ originalName: '苏绾', newName: '沈绾' }],
      [
        { originalName: '林舟', newName: '陆舟' },
        { originalName: '陆舟', newName: '陆舟' },
        { originalName: '陌生人', newName: '某人' },
      ],
      persisted('林舟', '苏绾'),
    )
    expect(next).toEqual([
      { originalName: '苏绾', newName: '沈绾' },
      { originalName: '林舟', newName: '陆舟' },
    ])
  })

  it('renames every card in one pass so exchanges never collide', () => {
    const characters = [{ name: '林舟', notes: '甲' }, { name: '苏绾', notes: '乙' }, { name: '顾岩', notes: '丙' }]
    expect(renameCharacterCardsSimultaneously(characters, [
      { originalName: '林舟', newName: '苏绾' },
      { originalName: '苏绾', newName: '林舟' },
    ])).toEqual([
      { name: '苏绾', notes: '甲' },
      { name: '林舟', notes: '乙' },
      { name: '顾岩', notes: '丙' },
    ])
    expect(renameCharacterCardsSimultaneously(characters, [])).toEqual(characters)
  })
})
