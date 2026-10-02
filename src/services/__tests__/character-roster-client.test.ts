import { describe, expect, it } from 'vitest'

import { characterCardFromRosterEntry, characterRosterEntryFromCard } from '../character-roster-client'
import type { CharacterData } from '../../../electron/repositories/character-repository'

const card = (overrides: Partial<CharacterData> = {}): CharacterData => ({
  name: '陆舟',
  role: 'protagonist',
  gender: '男',
  age: '十八',
  appearance: '灰袍',
  personality: '克制',
  background: '铁砧镇学徒',
  abilities: '锻造',
  motivation: '守住家人',
  relationships: '',
  arc: '成长',
  notes: '',
  ...overrides,
})

describe('character roster card mapping', () => {
  it('keeps relationship direction, source chapter, and evidence across a manual save', () => {
    const entry = characterRosterEntryFromCard(card({
      relationships: JSON.stringify([{
        target: '沈绾',
        relation: '师徒',
        direction: 'outgoing',
        sourceChapter: 3,
        evidence: '沈绾收陆舟为徒',
      }]),
    }))

    expect(entry.relationships).toEqual([{
      target: '沈绾',
      relation: '师徒',
      direction: 'outgoing',
      sourceChapter: 3,
      evidence: '沈绾收陆舟为徒',
    }])
    expect(characterCardFromRosterEntry(entry)).toMatchObject({
      relationships: expect.stringContaining('"sourceChapter":3'),
    })
  })

  it('still rejects malformed structured relationships and preserves free-text legacy notes', () => {
    expect(characterRosterEntryFromCard(card({
      relationships: JSON.stringify([{ target: '沈绾' }]),
    }))).toMatchObject({ relationships: [], legacyRelationshipNotes: expect.stringContaining('target') })

    expect(characterRosterEntryFromCard(card({ relationships: '沈绾：师徒' })))
      .toMatchObject({ relationships: [], legacyRelationshipNotes: '沈绾：师徒' })
  })
})
