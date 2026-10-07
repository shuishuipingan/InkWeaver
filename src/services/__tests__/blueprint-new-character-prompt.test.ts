import { describe, expect, it } from 'vitest'

import { getBuiltinPromptTemplate } from '../prompt-templates'
import { blueprintSemanticGenerationContract } from '../../shared/blueprint-semantic-contract'

/** 蓝图模板只有三处会产出 characters 字段，逐个钉住，避免将来新增变体时漏改。 */
const BLUEPRINT_TEMPLATE_KEYS = [
  'chapter_blueprint',
  'chapter_blueprint_chunk',
  'infer_single_chapter_blueprint',
] as const

function templateText(key: string, language: 'zh-CN' | 'en-US'): string {
  const template = getBuiltinPromptTemplate(key, language)
  return [template?.systemRole ?? '', template?.content ?? '', template?.systemSuffix ?? ''].join('\n')
}

function zhTemplateText(key: string): string {
  return templateText(key, 'zh-CN')
}

describe('blueprint prompts allow new characters', () => {
  it.each(BLUEPRINT_TEMPLATE_KEYS)('tells the model new characters may debut in %s', (key) => {
    const content = zhTemplateText(key)
    expect(content).toContain('新角色')
    // 「系统会为新角色自动建立角色档案」这层意思必须出现在每个蓝图模板里，
    // 否则模型仍会以为引入新角色会造成档案缺失。
    expect(content).toMatch(/自动(建立|建档|创建)/)
  })

  it('spells out the four rules instead of hinting at them', () => {
    for (const key of BLUEPRINT_TEMPLATE_KEYS) {
      const content = zhTemplateText(key)
      // 无名占位不能进 characters。
      expect(content).toMatch(/路人甲|无名占位/)
      // 新角色要有真实姓名。
      expect(content).toMatch(/真实姓名|真实姓名并写进/)
    }
  })

  it('shows an example that mixes an existing character with a debut', () => {
    for (const key of ['chapter_blueprint', 'chapter_blueprint_chunk'] as const) {
      const content = zhTemplateText(key)
      expect(content).toContain('本章首次登场的新角色')
      // 旧的「要人A / 要人B」写法已不再出现在蓝图示例里。
      expect(content).not.toContain('本章互动的要人A')
    }
  })

  it('keeps every pre-existing blueprint requirement verbatim', () => {
    for (const key of ['chapter_blueprint', 'chapter_blueprint_chunk'] as const) {
      const content = zhTemplateText(key)
      expect(content).toContain('每个对象必须包含完整的 chapterNumber、title、role、purpose、characters、relationships、keyEvents、suspenseHook')
      expect(content).toContain('relationships 仅写本章可确认的角色关系，无则输出空数组。')
    }
    const single = zhTemplateText('infer_single_chapter_blueprint')
    expect(single).toContain('每章蓝图包含 chapterNumber、title、role、purpose、characters、relationships、keyEvents、suspenseHook。')
    expect(single).toContain('keyEvents 必须基于正文实际内容提取，不可臆造')
  })

  it.each(BLUEPRINT_TEMPLATE_KEYS)('allows new characters in the English overlay of %s', (key) => {
    const content = templateText(key, 'en-US')
    expect(content).toMatch(/real full name/i)
    expect(content).toMatch(/profile/i)
    expect(content).toMatch(/unnamed placeholder/i)
    // 旧措辞不该在英文蓝图模板里出现。
    expect(content).not.toContain('要人')
  })

  it('keeps every pre-existing English blueprint requirement verbatim', () => {
    expect(templateText('chapter_blueprint', 'en-US'))
      .toContain('Every item must contain chapterNumber, title, role, purpose, characters, relationships, keyEvents, and suspenseHook.')
    expect(templateText('chapter_blueprint_chunk', 'en-US'))
      .toContain('Return exactly one JSON object with a blueprints array and no analysis, plan, explanation, Markdown, or code fence.')
    expect(templateText('infer_single_chapter_blueprint', 'en-US'))
      .toContain('The runtime appends the final immutable JSON contract; follow it over any alternative schema.')
  })

  it('states the same rule in the generation contract for both languages', () => {
    const zh = blueprintSemanticGenerationContract('zh-CN')
    expect(zh).toContain('characters 必须是至少含一个唯一非空角色名的字符串数组。')
    expect(zh).toContain('允许新角色在本章首次登场')
    expect(zh).toContain('自动建立角色档案')

    const en = blueprintSemanticGenerationContract('en-US')
    expect(en).toContain('characters must be an array containing at least one unique, non-empty full character name.')
    expect(en).toContain('New characters may debut in this chapter')
    expect(en).toContain('profile is created automatically')
  })
})
