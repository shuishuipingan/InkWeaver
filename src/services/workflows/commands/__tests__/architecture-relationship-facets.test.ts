import { describe, expect, it } from 'vitest'

import { characterArchitecturePrompts } from '../../../prompt-language'
import { decodeCharacterIdentityManifest } from '../architecture.command'
import { StructuredContractDiagnostic } from '../../../../shared/structured-contract-diagnostic'

function slot(overrides: Record<string, unknown> = {}) {
  return {
    slotId: 's1',
    name: '沈瑶光',
    role: 'protagonist',
    narrativeDuty: '主线推动者',
    relations: [{ targetSlotId: 's2', relation: '师妹' }],
    ...overrides,
  }
}

function slot2(overrides: Record<string, unknown> = {}) {
  return {
    slotId: 's2',
    name: '鹿鸣',
    role: 'supporting',
    narrativeDuty: '镜像与牵制',
    relations: [{ targetSlotId: 's1', relation: '师姐' }],
    ...overrides,
  }
}

function slot3(overrides: Record<string, unknown> = {}) {
  return {
    slotId: 's3',
    name: '温辞',
    role: 'minor',
    narrativeDuty: '信息与代价的传递者',
    relations: [{ targetSlotId: 's1', relation: '同门' }],
    ...overrides,
  }
}

function decode(slots: unknown[]) {
  return decodeCharacterIdentityManifest(JSON.stringify({ slots }))
}

describe('character identity manifest multi-facet relationships', () => {
  it('keeps legacy manifests without facets working unchanged', () => {
    const decoded = decode([slot(), slot2(), slot3()])
    expect(decoded).toHaveLength(3)
    expect(decoded[0]!.relations[0]).toEqual({ targetSlotId: 's2', relation: '师妹' })
    expect(decoded[0]!.factionEdges).toBeUndefined()
    expect('facets' in decoded[0]!.relations[0]!).toBe(false)
  })

  it('decodes facets and faction edges when the model provides them', () => {
    const decoded = decode([
      slot({
        relations: [{
          targetSlotId: 's2',
          relation: '师妹',
          facets: [
            { kind: 'stance', text: '名义同门，实为彼此钳制' },
            { kind: 'emotion', text: '上一世目睹其死亡，愧疚未消' },
          ],
        }],
        factionEdges: [{ faction: '仙盟', stance: '名义归属，暗中怀疑' }],
      }),
      slot2(),
      slot3(),
    ])
    expect(decoded[0]!.relations[0]!.facets).toEqual([
      { kind: 'stance', text: '名义同门，实为彼此钳制' },
      { kind: 'emotion', text: '上一世目睹其死亡，愧疚未消' },
    ])
    expect(decoded[0]!.factionEdges).toEqual([{ faction: '仙盟', stance: '名义归属，暗中怀疑' }])
  })

  it('rejects an unknown facet kind with a locatable diagnostic', () => {
    expect(() => decode([
      slot({ relations: [{ targetSlotId: 's2', relation: '师妹', facets: [{ kind: 'vibes', text: 'x' }] }] }),
      slot2(),
      slot3(),
    ])).toThrowError(StructuredContractDiagnostic)
    try {
      decode([slot({ relations: [{ targetSlotId: 's2', relation: '师妹', facets: [{ kind: 'vibes', text: 'x' }] }] }), slot2(), slot3()])
    } catch (error) {
      const diagnostic = error as StructuredContractDiagnostic
      expect(diagnostic.code).toBe('invalid_value')
      expect(diagnostic.path).toBe('slots[0].relations[0].facets[0].kind')
    }
  })

  it('rejects a duplicated relationship target with a locatable diagnostic', () => {
    const input = [
      slot({ relations: [
        { targetSlotId: 's2', relation: '师妹' },
        { targetSlotId: 's2', relation: '宿敌' },
      ] }),
      slot2(),
      slot3(),
    ]
    expect(() => decode(input)).toThrowError(StructuredContractDiagnostic)
    try {
      decode(input)
    } catch (error) {
      const diagnostic = error as StructuredContractDiagnostic
      expect(diagnostic.code).toBe('duplicate_item')
      expect(diagnostic.path).toBe('slots[0].relations[1].targetSlotId')
    }
  })

  it('rejects a duplicated facet kind inside one relationship', () => {
    const input = [
      slot({ relations: [{
        targetSlotId: 's2',
        relation: '师妹',
        facets: [
          { kind: 'stance', text: '名义同门' },
          { kind: 'stance', text: '实为钳制' },
        ],
      }] }),
      slot2(),
      slot3(),
    ]
    expect(() => decode(input)).toThrowError(StructuredContractDiagnostic)
    try {
      decode(input)
    } catch (error) {
      const diagnostic = error as StructuredContractDiagnostic
      expect(diagnostic.code).toBe('duplicate_item')
      expect(diagnostic.path).toBe('slots[0].relations[0].facets[1].kind')
    }
  })

  it('rejects malformed facet containers and empty facet text', () => {
    expect(() => decode([
      slot({ relations: [{ targetSlotId: 's2', relation: '师妹', facets: '立场' }] }),
      slot2(),
      slot3(),
    ])).toThrowError(StructuredContractDiagnostic)
    expect(() => decode([
      slot({ relations: [{ targetSlotId: 's2', relation: '师妹', facets: [{ kind: 'stance', text: '   ' }] }] }),
      slot2(),
      slot3(),
    ])).toThrowError(StructuredContractDiagnostic)
  })

  it('requires faction and stance to be non-empty when factionEdges is present', () => {
    expect(() => decode([slot({ factionEdges: [{ faction: '', stance: 'x' }] }), slot2(), slot3()])).toThrowError(StructuredContractDiagnostic)
    expect(() => decode([slot({ factionEdges: [{ faction: '仙盟' }] }), slot2(), slot3()])).toThrowError(StructuredContractDiagnostic)
    // 空数组按「没有」处理，不产生字段。
    const decoded = decode([slot({ factionEdges: [] }), slot2(), slot3()])
    expect(decoded[0]!.factionEdges).toBeUndefined()
  })

  it('asks the model for multi-dimensional relationships and factions in both languages', () => {
    const zh = characterArchitecturePrompts('zh-CN').manifestTask('上下文', 3, 8)
    expect(zh).toContain('关系不是一句话，是多个维度')
    expect(zh).toContain('2–4 条 facets')
    for (const kind of ['stance', 'emotion', 'dependency', 'knowledge', 'history']) {
      expect(zh).toContain(kind)
    }
    expect(zh).toContain('factionEdges')
    expect(zh).toContain('待确认')

    const en = characterArchitecturePrompts('en-US').manifestTask('context', 3, 8)
    expect(en).toContain('A relationship is not one sentence but several dimensions')
    expect(en).toContain('2–4 facets')
    expect(en).toContain('factionEdges')
    for (const kind of ['stance', 'emotion', 'dependency', 'knowledge', 'history']) {
      expect(en).toContain(kind)
    }
  })
})
