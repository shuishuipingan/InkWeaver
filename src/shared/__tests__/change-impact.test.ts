import { describe, expect, it } from 'vitest'

import {
  analyzeChangeImpact,
  formatChangeImpactReport,
  type ChangeImpactSnapshot,
} from '../change-impact'

function snapshot(overrides: Partial<ChangeImpactSnapshot> = {}): ChangeImpactSnapshot {
  return {
    projectName: '测试小说',
    core: {
      genre: '玄幻',
      subGenre: '东方玄幻',
      targetAudience: '男频',
      totalChapters: 120,
      wordsPerChapter: 3000,
      writingLanguage: 'zh-CN',
      creativeStrategy: 'auto',
      narrativePov: 'third-person-limited',
      plotStructure: '三幕',
      coreOutline: '主角在宗门崛起',
      worldSetting: '灵气复苏的东方世界',
      protagonistProfile: '坚韧的杂役弟子',
      globalGuidance: '节奏紧凑',
      goldenFinger: '神秘玉佩',
      premise: '被逐出宗门的少年逆袭',
      worldbuilding: '三大宗门与灵气体系',
      synopsis: '林尘被逐出宗门后重修',
      writingStyle: '冷峻简洁',
      referenceWorks: '',
    },
    characters: [
      {
        name: '林尘',
        aliases: [],
        role: 'protagonist',
        appearance: '清瘦少年',
        personality: '坚韧',
        background: '宗门杂役',
        abilities: '玉佩护体',
        motivation: '查明身世',
        arc: '从杂役到宗主',
        notes: '',
        relationships: [{ target: '玄真', relation: '师徒' }],
        currentState: { state: '刚被逐出宗门', updatedAtChapter: 3 },
      },
      {
        name: '玄真',
        aliases: ['师父'],
        role: 'supporting',
        appearance: '白发老者',
        personality: '慈和',
        background: '宗门长老',
        abilities: '灵气深厚',
        motivation: '守护宗门',
        arc: '隐忍的守护者',
        notes: '对林尘多有照拂',
        relationships: [{ target: '林尘', relation: '师徒' }],
        currentState: { state: '暂居宗门', updatedAtChapter: 2 },
      },
    ],
    blueprints: [
      {
        chapterNumber: 3,
        title: '逐出宗门',
        role: '转折',
        purpose: '林尘被逐出宗门',
        keyEvents: '林尘被玄真逐出宗门',
        characters: ['林尘', '玄真'],
        suspenseHook: '玄真为何沉默',
        userGuidance: '',
        notes: '',
      },
      {
        chapterNumber: 8,
        title: '旧敌重逢',
        role: '发展',
        purpose: '林尘发现玄真另有隐情',
        keyEvents: '林尘与玄真对峙',
        characters: ['林尘', '玄真'],
        suspenseHook: '玄真的秘密',
        userGuidance: '',
        notes: '',
      },
      {
        chapterNumber: 12,
        title: '终局',
        role: '高潮',
        purpose: '决战',
        keyEvents: '林尘击败玄真',
        characters: ['林尘'],
        suspenseHook: '',
        userGuidance: '',
        notes: '',
      },
    ],
    drafts: [
      { chapterNumber: 1, status: 'finalized', version: 2 },
      { chapterNumber: 2, status: 'finalized', version: 1 },
      { chapterNumber: 3, status: 'candidate', version: 1 },
    ],
    handoffs: [{ chapterNumber: 2, status: 'confirmed', presentCharacters: ['林尘', '玄真'], immediateGoal: '离开宗门' }],
    threads: [
      {
        id: 11,
        title: '玉佩的秘密',
        type: '悬疑',
        authorIntent: '林尘逐步揭开玉佩来历',
        targetStartChapter: 2,
        targetEndChapter: 40,
        lane: 'main',
        status: 'progressing',
      },
      {
        id: 12,
        title: '玄真的双面',
        type: '人物',
        authorIntent: '玄真的真实立场',
        targetStartChapter: 3,
        targetEndChapter: 60,
        lane: 'sub',
        status: 'planned',
      },
    ],
    planningMaterials: [
      { id: 'material-1', name: '宗门设定', kind: 'world', status: 'confirmed', excerpt: '宗门以玄真为首，林尘是杂役弟子。' },
    ],
    knowledgeEvents: [
      { character: '玄真', information: '林尘体内封印着旧朝血脉', certainty: 'fact', falseBelief: false, sourceChapter: 2 },
    ],
    continuityFacts: [
      { category: 'character-state', entities: ['林尘'], statement: '林尘在第 3 章被逐出宗门。', sourceChapter: 3 },
    ],
    ...overrides,
  }
}

describe('change-impact', () => {
  it('maps a character change onto profile, state, blueprints, threads, materials, and finalized facts', () => {
    const report = analyzeChangeImpact(snapshot(), { change: '把玄真改成隐藏的反派，一直在暗中布局' })

    expect(report.detected.scope).toBe('character')
    expect(report.detected.characters).toEqual(['玄真'])

    const byId = new Map(report.targets.map(target => [target.id, target]))
    expect(byId.get('character-profile:玄真')).toMatchObject({
      kind: 'character-profile',
      severity: 'must-change',
    })
    expect(byId.get('character-state:玄真')?.fields).toContain('currentState')
    expect(byId.get('blueprint:3')).toMatchObject({ kind: 'blueprint', protection: 'editable' })
    expect(byId.get('blueprint:8')?.reason).toContain('玄真')
    expect(byId.get('narrative-thread:12')?.label).toContain('玄真的双面')
    expect(byId.get('planning-material:material-1')?.reason).toContain('玄真')
    expect(byId.get('character-profile:林尘')).toBeUndefined()
    // 交接绑定已定稿正文，只能由作者重新生成并确认。
    expect(byId.get('chapter-handoff:2')).toMatchObject({
      kind: 'chapter-handoff',
      severity: 'cannot-auto-change',
      protection: 'finalized-immutable',
    })
    // 知情边界记录"谁在何时知道什么"：未点名知情变化时列为需要复核。
    expect(byId.get('knowledge-event:玄真:2:林尘体内封印着旧朝血脉')).toMatchObject({
      kind: 'knowledge-event',
      severity: 'should-review',
      protection: 'author-only',
    })
  })

  it('flags a knowledge boundary as a must-change target when the request reveals a secret', () => {
    const report = analyzeChangeImpact(snapshot(), { change: '让林尘提前知道玄真的真实身份' })
    const knowledge = report.targets.find(target => target.kind === 'knowledge-event')
    expect(knowledge?.reason).toContain('知情边界')
    expect(knowledge?.evidence).toContain('封印')
    expect(knowledge?.severity).toBe('must-change')
  })

  it('treats an architecture-level change as touching config, every profile, and every blueprint', () => {
    const report = analyzeChangeImpact(snapshot(), {
      change: '把世界观从东方玄幻改成赛博朋克，力量体系换成义体改造',
    })

    expect(report.detected.scope).toBe('architecture')
    expect(report.detected.fields).toContain('worldSetting')

    const byId = new Map(report.targets.map(target => [target.id, target]))
    expect(byId.get('architecture:core')).toMatchObject({ severity: 'must-change' })
    expect(byId.get('novel-config:core')).toMatchObject({ kind: 'novel-config' })
    expect(byId.get('character-profile:林尘')).toMatchObject({ severity: 'should-review' })
    expect(byId.get('character-profile:玄真')).toBeDefined()
    expect(byId.get('blueprint:12')).toBeDefined()
  })

  it('never offers to rewrite a finalized chapter silently', () => {
    const report = analyzeChangeImpact(snapshot(), { change: '重写第 2 章的这段情节' })

    const byId = new Map(report.targets.map(target => [target.id, target]))
    expect(byId.get('blueprint:2')).toMatchObject({
      protection: 'finalized-immutable',
      severity: 'cannot-auto-change',
    })
    expect(byId.get('finalized-chapter:2')).toMatchObject({ kind: 'finalized-chapter' })
    expect(report.advisories.some(advisory => advisory.includes('第 2 章已定稿'))).toBe(true)
  })

  it('routes a rename request through the character identity channel', () => {
    const report = analyzeChangeImpact(snapshot(), { change: '把林尘改名为林晨' })

    expect(report.detected.renames).toEqual([{ from: '林尘', to: '林晨' }])
    expect(report.detected.terminology).toEqual([])
    expect(report.detected.scope).toBe('character')
    const rename = report.targets.find(target => target.id === 'character-profile:林尘')
    expect(rename?.reason).toContain('改名')
    expect(rename?.fields).toContain('name')
  })

  it('maps a non-character terminology change onto architecture text and flags finalized prose', () => {
    const report = analyzeChangeImpact(snapshot(), { change: '把“灵气”统一改成“以太”' })

    expect(report.detected.terminology).toEqual([{ from: '灵气', to: '以太' }])
    const terminology = report.targets.find(target => target.id === 'terminology:灵气')
    expect(terminology).toMatchObject({ protection: 'finalized-immutable', severity: 'cannot-auto-change' })
    expect(terminology?.evidence).toContain('第 1、2 章')
  })

  it('surfaces blueprint characters that are missing from the roster and reports truncation', () => {
    const many = snapshot({
      blueprints: Array.from({ length: 60 }, (_, index) => ({
        chapterNumber: index + 1,
        title: `第${index + 1}章`,
        role: '发展',
        purpose: '推进',
        keyEvents: '事件',
        characters: ['林尘', '无名氏'],
        suspenseHook: '',
        userGuidance: '',
        notes: '',
      })),
    })
    const report = analyzeChangeImpact(many, { change: '调整林尘的主线走向' })

    expect(report.summary.truncated).toBe(true)
    expect(report.summary.byKind.blueprint).toBeLessThanOrEqual(10)
    expect(report.targets.length).toBeLessThanOrEqual(30)
    expect(report.advisories.some(advisory => advisory.includes('共 60 项'))).toBe(true)
    expect(report.advisories.some(advisory => advisory.includes('无名氏'))).toBe(true)
  })

  it('renders a readable report and asks for a named target when none was found', () => {
    const report = analyzeChangeImpact(snapshot(), { change: '调整一下某个角色的设定' })
    expect(report.advisories.some(advisory => advisory.includes('未在角色名单中定位'))).toBe(true)

    const rendered = formatChangeImpactReport(
      analyzeChangeImpact(snapshot(), { change: '把玄真改成隐藏的反派' }),
    )
    expect(rendered).toContain('改动：把玄真改成隐藏的反派')
    expect(rendered).toContain('人物档案｜玄真（人物档案）')
    expect(rendered).toContain('逐项影响：')
    expect(rendered).toContain('仅作者可改')
  })
})
