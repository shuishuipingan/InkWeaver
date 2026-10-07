/**
 * 手工保存路径不得丢掉多面关系。
 *
 * 角色卡的 relationships 是一段持久化 JSON：编辑器读它、保存时再写回。
 * card ↔ entry 的转换如果是逐字段白名单，facets 会在**手工保存**这一侧丢失，
 * 与主进程 normalizeRelationships 的丢点是同一模式的另一处。
 */
import { describe, expect, it } from 'vitest'

import { characterCardFromRosterEntry, characterRosterEntryFromCard } from '../character-roster-client'

// 渲染层测试不跨层导入 electron 的类型声明，直接复用公开函数的参数类型。
type CardLike = Parameters<typeof characterRosterEntryFromCard>[0]

function card(relationships: string): CardLike {
  return {
    name: '林舟',
    role: 'protagonist',
    gender: '男',
    age: '十八岁',
    appearance: '灰袍少年',
    personality: '克制',
    background: '铁砧镇学徒',
    abilities: '锻造',
    motivation: '守住家人',
    relationships,
    arc: '从学徒成长为守护者',
    notes: '',
  }
}

describe('手工保存的多面关系往返', () => {
  it('keeps facets in both directions of the card ↔ entry conversion', () => {
    const persisted = JSON.stringify([
      { target: '苏绾', relation: '师徒', facets: [{ kind: 'stance', text: '敬而远之' }] },
    ])

    const entry = characterRosterEntryFromCard(card(persisted))
    expect(entry.relationships[0]?.facets).toEqual([{ kind: 'stance', text: '敬而远之' }])

    const back = characterCardFromRosterEntry(entry)
    expect(JSON.parse(back.relationships)[0].facets).toEqual([{ kind: 'stance', text: '敬而远之' }])
  })

  it('drops only the invalid facets, keeping the valid ones', () => {
    const persisted = JSON.stringify([{
      target: '苏绾',
      relation: '师徒',
      facets: [
        { kind: 'bogus', text: '未知维度' },
        { kind: 'emotion', text: '有效维度' },
      ],
    }])

    expect(characterRosterEntryFromCard(card(persisted)).relationships[0]?.facets)
      .toEqual([{ kind: 'emotion', text: '有效维度' }])
  })

  it('leaves old cards without facets byte-shape untouched', () => {
    const persisted = JSON.stringify([{ target: '苏绾', relation: '师徒' }])
    const entry = characterRosterEntryFromCard(card(persisted))
    expect(entry.relationships[0]).not.toHaveProperty('facets')
  })
})
