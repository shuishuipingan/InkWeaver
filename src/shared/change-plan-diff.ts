/**
 * 改动计划预览的字段级对比（纯函数）。
 *
 * 确认卡片必须让作者看到"当前值 → 建议值"，而不是只看到目标名称；
 * 这里把计划条目对到项目快照中的真实当前值，便于逐项核对。
 */
import type { ChangeImpactSnapshot } from './change-impact'
import type { ChangePlanItem } from './change-plan'

export interface ChangePlanDiffLine {
  field: string
  current: string
  proposed: string
}

const FIELD_LABELS: Record<string, readonly [string, string]> = {
  genre: ['类型', 'Genre'], subGenre: ['子类型', 'Subgenre'], targetAudience: ['目标读者', 'Target audience'],
  totalChapters: ['总章节数', 'Total chapters'], wordsPerChapter: ['每章字数', 'Words per chapter'],
  plotStructure: ['情节结构', 'Plot structure'], narrativePOV: ['叙事视角', 'Narrative POV'],
  writingLanguage: ['写作语言', 'Writing language'], writingStyle: ['写作风格', 'Writing style'],
  referenceWorks: ['参考作品', 'Reference works'], goldenFinger: ['金手指', 'Special advantage'],
  globalGuidance: ['全局指导', 'Global guidance'], coreOutline: ['核心大纲', 'Core outline'],
  worldSetting: ['世界设定', 'World setting'], protagonistProfile: ['主角设定', 'Protagonist profile'],
  premise: ['故事前提', 'Premise'], worldbuilding: ['世界观文档', 'Worldbuilding'], synopsis: ['剧情概要', 'Synopsis'],
  role: ['定位', 'Role'], gender: ['性别', 'Gender'], age: ['年龄', 'Age'], appearance: ['外貌', 'Appearance'],
  personality: ['性格', 'Personality'], background: ['背景', 'Background'], abilities: ['能力', 'Abilities'],
  motivation: ['动机', 'Motivation'], arc: ['弧光', 'Arc'], notes: ['备注', 'Notes'],
  title: ['标题', 'Title'], purpose: ['目的', 'Purpose'], keyEvents: ['关键事件', 'Key events'],
  characters: ['出场角色', 'Characters'], suspenseHook: ['悬念钩子', 'Suspense hook'],
  userGuidance: ['作者指导', 'Author guidance'],
  location: ['位置', 'Location'], powerLevel: ['实力', 'Power level'], physicalState: ['身体状态', 'Physical state'],
  mentalState: ['心理状态', 'Mental state'], keyItems: ['关键物品', 'Key items'], recentEvents: ['近期事件', 'Recent events'],
}

export function changePlanFieldLabel(field: string, locale: string): string {
  const labels = FIELD_LABELS[field]
  if (!labels) return field
  return locale === 'zh-CN' ? labels[0] : labels[1]
}

export function changePlanDisplayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join('、')
  if (value === undefined || value === null || value === '') return '—'
  return String(value)
}

function findCharacter(name: string, snapshot: ChangeImpactSnapshot) {
  return snapshot.characters.find(
    character => character.name === name || character.aliases.includes(name),
  )
}

function currentValueOf(item: ChangePlanItem, field: string, snapshot: ChangeImpactSnapshot): unknown {
  const core = snapshot.core as unknown as Record<string, unknown> | null
  switch (item.kind) {
    case 'config':
    case 'architecture':
      return core ? core[field] : undefined
    case 'character-profile':
      return (findCharacter(item.character, snapshot) as unknown as Record<string, unknown> | undefined)?.[field]
    case 'character-state':
      return findCharacter(item.character, snapshot)?.currentState?.state
    case 'blueprint':
      return (snapshot.blueprints.find(
        blueprint => blueprint.chapterNumber === item.chapterNumber,
      ) as unknown as Record<string, unknown> | undefined)?.[field]
    default:
      return undefined
  }
}

/** 「当前值 → 建议值」列表；未在快照中找到当前值时显示为 —。 */
export function changePlanDiffLines(item: ChangePlanItem, snapshot: ChangeImpactSnapshot): ChangePlanDiffLine[] {
  switch (item.kind) {
    case 'config':
    case 'architecture':
    case 'character-profile':
    case 'blueprint':
      return Object.entries(item.fields).map(([field, value]) => ({
        field,
        current: changePlanDisplayValue(currentValueOf(item, field, snapshot)),
        proposed: changePlanDisplayValue(value),
      }))
    case 'character-state':
      return Object.entries(item.state).map(([field, value]) => ({
        field,
        current: changePlanDisplayValue(currentValueOf(item, field, snapshot)),
        proposed: changePlanDisplayValue(value),
      }))
    case 'narrative-thread': {
      const existing = item.threadId
        ? snapshot.threads.find(thread => thread.id === item.threadId)
        : undefined
      return [
        { field: 'title', current: changePlanDisplayValue(existing?.title), proposed: item.title },
        { field: 'authorIntent', current: changePlanDisplayValue(existing?.authorIntent), proposed: item.authorIntent },
        { field: 'targetStartChapter', current: changePlanDisplayValue(existing?.targetStartChapter), proposed: String(item.targetStartChapter) },
        { field: 'targetEndChapter', current: changePlanDisplayValue(existing?.targetEndChapter), proposed: String(item.targetEndChapter) },
      ]
    }
    case 'planning-material': {
      const existing = snapshot.planningMaterials.find(material => material.name === item.name)
      return [{ field: 'name', current: changePlanDisplayValue(existing?.name), proposed: item.name }]
    }
  }
}
