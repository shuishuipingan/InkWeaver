/**
 * 改动影响分析的服务层：用当前冻结的项目会话读取真实项目状态，再交给
 * `src/shared/change-impact.ts` 的确定性分析器。读取全部走会话通道，
 * 任何一种事实缺失都降级为"该维度为空"，不影响其余维度。
 */
import type { ProjectSessionContext } from '../shared/ipc-channels'
import { ipc } from './ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './agent/tools/project-context'
import type { AgentExecutionContext } from './agent/tool-registry'
import {
  analyzeChangeImpact,
  detectChangeImpactMentions,
  type ChangeImpactReport,
  type ChangeImpactRequest,
  type ChangeImpactSnapshot,
} from '../shared/change-impact'
import type { ChangePlanContext } from '../shared/change-plan'
import type { CharacterRosterCharacterState } from '../shared/character-roster'
import type { FinalizedContinuityFact } from '../shared/finalized-continuity'

/**
 * 只读作用域：工具用冻结的 Agent 上下文构造，确认卡片用工具调用上记录
 * 的项目会话构造。两者都不重新读取"当前项目"，避免跨会话误读。
 */
export interface ChangeImpactScope {
  projectSession: ProjectSessionContext
  projectPath: string
  projectName: string
}

export function changeImpactScopeFromContext(context?: AgentExecutionContext): ChangeImpactScope {
  const { project, projectSession } = requireAgentProject(context)
  return { projectSession, projectPath: project.path, projectName: project.name }
}

const MAX_SNAPSHOT_CHARACTERS = 200
const MAX_SNAPSHOT_BLUEPRINTS = 400
const MAX_SNAPSHOT_THREADS = 200
const MAX_SNAPSHOT_MATERIALS = 40
const MAX_SNAPSHOT_FACTS = 300
const MAX_KNOWLEDGE_CHARACTERS = 8
const PLANNING_EXCERPT_CHARS = 2_000

async function safeRead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 把结构化状态压成一行可读证据，供影响报告引用。 */
function formatCharacterState(state: CharacterRosterCharacterState | undefined): string | undefined {
  if (!state) return undefined
  const parts = [
    ['位置', state.location],
    ['实力', state.powerLevel],
    ['身体', state.physicalState],
    ['心理', state.mentalState],
    ['关键物品', state.keyItems],
    ['近期事件', state.recentEvents],
  ]
    .filter(([, value]) => text(value).trim())
    .map(([label, value]) => `${label}：${text(value)}`)
  return parts.length > 0 ? parts.join('；') : undefined
}

/**
 * Read every project dimension the impact analysis needs. Each read is
 * independent: a failing dimension degrades to empty rather than failing the
 * whole analysis, and the project-session guard is re-asserted afterwards.
 */
export async function loadChangeImpactSnapshot(
  scope: ChangeImpactScope,
  options: { knowledgeCharacters?: readonly string[] } = {},
): Promise<ChangeImpactSnapshot> {
  const { projectSession, projectPath } = scope
  const projectName = scope.projectName

  const [core, roster, blueprints, drafts, handoffs, threads, materials, continuity] = await Promise.all([
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:project-core-get', projectPath)),
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:character-roster-read', projectPath)),
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:blueprint-get-all', projectPath)),
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:draft-list-all', projectPath)),
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:chapter-handoff-list-all', projectPath)),
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:narrative-thread-list', projectPath)),
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:planning-material-list', 'confirmed', projectPath)),
    safeRead(() => ipc.invokeWithProjectSession(projectSession, 'db:continuity-list-all', projectPath)),
  ])

  const blueprintList = asArray<{ chapterNumber?: unknown; title?: unknown; role?: unknown; purpose?: unknown; keyEvents?: unknown; characters?: unknown; suspenseHook?: unknown; userGuidance?: unknown; notes?: unknown }>(blueprints)
    .slice(0, MAX_SNAPSHOT_BLUEPRINTS)
    .map(blueprint => ({
      chapterNumber: Number(blueprint.chapterNumber),
      title: text(blueprint.title),
      role: text(blueprint.role),
      purpose: text(blueprint.purpose),
      keyEvents: text(blueprint.keyEvents),
      characters: asArray<string>(blueprint.characters).map(name => text(name)).filter(Boolean),
      suspenseHook: text(blueprint.suspenseHook),
      userGuidance: text(blueprint.userGuidance),
      notes: text(blueprint.notes),
    }))
    .filter(blueprint => Number.isSafeInteger(blueprint.chapterNumber) && blueprint.chapterNumber > 0)

  const draftList = asArray<{ chapterNumber: number; status: string; version: number }>(drafts).map(draft => ({
    chapterNumber: draft.chapterNumber,
    status: text(draft.status),
    version: draft.version,
  }))

  const knowledgeEvents = await loadKnowledgeEvents(
    scope,
    options.knowledgeCharacters ?? [],
    knowledgeChapterOf(blueprintList, draftList),
  )

  return {
    projectName: text(core?.projectName) || projectName,
    core: core ? {
      genre: text(core.genre),
      subGenre: text(core.subGenre),
      targetAudience: text(core.targetAudience),
      totalChapters: core.totalChapters,
      wordsPerChapter: core.wordsPerChapter,
      writingLanguage: text(core.writingLanguage),
      creativeStrategy: text(core.creativeStrategy),
      narrativePov: text(core.narrativePov),
      plotStructure: text(core.plotStructure),
      coreOutline: text(core.coreOutline),
      worldSetting: text(core.worldSetting),
      protagonistProfile: text(core.protagonistProfile),
      globalGuidance: text(core.globalGuidance),
      goldenFinger: text(core.goldenFinger),
      premise: text(core.premise),
      worldbuilding: text(core.worldbuilding),
      synopsis: text(core.synopsis),
      writingStyle: text(core.writingStyle),
      referenceWorks: text(core.referenceWorks),
    } : null,
    characters: asArray<CharacterRosterSnapshotEntry>(roster?.entries)
      .slice(0, MAX_SNAPSHOT_CHARACTERS)
      .map(entry => {
        const state = formatCharacterState(entry.currentState)
        return {
          name: text(entry.name),
          aliases: asArray<string>(entry.aliases).map(alias => text(alias)).filter(Boolean),
          role: text(entry.role),
          appearance: text(entry.appearance),
          personality: text(entry.personality),
          background: text(entry.background),
          abilities: text(entry.abilities),
          motivation: text(entry.motivation),
          arc: text(entry.arc),
          notes: text(entry.notes),
          relationships: asArray<{ target?: unknown; relation?: unknown }>(entry.relationships)
            .map(relationship => ({ target: text(relationship?.target), relation: text(relationship?.relation) }))
            .filter(relationship => relationship.target),
          ...(state
            ? { currentState: { state, updatedAtChapter: entry.currentState?.updatedAtChapter ?? 0 } }
            : {}),
        }
      })
      .filter(character => character.name),
    blueprints: blueprintList,
    drafts: draftList,
    handoffs: asArray<{ chapterNumber: number; status?: unknown; presentCharacters?: unknown; immediateGoal?: unknown }>(handoffs).map(handoff => ({
      chapterNumber: handoff.chapterNumber,
      status: text(handoff.status),
      presentCharacters: asArray<string>(handoff.presentCharacters).map(name => text(name)).filter(Boolean),
      immediateGoal: text(handoff.immediateGoal),
    })),
    knowledgeEvents,
    threads: asArray<{ id: number; title?: unknown; type?: unknown; authorIntent?: unknown; targetStartChapter: number; targetEndChapter: number; lane?: unknown; status?: unknown }>(threads)
      .slice(0, MAX_SNAPSHOT_THREADS)
      .map(thread => ({
        id: thread.id,
        title: text(thread.title),
        type: text(thread.type),
        authorIntent: text(thread.authorIntent),
        targetStartChapter: thread.targetStartChapter,
        targetEndChapter: thread.targetEndChapter,
        lane: text(thread.lane),
        status: text(thread.status),
      })),
    planningMaterials: asArray<{ id?: unknown; name?: unknown; kind?: unknown; status?: unknown; content?: unknown }>(materials)
      .slice(0, MAX_SNAPSHOT_MATERIALS)
      .map(material => ({
        id: text(material.id),
        name: text(material.name),
        kind: text(material.kind),
        status: text(material.status),
        excerpt: text(material.content).slice(0, PLANNING_EXCERPT_CHARS),
      })),
    continuityFacts: asArray<{ chapterNumber?: unknown; facts?: unknown }>(continuity)
      .flatMap(projection => asArray<FinalizedContinuityFact>(projection.facts).map(fact => ({
        category: text(fact.category),
        entities: asArray<string>(fact.entities).map(entity => text(entity)).filter(Boolean),
        statement: text(fact.statement),
        sourceChapter: Number(projection.chapterNumber) || 0,
      })))
      .slice(0, MAX_SNAPSHOT_FACTS),
  }
}

type CharacterRosterSnapshotEntry = {
  name: string
  aliases?: string[]
  role: string
  appearance: string
  personality: string
  background: string
  abilities: string
  motivation: string
  arc: string
  notes: string
  relationships?: unknown
  currentState?: CharacterRosterCharacterState
}

export async function analyzeProjectChangeImpact(
  context: AgentExecutionContext | undefined,
  request: ChangeImpactRequest,
): Promise<ChangeImpactReport> {
  const scope = changeImpactScopeFromContext(context)
  const base = await loadChangeImpactSnapshot(scope)
  const mentions = detectChangeImpactMentions(base, request)
  // 已知涉及哪些角色后，再按"当前故事进度"读一次知情边界，避免整份快照重读。
  const snapshot = mentions.characters.length === 0
    ? base
    : {
      ...base,
      knowledgeEvents: await loadKnowledgeEvents(
        scope,
        mentions.characters,
        knowledgeChapterOf(base.blueprints, base.drafts),
      ),
    }
  assertAgentProjectCurrent(context)
  return analyzeChangeImpact(snapshot, request)
}

/** The facts a change plan is validated against, read from the same session. */
export async function loadChangePlanContext(scope: ChangeImpactScope): Promise<ChangePlanContext> {
  return changePlanContextFromSnapshot(await loadChangeImpactSnapshot(scope))
}

/** Snapshot + validation facts, for previews that must also show current values. */
export async function loadChangePlanPreview(
  scope: ChangeImpactScope,
): Promise<{ context: ChangePlanContext; snapshot: ChangeImpactSnapshot }> {
  const snapshot = await loadChangeImpactSnapshot(scope)
  return { context: changePlanContextFromSnapshot(snapshot), snapshot }
}

function knowledgeChapterOf(
  blueprints: ReadonlyArray<{ chapterNumber: number }>,
  drafts: ReadonlyArray<{ chapterNumber: number; status: string }>,
): number {
  return Math.max(
    1,
    ...blueprints.map(blueprint => blueprint.chapterNumber),
    ...drafts.filter(draft => draft.status === 'finalized').map(draft => draft.chapterNumber),
  )
}

/** 知情边界：每个角色在给定章节时点已经知道什么。 */
async function loadKnowledgeEvents(
  scope: ChangeImpactScope,
  characters: readonly string[],
  chapterNumber: number,
): Promise<ChangeImpactSnapshot['knowledgeEvents']> {
  const names = characters.map(name => name.trim()).filter(Boolean).slice(0, MAX_KNOWLEDGE_CHARACTERS)
  if (names.length === 0) return []
  const batches = await Promise.all(names.map(character => safeRead(
    () => ipc.invokeWithProjectSession(
      scope.projectSession,
      'db:knowledge-event-list-review',
      [character],
      chapterNumber,
      scope.projectPath,
    ),
  )))
  return batches
    .flatMap(events => asArray<{
      character?: unknown
      information?: unknown
      certainty?: unknown
      falseBelief?: unknown
      sourceChapter?: unknown
    }>(events).map(event => ({
      character: text(event.character),
      information: text(event.information),
      certainty: text(event.certainty),
      falseBelief: event.falseBelief === true,
      sourceChapter: Number(event.sourceChapter) || 0,
    })))
    .filter(event => event.character && event.information)
}

function changePlanContextFromSnapshot(snapshot: ChangeImpactSnapshot): ChangePlanContext {
  const finalizedChapters = [...new Set(
    snapshot.drafts.filter(draft => draft.status === 'finalized').map(draft => draft.chapterNumber),
  )].sort((left, right) => left - right)
  const maxChapter = Math.max(
    0,
    ...snapshot.blueprints.map(blueprint => blueprint.chapterNumber),
    ...finalizedChapters,
  )
  return {
    characters: snapshot.characters.map(character => ({
      name: character.name,
      aliases: character.aliases,
    })),
    blueprintChapters: snapshot.blueprints.map(blueprint => blueprint.chapterNumber),
    finalizedChapters,
    threads: snapshot.threads.map(thread => ({ id: thread.id })),
    maxChapter,
  }
}
