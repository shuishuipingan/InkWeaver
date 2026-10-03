import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeWithProjectSession = vi.hoisted(() => vi.fn())
vi.mock('../../../ipc-client', () => ({ ipc: { invokeWithProjectSession } }))

import { useProjectStore } from '../../../../stores/project-store'
import { createAgentExecutionContext } from '../project-context'
import { analyzeChangeImpactTool } from '../analyze-change-impact.tool'
import { buildChangePlanProposal, proposeChangePlanTool } from '../propose-change-plan.tool'

const ROSTER_ENTRIES = [
  {
    characterId: 'char_a'.padEnd(37, 'a'),
    name: '林尘',
    aliases: [],
    role: 'protagonist',
    gender: '男',
    age: '十七',
    appearance: '清瘦少年',
    personality: '坚韧',
    background: '宗门杂役',
    abilities: '玉佩护体',
    motivation: '查明身世',
    relationships: [{ target: '玄真', relation: '师徒' }],
    arc: '从杂役到宗主',
    notes: '',
    currentState: {
      location: '宗门',
      powerLevel: '练气三层',
      physicalState: '',
      mentalState: '',
      keyItems: '玉佩',
      recentEvents: '被逐出宗门',
      updatedAtChapter: 3,
      provenance: { source: 'author' },
    },
  },
  {
    characterId: 'char_b'.padEnd(37, 'b'),
    name: '玄真',
    aliases: ['师父'],
    role: 'supporting',
    gender: '男',
    age: '不详',
    appearance: '白发老者',
    personality: '慈和',
    background: '宗门长老',
    abilities: '灵气深厚',
    motivation: '守护宗门',
    relationships: [{ target: '林尘', relation: '师徒' }],
    arc: '隐忍的守护者',
    notes: '对林尘多有照拂',
  },
]

const BLUEPRINTS = [
  { chapterNumber: 1, title: '序章', role: '开端', purpose: '引入', keyEvents: '林尘入门', characters: ['林尘'], suspenseHook: '', userGuidance: '', notes: '' },
  { chapterNumber: 2, title: '拜师', role: '发展', purpose: '玄真收徒', keyEvents: '玄真收林尘为徒', characters: ['林尘', '玄真'], suspenseHook: '', userGuidance: '', notes: '' },
  { chapterNumber: 3, title: '逐出宗门', role: '转折', purpose: '林尘被逐出宗门', keyEvents: '玄真逐出林尘', characters: ['林尘', '玄真'], suspenseHook: '玄真为何沉默', userGuidance: '', notes: '' },
  { chapterNumber: 8, title: '旧敌重逢', role: '发展', purpose: '林尘发现玄真另有隐情', keyEvents: '林尘与玄真对峙', characters: ['林尘', '玄真'], suspenseHook: '玄真的秘密', userGuidance: '', notes: '' },
]

const DRAFTS = [
  { chapterNumber: 1, status: 'finalized', version: 2 },
  { chapterNumber: 2, status: 'finalized', version: 1 },
  { chapterNumber: 3, status: 'candidate', version: 1 },
]

function projectCore(): Record<string, unknown> {
  return {
    projectName: '测试小说',
    genre: '玄幻',
    subGenre: '东方玄幻',
    targetAudience: '男频',
    totalChapters: 120,
    wordsPerChapter: 3000,
    writingLanguage: 'zh-CN',
    creativeStrategy: 'auto',
    narrativePov: 'third_limited',
    plotStructure: 'three_act',
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
  }
}

interface FakeIpcOptions {
  finalizedAtExecution?: number[]
}

function installFakeIpc(options: FakeIpcOptions = {}) {
  invokeWithProjectSession.mockImplementation(async (_session, channel, ...args) => {
    switch (channel) {
      case 'db:project-core-get':
        return projectCore()
      case 'db:character-roster-read':
        return {
          schemaVersion: 1,
          revision: 7,
          migrationState: 'ready',
          status: 'ready',
          entries: ROSTER_ENTRIES,
          renderedMarkdown: '角色图谱',
          projectionHash: 'p'.repeat(64),
          factHash: 'f'.repeat(64),
        }
      case 'db:character-roster-commit':
        return {
          success: true,
          receipt: {
            operationId: (args[0] as { operationId: string }).operationId,
            payloadHash: 'h'.repeat(64),
            revision: 8,
            idempotent: false,
          },
        }
      case 'db:blueprint-get-all':
        return BLUEPRINTS
      case 'db:blueprint-get':
        return BLUEPRINTS.find(blueprint => blueprint.chapterNumber === args[0]) ?? null
      case 'db:blueprint-upsert':
        return { success: true }
      case 'db:draft-list-all':
        return DRAFTS
      case 'db:draft-get-finalized':
        return (options.finalizedAtExecution ?? [1, 2]).includes(args[0] as number)
          ? { id: 99, chapterNumber: args[0], status: 'finalized', version: 1 }
          : null
      case 'db:chapter-handoff-list-all':
        return [{ chapterNumber: 2, status: 'confirmed', presentCharacters: ['林尘', '玄真'], immediateGoal: '离开宗门' }]
      case 'db:narrative-thread-list':
        return [{
          id: 12,
          title: '玄真的双面',
          type: '人物',
          authorIntent: '玄真的真实立场',
          targetStartChapter: 3,
          targetEndChapter: 60,
          lane: 'sub',
          status: 'planned',
        }]
      case 'db:narrative-thread-plan-update':
        return { success: true, plan: { id: args[0] } }
      case 'db:narrative-thread-plan-create':
        return { success: true, plan: { id: 21 } }
      case 'db:planning-material-list':
        return [{ id: 'material-1', name: '宗门设定', kind: 'world', status: 'confirmed', content: '宗门以玄真为首，林尘是杂役弟子。' }]
      case 'db:planning-material-upsert':
        return { success: true, material: { id: 'material-2' } }
      case 'db:knowledge-event-list-review':
        return (args[0] as string[]).includes('玄真')
          ? [{
            eventId: 'event-1',
            character: '玄真',
            information: '林尘体内封印着旧朝血脉',
            certainty: 'fact',
            falseBelief: false,
            learnedBy: '亲眼所见',
            sourceChapter: 2,
            evidence: '原文',
            status: 'confirmed',
          }]
          : []
      case 'db:continuity-list-all':
        return [{
          draftId: 99,
          chapterNumber: 3,
          chapterTitle: '逐出宗门',
          chapterNotes: '',
          facts: [{ category: 'character-state', entities: ['林尘'], statement: '林尘被逐出宗门。', sourceChapter: 3, evidence: '原文' }],
        }]
      case 'db:project-core-update':
        return { success: true }
      default:
        throw new Error(`unexpected IPC: ${String(channel)}`)
    }
  })
  return invokeWithProjectSession
}

function callsFor(channel: string): unknown[][] {
  return invokeWithProjectSession.mock.calls.filter(call => call[1] === channel)
}

beforeEach(() => {
  invokeWithProjectSession.mockReset()
  installFakeIpc()
  useProjectStore.setState({
    currentProject: {
      id: 'project',
      sessionLease: 'lease',
      path: 'C:\\novels\\project',
      name: '测试小说',
      novelConfig: projectCore(),
    },
  } as never)
})

describe('analyze_change_impact tool', () => {
  it('reports every affected dimension with evidence and finalized protection', async () => {
    const result = await analyzeChangeImpactTool.execute(
      { change: '把玄真改成隐藏的反派，一直在暗中布局' },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('人物档案｜玄真（人物档案）')
    expect(result.content).toContain('叙事线索')
    expect(result.content).toContain('规划资料')
    expect(result.content).toContain('第 2 章已定稿')
    expect(result.content).toContain('知情边界')
    expect(result.content).toContain('林尘体内封印着旧朝血脉')
    expect(result.content).toContain('章节交接')
    expect(result.content).toContain('propose_change_plan')
  })

  it('requires a change description instead of guessing', async () => {
    const result = await analyzeChangeImpactTool.execute({}, createAgentExecutionContext('model'))
    expect(result.success).toBe(false)
    expect(result.error).toContain('change')
  })
})

describe('propose_change_plan tool', () => {
  const plan = {
    summary: '把玄真改成隐藏反派并同步蓝图与线索',
    items: [
      { kind: 'config', reason: '题材需要贴合新走向', fields: { writingStyle: '冷峻悬疑' } },
      { kind: 'architecture', reason: '前提需要补上暗线', fields: { synopsis: '林尘在追查中逐渐发现玄真的真实立场。' } },
      { kind: 'character-profile', reason: '立场反转', character: '玄真', fields: { role: 'antagonist', motivation: '暗中推动林尘成长' }, relationships: [{ target: '林尘', relation: '貌合神离的师徒' }] },
      { kind: 'character-state', reason: '身份暴露进度', character: '玄真', state: { mentalState: '身份被察觉', recentEvents: '暗中布局被林尘发现' }, updatedAtChapter: 8 },
      { kind: 'blueprint', reason: '本章需要点出暗线', chapterNumber: 8, fields: { purpose: '林尘发现玄真另有隐情', suspenseHook: '玄真为何暗中相助' } },
      { kind: 'narrative-thread', reason: '线索走向变化', threadId: 12, title: '玄真的双面', type: '人物', authorIntent: '逐步揭示玄真的真实立场', targetStartChapter: 3, targetEndChapter: 70, lane: 'sub' },
      { kind: 'planning-material', reason: '把新设定写成候选资料', name: '玄真暗线', materialKind: 'outline', content: '玄真从第 3 章起暗中布局，第 60 章揭示。' },
    ],
  }

  it('writes every entity through its guarded channel in dependency order', async () => {
    const result = await proposeChangePlanTool.execute(
      { plan },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('应用 7 项，跳过 0 项，失败 0 项')
    expect(result.content).toContain('✅')

    const channelOrder = invokeWithProjectSession.mock.calls
      .map(call => String(call[1]))
      .filter(channel => channel.endsWith('update') || channel.endsWith('commit') || channel.endsWith('upsert') || channel.endsWith('create'))
    expect(channelOrder).toEqual([
      'db:project-core-update',
      'db:project-core-update',
      'db:character-roster-commit',
      'db:blueprint-upsert',
      'db:narrative-thread-plan-update',
      'db:planning-material-upsert',
    ])

    // Config and architecture go through project_core with only the planned fields.
    expect(callsFor('db:project-core-update')[0]![2]).toEqual({ writingStyle: '冷峻悬疑' })
    expect(callsFor('db:project-core-update')[1]![2]).toEqual({ synopsis: '林尘在追查中逐渐发现玄真的真实立场。' })

    // One roster commit carries both the profile patch and the state patch.
    const commit = callsFor('db:character-roster-commit')[0]![2] as { request?: unknown } | { expectedRevision: number, intent: string, entries: Array<Record<string, unknown>> }
    expect(commit).toMatchObject({ expectedRevision: 7, intent: 'manual_edit' })
    const entries = (commit as { entries: Array<Record<string, unknown>> }).entries
    expect(entries).toHaveLength(2)
    const xuanzhen = entries.find(entry => entry.name === '玄真')!
    expect(xuanzhen.role).toBe('antagonist')
    expect(xuanzhen.relationships).toEqual([{ target: '林尘', relation: '貌合神离的师徒' }])
    expect(xuanzhen.currentState).toMatchObject({
      updatedAtChapter: 8,
      mentalState: '身份被察觉',
      provenance: { source: 'author' },
    })
    // 未在计划中的角色原样保留。
    expect(entries.find(entry => entry.name === '林尘')).toMatchObject({ role: 'protagonist', motivation: '查明身世' })

    expect((callsFor('db:blueprint-upsert')[0]![2] as { notes: string }).notes).toBe('')
    expect(callsFor('db:narrative-thread-plan-update')[0]![2]).toBe(12)
    expect(callsFor('db:planning-material-upsert')[0]![2]).toMatchObject({ name: '玄真暗线', kind: 'outline' })
  })

  it('skips a plan item that targets a finalized chapter and says so', async () => {
    const result = await proposeChangePlanTool.execute(
      {
        plan: {
          summary: '改写已定稿章节',
          items: [
            { kind: 'blueprint', reason: '想改写结局', chapterNumber: 2, fields: { purpose: '改写结局' } },
          ],
        },
      },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('已定稿')
    expect(callsFor('db:blueprint-upsert')).toHaveLength(0)
  })

  it('refuses unknown characters and never writes a partial plan through validation', async () => {
    const result = await proposeChangePlanTool.execute(
      {
        plan: {
          summary: '给未建档角色加设定',
          items: [
            { kind: 'character-profile', reason: '新角色', character: '神秘人', fields: { personality: '阴沉' } },
          ],
        },
      },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('候选确认')
    expect(callsFor('db:character-roster-commit')).toHaveLength(0)
  })

  it('re-checks finalization at write time and reports the item as failed', async () => {
    invokeWithProjectSession.mockReset()
    installFakeIpc({ finalizedAtExecution: [1, 2, 8] })
    const result = await proposeChangePlanTool.execute(
      {
        plan: {
          summary: '更新第 8 章蓝图',
          items: [
            { kind: 'blueprint', reason: '同步暗线', chapterNumber: 8, fields: { purpose: '发现隐情' } },
          ],
        },
      },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('失败 1 项')
    expect(result.content).toContain('写入前复核拒绝改写')
    expect(callsFor('db:blueprint-upsert')).toHaveLength(0)
  })

  it('exposes a pure builder for the confirmation preview', () => {
    const proposal = buildChangePlanProposal({ plan }, {
      characters: [{ name: '玄真', aliases: ['师父'] }, { name: '林尘', aliases: [] }],
      blueprintChapters: [8],
      finalizedChapters: [1, 2],
      threads: [{ id: 12 }],
      maxChapter: 120,
    })
    expect(proposal.valid).toBe(true)
    if (!proposal.valid) return
    expect(proposal.validation.items).toHaveLength(7)
  })

  it('declares the confirmation gates the engine relies on', () => {
    expect(analyzeChangeImpactTool.requiresConfirmation).toBe(false)
    expect(analyzeChangeImpactTool.isReadOnly).toBe(true)
    expect(proposeChangePlanTool.requiresConfirmation).toBe(true)
    expect(proposeChangePlanTool.isReadOnly).toBe(false)
  })
})
