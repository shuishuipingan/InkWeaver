import { describe, expect, it } from 'vitest'

import { decodeCharacterIdentityManifest } from '../architecture.command'
import { StructuredContractDiagnostic } from '../../../../shared/structured-contract-diagnostic'

function slot(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    slotId: id,
    name,
    role: id === 's1' ? 'protagonist' : 'supporting',
    narrativeDuty: '职责',
    relations: [],
    ...overrides,
  }
}

function decode(names: string[][]) {
  return decodeCharacterIdentityManifest(JSON.stringify({
    slots: names.map(([id, name]) => slot(id!, name!)),
  }))
}

describe('character manifest name guard', () => {
  it('rejects a slot whose name merges several characters, with a precise path', () => {
    const input = [['s1', '沈瑶光、鹿鸣、谢无尘'], ['s2', '鹿鸣'], ['s3', '苏倦']]
    expect(() => decode(input)).toThrowError(StructuredContractDiagnostic)
    try {
      decode(input)
    } catch (error) {
      const diagnostic = error as StructuredContractDiagnostic
      expect(diagnostic.code).toBe('invalid_value')
      expect(diagnostic.path).toBe('slots[0].name')
    }
  })

  it('rejects comma joined and 甲和乙 names too', () => {
    expect(() => decode([['s1', '沈瑶光，鹿鸣'], ['s2', '谢无尘'], ['s3', '苏倦']])).toThrowError(StructuredContractDiagnostic)
    expect(() => decode([['s1', '沈瑶光与林雪'], ['s2', '谢无尘'], ['s3', '苏倦']])).toThrowError(StructuredContractDiagnostic)
  })

  it('keeps legitimate single names untouched', () => {
    const decoded = decode([['s1', '苏倦'], ['s2', '萧十一郎'], ['s3', '阿·喀琉斯']])
    expect(decoded.map(entry => entry.name)).toEqual(['苏倦', '萧十一郎', '阿·喀琉斯'])
  })

  it('still asks the model to split merged names in both languages', async () => {
    const { characterArchitecturePrompts } = await import('../../../prompt-language')
    const zh = characterArchitecturePrompts('zh-CN').manifestTask('上下文', 3, 8)
    expect(zh).toContain('name 必须是单个角色的名字')
    expect(zh).toContain('必须拆成多个 slot')
    const en = characterArchitecturePrompts('en-US').manifestTask('context', 3, 8)
    expect(en).toContain('Each name must be a single character')
    expect(en).toContain('split them into separate slots')
  })
})
