import type { BlueprintData } from '../../electron/repositories/blueprint-repository'
import type { ProjectCoreData } from '../../electron/repositories/project-core-repository'
import type { CharacterRosterEntry } from './character-roster'
import type { NarrativeThreadPlanInput } from './narrative-thread'
import type { StoryDirectionTerminologyReplacement } from './story-direction-terminology'

export const STORY_DIRECTION_CORE_FIELDS = [
  'coreOutline', 'worldSetting', 'protagonistProfile', 'globalGuidance',
  'premise', 'worldbuilding', 'synopsis', 'goldenFinger',
] as const satisfies readonly (keyof ProjectCoreData)[]

export const STORY_DIRECTION_BLUEPRINT_FIELDS = [
  'title', 'role', 'purpose', 'keyEvents', 'suspenseHook', 'userGuidance',
] as const satisfies readonly (keyof BlueprintData)[]

export type StoryDirectionCoreField = typeof STORY_DIRECTION_CORE_FIELDS[number]
export type StoryDirectionBlueprintField = typeof STORY_DIRECTION_BLUEPRINT_FIELDS[number]
/**
 * AI 可以直接重写的角色档案字段。name 是身份主键、currentState 是定稿推导
 * 的动态事实、relationships 需要闭合校验，因此这三项仍由系统维护。
 */
export const STORY_DIRECTION_CHARACTER_FIELDS = [
  'role', 'gender', 'age', 'appearance', 'background',
  'personality', 'abilities', 'motivation', 'arc', 'notes',
] as const satisfies readonly (keyof CharacterRosterEntry)[]
export type StoryDirectionCharacterField = typeof STORY_DIRECTION_CHARACTER_FIELDS[number]

/** 关系只能改描述或替换成名单内的角色，不能凭空造人。 */
export interface StoryDirectionCharacterRelationship {
  target: string
  relation: string
}

export interface StoryDirectionCharacterChange {
  name: string
  changes: Partial<Pick<CharacterRosterEntry, StoryDirectionCharacterField>>
  /** 给出时整份替换该角色的关系列表（目标必须是现有角色）。 */
  relationships?: StoryDirectionCharacterRelationship[]
}

export interface StoryDirectionSnapshot {
  core: ProjectCoreData
  blueprints: BlueprintData[]
  drafts: Array<{ id: number; chapterNumber: number; version: number; status: string }>
  threadPlans: Array<NarrativeThreadPlanInput & { id: number }>
  fingerprint: string
}

export interface StoryDirectionBlueprintChange {
  chapterNumber: number
  changes: Partial<Pick<BlueprintData, StoryDirectionBlueprintField>> & {
    /** 给出时整份替换本章出场角色；每个名字都必须是角色名单里的现有角色。 */
    characters?: string[]
  }
}

export interface StoryDirectionApplyRequest {
  expectedFingerprint: string
  coreChanges: Partial<Pick<ProjectCoreData, StoryDirectionCoreField>>
  blueprintChanges: StoryDirectionBlueprintChange[]
  characterChanges?: StoryDirectionCharacterChange[]
  expectedRosterRevision?: number
  terminologyReplacements?: StoryDirectionTerminologyReplacement[]
  /** Draft chapters that should receive reviewable candidate revisions for explicit terminology changes. */
  draftCandidateChapterNumbers?: number[]
  idea?: string
  modelId?: string
  generateDraftCandidates?: boolean
  newNarrativeThreads?: NarrativeThreadPlanInput[]
}

export interface StoryDirectionRun {
  id: string
  idea: string
  modelId: string
  coreChanges: StoryDirectionApplyRequest['coreChanges']
  characterChanges: NonNullable<StoryDirectionApplyRequest['characterChanges']>
  terminologyReplacements: NonNullable<StoryDirectionApplyRequest['terminologyReplacements']>
  newNarrativeThreads: NarrativeThreadPlanInput[]
  blueprintChanges: StoryDirectionBlueprintChange[]
  drafts: Array<{ draftId: number; chapterNumber: number; status: 'pending' | 'failed' | 'completed'; revisionId?: number; error?: string }>
}
