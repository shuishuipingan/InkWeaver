/**
 * task-39 回归：架构链路的解码失败必须是**可定位的结构化诊断**，多候选时必须**择优**。
 *
 * 这两件事决定用户能否看到真实原因，也决定 structured-batch-executor 的语义补全通道
 * 是否会被触发（它只在 structuredContractDiagnostic 非 null 时才构建补全计划）。
 */
import { describe, expect, it } from 'vitest'

import { decodeCharacterIdentityManifest } from '../architecture.command'
import {
  StructuredContractDiagnostic,
  structuredContractDiagnostic,
} from '../../../../shared/structured-contract-diagnostic'
import {
  collectCompleteJsonObjectCandidates,
  decodeJsonObjectCandidate,
} from '../../workflow-utils'

function slot(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slotId: `slot-${index}`,
    name: `角色${index}`,
    role: index === 0 ? 'protagonist' : 'supporting',
    narrativeDuty: `第 ${index} 位角色的叙事职责`,
    relations: [],
    ...overrides,
  }
}

function manifestOf(slots: unknown[]): string {
  return JSON.stringify({ slots })
}

function diagnosticOf(run: () => unknown): StructuredContractDiagnostic {
  try {
    run()
  } catch (error) {
    const diagnostic = structuredContractDiagnostic(error)
    if (!diagnostic) throw new Error(`期望结构化诊断，实际为：${String(error)}`)
    return diagnostic
  }
  throw new Error('期望抛出诊断，但没有抛错')
}

describe('decodeCharacterIdentityManifest：逐个 code 的结构化诊断', () => {
  it('无候选 → invalid_json/$', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest('这里没有任何 JSON 对象'))
    expect(diagnostic.code).toBe('invalid_json')
    expect(diagnostic.path).toBe('$')
  })

  it('legacy entries 信封 → missing_field/slots', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest('{"entries":[]}'))
    expect(diagnostic.code).toBe('missing_field')
    expect(diagnostic.path).toBe('slots')
  })

  it('slot 不是对象 → invalid_type/slots[1]', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(manifestOf([slot(0), 42, slot(2)])))
    expect(diagnostic.code).toBe('invalid_type')
    expect(diagnostic.path).toBe('slots[1]')
  })

  it('role 非法 → invalid_value/slots[1].role', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(
      manifestOf([slot(0), slot(1, { role: 'wizard' }), slot(2)]),
    ))
    expect(diagnostic.code).toBe('invalid_value')
    expect(diagnostic.path).toBe('slots[1].role')
  })

  it('slot 数量越界 → invalid_value/slots', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(manifestOf([slot(0), slot(1)])))
    expect(diagnostic.code).toBe('invalid_value')
    expect(diagnostic.path).toBe('slots')
  })

  it('slotId 重复 → duplicate_item/slots[2].slotId', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(
      manifestOf([slot(0), slot(1), slot(2, { slotId: 'slot-0' })]),
    ))
    expect(diagnostic.code).toBe('duplicate_item')
    expect(diagnostic.path).toBe('slots[2].slotId')
  })

  it('姓名重复 → duplicate_item/slots[2].name', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(
      manifestOf([slot(0), slot(1), slot(2, { name: '角色0' })]),
    ))
    expect(diagnostic.code).toBe('duplicate_item')
    expect(diagnostic.path).toBe('slots[2].name')
  })

  it('主角数量不唯一 → invalid_value/slots', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(
      manifestOf([slot(0), slot(1, { role: 'protagonist' }), slot(2)]),
    ))
    expect(diagnostic.code).toBe('invalid_value')
    expect(diagnostic.path).toBe('slots')
  })

  it('关系自指 → relationship_self_reference/slots[0].relations[0].targetSlotId', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(manifestOf([
      slot(0, { relations: [{ targetSlotId: 'slot-0', relation: '自指' }] }),
      slot(1),
      slot(2),
    ])))
    expect(diagnostic.code).toBe('relationship_self_reference')
    expect(diagnostic.path).toBe('slots[0].relations[0].targetSlotId')
  })

  it('关系端点不存在 → relationship_endpoint_not_in_characters/同名路径', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(manifestOf([
      slot(0, { relations: [{ targetSlotId: 'slot-9', relation: '悬空' }] }),
      slot(1),
      slot(2),
    ])))
    expect(diagnostic.code).toBe('relationship_endpoint_not_in_characters')
    expect(diagnostic.path).toBe('slots[0].relations[0].targetSlotId')
  })

  it('诊断只带 code/path/field，不夹带候选正文', () => {
    const diagnostic = diagnosticOf(() => decodeCharacterIdentityManifest(manifestOf([
      slot(0), slot(1, { role: 'wizard' }), slot(2),
    ])))
    expect(diagnostic.message).toBe('结构化合同诊断 code=invalid_value path=slots[1].role field=role')
  })
})

describe('多候选择优', () => {
  it('reasoning 草稿 + 最终 JSON：选中可解码的那一个', () => {
    const draft = JSON.stringify({ slots: '这是思考中的草稿' })
    const final = manifestOf([slot(0), slot(1), slot(2)])
    const decoded = decodeCharacterIdentityManifest(`先想一下：
${draft}

最终结果：
${final}`)
    expect(decoded.map(entry => entry.slotId)).toEqual(['slot-0', 'slot-1', 'slot-2'])
  })

  it('完整对象之后的未闭合残片只被跳过（不再整体失败）', () => {
    const final = manifestOf([slot(0), slot(1), slot(2)])
    const decoded = decodeCharacterIdentityManifest(`${final}

{"slots":[`)
    expect(decoded).toHaveLength(3)
  })

  it('全部候选都不可解码 → 带候选范围的 invalid_envelope，而不是"无法确定唯一结果"', () => {
    const twoCandidates = ['{"a":1}', '{"b":2}'].join('\n')
    const diagnostic = diagnosticOf(() => decodeJsonObjectCandidate(twoCandidates, () => {
      throw new Error('decoder rejected every candidate')
    }))
    expect(diagnostic.code).toBe('invalid_envelope')
    expect(diagnostic.path).toBe('candidates[0..1]')
  })

  it('多候选里只有第二个可解码时，优先返回成功的那个', () => {
    const decoded = decodeJsonObjectCandidate(['{"a":1}', '{"b":2}'].join('\n'), candidate => {
      if (candidate === '{"a":1}') throw new StructuredContractDiagnostic('missing_field', 'slots')
      return candidate
    })
    expect(decoded).toBe('{"b":2}')
  })

  it('单候选且可解码时行为与旧实现一致', () => {
    const single = manifestOf([slot(0), slot(1), slot(2)])
    expect(decodeCharacterIdentityManifest(single)).toHaveLength(3)
    expect(collectCompleteJsonObjectCandidates(single)).toEqual([single])
  })

  it('未闭合片段在前时，仍能找到其后的完整对象', () => {
    const final = manifestOf([slot(0), slot(1), slot(2)])
    const decoded = decodeCharacterIdentityManifest(`{"slots":[

${final}`)
    expect(decoded).toHaveLength(3)
  })
})
