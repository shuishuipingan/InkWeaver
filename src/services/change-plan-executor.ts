/**
 * 改动计划的执行器：按依赖顺序把每一项写进各自既有的受保护通道。
 *
 * 这里不发明新的写入方式——配置走 project_core、角色走角色名单提交（带
 * revision 与身份约束）、蓝图逐章 upsert（写前二次确认未定稿）、线索与规划
 * 资料走各自的仓库。计划无法原子提交，因此逐项记录结果并如实汇报
 * 已应用/已跳过/失败，便于作者重试或单独处理。
 */
import { ipc } from './ipc-client'
import { globalEventBus } from '../shared/event-bus'
import { useProjectStore } from '../stores/project-store'
import type { AgentExecutionContext } from './agent/tool-registry'
import { assertAgentProjectCurrent, requireAgentProject } from './agent/tools/project-context'
import {
  orderChangePlanItems,
  type ChangePlan,
  type ChangePlanItem,
  type ChangePlanItemKind,
  type ChangePlanValidation,
} from '../shared/change-plan'
import type { CharacterRosterEntry } from '../shared/character-roster'
import { runtimeLog } from './runtime-log'

/** 需要通过角色名单提交的条目类型。 */
type RosterPlanItem = Extract<ChangePlanItem, { kind: 'character-profile' | 'character-state' }>

export interface ChangePlanExecutionItemResult {
  index: number
  kind: ChangePlanItemKind
  label: string
  status: 'applied' | 'skipped' | 'failed'
  detail?: string
}

export interface ChangePlanExecutionReceipt {
  summary: string
  applied: number
  skipped: number
  failed: number
  items: ChangePlanExecutionItemResult[]
  targetIds: string[]
  /** Stable id of this execution, also used for the refresh events. */
  runId: string
}

const ARCHITECTURE_FILE_FIELDS: Readonly<Record<string, string>> = {
  premise: 'premise.md',
  worldbuilding: 'worldbuilding.md',
  synopsis: 'synopsis.md',
}

const EMPTY_CHARACTER_STATE = {
  location: '',
  powerLevel: '',
  physicalState: '',
  mentalState: '',
  keyItems: '',
  recentEvents: '',
} as const

function resolveRosterEntry(
  entries: readonly CharacterRosterEntry[],
  name: string,
): CharacterRosterEntry | undefined {
  const trimmed = name.trim()
  return entries.find(entry => entry.name === trimmed)
    ?? entries.find(entry => (entry.aliases ?? []).includes(trimmed))
}

/**
 * Applies one plan. Items that failed validation are reported as skipped, and
 * every write re-checks its own preconditions against the live project.
 */
export async function executeChangePlan(
  context: AgentExecutionContext | undefined,
  plan: ChangePlan,
  validation: ChangePlanValidation,
): Promise<ChangePlanExecutionReceipt> {
  const { project, projectSession } = requireAgentProject(context)
  const projectPath = project.path
  const runId = `change-plan-${crypto.randomUUID()}`
  const results: ChangePlanExecutionItemResult[] = []
  const targetIds: string[] = []

  const applicable: ChangePlanItem[] = []
  plan.items.forEach((item, index) => {
    const itemValidation = validation.items[index]
    if (itemValidation && (!itemValidation.ok || itemValidation.blocked)) {
      results.push({
        index,
        kind: item.kind,
        label: itemValidation.label,
        status: 'skipped',
        detail: [...itemValidation.errors, ...(itemValidation.blocked ? ['目标已定稿，不可自动改写'] : [])].join('；'),
      })
      return
    }
    applicable.push(item)
  })

  let architectureFields: string[] = []
  const rosterItems = applicable.filter(
    (item): item is RosterPlanItem => item.kind === 'character-profile' || item.kind === 'character-state',
  )
  const ordered = orderChangePlanItems(applicable)
  let rosterCommitted = false

  for (const item of ordered) {
    // 角色档案与状态共用一次名单提交，避免第二条用过期 revision 覆盖；
    // 提交位置仍按依赖顺序（架构之后、蓝图之前）。
    if (item.kind === 'character-profile' || item.kind === 'character-state') {
      if (rosterCommitted) continue
      rosterCommitted = true
      try {
        const detail = await commitRosterBatch(rosterItems, projectPath, context)
        for (const rosterItem of rosterItems) {
          results.push({
            index: plan.items.indexOf(rosterItem),
            kind: rosterItem.kind,
            label: describeItem(rosterItem),
            status: 'applied',
            detail,
          })
        }
        targetIds.push('character-roster')
      } catch (error) {
        for (const rosterItem of rosterItems) {
          results.push({
            index: plan.items.indexOf(rosterItem),
            kind: rosterItem.kind,
            label: describeItem(rosterItem),
            status: 'failed',
            detail: String(error),
          })
        }
      }
      continue
    }

    const index = plan.items.indexOf(item)
    try {
      const detail = await executeItem(item, {
        projectId: project.id,
        projectPath,
        projectSession,
        context,
      })
      results.push({ index, kind: item.kind, label: detail.label, status: 'applied', detail: detail.detail })
      targetIds.push(detail.targetId)
      if (item.kind === 'architecture') architectureFields = [...architectureFields, ...Object.keys(item.fields)]
    } catch (error) {
      results.push({
        index,
        kind: item.kind,
        label: describeItem(item),
        status: 'failed',
        detail: String(error),
      })
    }
  }

  assertAgentProjectCurrent(context)
  const applied = results.filter(result => result.status === 'applied').length
  if (applied > 0) emitRefresh(projectSession, runId, architectureFields)

  const skipped = results.filter(result => result.status === 'skipped').length
  const failed = results.filter(result => result.status === 'failed').length
  runtimeLog.info('agent', '多实体改动计划执行完成', {
    runId,
    applied,
    skipped,
    failed,
    items: results.length,
  })

  return {
    summary: plan.summary,
    applied,
    skipped,
    failed,
    items: results.sort((left, right) => left.index - right.index),
    targetIds,
    runId,
  }
}

function describeItem(item: ChangePlanItem): string {
  switch (item.kind) {
    case 'config':
      return `作品配置（${Object.keys(item.fields).join('、')}）`
    case 'architecture':
      return `架构设定（${Object.keys(item.fields).join('、')}）`
    case 'character-profile':
      return `${item.character} 的人物档案`
    case 'character-state':
      return `${item.character} 的当前状态`
    case 'blueprint':
      return `第 ${item.chapterNumber} 章蓝图`
    case 'narrative-thread':
      return item.threadId ? `线索 #${item.threadId}：${item.title}` : `新建线索：${item.title}`
    case 'planning-material':
      return `规划资料：${item.name}`
  }
}

interface ExecutionScope {
  projectId: string
  projectPath: string
  projectSession: ReturnType<typeof requireAgentProject>['projectSession']
  context: AgentExecutionContext | undefined
}

async function executeItem(item: ChangePlanItem, scope: ExecutionScope): Promise<{ label: string, detail: string, targetId: string }> {
  switch (item.kind) {
    case 'config': {
      const result = await ipc.invokeWithProjectSession(
        scope.projectSession,
        'db:project-core-update',
        item.fields,
        scope.projectPath,
      )
      assertAgentProjectCurrent(scope.context)
      if (!result.success) throw new Error(result.error ?? '作品配置写入失败')
      useProjectStore.getState().updateNovelConfig(item.fields, scope.projectSession)
      return { label: describeItem(item), detail: `已更新 ${Object.keys(item.fields).length} 个配置字段`, targetId: 'novel-config' }
    }
    case 'architecture': {
      const result = await ipc.invokeWithProjectSession(
        scope.projectSession,
        'db:project-core-update',
        item.fields,
        scope.projectPath,
      )
      assertAgentProjectCurrent(scope.context)
      if (!result.success) throw new Error(result.error ?? '架构设定写入失败')
      return { label: describeItem(item), detail: `已更新 ${Object.keys(item.fields).length} 个架构字段`, targetId: 'architecture' }
    }
    case 'blueprint': {
      const finalized = await ipc.invokeWithProjectSession(
        scope.projectSession,
        'db:draft-get-finalized',
        item.chapterNumber,
        scope.projectPath,
      )
      assertAgentProjectCurrent(scope.context)
      if (finalized) throw new Error(`第 ${item.chapterNumber} 章已定稿，写入前复核拒绝改写`)
      const current = await ipc.invokeWithProjectSession(
        scope.projectSession,
        'db:blueprint-get',
        item.chapterNumber,
        scope.projectPath,
      )
      assertAgentProjectCurrent(scope.context)
      if (!current) throw new Error(`第 ${item.chapterNumber} 章蓝图不存在`)
      const notesChanged = item.fields.notes !== undefined && item.fields.notes !== current.notes
      const result = await ipc.invokeWithProjectSession(
        scope.projectSession,
        'db:blueprint-upsert',
        {
          ...current,
          ...item.fields,
          ...(notesChanged ? { notesUpdatedAt: new Date().toISOString() } : {}),
        },
        scope.projectPath,
      )
      assertAgentProjectCurrent(scope.context)
      if (!result.success) throw new Error(result.error ?? '蓝图写入失败')
      return {
        label: describeItem(item),
        detail: `已更新 ${Object.keys(item.fields).join('、')}`,
        targetId: `blueprint:${item.chapterNumber}`,
      }
    }
    case 'narrative-thread': {
      if (item.threadId !== undefined) {
        const plans = await ipc.invokeWithProjectSession(
          scope.projectSession,
          'db:narrative-thread-list',
          scope.projectPath,
        )
        assertAgentProjectCurrent(scope.context)
        const existing = plans.find(plan => plan.id === item.threadId)
        if (!existing) throw new Error(`线索 #${item.threadId} 不存在`)
        const result = await ipc.invokeWithProjectSession(
          scope.projectSession,
          'db:narrative-thread-plan-update',
          item.threadId,
          {
            title: item.title,
            type: item.type,
            authorIntent: item.authorIntent,
            targetStartChapter: item.targetStartChapter,
            targetEndChapter: item.targetEndChapter,
            lane: item.lane ?? existing.lane ?? 'sub',
            ...(existing.parentId ? { parentId: existing.parentId } : {}),
          },
          scope.projectPath,
        )
        assertAgentProjectCurrent(scope.context)
        if (!result.success) throw new Error(result.error ?? '线索更新失败')
        return { label: describeItem(item), detail: '已更新线索规划', targetId: `narrative-thread:${item.threadId}` }
      }
      const result = await ipc.invokeWithProjectSession(
        scope.projectSession,
        'db:narrative-thread-plan-create',
        {
          title: item.title,
          type: item.type,
          authorIntent: item.authorIntent,
          targetStartChapter: item.targetStartChapter,
          targetEndChapter: item.targetEndChapter,
          lane: item.lane ?? 'sub',
        },
        scope.projectPath,
      )
      assertAgentProjectCurrent(scope.context)
      if (!result.success || !result.plan) throw new Error(result.error ?? '线索创建失败')
      return { label: describeItem(item), detail: '已创建线索规划', targetId: `narrative-thread:${result.plan.id}` }
    }
    case 'planning-material': {
      const result = await ipc.invokeWithProjectSession(
        scope.projectSession,
        'db:planning-material-upsert',
        { name: item.name, kind: item.materialKind, content: item.content },
        scope.projectPath,
      )
      assertAgentProjectCurrent(scope.context)
      if (!result.success) throw new Error(result.error ?? '规划资料写入失败')
      return {
        label: describeItem(item),
        detail: '已写入为候选规划资料（需作者在资料列表中确认后才会用于生成）',
        targetId: `planning-material:${item.name}`,
      }
    }
    case 'character-profile':
    case 'character-state':
      throw new Error('角色条目必须批量提交')
  }
}

/** 角色档案与状态共用一次名单提交，避免第二条用过期 revision 覆盖。 */
async function commitRosterBatch(
  items: readonly RosterPlanItem[],
  projectPath: string,
  context: AgentExecutionContext | undefined,
): Promise<string> {
  const { projectSession } = requireAgentProject(context)
  const snapshot = await ipc.invokeWithProjectSession(projectSession, 'db:character-roster-read', projectPath)
  assertAgentProjectCurrent(context)
  if (snapshot.status !== 'ready' && snapshot.status !== 'empty') {
    throw new Error(`角色名单当前状态为 ${snapshot.status}，无法通过改动计划写入；请先在角色管理中处理`)
  }
  const originalNames = snapshot.entries.map(entry => entry.name).join('\u0000')
  const entries = snapshot.entries.map(entry => ({
    ...entry,
    relationships: entry.relationships.map(relationship => ({ ...relationship })),
    ...(entry.currentState ? { currentState: { ...entry.currentState } } : {}),
  }))

  const touched = new Set<string>()
  for (const item of items) {
    const entry = resolveRosterEntry(entries, item.character)
    if (!entry) throw new Error(`角色名单中没有「${item.character}」`)
    touched.add(entry.name)
    if (item.kind === 'character-profile') {
      for (const [field, value] of Object.entries(item.fields)) {
        if (value === undefined) continue
        ;(entry as unknown as Record<string, unknown>)[field] = value
      }
      if (item.relationships) {
        entry.relationships = item.relationships.map(relationship => ({
          target: relationship.target,
          relation: relationship.relation,
        }))
      }
    } else {
      // 作者确认过的状态更新按 author 记账，避免后续模型推演覆盖这次决定。
      entry.currentState = {
        ...EMPTY_CHARACTER_STATE,
        ...(entry.currentState ?? {}),
        ...item.state,
        updatedAtChapter: item.updatedAtChapter,
        provenance: { source: 'author' as const },
      }
    }
  }

  if (entries.map(entry => entry.name).join('\u0000') !== originalNames) {
    throw new Error('改动计划不得新增或删除角色；新角色必须先经过候选确认流程')
  }

  const result = await ipc.invokeWithProjectSession(
    projectSession,
    'db:character-roster-commit',
    {
      operationId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      schemaVersion: 1,
      entries,
      intent: 'manual_edit',
      fullIdentityRename: false,
    },
    projectPath,
  )
  assertAgentProjectCurrent(context)
  if (!result.success || !result.receipt) throw new Error(result.error ?? '角色名单写入失败')
  return `已更新 ${touched.size} 名角色（名单 revision ${result.receipt.revision}）`
}

function emitRefresh(
  projectSession: ReturnType<typeof requireAgentProject>['projectSession'],
  runId: string,
  architectureFields: readonly string[],
): void {
  globalEventBus.emit('REFRESH_RESOURCE', {
    resources: ['characterCards', 'blueprints', 'fileTree', 'drafts'],
    projectPath: projectSession.projectPath,
    projectSession,
  })
  for (const field of new Set(architectureFields)) {
    const fileName = ARCHITECTURE_FILE_FIELDS[field]
    if (!fileName) continue
    globalEventBus.emit('ARCH_FILE_UPDATED', {
      fileName,
      projectPath: projectSession.projectPath,
      projectSession,
      runId,
    })
  }
}
