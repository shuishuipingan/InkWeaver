import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'

import type { BlueprintData } from '../../../electron/repositories/blueprint-repository'
import type { CharacterRosterSnapshot } from '../../shared/character-roster'
import { countDraftUnits } from '../../shared/draft-units'
import { textFingerprint } from '../../shared/character-extraction'
import {
  parseExplicitTerminologyReplacements,
  replaceTerminologyText,
} from '../../shared/story-direction-terminology'
import {
  STORY_DIRECTION_CORE_FIELDS,
  type StoryDirectionBlueprintChange,
  type StoryDirectionSnapshot,
  type StoryDirectionRun,
} from '../../shared/story-direction'
import { globalEventBus } from '../../shared/event-bus'
import { ipc } from '../../services/ipc-client'
import { requireIpcSuccess } from '../../services/ipc-result'
import { decodeBlueprintDirectionChanges, decodeCoreDirectionChanges } from '../../services/story-direction-planner'
import { useLLMStore } from '../../stores/llm-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { useCharacterStore } from '../../stores/character-store'
import { useEditorStore } from '../../stores/editor-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { runtimeLog } from '../../services/runtime-log'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/Dialog'
import { captureProjectSession, isProjectSessionCurrent } from '../project-session-gate'

interface Props {
  open: boolean
  onClose: () => void
  onApplied: () => void | Promise<void>
}

type CorePlan = ReturnType<typeof decodeCoreDirectionChanges>
interface PartialPlan {
  fingerprint: string
  rosterRevision: number | null
  idea: string
  start: number
  end: number
  modelId: string
  core: CorePlan
  chapterChanges: StoryDirectionBlueprintChange[]
  nextCharacterBatch: number
  nextBatch: number
}

const CONFIG_KEYS = new Set(['coreOutline', 'worldSetting', 'protagonistProfile', 'globalGuidance', 'goldenFinger'])
const BATCH_SIZE = 5
const DIRECTION_FIELD_LABELS: Record<string, readonly [string, string]> = {
  coreOutline: ['核心大纲', 'Core outline'], worldSetting: ['世界设定', 'World setting'],
  protagonistProfile: ['主角设定', 'Protagonist profile'], globalGuidance: ['全局指导', 'Global guidance'],
  goldenFinger: ['金手指', 'Special advantage'], premise: ['故事前提', 'Premise'],
  worldbuilding: ['世界观', 'World building'], synopsis: ['情节大纲', 'Synopsis'],
  personality: ['性格', 'Personality'], abilities: ['能力', 'Abilities'],
  motivation: ['动机', 'Motivation'], arc: ['角色弧光', 'Character arc'], notes: ['备注', 'Notes'],
  title: ['章节标题', 'Chapter title'], role: ['章节定位', 'Chapter role'],
  purpose: ['章节目的', 'Purpose'], keyEvents: ['关键事件', 'Key events'], suspenseHook: ['悬念钩子', 'Suspense hook'],
  userGuidance: ['作者指导', 'Author guidance'],
}

function directionFieldLabel(field: string, text: (zhCNText: string, enUSText: string) => string): string {
  const labels = DIRECTION_FIELD_LABELS[field]
  return labels ? text(labels[0], labels[1]) : field
}

function compact(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`
}

function selectedBlueprints(snapshot: StoryDirectionSnapshot, start: number, end: number): BlueprintData[] {
  const finalized = new Set(snapshot.drafts.filter(draft => draft.status === 'finalized').map(draft => draft.chapterNumber))
  return snapshot.blueprints.filter(item => item.chapterNumber >= start && item.chapterNumber <= end && !finalized.has(item.chapterNumber))
}

export default function StoryDirectionDialog({ open, onClose, onApplied }: Props) {
  const text = useLocaleStore(state => state.text)
  const currentProject = useProjectStore(state => state.currentProject)
  const hasUnsavedProjectConfig = useProjectStore(state => currentProject
    ? state.hasUnsavedNovelConfig(currentProject.path) : false)
  const hasUnsavedCharacterDraft = useCharacterStore(state => currentProject
    ? state.hasUnsavedCharacterDraft(currentProject.path) : false)
  const editorTabs = useEditorStore(state => state.tabs)
  const activeRuns = useWorkflowStore(state => state.activeRuns)
  const projectSession = captureProjectSession(currentProject)
  const sessionKey = projectSession ? `${projectSession.projectId}:${projectSession.leaseId}` : ''
  const [snapshot, setSnapshot] = useState<StoryDirectionSnapshot | null>(null)
  const [roster, setRoster] = useState<CharacterRosterSnapshot | null>(null)
  const [latestRun, setLatestRun] = useState<StoryDirectionRun | null>(null)
  const [idea, setIdea] = useState('')
  const [startChapter, setStartChapter] = useState(1)
  const [endChapter, setEndChapter] = useState(1)
  const [includeDrafts, setIncludeDrafts] = useState(true)
  const [largeRunConfirmed, setLargeRunConfirmed] = useState(false)
  const [largeDraftRunConfirmed, setLargeDraftRunConfirmed] = useState(false)
  const [partial, setPartial] = useState<PartialPlan | null>(null)
  const [phase, setPhase] = useState<'input' | 'generating' | 'preview' | 'applying' | 'drafts' | 'done'>('input')
  const [processed, setProcessed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [draftSuccess, setDraftSuccess] = useState<number[]>([])
  const [draftFailures, setDraftFailures] = useState<Array<{ chapter: number; error: string }>>([])
  const [acknowledgedConflicts, setAcknowledgedConflicts] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!open || !projectSession) return
    let disposed = false
    queueMicrotask(() => {
      if (disposed) return
      setSnapshot(null)
      setRoster(null)
      setLatestRun(null)
      setPhase('input')
      setPartial(null)
      setError(null)
      setAcknowledgedConflicts(false)
      setLargeRunConfirmed(false)
      setLargeDraftRunConfirmed(false)
    })
    void Promise.all([
      ipc.invokeWithProjectSession(projectSession, 'db:story-direction-snapshot', projectSession.projectPath),
      ipc.invokeWithProjectSession(projectSession, 'db:character-roster-read', projectSession.projectPath),
      ipc.invokeWithProjectSession(projectSession, 'db:story-direction-latest-run', projectSession.projectPath),
    ]).then(([value, rosterValue, lastRun]) => {
        if (disposed || !isProjectSessionCurrent(projectSession)) return
        setSnapshot(value)
        setRoster(rosterValue)
        setLatestRun(lastRun)
        const available = selectedBlueprints(value, 1, Number.MAX_SAFE_INTEGER)
        const latestFinalized = Math.max(0, ...value.drafts.filter(draft => draft.status === 'finalized').map(draft => draft.chapterNumber))
        setStartChapter(available[0]?.chapterNumber ?? Math.min(value.core.totalChapters || 1, latestFinalized + 1))
        setEndChapter(available.at(-1)?.chapterNumber ?? Math.max(1, value.core.totalChapters || 1))
      })
      .catch(reason => { if (!disposed) setError(String(reason)) })
    return () => { disposed = true }
  // Identity, rather than the mutable project object, owns one dialog session.
  }, [open, sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const editable = useMemo(() => snapshot
    ? selectedBlueprints(snapshot, startChapter, endChapter) : [], [snapshot, startChapter, endChapter])
  const explicitTerminologyReplacements = useMemo(
    () => parseExplicitTerminologyReplacements(idea.trim()), [idea],
  )
  const unfinishedDraftCount = snapshot?.drafts.filter(draft => draft.status !== 'finalized'
    && draft.chapterNumber >= startChapter && draft.chapterNumber <= endChapter).length ?? 0
  const batches = useMemo(() => Array.from({ length: Math.ceil(editable.length / BATCH_SIZE) }, (_, index) =>
    editable.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)), [editable])
  const characterBatches = useMemo(() => roster?.status === 'ready'
    ? Array.from({ length: Math.ceil(roster.entries.length / 20) }, (_, index) => roster.entries.slice(index * 20, (index + 1) * 20))
    : [], [roster])
  const estimatedDraftCalls = includeDrafts ? unfinishedDraftCount : 0
  const estimatedCalls = 1 + batches.length + characterBatches.length + estimatedDraftCalls
  const candidateDraftEstimate = snapshot && partial
    ? new Set(snapshot.drafts.filter(draft => draft.status !== 'finalized'
      && draft.chapterNumber >= partial.start && draft.chapterNumber <= partial.end
      && (partial.core.terminologyReplacements.length > 0
        || partial.chapterChanges.some(item => item.chapterNumber === draft.chapterNumber)))
      .map(draft => draft.chapterNumber)).size
    : 0
  const estimatedPreviewCalls = 1 + batches.length + characterBatches.length
    + (includeDrafts ? candidateDraftEstimate : 0)
  const needsDraftCostConfirmation = includeDrafts && estimatedPreviewCalls > 11 && !largeDraftRunConfirmed
  const busy = phase === 'generating' || phase === 'applying' || phase === 'drafts'
  const canStart = !!snapshot && !!idea.trim() && idea.length <= 4_000 && startChapter >= 1
    && endChapter >= startChapter
    && (!(snapshot.core.totalChapters > 0) || endChapter <= snapshot.core.totalChapters)
    && activeRuns.length === 0 && (estimatedCalls <= 11 || largeRunConfirmed)
  const applyHasChanges = Boolean(partial && (
    Object.keys(partial.core.changes).length > 0
    || partial.chapterChanges.length > 0
    || partial.core.characterChanges.length > 0
    || partial.core.newNarrativeThreads.length > 0
    || partial.core.terminologyReplacements.length > 0
  ))
  const planTouchesCharacters = Boolean(partial && (
    partial.core.characterChanges.length > 0 || partial.core.terminologyReplacements.length > 0
  ))
  const hasUnsavedPlanningTabs = Boolean(projectSession && editorTabs.some(tab =>
    tab.projectKey === projectSession.projectPath
      && tab.dirty && ['config', 'chapter-card', 'world-building', 'arch-file'].includes(tab.type)))
  const blockedByUnsavedEdits = hasUnsavedProjectConfig
    || (planTouchesCharacters && hasUnsavedCharacterDraft)
    || hasUnsavedPlanningTabs
  const applyBlockedReason = activeRuns.length > 0
    ? text('有工作流正在运行，请等待完成后再提交。', 'Another workflow is running. Wait for it to finish before applying this plan.')
    : partial?.core.conflicts.length && !acknowledgedConflicts
      ? text('请先确认已核对与定稿事实有关的冲突。', 'Review and acknowledge the conflicts with finalized facts first.')
      : partial && !applyHasChanges
        ? text('当前方案没有可提交的变更；返回修改想法或章节范围后重新生成。', 'This plan has no changes to apply. Go back, edit the idea or chapter range, and generate again.')
      : partial && partial.nextBatch !== batches.length
          ? text('还有章节批次未生成；请继续生成后再提交。', 'Some chapter batches are still missing. Resume generation before applying.')
          : blockedByUnsavedEdits
            ? text('项目配置或架构/蓝图仍有未保存编辑。保存后返回并重新生成方案。', 'Project settings, architecture, or blueprints contain unsaved edits. Save them, then return and generate the plan again.')
            : needsDraftCostConfirmation
              ? text(`全流程预计约 ${estimatedPreviewCalls} 次模型调用，其中最多 ${candidateDraftEstimate} 次用于候选修稿；请确认后再提交。`, `The full run is estimated at ${estimatedPreviewCalls} model calls, including up to ${candidateDraftEstimate} draft candidates. Confirm before applying.`)
              : null

  const requestModel = async (
    modelId: string,
    purpose: string,
    system: string,
    user: string,
    maxTokens: number,
    structured = true,
  ): Promise<string> => {
    if (!projectSession || !isProjectSessionCurrent(projectSession) || cancelled.current) throw new Error('任务已停止或项目已切换')
    const configuredLimit = useLLMStore.getState().models.find(model => model.id === modelId)?.maxTokens
    const startedAt = Date.now()
    const logContext = {
      projectId: projectSession.projectId,
      projectSessionId: projectSession.leaseId,
      operation: `story-direction.${purpose}`,
      outcome: 'started' as const,
    }
    runtimeLog.info('story-direction', '方向调整模型请求开始', {
      purpose, modelId, inputCharacters: user.length, requestedTokens: maxTokens, structured,
    }, logContext)
    try {
      const result = await ipc.invoke('llm:generate', {
        modelId,
        purpose,
        creativeStrategy: 'consistency-first',
        reasoningStage: structured ? 'planning' : 'drafting',
        projectSession,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        ...(structured ? { responseFormat: { type: 'json_object' as const } } : {}),
        maxTokens: configuredLimit && configuredLimit > 0 ? Math.min(maxTokens, configuredLimit) : maxTokens,
      })
      if (!isProjectSessionCurrent(projectSession) || cancelled.current) throw new Error('任务已停止或项目已切换')
      if (!result.success || result.finishReason !== 'stop') {
        runtimeLog.warn('story-direction', '方向调整模型请求未完整完成', {
          purpose, finishReason: result.finishReason, outputCharacters: result.content?.length ?? 0,
          durationMs: Date.now() - startedAt,
        }, { ...logContext, outcome: 'failed' })
        throw new Error(`模型未完整返回（${result.finishReason}）：${result.error ?? '请缩小章节范围后重试'}`)
      }
      runtimeLog.info('story-direction', '方向调整模型请求完成', {
        purpose, finishReason: result.finishReason, outputCharacters: result.content.length,
        durationMs: Date.now() - startedAt,
      }, { ...logContext, outcome: 'succeeded', durationMs: Date.now() - startedAt })
      return result.content
    } catch (reason) {
      if (!(reason instanceof Error && reason.message.startsWith('模型未完整返回'))) {
        runtimeLog.error('story-direction', '方向调整模型请求失败', {
          purpose, errorType: reason instanceof Error ? reason.name : 'UnknownError',
          durationMs: Date.now() - startedAt,
        }, { ...logContext, outcome: 'failed', durationMs: Date.now() - startedAt })
      }
      throw reason
    }
  }

  const generate = async () => {
    if (!snapshot || !projectSession || !canStart) return
    cancelled.current = false
    setError(null)
    setPhase('generating')
    setAcknowledgedConflicts(false)
    setLargeDraftRunConfirmed(largeRunConfirmed && includeDrafts)
    const normalizedIdea = idea.trim()
    const existing = partial?.fingerprint === snapshot.fingerprint && partial.idea === normalizedIdea
      && partial.rosterRevision === (roster?.revision ?? null)
      && partial.start === startChapter && partial.end === endChapter ? partial : null
    runtimeLog.info('story-direction', '全书方向调整生成开始', {
      chapterCount: editable.length, chapterBatchCount: batches.length,
      characterCount: roster?.entries.length ?? 0, characterBatchCount: characterBatches.length,
      unfinishedDraftCount, ideaCharacters: normalizedIdea.length,
      estimatedModelCalls: existing
        ? Math.max(0, characterBatches.length - existing.nextCharacterBatch)
          + Math.max(0, batches.length - existing.nextBatch) + estimatedDraftCalls
        : estimatedCalls,
      resuming: Boolean(existing), includeDrafts,
    }, {
      projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
      operation: 'story-direction.generate', outcome: 'started',
    })
    try {
      const modelId = existing?.modelId ?? useLLMStore.getState().defaultModelId
      if (!modelId) throw new Error('请先配置默认生成模型')
      const finalizedSummaries = snapshot.blueprints
        .filter(blueprint => snapshot.drafts.some(draft => draft.chapterNumber === blueprint.chapterNumber && draft.status === 'finalized'))
      const finalizedBrief = finalizedSummaries.map((item, index) => ({
        chapterNumber: item.chapterNumber,
        title: compact(item.title, 80),
        notes: index >= finalizedSummaries.length - 50 ? compact(item.notes, 180) : '',
      }))
      const core = existing?.core ?? decodeCoreDirectionChanges(await requestModel(
        modelId, 'story-direction-global',
        '你是长篇小说总编辑。根据作者的新想法，提出必要且最小的项目配置和故事架构改动。已定稿章节不可改写。仅输出 JSON 对象。',
        JSON.stringify({
          newIdea: normalizedIdea,
          current: Object.fromEntries(STORY_DIRECTION_CORE_FIELDS.map(field => [field, compact(String(snapshot.core[field] ?? ''), 8_000)])),
          characters: roster?.status === 'ready' ? roster.entries.map(entry => ({
            name: entry.name, role: entry.role, personality: compact(entry.personality, 600),
            abilities: compact(entry.abilities, 600), arc: compact(entry.arc, 600),
          })).slice(0, 80) : [],
          finalizedSummaries: finalizedBrief,
          existingNarrativeThreads: snapshot.threadPlans.map(item => ({
            title: item.title, type: item.type, targetStartChapter: item.targetStartChapter,
            targetEndChapter: item.targetEndChapter, authorIntent: compact(item.authorIntent, 300),
          })),
            outputContract: {
              terminologyReplacements: [{ from: '作者明确要求替换的原名', to: '作者指定的新名' }],
              coreChanges: '仅包含需要修改的 coreOutline/worldSetting/protagonistProfile/globalGuidance/premise/worldbuilding/synopsis/goldenFinger 字符串字段',
            characterChanges: [{ name: '只允许已有角色名', changes: { personality: '需要修改时的新性格', abilities: '需要修改时的新能力', arc: '需要修改时的新角色弧光' } }],
            newNarrativeThreads: [{ title: '需要新增时的线索标题', type: '线索类型', authorIntent: '作者预期的埋设与回收', targetStartChapter: startChapter, targetEndChapter: endChapter, lane: 'sub' }],
            summary: '调整摘要', conflicts: ['与已定稿事实冲突或需要作者决定的事项'],
          },
        }), 16_384,
      ), snapshot.core, roster?.status === 'ready' ? roster.entries.map(entry => entry.name) : [],
      snapshot.threadPlans.map(item => item.title),
      Math.max(0, ...snapshot.drafts.filter(draft => draft.status === 'finalized').map(draft => draft.chapterNumber)),
      snapshot.core.totalChapters, explicitTerminologyReplacements)
      let plan: PartialPlan = existing ?? {
        fingerprint: snapshot.fingerprint, idea: normalizedIdea, start: startChapter, end: endChapter,
        rosterRevision: roster?.revision ?? null,
        modelId, core, chapterChanges: [], nextCharacterBatch: 0, nextBatch: 0,
      }
      setPartial(plan)
      for (let index = plan.nextCharacterBatch; index < characterBatches.length; index += 1) {
        if (cancelled.current) throw new Error('已停止；已完成的分析批次保留，可继续生成')
        const batch = characterBatches[index].filter(entry => !plan.core.characterChanges.some(change => change.name === entry.name))
        if (batch.length > 0) {
          const response = await requestModel(
            modelId, 'story-direction-characters',
            '你是长篇小说人物编辑。根据新想法与全局方向，只对本批已有角色提出必要的资料变更。不得改名、删除角色或更改关系与已定稿状态。仅返回 JSON 对象。',
            JSON.stringify({
              newIdea: normalizedIdea, globalChanges: plan.core.changes,
              characters: batch.map(entry => ({
                name: entry.name, role: entry.role, personality: compact(entry.personality ?? '', 500),
                abilities: compact(entry.abilities ?? '', 500), motivation: compact(entry.motivation ?? '', 500),
                arc: compact(entry.arc ?? '', 500), notes: compact(entry.notes ?? '', 500),
              })),
              outputContract: { coreChanges: {}, characterChanges: [{ name: '本批已有角色名', changes: { personality: '需要改变时的新性格', arc: '需要改变时的新弧光' } }], conflicts: [] },
            }), 16_384,
          )
          const decoded = decodeCoreDirectionChanges(response, snapshot.core, batch.map(entry => entry.name))
          plan = { ...plan, core: {
            ...plan.core,
            characterChanges: [...plan.core.characterChanges, ...decoded.characterChanges],
            conflicts: [...new Set([...plan.core.conflicts, ...decoded.conflicts])],
          }, nextCharacterBatch: index + 1 }
        } else plan = { ...plan, nextCharacterBatch: index + 1 }
        setPartial(plan)
        runtimeLog.info('story-direction', '方向调整角色批次完成', {
          batchIndex: index + 1, batchCount: characterBatches.length,
          processedCharacters: batch.length, changedCharacterCount: plan.core.characterChanges.length,
        }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          operation: 'story-direction.characters', outcome: 'succeeded',
        })
      }
      const generateBatch = async (
        batch: BlueprintData[],
        priorChanges: StoryDirectionBlueprintChange[] = plan.chapterChanges,
      ): Promise<StoryDirectionBlueprintChange[]> => {
        try {
          const content = await requestModel(
            modelId, 'story-direction-blueprints',
            '你是长篇小说编辑。逐章调整需要受新想法影响的未定稿章节蓝图；无须改变的章节不返回。保留人物名单和作者备注，只输出 JSON 对象。人物名单的确定改名由系统同步，不要改 characters。',
            JSON.stringify({
              newIdea: normalizedIdea,
              globalChanges: core.changes,
              terminologyReplacements: core.terminologyReplacements,
              relevantCharacterChanges: plan.core.characterChanges.filter(change =>
                batch.some(item => item.characters.includes(change.name))),
              previousApprovedBatchChanges: priorChanges.slice(-20).map(item => ({
                chapterNumber: item.chapterNumber,
                purpose: compact(item.changes.purpose ?? '', 350),
                keyEvents: compact(item.changes.keyEvents ?? '', 450),
              })),
              chapters: batch.map(item => ({
                chapterNumber: item.chapterNumber, title: item.title, role: item.role,
                purpose: compact(item.purpose, 1_500), keyEvents: compact(item.keyEvents, 2_500),
                suspenseHook: compact(item.suspenseHook, 1_000), userGuidance: compact(item.userGuidance, 1_000),
                characters: item.characters,
              })),
              outputContract: { changes: [{ chapterNumber: 1, changes: { purpose: '更新后的章节目的', keyEvents: '更新后的关键事件', userGuidance: '后续写作指导' } }] },
            }), 16_384,
          )
          return decodeBlueprintDirectionChanges(content, batch, plan.core.terminologyReplacements)
        } catch (reason) {
          if (batch.length > 1 && String(reason).includes('（length）')) {
            const middle = Math.ceil(batch.length / 2)
            const first = await generateBatch(batch.slice(0, middle), priorChanges)
            const second = await generateBatch(batch.slice(middle), [...priorChanges, ...first])
            return [...first, ...second]
          }
          throw reason
        }
      }
      for (let index = plan.nextBatch; index < batches.length; index += 1) {
        if (cancelled.current) throw new Error('已停止；已完成的分析批次保留，可继续生成')
        const changes = await generateBatch(batches[index])
        plan = { ...plan, chapterChanges: [...plan.chapterChanges, ...changes], nextBatch: index + 1 }
        setPartial(plan)
        setProcessed(index + 1)
        runtimeLog.info('story-direction', '方向调整章节批次完成', {
          batchIndex: index + 1, batchCount: batches.length,
          processedChapters: batches[index].length, changedChapterCount: changes.length,
        }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          operation: 'story-direction.blueprints', outcome: 'succeeded',
        })
      }
      setPhase('preview')
      runtimeLog.info('story-direction', '全书方向调整方案生成完成', {
        changedCoreFields: Object.keys(plan.core.changes).length,
        changedCharacters: plan.core.characterChanges.length,
        changedChapters: plan.chapterChanges.length,
        narrativeThreads: plan.core.newNarrativeThreads.length,
        terminologyReplacements: plan.core.terminologyReplacements.length,
        conflictCount: plan.core.conflicts.length,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'story-direction.generate', outcome: 'succeeded',
      })
    } catch (reason) {
      runtimeLog.error('story-direction', '全书方向调整方案生成失败或暂停', {
        errorType: reason instanceof Error ? reason.name : 'UnknownError',
        processedCharacterBatches: partial?.nextCharacterBatch ?? 0,
        processedChapterBatches: processed,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'story-direction.generate', outcome: cancelled.current ? 'cancelled' : 'failed',
      })
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('input')
    }
  }

  const apply = async () => {
    if (!snapshot || !partial || !projectSession) {
      setError(text('没有完整的方向调整方案，无法提交。', 'There is no complete story direction plan to apply.'))
      return
    }
    if (partial.nextBatch !== batches.length) {
      runtimeLog.warn('story-direction', '方向调整提交被未完成批次阻止', {
        completedBatches: partial.nextBatch, requiredBatches: batches.length,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'story-direction.apply', outcome: 'rejected',
      })
      setError(text('还有章节批次未生成；请继续生成后再提交。', 'Some chapter batches are still missing. Resume generation before applying.'))
      setPhase('input')
      return
    }
    if (activeRuns.length > 0) {
      setError(text('有工作流正在运行，请完成后再提交方向调整。', 'Another workflow is running. Finish it before applying this plan.'))
      return
    }
    if (!applyHasChanges) {
      setError(text('当前方案没有可提交的变更；返回修改想法或章节范围后重新生成。', 'This plan has no changes to apply. Go back, edit the idea or chapter range, and generate again.'))
      return
    }
    if (partial.core.conflicts.length > 0 && !acknowledgedConflicts) {
      setError(text('请先确认已核对与定稿事实有关的冲突。', 'Review and acknowledge the conflicts with finalized facts first.'))
      return
    }
    const dirtyConfig = useProjectStore.getState().hasUnsavedNovelConfig(projectSession.projectPath)
    const dirtyCharacterDraft = (partial.core.characterChanges.length > 0 || partial.core.terminologyReplacements.length > 0)
      && useCharacterStore.getState().hasUnsavedCharacterDraft(projectSession.projectPath)
    const dirtyTabs = useEditorStore.getState().tabs.filter(tab => tab.projectKey === projectSession.projectPath
      && tab.dirty && ['config', 'chapter-card', 'world-building', 'arch-file'].includes(tab.type))
    if (dirtyConfig || dirtyCharacterDraft || dirtyTabs.length > 0) {
      runtimeLog.warn('story-direction', '方向调整提交被未保存编辑阻止', {
        dirtyConfig, dirtyCharacterDraft: Boolean(dirtyCharacterDraft), dirtyTabCount: dirtyTabs.length,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'story-direction.apply', outcome: 'rejected',
      })
      setError(text('项目配置或架构/蓝图仍有未保存编辑，请先保存后重新生成方案。',
        'Project settings, architecture, or blueprints contain unsaved edits. Save them and generate the plan again.'))
      return
    }
    setError(null)
    setPhase('applying')
    runtimeLog.info('story-direction', '提交全书方向调整开始', {
      changedCoreFields: Object.keys(partial.core.changes).length,
      changedCharacters: partial.core.characterChanges.length,
      changedChapters: partial.chapterChanges.length,
      narrativeThreads: partial.core.newNarrativeThreads.length,
      terminologyReplacements: partial.core.terminologyReplacements.length,
      generateDraftCandidates: includeDrafts,
    }, {
      projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
      operation: 'story-direction.apply', outcome: 'started',
    })
    try {
      const result = requireIpcSuccess(await ipc.invokeWithProjectSession(
        projectSession, 'db:story-direction-apply', {
          expectedFingerprint: partial.fingerprint,
          coreChanges: partial.core.changes,
          blueprintChanges: partial.chapterChanges,
          characterChanges: partial.core.characterChanges,
          newNarrativeThreads: partial.core.newNarrativeThreads,
          terminologyReplacements: partial.core.terminologyReplacements,
          ...(partial.core.characterChanges.length > 0 || partial.core.terminologyReplacements.length > 0
            ? { expectedRosterRevision: partial.rosterRevision ?? undefined } : {}),
          ...(includeDrafts && partial.core.terminologyReplacements.length > 0
            ? { draftCandidateChapterNumbers: snapshot.drafts
              .filter(draft => draft.status !== 'finalized'
                && draft.chapterNumber >= partial.start && draft.chapterNumber <= partial.end)
              .map(draft => draft.chapterNumber) }
            : {}),
          idea: partial.idea,
          modelId: partial.modelId,
          generateDraftCandidates: includeDrafts,
        }, projectSession.projectPath,
      ), '提交全书方向调整')
      if (!result.snapshot || !isProjectSessionCurrent(projectSession)) return
      const protectedCharacterNames = roster?.status === 'ready'
        ? roster.entries.map(entry => entry.name)
        : []
      const currentNovelConfig = useProjectStore.getState().currentProject?.novelConfig
      if (currentNovelConfig) {
        const mappedConfig = Object.fromEntries(Object.entries(currentNovelConfig).map(([field, value]) => [
          field,
          typeof value === 'string'
            ? replaceTerminologyText(value, partial.core.terminologyReplacements,
              protectedCharacterNames)
            : value,
        ])) as Partial<typeof currentNovelConfig>
        const configChanges = Object.fromEntries(Object.entries(partial.core.changes)
          .filter(([field]) => CONFIG_KEYS.has(field))
          .map(([field, value]) => [field, replaceTerminologyText(value, partial.core.terminologyReplacements,
            protectedCharacterNames)]))
        useProjectStore.getState().syncCommittedNovelConfig({ ...mappedConfig, ...configChanges }, projectSession)
      }
      const currentProjectName = useProjectStore.getState().currentProject?.name
      if (currentProjectName) {
        const nextProjectName = replaceTerminologyText(
          currentProjectName, partial.core.terminologyReplacements, protectedCharacterNames,
        )
        if (nextProjectName !== currentProjectName) {
          const recentProjectSaved = await useProjectStore.getState()
            .syncCommittedProjectName(nextProjectName, projectSession)
          if (!recentProjectSaved && isProjectSessionCurrent(projectSession)) {
            globalEventBus.emit('SYSTEM_NOTICE', {
              level: 'warn',
              message: text('方向调整已提交，但最近项目名称同步失败。重新打开项目后会自动校正。',
                'The story plan was applied, but the recent-project label did not sync. Reopening the project will refresh it.'),
            })
          }
        }
      }
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['blueprints', 'characterCards', 'fileTree'], projectPath: projectSession.projectPath, projectSession,
      })
      for (const field of ['premise', 'worldbuilding', 'synopsis', 'characters']) {
        if (field in partial.core.changes || partial.core.terminologyReplacements.length > 0) globalEventBus.emit('ARCH_FILE_UPDATED', {
          fileName: `${field}.md`, projectPath: projectSession.projectPath, projectSession,
          runId: `story-direction-${partial.fingerprint.slice(0, 12)}`,
        })
      }
      await onApplied()
      setSnapshot(result.snapshot)
      setPhase('done')
      runtimeLog.info('story-direction', '提交全书方向调整完成', {
        runId: result.runId ?? null,
        changedCoreFields: Object.keys(partial.core.changes).length,
        changedCharacters: partial.core.characterChanges.length,
        changedChapters: partial.chapterChanges.length,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'story-direction.apply', outcome: 'succeeded',
      })
      if (result.runId) {
        const run = await ipc.invokeWithProjectSession(projectSession, 'db:story-direction-latest-run', projectSession.projectPath)
        if (run?.id === result.runId) {
          setLatestRun(run)
          if (includeDrafts) await generateDraftCandidates(result.snapshot, run)
        }
      }
    } catch (reason) {
      runtimeLog.error('story-direction', '提交全书方向调整失败', {
        errorType: reason instanceof Error ? reason.name : 'UnknownError',
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'story-direction.apply', outcome: 'failed',
      })
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('preview')
    }
  }

  const generateDraftCandidates = async (applied: StoryDirectionSnapshot, run: StoryDirectionRun, retryChapters?: Set<number>) => {
    if (!projectSession) return
    const changed = new Set([
      ...run.blueprintChanges.map(item => item.chapterNumber),
      ...(run.terminologyReplacements.length > 0 ? run.drafts.map(item => item.chapterNumber) : []),
    ])
    const pending = new Set(run.drafts.filter(item => item.status !== 'completed'
      && (!retryChapters || retryChapters.has(item.chapterNumber))).map(item => item.draftId))
    const latest = new Map<number, (typeof applied.drafts)[number]>()
    for (const draft of applied.drafts) {
      if (!changed.has(draft.chapterNumber) || draft.status === 'finalized'
        || !pending.has(draft.id)) continue
      if ((latest.get(draft.chapterNumber)?.version ?? -1) < draft.version) latest.set(draft.chapterNumber, draft)
    }
    if (latest.size === 0) return
    setPhase('drafts')
    cancelled.current = false
    const successes: number[] = run.drafts.filter(item => item.status === 'completed').map(item => item.chapterNumber)
    const failures: Array<{ chapter: number; error: string }> = []
    const targets = [...latest.values()]
    runtimeLog.info('story-direction', '方向调整候选修稿生成开始', {
      targetCount: targets.length, alreadyCompleted: successes.length,
      retryCount: retryChapters?.size ?? 0,
    }, {
      projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
      runId: run.id, operation: 'story-direction.draft-candidates', outcome: 'started',
    })
    for (let index = 0; index < targets.length; index += 1) {
      const draft = targets[index]
      if (cancelled.current || !isProjectSessionCurrent(projectSession)) {
        failures.push(...targets.slice(index).map(item => ({ chapter: item.chapterNumber, error: '已停止，尚未生成' })))
        break
      }
      try {
        if (applied.drafts.some(item => item.chapterNumber === draft.chapterNumber && item.version > draft.version)) {
          throw new Error('章节已有更新版本，请重新规划该章的候选修稿')
        }
        const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', draft.id, projectSession.projectPath)
        if (!full || full.status === 'finalized') throw new Error('目标草稿已不存在或已定稿')
        const blueprint = applied.blueprints.find(item => item.chapterNumber === draft.chapterNumber)
        const priorFinalized = applied.blueprints
          .filter(item => item.chapterNumber < draft.chapterNumber
            && applied.drafts.some(candidate => candidate.chapterNumber === item.chapterNumber && candidate.status === 'finalized'))
          .slice(-12).map(item => ({ chapterNumber: item.chapterNumber, title: item.title, notes: compact(item.notes, 240) }))
        const rawContent = await requestModel(
          (useLLMStore.getState().models.some(model => model.id === run.modelId)
            ? run.modelId : useLLMStore.getState().defaultModelId) || '', 'story-direction-draft-candidate',
          '你是长篇小说修稿编辑。按新故事方向改写这份未定稿草稿，保留其他重要事实、人物声线和情节连续性。返回完整修订正文，不要解释或 JSON。',
          JSON.stringify({ idea: run.idea, globalDirection: run.coreChanges,
            terminologyReplacements: run.terminologyReplacements,
            characterChanges: run.characterChanges.map(change => ({
              ...change,
              name: run.terminologyReplacements.find(pair => pair.from === change.name)?.to ?? change.name,
            })).filter(change => blueprint?.characters.includes(change.name)),
            newNarrativeThreads: run.newNarrativeThreads.filter(thread =>
              draft.chapterNumber >= thread.targetStartChapter && draft.chapterNumber <= thread.targetEndChapter),
            blueprint, priorFinalized, originalDraft: full.content }),
          65_536, false,
        )
        const content = replaceTerminologyText(rawContent, run.terminologyReplacements,
          roster?.status === 'ready' ? roster.entries.map(entry => entry.name) : [])
        if (!content.trim()) throw new Error('模型返回了空修稿')
        if (content.trim().length < Math.max(5, full.content.trim().length * 0.4)) {
          throw new Error('候选修稿过短，已拒绝保存不完整正文')
        }
        requireIpcSuccess(await ipc.invokeWithProjectSession(
          projectSession, 'db:story-direction-save-candidate', {
            runId: run.id, draftId: draft.id, content,
            wordCount: countDraftUnits(content), baseContentHash: textFingerprint(full.content),
          }, projectSession.projectPath,
        ), '保存方向调整候选修稿')
        successes.push(draft.chapterNumber)
        runtimeLog.info('story-direction', '方向调整候选修稿已保存', {
          outputCharacters: content.length, draftVersion: draft.version,
        }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          runId: run.id, chapterNumber: draft.chapterNumber,
          operation: 'story-direction.draft-candidates', outcome: 'succeeded',
        })
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason)
        failures.push({ chapter: draft.chapterNumber, error: message })
        runtimeLog.error('story-direction', '方向调整候选修稿失败', {
          errorType: reason instanceof Error ? reason.name : 'UnknownError',
        }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          runId: run.id, chapterNumber: draft.chapterNumber,
          operation: 'story-direction.draft-candidates', outcome: 'failed',
        })
        try {
          await ipc.invokeWithProjectSession(projectSession, 'db:story-direction-mark-draft-failed',
            run.id, draft.id, message, projectSession.projectPath)
        } catch { /* Retain the pending durable task for the next reopen. */ }
      }
      setDraftSuccess([...successes])
      setDraftFailures([...failures])
    }
    runtimeLog.info('story-direction', '方向调整候选修稿批次结束', {
      succeededCount: successes.length, failedCount: failures.length,
    }, {
      projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
      runId: run.id, operation: 'story-direction.draft-candidates',
      outcome: failures.length > 0 ? 'failed' : 'succeeded',
    })
    if (isProjectSessionCurrent(projectSession)) {
      const refreshed = await ipc.invokeWithProjectSession(projectSession, 'db:story-direction-latest-run', projectSession.projectPath)
      if (refreshed?.id === run.id) setLatestRun(refreshed)
    }
    setPhase('done')
  }

  const resumeLastRun = async () => {
    if (!snapshot || !latestRun) return
    setPartial({
      fingerprint: snapshot.fingerprint, idea: latestRun.idea, modelId: latestRun.modelId,
      rosterRevision: roster?.revision ?? null,
      start: startChapter, end: endChapter,
      core: { changes: latestRun.coreChanges, characterChanges: latestRun.characterChanges,
        newNarrativeThreads: latestRun.newNarrativeThreads,
        terminologyReplacements: latestRun.terminologyReplacements,
        summary: '已提交的全书方向调整', conflicts: [] },
      chapterChanges: latestRun.blueprintChanges, nextCharacterBatch: characterBatches.length, nextBatch: batches.length,
    })
    await generateDraftCandidates(snapshot, latestRun)
  }

  const close = () => { if (!busy) onClose() }
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) close() }}>
      <DialogContent className="max-w-[880px] flex flex-col" style={{ maxHeight: '90dvh', width: 'min(94vw, 880px)' }}>
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <DialogTitle className="flex items-center gap-2"><Sparkles size={16} />{text('AI 全书方向调整', 'AI Story Direction Adjustment')}</DialogTitle>
          <DialogDescription>{text('先预览设定、架构和章节差异，再确认提交；已定稿正文不会改动。', 'Preview project and chapter changes before applying. Finalized prose stays immutable.')}</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {!snapshot && <p>{text('正在读取项目规划…', 'Loading project planning…')}</p>}
          {(phase === 'input' || phase === 'generating') && snapshot && <>
            {phase === 'input' && latestRun?.drafts.some(item => item.status !== 'completed') && <div className="rounded border border-[var(--color-border)] p-3 text-xs space-y-2">
              <p>{text(`上次方向调整仍有 ${latestRun.drafts.filter(item => item.status !== 'completed').length} 章候选修稿待完成。`, `${latestRun.drafts.filter(item => item.status !== 'completed').length} candidate revisions from the previous plan remain unfinished.`)}</p>
              <Button variant="outline" size="sm" onClick={() => void resumeLastRun()}>{text('继续上次候选修稿', 'Resume previous candidate revisions')}</Button>
            </div>}
            <label className="block space-y-1">{text('新的故事想法', 'New story idea')}
              <textarea className="w-full rounded border border-[var(--color-border)] bg-[var(--color-raised)] p-2" rows={5}
                value={idea} onChange={event => { setIdea(event.target.value); setPartial(null) }} disabled={busy}
                placeholder={text('例如：主角有第二人格，会在关键时刻出来帮忙，并逐渐改变主角与同伴的关系。', 'For example: a second personality helps the protagonist at crucial moments and changes their relationships.')} />
            </label>
            <div className="flex flex-wrap gap-3 items-center">
              <label>{text('从第', 'From chapter')} <input type="number" min={1} className="w-20 rounded border p-1" value={startChapter} disabled={busy}
                onChange={event => { setStartChapter(Number(event.target.value)); setPartial(null); setLargeRunConfirmed(false); setLargeDraftRunConfirmed(false) }} /></label>
              <label>{text('到第', 'To chapter')} <input type="number" min={1} className="w-20 rounded border p-1" value={endChapter} disabled={busy}
                onChange={event => { setEndChapter(Number(event.target.value)); setPartial(null); setLargeRunConfirmed(false); setLargeDraftRunConfirmed(false) }} /></label>
              <span className="text-xs opacity-70">{text(`将分析 ${editable.length} 章（${batches.length} 批）与 ${roster?.entries.length ?? 0} 名角色（${characterBatches.length} 批）；范围内未定稿草稿 ${unfinishedDraftCount} 份`, `Analyze ${editable.length} chapters (${batches.length} batches) and ${roster?.entries.length ?? 0} characters (${characterBatches.length} batches); ${unfinishedDraftCount} unfinished drafts in range`)}</span>
            </div>
            {editable.length === 0 && <p className="text-xs opacity-80">{text('此范围没有可改动的未定稿蓝图；仍可调整项目设定、故事架构、角色卡或新增后续叙事线索。', 'No unfinished blueprints are available in this range; you can still adjust project settings, architecture, character cards, or add future narrative threads.')}</p>}
            {estimatedCalls > 11 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={largeRunConfirmed} disabled={busy}
              onChange={event => setLargeRunConfirmed(event.target.checked)} />{text(
                `我知道本次预计调用模型约 ${estimatedCalls} 次（含最多 ${estimatedDraftCalls} 章候选修稿；缩批重试会增加调用），可能花费较长时间与额度。`,
                `I understand this run may need about ${estimatedCalls} model calls, including up to ${estimatedDraftCalls} draft candidates; smaller-batch retries may add calls.`,
              )}</label>}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeDrafts} disabled={busy}
              onChange={event => { setIncludeDrafts(event.target.checked); setLargeRunConfirmed(false) }} />{text('为受影响的未定稿正文生成候选修稿（需逐章审阅后合并）', 'Generate candidate revisions for affected unfinished drafts (review before merging)')}</label>
            {phase === 'generating' && <p>{text(`角色分析 ${partial?.nextCharacterBatch ?? 0}/${characterBatches.length} 批；章节分析 ${processed}/${batches.length} 批…`, `Character batches ${partial?.nextCharacterBatch ?? 0}/${characterBatches.length}; chapter batches ${processed}/${batches.length}…`)}</p>}
            {partial && phase === 'input' && <p className="text-xs">{text(`已保留 ${partial.nextBatch} 批结果，可继续生成。`, `${partial.nextBatch} completed batches retained; you can resume.`)}</p>}
          </>}
          {(phase === 'preview' || phase === 'applying' || phase === 'drafts' || phase === 'done') && partial && snapshot && <>
            <p className="font-medium">{partial.core.summary || text('全书调整方案', 'Story adjustment plan')}</p>
            {partial.core.terminologyReplacements.length > 0 && <div className="rounded border border-[var(--color-border)] p-3 text-xs space-y-2">
              <p className="font-medium">{text('全书术语与角色名替换', 'Book-wide term and character-name replacements')}</p>
              <div className="space-y-1">
                {partial.core.terminologyReplacements.map(pair => <p key={pair.from}>{pair.from} → {pair.to}</p>)}
              </div>
              <p className="opacity-75">{text('确认后同步更新项目配置、角色卡、关系、蓝图与叙事线索。未定稿正文只生成可审阅候选修稿，已定稿正文不会改动。', 'Confirmation updates project settings, character cards, relationships, blueprints, and narrative threads. Unfinished prose gets reviewable candidate revisions; finalized prose stays unchanged.')}</p>
            </div>}
            {partial.core.conflicts.length > 0 && <div className="rounded border border-amber-500 p-3 text-xs space-y-1">
              <p className="font-medium">{text('需要作者核对的已定稿事实', 'Finalized facts to review')}</p>
              {partial.core.conflicts.map((item, index) => <p key={index}>{item}</p>)}
              {phase === 'preview' && <label className="flex items-center gap-2 pt-2"><input type="checkbox" checked={acknowledgedConflicts}
                onChange={event => setAcknowledgedConflicts(event.target.checked)} />{text('我已核对这些冲突，后续章节会解释，已定稿事实保持不变。', 'I reviewed these conflicts; later chapters will explain them without changing finalized facts.')}</label>}
            </div>}
            <div className="space-y-2">
              <p className="font-medium">{text(`设定与架构变更（${Object.keys(partial.core.changes).length} 项）`, `Project and architecture changes (${Object.keys(partial.core.changes).length})`)}</p>
              {Object.entries(partial.core.changes).map(([field, value]) => <details key={field} className="rounded border border-[var(--color-border)] p-2 text-xs">
                <summary className="cursor-pointer font-medium">{directionFieldLabel(field, text)}</summary>
                <div className="grid grid-cols-2 gap-2 mt-2 whitespace-pre-wrap break-words"><p>{String(snapshot.core[field as keyof typeof snapshot.core] ?? '')}</p><p>{value}</p></div>
              </details>)}
            </div>
            {partial.core.characterChanges.length > 0 && <div className="space-y-2">
              <p className="font-medium">{text(`角色卡调整（${partial.core.characterChanges.length} 人）`, `Character card changes (${partial.core.characterChanges.length})`)}</p>
              {partial.core.characterChanges.map(item => <details key={item.name} className="rounded border border-[var(--color-border)] p-2 text-xs">
                <summary className="cursor-pointer">{item.name} · {Object.keys(item.changes).map(field => directionFieldLabel(field, text)).join('、')}</summary>
                {Object.entries(item.changes).map(([field, value]) => <p key={field} className="mt-2 whitespace-pre-wrap"><strong>{directionFieldLabel(field, text)}：</strong>{value}</p>)}
              </details>)}
            </div>}
            {partial.core.newNarrativeThreads.length > 0 && <div className="space-y-1 text-xs">
              <p className="font-medium">{text(`新增叙事线索（${partial.core.newNarrativeThreads.length} 条）`, `New narrative threads (${partial.core.newNarrativeThreads.length})`)}</p>
              {partial.core.newNarrativeThreads.map(thread => <p key={thread.title}>{thread.title} · {thread.targetStartChapter}–{thread.targetEndChapter} · {thread.authorIntent}</p>)}
            </div>}
            <div className="space-y-2">
              <p className="font-medium">{text(`受影响章节（${partial.chapterChanges.length} 章）`, `Affected chapters (${partial.chapterChanges.length})`)}</p>
              {phase === 'preview' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeDrafts}
                onChange={event => { setIncludeDrafts(event.target.checked); setLargeDraftRunConfirmed(false) }} />{text(`为约 ${candidateDraftEstimate} 章未定稿正文生成候选修稿（不覆盖原稿）`, `Generate candidate revisions for about ${candidateDraftEstimate} unfinished chapters without overwriting originals`)}</label>}
              {includeDrafts && estimatedPreviewCalls > 11 && <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={largeDraftRunConfirmed}
                  onChange={event => setLargeDraftRunConfirmed(event.target.checked)} />
                {text(`我知道全流程预计约调用模型 ${estimatedPreviewCalls} 次，其中最多 ${candidateDraftEstimate} 次用于候选修稿。`, `I understand the full run is estimated at ${estimatedPreviewCalls} calls, including up to ${candidateDraftEstimate} draft candidates.`)}
              </label>}
              {partial.chapterChanges.map(item => <details key={item.chapterNumber} className="rounded border border-[var(--color-border)] p-2 text-xs">
                <summary className="cursor-pointer">{text(`第 ${item.chapterNumber} 章`, `Chapter ${item.chapterNumber}`)} · {Object.keys(item.changes).map(field => directionFieldLabel(field, text)).join('、')}</summary>
                {Object.entries(item.changes).map(([field, value]) => <div key={field} className="mt-2 grid grid-cols-[6rem_1fr] gap-2"><strong>{directionFieldLabel(field, text)}</strong><span className="whitespace-pre-wrap">{value}</span></div>)}
              </details>)}
            </div>
            {phase === 'drafts' && <p>{text('正在逐章生成候选修稿…', 'Generating candidate revisions chapter by chapter…')}</p>}
            {phase === 'done' && <p>{text(`规划已提交；候选修稿成功 ${draftSuccess.length} 章，失败 ${draftFailures.length} 章。`, `Plan applied; candidate revisions succeeded for ${draftSuccess.length} chapters and failed for ${draftFailures.length}.`)}</p>}
            {draftFailures.map(item => <p key={item.chapter} className="text-xs text-[var(--color-error-text)]">{text(`第 ${item.chapter} 章：${item.error}`, `Chapter ${item.chapter}: ${item.error}`)}</p>)}
          </>}
          {error && <p className="flex gap-2 text-xs text-[var(--color-error-text)]"><AlertTriangle size={14} />{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          {phase === 'preview' && applyBlockedReason && <p role="status" className="mr-auto self-center text-xs text-[var(--color-text-muted)]">
            {applyBlockedReason}
          </p>}
          {phase === 'generating' || phase === 'drafts'
            ? <Button variant="outline" onClick={() => { cancelled.current = true }}>{text('当前请求完成后停止', 'Stop after current request')}</Button>
            : <Button variant="outline" onClick={close}>{text('关闭', 'Close')}</Button>}
          {phase === 'input' && <Button disabled={!canStart} onClick={() => void generate()}>{text(partial ? '继续生成' : '生成调整方案', partial ? 'Resume generation' : 'Generate plan')}</Button>}
          {phase === 'preview' && <>
            <Button variant="outline" onClick={() => { setError(null); setPhase('input') }}>{text('返回修改', 'Back to edit')}</Button>
            <Button onClick={() => void apply()} disabled={Boolean(applyBlockedReason)}>{text('确认并应用规划', 'Confirm and apply plan')}</Button>
          </>}
          {phase === 'done' && draftFailures.length > 0 && snapshot && latestRun && <Button onClick={() => void generateDraftCandidates(snapshot, latestRun, new Set(draftFailures.map(item => item.chapter)))}>{text('重试失败的候选修稿', 'Retry failed candidate revisions')}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
