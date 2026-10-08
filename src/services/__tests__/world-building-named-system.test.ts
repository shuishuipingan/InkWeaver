import { describe, expect, it } from 'vitest'

import { getBuiltinPromptTemplate } from '../prompt-templates'
import { characterArchitecturePrompts } from '../prompt-language'

function worldText(language: 'zh-CN' | 'en-US'): string {
  const template = getBuiltinPromptTemplate('world_building', language)
  return [template?.systemRole ?? '', template?.content ?? '', template?.systemSuffix ?? ''].join('\n')
}

describe('world building asks for a named power system', () => {
  it('requires tier ladder, named entries, naming style and downstream citation in Chinese', () => {
    const content = worldText('zh-CN')
    expect(content).toContain('【具名体系】')
    expect(content).toContain('【等级阶梯】')
    expect(content).toContain('5-9 级')
    expect(content).toContain('【具名条目】')
    expect(content).toContain('【命名风格】')
    expect(content).toContain('会被角色档案与后续每一章直接引用')
    // 非超常题材的豁免句必须在场，避免把仙侠词汇强加给都市/悬疑。
    expect(content).toContain('不要强加仙侠词汇')
  })

  it('requires the same four points in English', () => {
    const content = worldText('en-US')
    expect(content).toContain('Named power system')
    expect(content).toContain('Tier ladder')
    expect(content).toContain('five to nine tier names')
    expect(content).toContain('Named entries')
    expect(content).toContain('Naming style')
    expect(content).toContain('cited directly by character profiles')
    expect(content).toContain('instead of xianxia vocabulary')
    // 总起句不得再说"三个维度"：它与第 4 条自相矛盾（指令层会压掉具名体系）。
    expect(content).not.toContain('three connected dimensions')
    expect(content).toMatch(/the first three apply to every genre/i)
    expect(content).toMatch(/dimension 4 only when the genre involves/i)
  })

  it('keeps the three original dimensions and the variable contract untouched', () => {
    const zh = worldText('zh-CN')
    expect(zh).toContain('【核心规则与体系漏洞】')
    expect(zh).toContain('【阶层断层与资源战场】')
    expect(zh).toContain('【隐喻与深层危机】')
    expect(zh).toContain('如何在这套规则下占据独特的非对称优势')

    const en = worldText('en-US')
    expect(en).toContain('Core rules and exploitable asymmetry')
    expect(en).toContain('Factions, hierarchy, and scarce resources')
    expect(en).toContain('Hidden history and deep crisis')

    const template = getBuiltinPromptTemplate('world_building', 'zh-CN')
    expect(template?.requiredContextVariables).toEqual([
      'premise', 'genre', 'core_setting', 'golden_finger', 'protagonist_profile', 'global_guidance',
    ])
    // 英文模板不得含 CJK（既有护栏的同源断言）。
    expect(worldText('en-US')).not.toMatch(/[\u3400-\u9fff]/u)
  })

  it('asks character abilities to cite concrete names in both languages', () => {
    const zh = characterArchitecturePrompts('zh-CN').detailContract
    expect(zh).toContain('abilities 必须写体系内的具体名称')
    expect(zh).toContain('精通剑道')
    expect(zh).toContain('不得与架构中的名称冲突')
    // 既有字段列表仍在。
    expect(zh).toContain('slotId、name、role、gender、age、appearance、personality、background、abilities、motivation、arc、notes、currentState')

    const en = characterArchitecturePrompts('en-US').detailContract
    expect(en).toContain("abilities must use concrete names from the world's power system")
    expect(en).toContain('skilled in swordsmanship')
    expect(en).toContain('never contradict the architecture')
    expect(en).toContain('slotId, name, role, gender, age, appearance, personality, background, abilities, motivation, arc, notes, and currentState')
    expect(en).not.toMatch(/[\u3400-\u9fff]/u)
  })
})
