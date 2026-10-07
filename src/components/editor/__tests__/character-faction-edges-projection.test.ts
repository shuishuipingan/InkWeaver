import { describe, expect, it } from 'vitest'

import type { CharacterData } from '../../../../electron/repositories/character-repository'
import type { CharacterRosterEntry } from '../../../shared/character-roster'
import { characterCardFromRosterEntry, characterRosterEntryFromCard } from '../../../services/character-roster-client'

/**
 * renderer 侧 card ↔ entry 投射的往返护栏（task-91 的第六处白名单投射）。
 *
 * 放在 editor/__tests__ 下的原因：被测函数在 services，但本卡的 write scope 是 editor/；
 * 这条断言是「势力立场在角色卡可见可编辑」的一部分（保存路径就是 card → entry），
 * 所以与它的 UI 测试放在一起，而不是拆到 services 目录另开一处。
 */
function card(overrides: Partial<CharacterData> = {}): CharacterData {
  return {
    name: '沈瑶光',
    role: 'protagonist',
    gender: '女',
    age: '19',
    appearance: '素白衣裙',
    personality: '克制',
    background: '药庐长大',
    abilities: '辨药',
    motivation: '查清旧案',
    relationships: '',
    arc: '从回避到承担',
    notes: '',
    ...overrides,
  }
}

describe('character card to roster entry projection keeps faction edges', () => {
  it('round-trips multiple faction edges including the optional detail', () => {
    const original = card({
      factionEdges: [
        { faction: '仙盟', stance: '名义归属，暗中怀疑' },
        { faction: '太虚宫', stance: '幼年受教', text: '师承来自太虚宫外门' },
        { faction: '魔庭', stance: '' },
      ],
    })

    const entry = characterRosterEntryFromCard(original)
    expect(entry.factionEdges).toEqual(original.factionEdges)

    const back = characterCardFromRosterEntry(entry)
    expect(back.factionEdges).toEqual(original.factionEdges)
  })

  it('does not invent the field for legacy cards without faction edges', () => {
    const entry = characterRosterEntryFromCard(card())
    expect('factionEdges' in entry).toBe(false)

    const entryWithoutField = { ...entry } as CharacterRosterEntry
    const back = characterCardFromRosterEntry(entryWithoutField)
    expect('factionEdges' in back).toBe(false)
  })

  it('treats an empty list as no faction edges on both directions', () => {
    const entry = characterRosterEntryFromCard(card({ factionEdges: [] }))
    expect('factionEdges' in entry).toBe(false)

    const back = characterCardFromRosterEntry({ ...entry, factionEdges: [] } as CharacterRosterEntry)
    expect('factionEdges' in back).toBe(false)
  })
})
