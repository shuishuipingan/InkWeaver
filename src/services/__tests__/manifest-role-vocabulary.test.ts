import { describe, expect, it } from 'vitest'

import { characterArchitecturePrompts } from '../prompt-language'

function manifestTaskText(language: 'zh-CN' | 'en-US'): string {
  return characterArchitecturePrompts(language).manifestTask(language === 'en-US' ? '(context)' : '（上下文）', 3, 8)
}

describe('identity manifest uses the full role vocabulary', () => {
  it('requires antagonist for stories with an explicit opposing side (Chinese)', () => {
    const content = manifestTaskText('zh-CN')
    expect(content).toContain('【定位词表要用全】')
    expect(content).toContain('必须把敌对方的核心人物标为 antagonist')
    expect(content).toContain('每个势力的代表人物各给一个')
    expect(content).toContain('不要用 minor 兜底所有非主要角色')
    expect(content).toContain('必须是有意为之')
  })

  it('requires antagonist for stories with an explicit opposing side (English)', () => {
    const content = manifestTaskText('en-US')
    expect(content).toContain('[Use the full role vocabulary]')
    expect(content).toContain('its core figures must be marked antagonist')
    expect(content).toContain('one representative per faction')
    expect(content).toContain('Never use minor as a fallback')
    expect(content).toContain('deliberate choice')
    // 英文模板不得含 CJK。
    expect(content).not.toMatch(/[\u3400-\u9fff]/u)
  })

  it('keeps every pre-existing hard constraint verbatim', () => {
    const zh = manifestTaskText('zh-CN')
    expect(zh).toContain('role 仅 protagonist/antagonist/supporting/minor，且恰好一个 protagonist')
    expect(zh).toContain('slotId/name 必须唯一')
    expect(zh).toContain('关系只能引用本清单其他 slotId，且同一个 targetSlotId 只出现一次')
    expect(zh).toContain('【多面关系与势力合同】')
    expect(zh).toContain('name 必须是单个角色的名字')

    const en = manifestTaskText('en-US')
    expect(en).toContain('role must be protagonist, antagonist, supporting, or minor, with exactly one protagonist.')
    expect(en).toContain('slotId and name must be unique')
    expect(en).toContain('each targetSlotId may appear only once')
    expect(en).toContain('[Multi-facet and faction contract]')
    expect(en).toContain('Each name must be a single character.')
  })
})
