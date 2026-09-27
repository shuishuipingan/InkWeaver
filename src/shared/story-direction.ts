import type { BlueprintData } from '../../electron/repositories/blueprint-repository'
import type { ProjectCoreData } from '../../electron/repositories/project-core-repository'
import type { CharacterRosterEntry } from './character-roster'
import type { NarrativeThreadPlanInput } from './narrative-thread'

export const STORY_DIRECTION_CORE_FIELDS = [
  'coreOutline', 'worldSetting', 'protagonistProfile', 'globalGuidance',
  'premise', 'worldbuilding', 'synopsis', 'goldenFinger',
] as const satisfies readonly (keyof ProjectCoreData)[]

export const STORY_DIRECTION_BLUEPRINT_FIELDS = [
  'title', 'role', 'purpose', 'keyEvents', 'suspenseHook', 'userGuidance',
] as const satisfies readonly (keyof BlueprintData)[]

export type StoryDirectionCoreField = typeof STORY_DIRECTION_CORE_FIELDS[number]
export type StoryDirectionBlueprintField = typeof STORY_DIRECTION_BLUEPRINT_FIELDS[number]
export const STORY_DIRECTION_CHARACTER_FIELDS = ['personality', 'abilities', 'motivation', 'arc', 'notes'] as const satisfies readonly (keyof CharacterRosterEntry)[]
export type StoryDirectionCharacterField = typeof STORY_DIRECTION_CHARACTER_FIELDS[number]

export interface StoryDirectionSnapshot {
  core: ProjectCoreData
  blueprints: BlueprintData[]
  drafts: Array<{ id: number; chapterNumber: number; version: number; status: string }>
  threadPlans: Array<NarrativeThreadPlanInput & { id: number }>
  fingerprint: string
}

export interface StoryDirectionBlueprintChange {
  chapterNumber: number
  changes: Partial<Pick<BlueprintData, StoryDirectionBlueprintField>>
}

export interface StoryDirectionApplyRequest {
  expectedFingerprint: string
  coreChanges: Partial<Pick<ProjectCoreData, StoryDirectionCoreField>>
  blueprintChanges: StoryDirectionBlueprintChange[]
  characterChanges?: Array<{ name: string; changes: Partial<Pick<CharacterRosterEntry, StoryDirectionCharacterField>> }>
  expectedRosterRevision?: number
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
  newNarrativeThreads: NarrativeThreadPlanInput[]
  blueprintChanges: StoryDirectionBlueprintChange[]
  drafts: Array<{ draftId: number; chapterNumber: number; status: 'pending' | 'failed' | 'completed'; revisionId?: number; error?: string }>
}
