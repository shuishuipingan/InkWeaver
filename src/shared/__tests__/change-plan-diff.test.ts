import { describe, expect, it } from 'vitest'

import {
  changePlanDiffLines,
  changePlanDisplayValue,
  changePlanFieldLabel,
} from '../change-plan-diff'
import { parseChangePlan } from '../change-plan'
import type { ChangeImpactSnapshot } from '../change-impact'

function snapshot(): ChangeImpactSnapshot {
  return {
    projectName: '测试小说',
    core: {
      genre: '玄幻',
      subGenre: '',
      targetAudience: '',
      totalChapters: 0,
      wordsPerChapter: 0,
      writingLanguage: 'zh-CN',
      creativeStrategy: '',
      narrativePov: '',
      plotStructure: '',
      coreOutline: '',
      worldSetting: '灵气世界',
      protagonistProfile: '',
      globalGuidance: '',
      goldenFinger: '',
      premise: '',
      worldbuilding: '',
      synopsis: '旧概要',
      writingStyle: '',
      referenceWorks: '',
    },
    characters: [
      {
        name: '玄真',
        aliases: ['师父'],
        role: 'supporting',
        appearance: '',
        personality: '慈和',
        background: '',
        abilities: '',
        motivation: '守护宗门',
        arc: '',
        notes: '',
        relationships: [],
        currentState: { state: '位置：宗门；心理：平静', updatedAtChapter: 3 },
      },
    ],
    blueprints: [
      {
        chapterNumber: 8,
        title: '旧敌重逢',
        role: '发展',
        purpose: '旧目的',
        keyEvents: '',
        characters: ['玄真'],
        suspenseHook: '',
        userGuidance: '',
        notes: '',
      },
    ],
    drafts: [],
    handoffs: [],
    knowledgeEvents: [],
    threads: [{ id: 12, title: '玄真的双面', type: '', authorIntent: '旧意图', targetStartChapter: 3, targetEndChapter: 60, lane: 'sub', status: 'planned' }],
    planningMaterials: [{ id: 'm1', name: '宗门设定', kind: 'world', status: 'confirmed', excerpt: '' }],
    continuityFacts: [],
  }
}

function itemsOf(raw: unknown) {
  const parsed = parseChangePlan({ summary: 's', items: raw })
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.plan.items
}

describe('change-plan-diff', () => {
  it('resolves config and architecture fields against the current project values', () => {
    const [architecture] = itemsOf([
      { kind: 'architecture', reason: 'r', fields: { synopsis: '新概要', worldSetting: '赛博世界' } },
    ]) as never as [never]
    const lines = changePlanDiffLines(architecture, snapshot())
    expect(lines).toEqual([
      { field: 'synopsis', current: '旧概要', proposed: '新概要' },
      { field: 'worldSetting', current: '灵气世界', proposed: '赛博世界' },
    ])
  })

  it('resolves a character profile through aliases and shows missing values as a dash', () => {
    const [profile] = itemsOf([
      { kind: 'character-profile', reason: 'r', character: '师父', fields: { role: 'antagonist', arc: '伪装者' } },
    ]) as never as [never]
    const lines = changePlanDiffLines(profile, snapshot())
    expect(lines).toEqual([
      { field: 'role', current: 'supporting', proposed: 'antagonist' },
      { field: 'arc', current: '—', proposed: '伪装者' },
    ])
  })

  it('shows blueprint, state, thread, and material diffs', () => {
    const [blueprint, state, thread, material] = itemsOf([
      { kind: 'blueprint', reason: 'r', chapterNumber: 8, fields: { purpose: '新目的', characters: ['玄真'] } },
      { kind: 'character-state', reason: 'r', character: '玄真', state: { mentalState: '起了疑心' }, updatedAtChapter: 8 },
      { kind: 'narrative-thread', reason: 'r', threadId: 12, title: '玄真的双面', type: '人物', authorIntent: '新意图', targetStartChapter: 3, targetEndChapter: 70 },
      { kind: 'planning-material', reason: 'r', name: '宗门秘辛', materialKind: 'world', content: '内容' },
    ]) as never as [never, never, never, never]

    expect(changePlanDiffLines(blueprint, snapshot())).toEqual([
      { field: 'purpose', current: '旧目的', proposed: '新目的' },
      { field: 'characters', current: '玄真', proposed: '玄真' },
    ])
    expect(changePlanDiffLines(state, snapshot())).toEqual([
      { field: 'mentalState', current: '位置：宗门；心理：平静', proposed: '起了疑心' },
    ])
    expect(changePlanDiffLines(thread, snapshot())).toEqual([
      { field: 'title', current: '玄真的双面', proposed: '玄真的双面' },
      { field: 'authorIntent', current: '旧意图', proposed: '新意图' },
      { field: 'targetStartChapter', current: '3', proposed: '3' },
      { field: 'targetEndChapter', current: '60', proposed: '70' },
    ])
    expect(changePlanDiffLines(material, snapshot())).toEqual([
      { field: 'name', current: '—', proposed: '宗门秘辛' },
    ])
  })

  it('labels known fields in both locales and falls back to the raw name', () => {
    expect(changePlanFieldLabel('worldSetting', 'zh-CN')).toBe('世界设定')
    expect(changePlanFieldLabel('worldSetting', 'en-US')).toBe('World setting')
    expect(changePlanFieldLabel('customField', 'zh-CN')).toBe('customField')
    expect(changePlanDisplayValue(['a', 'b'])).toBe('a、b')
    expect(changePlanDisplayValue(undefined)).toBe('—')
  })
})
