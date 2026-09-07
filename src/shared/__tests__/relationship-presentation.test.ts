import { describe, expect, it } from 'vitest'

import {
  formatRelationshipsForEditor,
  parseRelationshipEdges,
  relationshipStorageFromEditor,
} from '../relationship-presentation'

describe('relationship presentation', () => {
  it('renders legacy structured relationships as natural-language editor lines', () => {
    const persisted = JSON.stringify([
      {
        target: '陆云飞',
        relation: '关系类型：竞争对手；矛盾张力：权力斗争；情感连接：无',
      },
    ])

    expect(formatRelationshipsForEditor(persisted)).toBe(
      '陆云飞：竞争对手（权力斗争；情感连接：无）',
    )
  })

  it('retains optional direction and source evidence for graph details', () => {
    const persisted = JSON.stringify([{
      target: '陆云飞',
      relation: '信任',
      direction: 'outgoing',
      sourceChapter: 7,
      evidence: '沈砺把钥匙交给了陆云飞。',
    }])
    expect(parseRelationshipEdges(persisted, { knownNames: ['沈砺', '陆云飞'], selfName: '沈砺' })).toEqual([{
      target: '陆云飞',
      relation: '信任',
      direction: 'outgoing',
      sourceChapter: 7,
      evidence: '沈砺把钥匙交给了陆云飞。',
    }])
  })

  it('keeps same-label relationship evidence from different chapters as history', () => {
    const persisted = JSON.stringify([
      { target: '陆云飞', relation: '信任', sourceChapter: 3, evidence: '第一次交付钥匙。' },
      { target: '陆云飞', relation: '信任', sourceChapter: 9, evidence: '危急时刻替他挡刀。' },
    ])
    expect(parseRelationshipEdges(persisted, { knownNames: ['沈砺', '陆云飞'], selfName: '沈砺' })).toEqual([
      { target: '陆云飞', relation: '信任', sourceChapter: 3, evidence: '第一次交付钥匙。' },
      { target: '陆云飞', relation: '信任', sourceChapter: 9, evidence: '危急时刻替他挡刀。' },
    ])
  })

  it('stores unambiguous natural-language editor lines as graph-readable edges', () => {
    const stored = relationshipStorageFromEditor(
      '陆云飞：竞争对手（权力斗争）\n苏璃：盟友',
      { knownNames: ['沈砺', '陆云飞', '苏璃'], selfName: '沈砺' },
    )

    expect(JSON.parse(stored)).toEqual([
      { target: '陆云飞', relation: '竞争对手（权力斗争）' },
      { target: '苏璃', relation: '盟友' },
    ])
    expect(parseRelationshipEdges(stored, {
      knownNames: ['沈砺', '陆云飞', '苏璃'],
      selfName: '沈砺',
    })).toEqual([
      { target: '陆云飞', relation: '竞争对手（权力斗争）' },
      { target: '苏璃', relation: '盟友' },
    ])
  })

  it('keeps untouched detail fields from legacy structured data while another relation is edited', () => {
    const previousStorage = JSON.stringify([
      {
        target: '陆云飞',
        relation: '关系类型：竞争对手；矛盾张力：权力斗争；情感连接：无',
      },
    ])

    const stored = relationshipStorageFromEditor(
      '陆云飞：竞争对手（权力斗争；情感连接：无）\n苏璃：盟友',
      {
        knownNames: ['沈砺', '陆云飞', '苏璃'],
        selfName: '沈砺',
        previousStorage,
      },
    )

    expect(JSON.parse(stored)).toEqual([
      {
        target: '陆云飞',
        relation: '关系类型：竞争对手；矛盾张力：权力斗争；情感连接：无',
      },
      { target: '苏璃', relation: '盟友' },
    ])
  })

  it('preserves unknown free-form notes byte-for-byte instead of guessing at structure', () => {
    const note = '陆云飞与沈砺表面合作，实际彼此试探。'

    expect(relationshipStorageFromEditor(note, {
      knownNames: ['沈砺', '陆云飞'],
      selfName: '沈砺',
    })).toBe(note)
    expect(formatRelationshipsForEditor(note)).toBe(note)
  })

  it.each([
    '[{"participant":"陆云飞","status":"待确认"}]',
    '{"participant":"陆云飞","status":"待确认"}',
    '[{"target":"陆云飞"}]',
  ])('hides unknown JSON from the editor and never turns it into graph edges', (unknownJson) => {
    const displayed = formatRelationshipsForEditor(unknownJson)
    const englishDisplayed = formatRelationshipsForEditor(unknownJson, { locale: 'en-US' })
    const options = {
      knownNames: ['沈砺', '陆云飞'],
      selfName: '沈砺',
    }

    expect(displayed).not.toBe(unknownJson)
    expect(displayed).not.toContain('[{')
    expect(displayed).not.toContain('{"participant"')
    expect(displayed).toBe('关系数据格式无法识别。请按“角色：关系”逐行重写。')
    expect(englishDisplayed).toBe(
      'Relationship data format is unrecognized. Rewrite one relationship per line as “Character: relationship”.',
    )
    expect(parseRelationshipEdges(unknownJson, options)).toEqual([])
    // 展示层不自动改写持久化数据；用户主动编辑前保留原有值。
    expect(relationshipStorageFromEditor(unknownJson, options)).toBe(unknownJson)
  })
})
