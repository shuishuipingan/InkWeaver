import { describe, expect, it } from 'vitest'

import {
  orderChangePlanItems,
  parseChangePlan,
  summarizeChangePlan,
  validateChangePlan,
  type ChangePlan,
  type ChangePlanContext,
} from '../change-plan'

function context(overrides: Partial<ChangePlanContext> = {}): ChangePlanContext {
  return {
    characters: [
      { name: '林尘', aliases: [] },
      { name: '玄真', aliases: ['师父'] },
    ],
    blueprintChapters: [1, 2, 3, 8],
    finalizedChapters: [1, 2],
    threads: [{ id: 11 }, { id: 12 }],
    maxChapter: 120,
    ...overrides,
  }
}

function plan(items: unknown[], summary = '把玄真改成隐藏的反派'): unknown {
  return { summary, items }
}

describe('change-plan parsing', () => {
  it('parses every supported item kind into a typed plan', () => {
    const result = parseChangePlan(plan([
      { kind: 'config', reason: '题材变化', fields: { genre: '科幻', totalChapters: 150 } },
      { kind: 'architecture', reason: '设定变化', fields: { worldSetting: '赛博朋克世界' } },
      { kind: 'character-profile', reason: '立场变化', character: '玄真', fields: { role: 'antagonist', motivation: '暗中布局' }, relationships: [{ target: '林尘', relation: '貌合神离的师徒' }] },
      { kind: 'character-state', reason: '状态推进', character: '玄真', state: { mentalState: '身份被林尘察觉', recentEvents: '暗中布局被察觉' }, updatedAtChapter: 8 },
      { kind: 'blueprint', reason: '职责调整', chapterNumber: 8, fields: { purpose: '对峙', characters: ['林尘', '玄真'] } },
      { kind: 'narrative-thread', reason: '线索走向', threadId: 12, title: '玄真的双面', type: '人物', authorIntent: '揭开真实立场', targetStartChapter: 3, targetEndChapter: 60, lane: 'sub' },
      { kind: 'planning-material', reason: '补齐设定资料', name: '宗门秘辛', materialKind: 'world', content: '玄真早年…' },
    ]))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.items.map(item => item.kind)).toEqual([
      'config', 'architecture', 'character-profile', 'character-state',
      'blueprint', 'narrative-thread', 'planning-material',
    ])
    expect(summarizeChangePlan(result.plan)).toContain('人物档案×1')
  })

  it('rejects an unknown field with a message the model can repair from', () => {
    const result = parseChangePlan(plan([
      { kind: 'config', reason: 'x', fields: { creativeStrategy: 'auto' } },
    ]))
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toContain('未知的作品配置字段：creativeStrategy')
  })

  it('rejects invalid enums, non-positive numbers, and empty items', () => {
    expect(parseChangePlan(plan([
      { kind: 'config', reason: 'x', fields: { plotStructure: 'seven_act' } },
    ]))).toMatchObject({ ok: false, error: expect.stringContaining('plotStructure') as unknown as string })

    expect(parseChangePlan(plan([
      { kind: 'config', reason: 'x', fields: { totalChapters: 0 } },
    ]))).toMatchObject({ ok: false })

    expect(parseChangePlan({ summary: 'x', items: [] })).toMatchObject({ ok: false })
    expect(parseChangePlan(plan([
      { kind: 'blueprint', chapterNumber: 3, fields: { purpose: '推进' } },
    ]))).toMatchObject({ ok: false, error: expect.stringContaining('reason') as unknown as string })
  })

  it('rejects an oversized plan and a plan without a summary', () => {
    const many = Array.from({ length: 41 }, (_, index) => ({
      kind: 'character-state', reason: 'r', character: '林尘', state: { recentEvents: `状态${index}` }, updatedAtChapter: 1,
    }))
    expect(parseChangePlan(plan(many))).toMatchObject({ ok: false, error: expect.stringContaining('最多 40 项') as unknown as string })
    expect(parseChangePlan({ items: [{ kind: 'config', reason: 'r', fields: { genre: 'x' } }] }))
      .toMatchObject({ ok: false, error: expect.stringContaining('summary') as unknown as string })
  })
})

describe('change-plan validation', () => {
  it('accepts a plan whose targets exist and are still editable', () => {
    const parsed = parseChangePlan(plan([
      { kind: 'character-profile', reason: 'r', character: '师父', fields: { role: 'antagonist' } },
      { kind: 'blueprint', reason: 'r', chapterNumber: 8, fields: { purpose: '对峙并揭示立场' } },
    ]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const validation = validateChangePlan(parsed.plan, context())
    expect(validation.ok).toBe(true)
    expect(validation.items.every(item => item.ok)).toBe(true)
  })

  it('refuses to silently rewrite a finalized chapter and blocks that item', () => {
    const parsed = parseChangePlan(plan([
      { kind: 'blueprint', reason: 'r', chapterNumber: 2, fields: { purpose: '改写结局' } },
      { kind: 'blueprint', reason: 'r', chapterNumber: 8, fields: { purpose: '调整对峙' } },
    ]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const validation = validateChangePlan(parsed.plan, context())
    expect(validation.ok).toBe(false)
    expect(validation.items[0]).toMatchObject({ ok: false, blocked: true })
    expect(validation.items[0]!.errors.join()).toContain('已定稿')
    expect(validation.items[1]!.ok).toBe(true)
  })

  it('rejects unknown characters, missing blueprints, and unknown threads', () => {
    const parsed = parseChangePlan(plan([
      { kind: 'character-profile', reason: 'r', character: '路人甲', fields: { personality: '神秘' } },
      { kind: 'blueprint', reason: 'r', chapterNumber: 99, fields: { purpose: '新章' } },
      { kind: 'narrative-thread', reason: 'r', threadId: 404, title: 't', type: '人物', authorIntent: 'i', targetStartChapter: 1, targetEndChapter: 5 },
    ], '校验失败用例'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const validation = validateChangePlan(parsed.plan, context())
    expect(validation.ok).toBe(false)
    expect(validation.items[0]!.errors.join()).toContain('候选确认')
    expect(validation.items[1]!.errors.join()).toContain('还没有蓝图')
    expect(validation.items[2]!.errors.join()).toContain('不存在')
  })

  it('resolves aliases to canonical names and warns about finalized thread ranges', () => {
    const parsed = parseChangePlan(plan([
      { kind: 'character-state', reason: 'r', character: '师父', state: { location: '行踪不明' }, updatedAtChapter: 8 },
      { kind: 'narrative-thread', reason: 'r', threadId: 11, title: '玉佩的秘密', type: '悬疑', authorIntent: 'i', targetStartChapter: 1, targetEndChapter: 40 },
    ]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const validation = validateChangePlan(parsed.plan, context())
    expect(validation.items[0]!.ok).toBe(true)
    expect(validation.items[1]!.ok).toBe(true)
    expect(validation.items[1]!.warnings.join()).toContain('已定稿章节')
  })

  it('flags duplicate targets and validates roster-bound blueprint characters', () => {
    const parsed = parseChangePlan(plan([
      { kind: 'blueprint', reason: 'r', chapterNumber: 8, fields: { purpose: 'A' } },
      { kind: 'blueprint', reason: 'r', chapterNumber: 8, fields: { suspenseHook: 'B' } },
      { kind: 'blueprint', reason: 'r', chapterNumber: 3, fields: { characters: ['林尘', '神秘人'] } },
    ], '重复目标'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const validation = validateChangePlan(parsed.plan, context())
    expect(validation.ok).toBe(false)
    expect(validation.errors.join()).toContain('同一目标在计划中出现多次')
    expect(validation.items[2]!.errors.join()).toContain('神秘人')
  })

  it('orders execution from settings to derived planning artifacts', () => {
    const parsed = parseChangePlan(plan([
      { kind: 'planning-material', reason: 'r', name: 'm', materialKind: 'other', content: 'c' },
      { kind: 'blueprint', reason: 'r', chapterNumber: 8, fields: { purpose: 'p' } },
      { kind: 'config', reason: 'r', fields: { genre: '科幻' } },
      { kind: 'character-state', reason: 'r', character: '林尘', state: { physicalState: 's' }, updatedAtChapter: 8 },
      { kind: 'architecture', reason: 'r', fields: { worldSetting: 'w' } },
      { kind: 'character-profile', reason: 'r', character: '林尘', fields: { motivation: 'm' } },
      { kind: 'narrative-thread', reason: 'r', title: 't', type: '人物', authorIntent: 'i', targetStartChapter: 1, targetEndChapter: 5 },
    ]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const ordered = orderChangePlanItems(parsed.plan.items) as ChangePlan['items']
    expect(ordered.map(item => item.kind)).toEqual([
      'config', 'architecture', 'character-profile', 'character-state',
      'blueprint', 'narrative-thread', 'planning-material',
    ])
  })
})
