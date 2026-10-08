import { describe, expect, it } from 'vitest'

import { getBuiltinPromptTemplate } from '../prompt-templates'
import { blueprintSemanticGenerationContract } from '../../shared/blueprint-semantic-contract'

/** 产出章节名与设置物的蓝图模板：三处，中英各一版（第六处）。 */
const KEYS = ['chapter_blueprint', 'chapter_blueprint_chunk', 'infer_single_chapter_blueprint'] as const

function text(key: string, language: 'zh-CN' | 'en-US'): string {
  const template = getBuiltinPromptTemplate(key, language)
  return [template?.systemRole ?? '', template?.content ?? '', template?.systemSuffix ?? ''].join('\n')
}

describe('blueprint chapter titles are readability first', () => {
  it.each(KEYS)('asks for a legible title in the Chinese %s', (key) => {
    const content = text(key, 'zh-CN')
    expect(content).toContain('可读性优先')
    // 用户库里的真实反例必须在场，否则模型仍会去凑四字文言。
    expect(content).toContain('星枷守炉')
    // 设定物规则：创造并命名 + 实战用出来 + 沿用既有名称 + 题材豁免。
    expect(content).toMatch(/功法|招式/)
    expect(content).toMatch(/沿用既有名称|沿用正文已有名称/)
    expect(content).toMatch(/不要强加武侠|不含超常体系|不含修炼/)
  })

  it.each(KEYS)('asks for a legible title in the English %s', (key) => {
    const content = text(key, 'en-US')
    expect(content).toMatch(/readability first/i)
    // 英文侧用意译反例（英文模板不得含 CJK，见下一条用例）。
    expect(content).toContain('Frost Lock Vein')
    expect(content).toMatch(/techniques|artifacts/)
    expect(content).toMatch(/reuse/i)
    expect(content).toMatch(/never impose wuxia|without the supernatural/i)
  })

  it.each(KEYS)('keeps the English %s free of CJK characters', (key) => {
    // 英文模板里塞中文示例会让英文项目读到两种语言；既有 prompt-language-contract 也这样守。
    expect(text(key, 'en-US')).not.toMatch(/[\u3400-\u9fff]/u)
  })

  it('keeps every pre-existing title hard constraint verbatim', () => {
    for (const key of ['chapter_blueprint', 'chapter_blueprint_chunk'] as const) {
      const zh = text(key, 'zh-CN')
      expect(zh).toContain('不要书名号、引号、标点、章号、“标题：”前缀或副标题，也不要写成剧情梗概')
      const en = text(key, 'en-US')
      expect(en).toContain('4-12 characters')
      expect(en).toContain('no book-title marks')
    }
    // 推演模板保留「4-12 个字 / 无书名号 / 无章号 / 不写梗概」。
    const zhInfer = text('infer_single_chapter_blueprint', 'zh-CN')
    expect(zhInfer).toContain('不要书名号、引号、章号或“标题：”前缀，也不要写成剧情梗概')
    const enInfer = text('infer_single_chapter_blueprint', 'en-US')
    expect(enInfer).toMatch(/no rare-character padding/i)
    expect(enInfer).toContain('never a plot summary')
  })

  it('states both requirements in the generation contract for both languages', () => {
    const zh = blueprintSemanticGenerationContract('zh-CN')
    expect(zh).toContain('title 必须让人一眼看懂本章事件（可读性优先）')
    expect(zh).toContain('keyEvents 涉及修炼 / 异能 / 战斗体系时')
    expect(zh).toContain('沿用既有名称')
    // 既有字段与长度约束仍在。
    expect(zh).toContain('必须是非空字符串')
    expect(zh).toContain('每项长度上限')

    const en = blueprintSemanticGenerationContract('en-US')
    expect(en).toContain('title must make the chapter event instantly legible (readability first)')
    expect(en).toContain('When keyEvents involve cultivation, powers, or a combat system')
    expect(en).toContain('reused as established')
    expect(en).toContain('must be non-empty strings')
    expect(en).toContain('Limits:')
  })
})
