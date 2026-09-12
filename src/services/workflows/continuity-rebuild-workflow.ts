import type { ProjectSessionContext } from '../../shared/ipc-channels'
import type { WorkflowDefinition, WorkflowStep } from '../../stores/workflow-store'
import { workflowResourceKey } from '../../stores/workflow-store'
import {
  canResumeWorkflowCheckpoint,
  type WorkflowRecoveryCheckpoint,
  type WorkflowRecoveryMetadata,
} from '../../shared/workflow-recovery'
import { sameProjectPathKey, sameProjectSessionContext, projectSessionContextFromProject } from '../../shared/project-session-context'
import type { ContinuityImpactItem } from '../continuity-impact'
import { requireWorkflowProjectSession } from './workflow-project-session'

interface ContinuityRebuildParams {
  projectPath: string
  changedChapter: number
  impacts: readonly ContinuityImpactItem[]
}

interface FrozenContinuityRebuild {
  changedChapter: number
  affectedChapters: number[]
  impactIds: string[]
}

function positiveChapter(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label}无效`)
  return Number(value)
}

function parseJsonArray(value: unknown, label: string): unknown[] {
  if (typeof value !== 'string') throw new Error(`${label}缺失`)
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${label}无效`)
  }
  if (!Array.isArray(parsed)) throw new Error(`${label}无效`)
  return parsed
}

function freezeRebuild(params: ContinuityRebuildParams): FrozenContinuityRebuild {
  const changedChapter = positiveChapter(params.changedChapter, '改稿影响章节')
  if (!Array.isArray(params.impacts) || params.impacts.length === 0) {
    throw new Error('没有可重建的历史改稿影响')
  }
  const affectedChapters = [...new Set(params.impacts
    .flatMap(item => item.affectedChapters)
    .map(chapter => positiveChapter(chapter, '受影响章节'))
    .filter(chapter => chapter > changedChapter))]
    .sort((left, right) => left - right)
  if (affectedChapters.length === 0) throw new Error('历史改稿影响没有后续章节')
  const impactIds = [...new Set(params.impacts
    .map(item => item.id)
    .filter(id => typeof id === 'string' && id.trim() !== ''))]
    .sort((left, right) => left.localeCompare(right))
  if (impactIds.length === 0) throw new Error('历史改稿影响缺少稳定 ID')
  return { changedChapter, affectedChapters, impactIds }
}

function metadataOf(frozen: FrozenContinuityRebuild): WorkflowRecoveryMetadata {
  return {
    kind: 'continuity-rebuild',
    changedChapter: frozen.changedChapter,
    affectedChaptersJson: JSON.stringify(frozen.affectedChapters),
    impactIdsJson: JSON.stringify(frozen.impactIds),
  }
}

function frozenFromCheckpoint(checkpoint: WorkflowRecoveryCheckpoint): FrozenContinuityRebuild {
  if (checkpoint.type !== 'post_process' || checkpoint.resumeMetadata?.kind !== 'continuity-rebuild') {
    throw new Error('该恢复收据不是历史改稿重建工作流，不能由重建入口处理')
  }
  const changedChapter = positiveChapter(checkpoint.resumeMetadata.changedChapter, '恢复收据改稿影响章节')
  const affectedChapters = [...new Set(parseJsonArray(checkpoint.resumeMetadata.affectedChaptersJson, '恢复收据受影响章节')
    .map(chapter => positiveChapter(chapter, '恢复收据受影响章节'))
    .filter(chapter => chapter > changedChapter))]
    .sort((left, right) => left - right)
  if (affectedChapters.length === 0) throw new Error('恢复收据没有有效的后续章节')
  const impactIds = [...new Set(parseJsonArray(checkpoint.resumeMetadata.impactIdsJson, '恢复收据影响 ID')
    .filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
    .sort((left, right) => left.localeCompare(right))
  if (impactIds.length === 0) throw new Error('恢复收据没有有效的影响 ID')
  return { changedChapter, affectedChapters, impactIds }
}

function rebuildStep(chapterNumber: number): WorkflowDefinition['steps'][number] {
  return {
    name: `重建第${chapterNumber}章派生内容`,
    description: '从当前 finalized 正文重建连续性事实、角色状态和只读索引；不覆盖原稿或作者计划',
    executor: async (step: WorkflowStep, context, callbacks) => {
      const projectSession = requireWorkflowProjectSession(context)
      const { useProjectStore } = await import('../../stores/project-store')
      const { ipc } = await import('../ipc-client')
      const project = useProjectStore.getState().currentProject
      if (!project || !sameProjectSessionContext(projectSession, projectSessionContextFromProject(project))) {
        throw new Error('当前项目已切换，历史改稿重建已停止')
      }
      const draftMeta = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-finalized', chapterNumber, context.projectPath)
      if (!draftMeta) throw new Error(`第${chapterNumber}章没有可重建的 finalized 定稿`)
      const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', draftMeta.id, context.projectPath)
      if (!full) throw new Error(`第${chapterNumber}章正文读取失败`)
      const blueprint = await ipc.invokeWithProjectSession(projectSession, 'db:blueprint-get', chapterNumber, context.projectPath)
      const chapterTitle = typeof blueprint?.title === 'string' && blueprint.title.trim() ? blueprint.title : `第${chapterNumber}章`
      const chapterEntities = Array.isArray(blueprint?.characters)
        ? blueprint.characters.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        : []
      const { RunFinalizePostProcessCommand } = await import('./commands/finalize-chapter.command')
      await new RunFinalizePostProcessCommand({
        project,
        chapterNumber,
        chapterTitle,
        draftContent: full.content,
        draftId: draftMeta.id,
        sourceLabel: `历史改稿重建 · 第${chapterNumber}章`,
        stopOnFailure: true,
        onlyFailed: false,
        chapterEntities,
        // Rebuild derived projections only. Existing author-confirmed handoffs
        // and the immutable finalized manuscript remain untouched.
        enableChapterHandoff: false,
      }).execute({ step, context, callbacks })
      const { globalEventBus } = await import('../../shared/event-bus')
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['fileTree', 'characterCards', 'drafts'],
        projectPath: context.projectPath,
        projectSession,
      })
      return `第${chapterNumber}章派生内容已重建`
    },
  }
}

function createFromFrozen(frozen: FrozenContinuityRebuild, projectPath: string, sourceProjectSession: ProjectSessionContext): WorkflowDefinition {
  const steps = frozen.affectedChapters.map(rebuildStep)
  return {
    type: 'post_process',
    projectPath,
    projectSession: Object.freeze({ ...sourceProjectSession }),
    title: '历史改稿影响重建',
    resumeMetadata: metadataOf(frozen),
    resourceKeys: [
      workflowResourceKey('continuity'),
      workflowResourceKey('chapter-summary'),
      workflowResourceKey('character-roster'),
    ],
    readResourceKeys: frozen.affectedChapters.map(chapter => workflowResourceKey('chapter', chapter)),
    steps,
    onComplete: { mode: 'silent', message: '历史改稿影响重建完成' },
  }
}

export function createContinuityRebuildWorkflow(
  params: ContinuityRebuildParams,
  sourceProjectSession: ProjectSessionContext,
): WorkflowDefinition {
  const frozen = freezeRebuild(params)
  if (!sameProjectPathKey(params.projectPath, sourceProjectSession.projectPath)) throw new Error('历史改稿重建项目会话与路径不匹配')
  return createFromFrozen(frozen, params.projectPath, sourceProjectSession)
}

export function resumeContinuityRebuildWorkflowFromCheckpoint(
  checkpoint: WorkflowRecoveryCheckpoint,
  currentSession: ProjectSessionContext,
): WorkflowDefinition {
  const frozen = frozenFromCheckpoint(checkpoint)
  if (!canResumeWorkflowCheckpoint(checkpoint, currentSession)) {
    throw new Error('恢复收据所属项目会话已变化，已拒绝继续历史改稿重建')
  }
  return createFromFrozen(frozen, currentSession.projectPath, currentSession)
}
