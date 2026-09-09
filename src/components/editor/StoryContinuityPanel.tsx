import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Save, RefreshCw, X } from 'lucide-react'
import { ipc } from '../../services/ipc-client'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { useCharacterStore } from '../../stores/character-store'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { NativeSelect } from '../ui/NativeSelect'
import { Textarea } from '../ui/Textarea'
import {
  captureProjectSession,
  isProjectSessionCurrent,
  isProjectSessionPath,
} from '../project-session-gate'
import {
  emptyStoryContinuityDocument,
  type EmotionalCarryOver,
  type ReaderExpectation,
  type SceneBeat,
  type StoryContinuityDocument,
  type ViewpointThread,
  suggestSceneCandidatesFromText,
} from '../../shared/story-continuity'
import { factAppliesAtChapter, type FinalizedContinuityProjection } from '../../shared/finalized-continuity'
import { aggregateStoryContinuity, deriveVolumeTrends, type VolumeProgressSummary } from '../../shared/story-continuity-aggregation'
import { knowledgeEventAppliesAtChapter, type KnowledgeEvent } from '../../shared/knowledge-event'
import type { ChapterHandoffRecord } from '../../shared/chapter-handoff'
import { resolveNarrativeThreadDormantThreshold, type NarrativeThreadView } from '../../shared/narrative-thread'

interface StoryContinuityPanelProps {
  projectKey: string
  chapterNumber: number
}

interface WritingPreparationSummary {
  blueprint: Record<string, unknown> | null
  handoff: ChapterHandoffRecord | null
  narrativeThreads: NarrativeThreadView[]
}

function lines(value: string): string[] {
  return value.split(/\r?\n/gu).map(item => item.trim()).filter(Boolean)
}

function lineText(value: readonly string[]): string {
  return value.join('\n')
}

function newScene(index: number): SceneBeat {
  return {
    id: `scene-${Date.now()}-${index}`,
    sceneNumber: index,
    status: 'planned',
    entryState: '', goal: '', obstacle: '', choice: '', consequence: '', exitState: '', evidence: [],
  }
}

function newEmotion(index: number): EmotionalCarryOver {
  return { character: `角色${index}`, previousState: '', trigger: '', choice: '', cost: '', nextState: '', evidence: [] }
}

function newExpectation(index: number): ReaderExpectation {
  return { id: `expect-${Date.now()}-${index}`, question: '', introducedChapter: 1, expectedProgress: '', status: 'open', delayReason: '', evidence: [] }
}

function newViewpoint(): ViewpointThread {
  return { viewpoint: '', lastChapter: 1, unresolvedHooks: [], readerKnowledge: '', nextLanding: '' }
}

export default function StoryContinuityPanel({ projectKey, chapterNumber }: StoryContinuityPanelProps) {
  const text = useLocaleStore(state => state.text)
  const currentProject = useProjectStore(state => state.currentProject)
  const dormantThreshold = resolveNarrativeThreadDormantThreshold(
    currentProject?.novelConfig.narrativeThreadDormantChapterThreshold,
  )
  const characters = useCharacterStore(state => state.characters)
  const characterNames = useMemo(() => characters.map(character => character.name).filter(Boolean), [characters])
  const [document, setDocument] = useState<StoryContinuityDocument>(() => emptyStoryContinuityDocument(chapterNumber))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [knowledgeEvents, setKnowledgeEvents] = useState<KnowledgeEvent[]>([])
  const [timeline, setTimeline] = useState<FinalizedContinuityProjection[]>([])
  const [volumeProgress, setVolumeProgress] = useState<VolumeProgressSummary[]>([])
  const [previousDocuments, setPreviousDocuments] = useState<StoryContinuityDocument[]>([])
  const [knowledgeReviewEvents, setKnowledgeReviewEvents] = useState<KnowledgeEvent[]>([])
  const [knowledgeUpdatingId, setKnowledgeUpdatingId] = useState<string | null>(null)
  const [extractingScenes, setExtractingScenes] = useState(false)
  const [preparation, setPreparation] = useState<WritingPreparationSummary>({ blueprint: null, handoff: null, narrativeThreads: [] })

  const load = async () => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    setLoading(true)
    setError(null)
    try {
      const [next, nextTimeline, allDocuments, blueprints, handoff, narrativeThreads] = await Promise.all([
        ipc.invokeWithProjectSession(session, 'db:story-continuity-read', chapterNumber, projectKey),
        ipc.invokeWithProjectSession(session, 'db:continuity-list-before', chapterNumber, projectKey),
        ipc.invokeWithProjectSession(session, 'db:story-continuity-list-all', projectKey),
        ipc.invokeWithProjectSession(session, 'db:blueprint-get-all', projectKey),
        chapterNumber > 1
          ? ipc.invokeWithProjectSession(session, 'db:chapter-handoff-latest-before', chapterNumber, projectKey)
          : Promise.resolve(null),
        ipc.invokeWithProjectSession(session, 'db:narrative-thread-list-relevant', {
          chapterNumber,
          title: '',
          keyEvents: '',
          characters: characterNames,
        }, projectKey),
      ])
      if (isProjectSessionCurrent(session)) {
        setDocument(next)
        setTimeline(nextTimeline)
        setVolumeProgress(aggregateStoryContinuity([...allDocuments, next]))
        const previousDocs = (Array.isArray(allDocuments) ? allDocuments : [])
          .filter((doc: StoryContinuityDocument) => doc.chapterNumber < chapterNumber)
        setPreviousDocuments(previousDocs)
        const blueprint = Array.isArray(blueprints)
          ? blueprints.find(candidate => (candidate as { chapterNumber?: number }).chapterNumber === chapterNumber)
          : undefined
        setPreparation({
          blueprint: blueprint && typeof blueprint === 'object' ? blueprint as unknown as Record<string, unknown> : null,
          handoff: handoff && typeof handoff === 'object' ? handoff as ChapterHandoffRecord : null,
          narrativeThreads: Array.isArray(narrativeThreads) ? narrativeThreads as NarrativeThreadView[] : [],
        })
      }
    } catch (cause) {
      if (isProjectSessionCurrent(session)) {
        setError(String(cause))
        setTimeline([])
        setVolumeProgress([])
        setPreviousDocuments([])
        setPreparation({ blueprint: null, handoff: null, narrativeThreads: [] })
      }
    } finally {
      if (isProjectSessionCurrent(session)) setLoading(false)
    }
  }

  useEffect(() => { void load() }, [chapterNumber, projectKey, currentProject?.sessionLease, characterNames.join('\u0000')])

  useEffect(() => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey) || characterNames.length === 0) {
      setKnowledgeEvents([])
      setKnowledgeReviewEvents([])
      return
    }
    let cancelled = false
    void Promise.all([
      ipc.invokeWithProjectSession(session, 'db:knowledge-event-list-for-chapter', characterNames, chapterNumber, projectKey),
      ipc.invokeWithProjectSession(session, 'db:knowledge-event-list-review', characterNames, chapterNumber, projectKey),
    ])
      .then(([events, reviewEvents]) => {
        if (!cancelled && isProjectSessionCurrent(session)) {
          setKnowledgeEvents(events)
          setKnowledgeReviewEvents(reviewEvents)
        }
      })
      .catch(() => { if (!cancelled) setKnowledgeEvents([]) })
    return () => { cancelled = true }
  }, [chapterNumber, characterNames.join('\u0000'), currentProject?.sessionLease, projectKey])

  const updateKnowledgeStatus = async (eventId: string, status: 'confirmed' | 'rejected') => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    setKnowledgeUpdatingId(eventId)
    setError(null)
    try {
      const result = await ipc.invokeWithProjectSession(session, 'db:knowledge-event-status', eventId, status, projectKey)
      if (!result.success || !result.event) throw new Error(result.error || text('更新知情事件失败', 'Could not update the knowledge event'))
      if (!isProjectSessionCurrent(session)) return
      setKnowledgeReviewEvents(current => current.filter(event => event.eventId !== eventId))
      if (status === 'confirmed' && knowledgeEventAppliesAtChapter(result.event, chapterNumber)) {
        setKnowledgeEvents(current => [...current.filter(event => event.eventId !== eventId), result.event!])
      }
      setNotice(status === 'confirmed'
        ? text('知情事件已确认并可用于本章写作', 'Knowledge event confirmed for this chapter')
        : text('知情事件已拒绝，不会进入写作上下文', 'Knowledge event rejected; it will not enter writing context'))
    } catch (cause) {
      if (isProjectSessionCurrent(session)) setError(String(cause))
    } finally {
      if (isProjectSessionCurrent(session)) setKnowledgeUpdatingId(null)
    }
  }

  const update = (patch: Partial<StoryContinuityDocument>) => {
    setNotice(null)
    setDocument(current => ({ ...current, ...patch }))
  }

  const updateScene = (id: string, patch: Partial<SceneBeat>) => {
    update({ sceneBeats: document.sceneBeats.map(scene => scene.id === id ? { ...scene, ...patch } : scene) })
  }
  const updateEmotion = (index: number, patch: Partial<EmotionalCarryOver>) => {
    update({ emotionalCarryOver: document.emotionalCarryOver.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })
  }
  const updateExpectation = (id: string, patch: Partial<ReaderExpectation>) => {
    update({ readerExpectations: document.readerExpectations.map(item => item.id === id ? { ...item, ...patch } : item) })
  }
  const updateViewpoint = (index: number, patch: Partial<ViewpointThread>) => {
    update({ viewpointThreads: document.viewpointThreads.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })
  }

  const save = async () => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await ipc.invokeWithProjectSession(session, 'db:story-continuity-save', {
        document,
        expectedRevision: document.revision,
      }, projectKey)
      if (!result.success || !result.document) throw new Error(result.error || text('保存章节连续性计划失败', 'Could not save the story continuity plan'))
      if (isProjectSessionCurrent(session)) {
        setDocument(result.document)
        setNotice(text('章节连续性计划已保存', 'Story continuity plan saved'))
      }
    } catch (cause) {
      if (isProjectSessionCurrent(session)) setError(String(cause))
    } finally {
      if (isProjectSessionCurrent(session)) setSaving(false)
    }
  }

  const extractSceneCandidates = async () => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey) || extractingScenes) return
    setExtractingScenes(true)
    setError(null)
    setNotice(null)
    try {
      const meta = await ipc.invokeWithProjectSession(session, 'db:draft-get-finalized', chapterNumber, projectKey)
      if (!meta) throw new Error(text('本章还没有已定稿正文，暂时不能提取场景候选', 'This chapter has no finalized prose yet, so scene candidates cannot be suggested'))
      const full = await ipc.invokeWithProjectSession(session, 'db:draft-get-full', meta.id, projectKey)
      const candidates = suggestSceneCandidatesFromText(full?.content ?? '')
      if (candidates.length === 0) throw new Error(text('定稿正文中没有足够的段落证据', 'The finalized prose has no sufficiently long paragraph evidence'))
      if (!isProjectSessionCurrent(session)) return
      const offset = document.sceneBeats.length
      update({ sceneBeats: [...document.sceneBeats, ...candidates.map((candidate, index) => ({
        ...candidate,
        sceneNumber: offset + index + 1,
      }))] })
      setNotice(text(`已加入 ${candidates.length} 个场景候选；请补充因果字段后保存工作单`, `${candidates.length} scene candidates added; complete the causal fields before saving`))
    } catch (cause) {
      if (isProjectSessionCurrent(session)) setError(String(cause))
    } finally {
      if (isProjectSessionCurrent(session)) setExtractingScenes(false)
    }
  }

  const blueprintTitle = typeof preparation.blueprint?.title === 'string' ? preparation.blueprint.title : ''
  const blueprintPurpose = typeof preparation.blueprint?.purpose === 'string' ? preparation.blueprint.purpose : ''
  const blueprintKeyEvents = Array.isArray(preparation.blueprint?.keyEvents)
    ? preparation.blueprint.keyEvents.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    : []
  const dormantAlerts = preparation.narrativeThreads
    .filter(thread => thread.overdue || thread.dormantChapters >= dormantThreshold)
    .slice(0, 4)

  const ruleEntries = [
    [text('世界设定', 'World rules'), currentProject?.novelConfig.worldSetting],
    [text('全局写作要求', 'Global guidance'), currentProject?.novelConfig.globalGuidance],
    [text('文风约束', 'Style constraints'), currentProject?.novelConfig.writingStyle],
  ].filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
  const preparationMissing = [
    !preparation.blueprint
      ? text('本章还没有章节蓝图', 'This chapter has no blueprint yet')
      : undefined,
    chapterNumber > 1 && !preparation.handoff
      ? text('上一章没有已确认的章节交接', 'No confirmed handoff is available from the previous chapter')
      : undefined,
    characterNames.length === 0 && !Array.isArray(preparation.blueprint?.characters)
      ? text('尚未加载本章相关人物', 'No chapter characters are loaded')
      : undefined,
    knowledgeEvents.length === 0 && knowledgeReviewEvents.length === 0
      ? text('当前没有角色知情记录（不代表可以泄漏未来信息）', 'No character-knowledge record is available; future information must still stay out')
      : undefined,
    ruleEntries.length === 0
      ? text('尚未配置世界规则或全局写作约束', 'No world rules or global writing constraints are configured')
      : undefined,
  ].filter((value): value is string => value !== undefined)
  const currentCarryCharacters = new Set(
    document.emotionalCarryOver.map(item => item.character.trim()).filter(Boolean),
  )
  const previousCarryOver = previousDocuments
    .flatMap(doc => doc.emotionalCarryOver)
    .filter(item => item.character.trim() && item.nextState.trim())
    .filter(item => !currentCarryCharacters.has(item.character.trim()))
    .slice(0, 8)
  const emotionalGrowthLedger = previousDocuments
    .flatMap(doc => doc.emotionalCarryOver
      .filter(item => item.character.trim() && (
        item.previousState.trim() || item.nextState.trim() || item.trigger.trim() || item.choice.trim() || item.cost.trim() || item.evidence.length > 0
      ))
      .map(item => ({ ...item, fromChapter: doc.chapterNumber })))
    .sort((left, right) => left.fromChapter - right.fromChapter)
    .slice(0, 24)
  const dueExpectations = previousDocuments
    .flatMap(doc => doc.readerExpectations
      .filter(item => (item.status === 'open' || item.status === 'progressing'))
      .map(item => ({ ...item, fromChapter: doc.chapterNumber })))
    .filter(item => (item.dueChapter === undefined || item.dueChapter <= chapterNumber))
    .slice(0, 6)
  const previousViewpointKnowledge = previousDocuments
    .flatMap(doc => doc.viewpointThreads
      .filter(thread => thread.readerKnowledge.trim() || thread.unresolvedHooks.length > 0)
      .map(thread => ({ ...thread, fromChapter: doc.chapterNumber })))
    .slice(0, 8)
  const readerKnowledgeLedger = previousDocuments
    .flatMap(doc => doc.viewpointThreads
      .filter(thread => thread.readerKnowledge.trim() || thread.unresolvedHooks.length > 0)
      .map(thread => ({ ...thread, fromChapter: doc.chapterNumber })))
    .sort((left, right) => left.fromChapter - right.fromChapter)
    .slice(0, 24)
  const timelineFacts = timeline.flatMap(projection => (projection.facts ?? [])
    .filter(fact => factAppliesAtChapter(fact, chapterNumber)))
  const timelineGroups = [...timelineFacts.reduce((groups, fact) => {
    const chapter = fact.sourceChapter
    const current = groups.get(chapter) ?? []
    current.push(fact)
    groups.set(chapter, current)
    return groups
  }, new Map<number, NonNullable<FinalizedContinuityProjection['facts']>>())].sort(([left], [right]) => left - right)
  const volumeTrends = deriveVolumeTrends(volumeProgress)

  return (
    <details className="mt-3 rounded-lg border" data-story-continuity-panel="true" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)' }}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[var(--color-text)]">
        <span>{text(`章节连续性工作单 · 第${chapterNumber}章`, `Chapter continuity sheet · Chapter ${chapterNumber}`)}</span>
        <span className="text-[0.68rem] font-normal text-[var(--color-text-muted)]">v{document.revision}</span>
      </summary>
      <div className="space-y-3 border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
        {loading && <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"><RefreshCw size={12} className="animate-spin" />{text('读取中…', 'Loading…')}</div>}
        {error && <div className="rounded border px-2 py-1 text-xs text-[var(--color-error-text)]" style={{ borderColor: 'var(--color-error)' }}>{error}</div>}
        <section data-writing-preparation="true" className="rounded border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">{text('写前准备摘要', 'Writing preparation')}</h4>
            <span className="text-[0.68rem] font-normal text-[var(--color-text-muted)]">{text('只读来源汇总', 'Read-only source summary')}</span>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="font-medium">{text('本章蓝图', 'Chapter blueprint')}</div>
              <div className="text-[var(--color-text-secondary)]">{blueprintTitle || text('未创建', 'Not created')}</div>
              {blueprintPurpose && <div className="mt-0.5 text-[var(--color-text-muted)]">{blueprintPurpose}</div>}
              {blueprintKeyEvents.length > 0 && <div className="mt-0.5 text-[var(--color-text-muted)]">{text(`关键事件：${blueprintKeyEvents.slice(0, 3).join('；')}`, `Key events: ${blueprintKeyEvents.slice(0, 3).join('; ')}`)}</div>}
            </div>
            <div className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="font-medium">{text('上一章交接', 'Previous-chapter handoff')}</div>
              {preparation.handoff
                ? <><div className="text-[var(--color-text-secondary)]">{preparation.handoff.sceneLocation || text('现场未填写', 'Scene location not filled')}</div><div className="mt-0.5 text-[var(--color-text-muted)]">{preparation.handoff.immediateGoal || text('即时目标未填写', 'Immediate goal not filled')}</div></>
                : <div className="text-[var(--color-text-muted)]">{chapterNumber === 1 ? text('开篇章节，无前章交接', 'Opening chapter; no previous handoff') : text('未找到已确认交接', 'No confirmed handoff found')}</div>}
            </div>
            <div className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="font-medium">{text('活跃伏笔 / 叙事线', 'Active narrative threads')}</div>
              {preparation.narrativeThreads.length === 0
                ? <div className="text-[var(--color-text-muted)]">{text('当前没有相关活跃线索', 'No relevant active threads')}</div>
                : <div className="space-y-0.5 text-[var(--color-text-secondary)]">{preparation.narrativeThreads.slice(0, 4).map(thread => <div key={thread.id}>{thread.title} · {thread.status}{thread.dormantChapters > 0 ? text(` · 沉寂${thread.dormantChapters}章`, ` · dormant ${thread.dormantChapters} chapters`) : ''}</div>)}</div>}
            </div>
            {dormantAlerts.length > 0 && (
              <div role="status" data-thread-dormant-alerts="true" className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-warning)' }}>
                <span className="font-medium">{text('叙事线提醒', 'Narrative thread alerts')}</span>
                <div className="mt-0.5 text-[var(--color-warning-text)]">{dormantAlerts.map(alert => alert.overdue
                  ? text(alert.title + '（已逾期）', alert.title + ' (overdue)')
                  : text(alert.title + '（沉寂' + alert.dormantChapters + '章，达到阈值）', alert.title + ' (dormant ' + alert.dormantChapters + ' chapters, threshold reached)')).join('；')}</div>
              </div>
            )}
            <div className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="font-medium">{text('知情边界与预算', 'Knowledge boundary and budget')}</div>
              <div className="text-[var(--color-text-secondary)]">{text(`已确认知情 ${knowledgeEvents.length} 条 · 待审 ${knowledgeReviewEvents.length} 条`, `${knowledgeEvents.length} confirmed knowledge events · ${knowledgeReviewEvents.length} awaiting review`)}</div>
              <div className="mt-0.5 text-[var(--color-text-muted)]">{text('写作上下文会按模型预算裁剪，并在任务收据中列出纳入/省略原因。', 'Writing context is bounded by the model budget; the task receipt lists included and omitted sources.')}</div>
            </div>
          </div>
          <div className="mt-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <div className="font-medium">{text('规则与写作约束', 'Rules and writing constraints')}</div>
            {ruleEntries.length === 0
              ? <div className="mt-0.5 text-[var(--color-text-muted)]">{text('未配置；开始写作前建议补充世界规则或全局约束。', 'Not configured; add world rules or global constraints before writing.')}</div>
              : <div className="mt-1 grid gap-1 sm:grid-cols-3">{ruleEntries.map(([label, value]) => <div key={label} className="min-w-0"><div className="text-[var(--color-text-muted)]">{label}</div><div className="truncate text-[var(--color-text-secondary)]" title={value}>{value}</div></div>)}</div>}
          </div>
          {document.viewpointThreads.some(thread => thread.readerKnowledge.trim() || thread.unresolvedHooks.length > 0) && <div className="mt-2 rounded border px-2 py-1.5 text-xs" data-reader-knowledge-summary="true" style={{ borderColor: 'var(--color-border)' }}>
            <div className="font-medium">{text('读者已知与视角落点', 'Reader knowledge and viewpoint landing')}</div>
            <div className="mt-1 space-y-1">{document.viewpointThreads.filter(thread => thread.readerKnowledge.trim() || thread.unresolvedHooks.length > 0).map((thread, index) => <div key={`${thread.viewpoint}-${index}`} className="text-[var(--color-text-secondary)]"><span className="font-medium">{thread.viewpoint || text('未命名视角', 'Unnamed viewpoint')}：</span>{thread.readerKnowledge || text('读者知识未填写', 'Reader knowledge not filled')}{thread.unresolvedHooks.length > 0 ? text(`；未解钩子：${thread.unresolvedHooks.join('、')}`, `; open hooks: ${thread.unresolvedHooks.join(', ')}`) : ''}</div>)}</div>
          </div>}
          <div className="mt-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: preparationMissing.length > 0 ? 'var(--color-warning)' : 'var(--color-border)' }}>
            <span className="font-medium">{text('开始前需留意', 'Before writing')}</span>
            {preparationMissing.length === 0
              ? <span className="ml-1 text-[var(--color-success-text)]">{text('当前准备项齐全', 'The preparation inputs are ready')}</span>
              : <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--color-text-muted)]">{preparationMissing.map(item => <li key={item}>{item}</li>)}</ul>}
          </div>
        </section>
        {previousViewpointKnowledge.length > 0 && (
          <section data-previous-viewpoint-knowledge="true" className="rounded border p-2 text-xs" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
            <div className="font-medium">{text('跨章视角落点与读者已知', 'Cross-chapter viewpoint landing and reader knowledge')}</div>
            <div className="mt-1 space-y-1">
              {previousViewpointKnowledge.map((thread, index) => <div key={thread.viewpoint + '-' + index} className="text-[var(--color-text-secondary)]">
                <span className="font-medium">{thread.viewpoint || text('未命名视角', 'Unnamed viewpoint')}</span>
                <span className="text-[var(--color-text-muted)]"> · {text('第' + thread.fromChapter + '章', 'Chapter ' + thread.fromChapter)}</span>
                {thread.readerKnowledge ? <div>{text('读者已知：', 'Reader knows: ')}{thread.readerKnowledge}</div> : undefined}
                {thread.unresolvedHooks.length > 0 ? <div>{text('未解钩子：', 'Open hooks: ')}{thread.unresolvedHooks.join('、')}</div> : undefined}
              </div>)}
            </div>
          </section>
        )}
        {dueExpectations.length > 0 && (
          <section data-due-expectations-alert="true" className="rounded border p-2 text-xs" style={{ borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-raised)' }}>
            <div className="font-medium">{text('本章到期读者期待', 'Reader expectations due this chapter')}</div>
            <div className="mt-1 space-y-0.5 text-[var(--color-text-secondary)]">
              {dueExpectations.map(item => <div key={item.id}>{text('第' + item.fromChapter + '章埋设：', 'Planted in Chapter ' + item.fromChapter + ': ')}{item.question}{item.expectedProgress ? ' · ' + item.expectedProgress : ''}</div>)}
            </div>
            <p className="mt-1 text-[var(--color-text-muted)]">{text('如果本章不推进这些期待，可主动延后并写明理由。', 'If this chapter does not advance these expectations, delay them explicitly with a reason.')}</p>
          </section>
        )}
        {readerKnowledgeLedger.length > 0 && (
          <section data-reader-knowledge-ledger="true" className="rounded border p-2 text-xs" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="font-semibold">{text('读者知识账本', 'Reader-knowledge ledger')}</h4>
              <span className="text-[0.68rem] font-normal text-[var(--color-text-muted)]">{text('只读 · 不等同于角色知情', 'Read-only · separate from character knowledge')}</span>
            </div>
            <ol className="space-y-1.5" aria-label={text('按章节排列的读者知识', 'Reader knowledge ordered by chapter')}>
              {readerKnowledgeLedger.map((thread, index) => <li key={`${thread.fromChapter}:${thread.viewpoint}:${index}`} className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="font-medium">{text(`第${thread.fromChapter}章 · ${thread.viewpoint || '未命名视角'}`, `Chapter ${thread.fromChapter} · ${thread.viewpoint || 'Unnamed viewpoint'}`)}</div>
                {thread.readerKnowledge && <div className="text-[var(--color-text-secondary)]">{text('读者已知：', 'Reader knows: ')}{thread.readerKnowledge}</div>}
                {thread.unresolvedHooks.length > 0 && <div className="text-[var(--color-text-muted)]">{text(`未解钩子：${thread.unresolvedHooks.join('、')}`, `Open hooks: ${thread.unresolvedHooks.join(', ')}`)}</div>}
                {thread.nextLanding && <div className="text-[var(--color-text-muted)]">{text(`下次落点：${thread.nextLanding}`, `Next landing: ${thread.nextLanding}`)}</div>}
              </li>)}
            </ol>
          </section>
        )}
        {previousCarryOver.length > 0 && (
          <section data-emotional-carryover-alert="true" className="rounded border p-2 text-xs" style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-raised)' }}>
            <div className="font-medium">{text('上一章情绪余波待承接', 'Previous-chapter emotional carry-over awaiting continuity')}</div>
            <div className="mt-1 space-y-0.5 text-[var(--color-warning-text)]">
                          {previousCarryOver.map((item, index) => <div key={`${item.character}:${index}`}>{item.character} · {text('后状态：' + item.nextState, 'next state: ' + item.nextState)}</div>)}
            </div>
            <p className="mt-1 text-[var(--color-text-muted)]">{text('如果本章没有承接这些情绪余波，可在下方“情绪余波与人物成长”补记，或保留刻意跳切。', 'If this chapter does not continue these emotional states, add them under “Emotional carry-over and growth” below, or keep an intentional cutaway.')}</p>
          </section>
        )}
        {emotionalGrowthLedger.length > 0 && (
          <section data-emotional-growth-ledger="true" className="rounded border p-2 text-xs" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="font-semibold">{text('人物成长轨迹', 'Character-growth ledger')}</h4>
              <span className="text-[0.68rem] font-normal text-[var(--color-text-muted)]">{text('只读 · 来自已保存工作单', 'Read-only · from saved continuity sheets')}</span>
            </div>
            <ol className="space-y-1.5" aria-label={text('按章节排列的人物情绪与成长', 'Character emotion and growth ordered by chapter')}>
              {emotionalGrowthLedger.map((item, index) => <li key={`${item.fromChapter}:${item.character}:${index}`} className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="font-medium">{text(`第${item.fromChapter}章 · ${item.character}`, `Chapter ${item.fromChapter} · ${item.character}`)}</div>
                {(item.previousState.trim() || item.nextState.trim()) && <div className="text-[var(--color-text-secondary)]">{item.previousState || text('未记录前状态', 'Previous state not recorded')} → {item.nextState || text('未记录后状态', 'Next state not recorded')}</div>}
                {item.trigger.trim() && <div className="text-[var(--color-text-muted)]">{text('触发：', 'Trigger: ')}{item.trigger}</div>}
                {item.choice.trim() && <div className="text-[var(--color-text-muted)]">{text('选择：', 'Choice: ')}{item.choice}</div>}
                {item.cost.trim() && <div className="text-[var(--color-text-muted)]">{text('代价：', 'Cost: ')}{item.cost}</div>}
                {item.evidence.length > 0 && <div className="text-[var(--color-text-muted)]">{text('证据：', 'Evidence: ')}{item.evidence.slice(0, 2).join('；')}</div>}
              </li>)}
            </ol>
          </section>
        )}
        {timelineGroups.length > 0 && <section data-continuity-timeline="true" className="rounded border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
          <h4 className="mb-2 text-xs font-semibold">{text('跨章事实时间线', 'Cross-chapter fact timeline')}</h4>
          <div className="space-y-1.5">{timelineGroups.map(([sourceChapter, facts]) => <details key={sourceChapter} open className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
            <summary className="cursor-pointer text-xs font-medium">{text(`第${sourceChapter}章 · ${facts.length} 条有效事实`, `Chapter ${sourceChapter} · ${facts.length} active facts`)}</summary>
            <div className="mt-2 space-y-2">{facts.map((fact, index) => <div key={`${sourceChapter}:${fact.category}:${index}`} className="border-l-2 pl-2 text-xs" style={{ borderColor: 'var(--color-accent)' }}>
              <div className="font-medium">{fact.category}</div>
              <div className="text-[var(--color-text-secondary)]">{fact.statement}</div>
              <div className="text-[var(--color-text-muted)]">{text(`证据：${fact.evidence}`, `Evidence: ${fact.evidence}`)}</div>
            </div>)}</div>
          </details>)}</div>
        </section>}
        {volumeProgress.length > 0 && <section data-volume-progress="true" className="rounded border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
          <h4 className="mb-2 text-xs font-semibold">{text('卷级推进摘要', 'Volume progress')}</h4>
          <div className="space-y-2">{volumeProgress.map(summary => <div key={summary.volume} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <div className="font-medium">{summary.volume} · {text(`${summary.chapterCount}章`, `${summary.chapterCount} chapters`)} · {text(`场景 ${summary.observedSceneCount}/${summary.sceneCount} 已观察`, `${summary.observedSceneCount}/${summary.sceneCount} scenes observed`)}</div>
            {summary.mainlineContributions.length > 0 && <div className="text-[var(--color-text-secondary)]">{text(`主线：${summary.mainlineContributions.join('；')}`, `Mainline: ${summary.mainlineContributions.join('; ')}`)}</div>}
            {summary.subplots.length > 0 && <div className="text-[var(--color-text-secondary)]">{text(`支线：${summary.subplots.join('；')}`, `Subplots: ${summary.subplots.join('; ')}`)}</div>}
            {summary.characterArcs.length > 0 && <div className="text-[var(--color-text-secondary)]">{text(`人物弧：${summary.characterArcs.join('；')}`, `Character arcs: ${summary.characterArcs.join('; ')}`)}</div>}
            {summary.turningPoints.length > 0 && <div className="text-[var(--color-text-secondary)]">{text(`转折：${summary.turningPoints.join('；')}`, `Turns: ${summary.turningPoints.join('; ')}`)}</div>}
            {summary.activeExpectationCount > 0 && <div className="text-[var(--color-text-muted)]">{text(`活跃读者期待：${summary.activeExpectationCount} 条`, `Active reader expectations: ${summary.activeExpectationCount}`)}</div>}
            {summary.unresolvedQuestions.length > 0 && <div className="text-[var(--color-text-muted)]">{text(`待回应：${summary.unresolvedQuestions.join('；')}`, `Open questions: ${summary.unresolvedQuestions.join('; ')}`)}</div>}
          </div>)}</div>
        </section>}
        {volumeTrends.length > 1 && <section data-volume-trends="true" className="rounded border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">{text('跨卷趋势', 'Cross-volume trends')}</h4>
            <span className="text-[0.68rem] font-normal text-[var(--color-text-muted)]">{text('只读 · 来自已保存工作单', 'Read-only · from saved continuity sheets')}</span>
          </div>
          <ol className="space-y-1.5 text-xs" aria-label={text('跨卷主线与支线趋势', 'Cross-volume mainline and subplot trends')}>
            {volumeTrends.map((trend, index) => <li key={trend.volume} className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="font-medium">{index + 1}. {trend.volume}</div>
              {trend.newMainlineItems.length > 0 && <div className="text-[var(--color-text-secondary)]">{text(`新主线：${trend.newMainlineItems.join('；')}`, `New mainline: ${trend.newMainlineItems.join('; ')}`)}</div>}
              {trend.continuedMainlineItems.length > 0 && <div className="text-[var(--color-text-secondary)]">{text(`延续主线：${trend.continuedMainlineItems.join('；')}`, `Continuing mainline: ${trend.continuedMainlineItems.join('; ')}`)}</div>}
              {trend.newSubplots.length > 0 && <div className="text-[var(--color-text-muted)]">{text(`新支线：${trend.newSubplots.join('；')}`, `New subplot: ${trend.newSubplots.join('; ')}`)}</div>}
              {trend.newMainlineItems.length === 0 && trend.continuedMainlineItems.length === 0 && trend.newSubplots.length === 0 && <div className="text-[var(--color-text-muted)]">{text('本卷暂未记录新的主线或支线变化', 'No new mainline or subplot change recorded for this volume')}</div>}
            </li>)}
          </ol>
        </section>}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">{text('场景因果链（计划 / 实际）', 'Scene causality (plan / observed)')}</h4>
            <div className="flex flex-wrap justify-end gap-1">
              <Button variant="outline" size="sm" onClick={() => void extractSceneCandidates()} disabled={extractingScenes}><RefreshCw size={12} className={extractingScenes ? 'animate-spin' : undefined} />{text('从定稿提取候选', 'Suggest from finalized prose')}</Button>
              <Button variant="outline" size="sm" onClick={() => update({ sceneBeats: [...document.sceneBeats, newScene(document.sceneBeats.length + 1)] })}><Plus size={12} />{text('加场景', 'Add scene')}</Button>
            </div>
          </div>
          <div className="space-y-2">
            {document.sceneBeats.map(scene => (
              <fieldset key={scene.id} className="grid gap-2 rounded border p-2" style={{ borderColor: 'var(--color-border)' }}>
                <legend className="px-1 text-[0.68rem] text-[var(--color-text-muted)]">{text(`场景 ${scene.sceneNumber}`, `Scene ${scene.sceneNumber}`)}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label={text('进入状态', 'Entry state')} value={scene.entryState} onChange={event => updateScene(scene.id, { entryState: event.target.value })} placeholder={text('进入时的处境', 'Entry state')} />
                  <Input aria-label={text('场景目标', 'Scene goal')} value={scene.goal} onChange={event => updateScene(scene.id, { goal: event.target.value })} placeholder={text('人物想完成什么', 'What does the character want?')} />
                  <Input aria-label={text('场景阻碍', 'Scene obstacle')} value={scene.obstacle} onChange={event => updateScene(scene.id, { obstacle: event.target.value })} placeholder={text('什么阻止了目标', 'What blocks the goal?')} />
                  <Input aria-label={text('行动选择', 'Choice')} value={scene.choice} onChange={event => updateScene(scene.id, { choice: event.target.value })} placeholder={text('人物做出的选择', 'Choice made')} />
                  <Input aria-label={text('场景后果', 'Consequence')} value={scene.consequence} onChange={event => updateScene(scene.id, { consequence: event.target.value })} placeholder={text('选择造成的变化', 'What changed?')} />
                  <Input aria-label={text('离开状态', 'Exit state')} value={scene.exitState} onChange={event => updateScene(scene.id, { exitState: event.target.value })} placeholder={text('离开时留下什么', 'Exit state')} />
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
                  <Textarea aria-label={text('场景证据', 'Scene evidence')} value={lineText(scene.evidence)} onChange={event => updateScene(scene.id, { evidence: lines(event.target.value) })} placeholder={text('每行一条正文证据（可选）', 'One manuscript evidence excerpt per line (optional)')} />
                  <NativeSelect aria-label={text('场景状态', 'Scene status')} value={scene.status} onChange={event => updateScene(scene.id, { status: event.target.value as SceneBeat['status'] })}>
                    <option value="planned">{text('计划', 'Planned')}</option><option value="candidate">{text('候选', 'Candidate')}</option><option value="confirmed">{text('已确认', 'Confirmed')}</option><option value="observed">{text('正文实际', 'Observed')}</option>
                  </NativeSelect>
                </div>
              </fieldset>
            ))}
            {document.sceneBeats.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">{text('还没有场景卡；日常或抒情章节可以保持空白。', 'No scene cards yet; everyday or lyrical chapters may stay unstructured.')}</p>}
          </div>
        </section>

        <section className="grid gap-2">
          <h4 className="text-xs font-semibold">{text('卷级推进', 'Arc contribution')}</h4>
          <Input aria-label={text('卷名', 'Volume')} value={document.arcContribution.volume} onChange={event => update({ arcContribution: { ...document.arcContribution, volume: event.target.value } })} placeholder={text('卷 / 阶段名称', 'Volume or arc name')} />
          <Textarea aria-label={text('主线贡献', 'Mainline contribution')} value={document.arcContribution.mainline} onChange={event => update({ arcContribution: { ...document.arcContribution, mainline: event.target.value } })} placeholder={text('本章让主线发生了什么变化？', 'How does this chapter change the mainline?')} />
          <div className="grid gap-2 sm:grid-cols-2"><Input aria-label={text('转折', 'Turning point')} value={document.arcContribution.turningPoint} onChange={event => update({ arcContribution: { ...document.arcContribution, turningPoint: event.target.value } })} placeholder={text('转折', 'Turning point')} /><Input aria-label={text('代价', 'Cost')} value={document.arcContribution.cost} onChange={event => update({ arcContribution: { ...document.arcContribution, cost: event.target.value } })} placeholder={text('代价', 'Cost')} /></div>
          <Textarea aria-label={text('待回应问题', 'Open questions')} value={lineText(document.arcContribution.unresolvedQuestions)} onChange={event => update({ arcContribution: { ...document.arcContribution, unresolvedQuestions: lines(event.target.value) } })} placeholder={text('每行一个跨章待回应问题', 'One cross-chapter open question per line')} />
        </section>

        {knowledgeReviewEvents.some(event => event.status === 'candidate') && <section data-knowledge-candidates="true"><h4 className="mb-2 text-xs font-semibold">{text('待确认知情候选（不会自动写入上下文）', 'Knowledge candidates (not injected automatically)')}</h4><div className="space-y-1.5">{knowledgeReviewEvents.filter(event => event.status === 'candidate').map(event => <div key={event.eventId} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)' }}><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{event.character} · {event.falseBelief ? text('误信', 'False belief') : event.certainty === 'rumor' ? text('传闻', 'Rumor') : text('候选事实', 'Candidate fact')}</div><div className="mt-0.5 text-[var(--color-text-secondary)]">{event.information}</div><div className="mt-0.5 text-[var(--color-text-muted)]">{text(`获知方式：${event.learnedBy} · 第${event.sourceChapter}章证据：${event.evidence}`, `Learned by ${event.learnedBy} · evidence from Chapter ${event.sourceChapter}: ${event.evidence}`)}</div></div><div className="flex shrink-0 gap-1"><Button variant="success" size="sm" disabled={knowledgeUpdatingId === event.eventId} onClick={() => void updateKnowledgeStatus(event.eventId, 'confirmed')} aria-label={text(`确认知情事件 ${event.eventId}`, `Confirm knowledge event ${event.eventId}`)}><Check size={11} aria-hidden="true" /></Button><Button variant="ghost" size="sm" disabled={knowledgeUpdatingId === event.eventId} onClick={() => void updateKnowledgeStatus(event.eventId, 'rejected')} aria-label={text(`拒绝知情事件 ${event.eventId}`, `Reject knowledge event ${event.eventId}`)}><X size={11} aria-hidden="true" /></Button></div></div></div>)}</div></section>}
        {knowledgeEvents.length > 0 && <section data-knowledge-boundary="true"><h4 className="mb-2 text-xs font-semibold">{text('当前角色知情范围（已确认）', 'Confirmed character knowledge')}</h4><div className="space-y-1.5">{knowledgeEvents.map(event => <div key={event.eventId} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)' }}><div className="font-medium">{event.character} · {event.falseBelief ? text('误信', 'False belief') : event.certainty === 'rumor' ? text('传闻', 'Rumor') : text('已知事实', 'Known fact')}</div><div className="mt-0.5 text-[var(--color-text-secondary)]">{event.information}</div><div className="mt-0.5 text-[var(--color-text-muted)]">{text(`获知方式：${event.learnedBy} · 第${event.sourceChapter}章证据：${event.evidence}`, `Learned by ${event.learnedBy} · evidence from Chapter ${event.sourceChapter}: ${event.evidence}`)}</div></div>)}</div></section>}

        <section>
          <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">{text('情绪余波与人物成长', 'Emotional carry-over and growth')}</h4><Button variant="outline" size="sm" onClick={() => update({ emotionalCarryOver: [...document.emotionalCarryOver, newEmotion(document.emotionalCarryOver.length + 1)] })}><Plus size={12} />{text('加人物', 'Add character')}</Button></div>
          <div className="space-y-2">{document.emotionalCarryOver.map((item, index) => <fieldset key={`${item.character}-${index}`} className="grid gap-2 rounded border p-2" style={{ borderColor: 'var(--color-border)' }}><legend className="px-1 text-[0.68rem]">{item.character || text('未命名人物', 'Unnamed character')}</legend><div className="grid gap-2 sm:grid-cols-2"><Input aria-label={text('情绪人物', 'Emotion character')} value={item.character} onChange={event => updateEmotion(index, { character: event.target.value })} /><Input aria-label={text('情绪触发', 'Emotion trigger')} value={item.trigger} onChange={event => updateEmotion(index, { trigger: event.target.value })} placeholder={text('事件触发', 'Trigger')} /><Input aria-label={text('前置情绪', 'Previous emotion')} value={item.previousState} onChange={event => updateEmotion(index, { previousState: event.target.value })} /><Input aria-label={text('后续状态', 'Next state')} value={item.nextState} onChange={event => updateEmotion(index, { nextState: event.target.value })} /><Input aria-label={text('情绪选择', 'Emotion choice')} value={item.choice} onChange={event => updateEmotion(index, { choice: event.target.value })} /><Input aria-label={text('情绪代价', 'Emotion cost')} value={item.cost} onChange={event => updateEmotion(index, { cost: event.target.value })} /></div><Textarea aria-label={text('情绪证据', 'Emotion evidence')} value={lineText(item.evidence)} onChange={event => updateEmotion(index, { evidence: lines(event.target.value) })} placeholder={text('每行一条正文证据', 'One manuscript evidence excerpt per line')} /></fieldset>)}</div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">{text('读者期待与多视角线索', 'Reader expectations and viewpoint threads')}</h4><Button variant="outline" size="sm" onClick={() => update({ readerExpectations: [...document.readerExpectations, newExpectation(document.readerExpectations.length + 1)] })}><Plus size={12} />{text('加期待', 'Add expectation')}</Button></div>
          <div className="space-y-2">{document.readerExpectations.map(item => <fieldset key={item.id} className="grid gap-2 rounded border p-2" style={{ borderColor: 'var(--color-border)' }}><Input aria-label={text('期待问题', 'Expectation question')} value={item.question} onChange={event => updateExpectation(item.id, { question: event.target.value })} /><div className="grid gap-2 sm:grid-cols-2"><Input aria-label={text('期待推进', 'Expected progress')} value={item.expectedProgress} onChange={event => updateExpectation(item.id, { expectedProgress: event.target.value })} /><NativeSelect aria-label={text('期待状态', 'Expectation status')} value={item.status} onChange={event => updateExpectation(item.id, { status: event.target.value as ReaderExpectation['status'] })}><option value="open">{text('开放', 'Open')}</option><option value="progressing">{text('推进中', 'Progressing')}</option><option value="resolved">{text('已兑现', 'Resolved')}</option><option value="abandoned">{text('放弃', 'Abandoned')}</option></NativeSelect></div><Textarea aria-label={text('期待证据', 'Expectation evidence')} value={lineText(item.evidence)} onChange={event => updateExpectation(item.id, { evidence: lines(event.target.value) })} placeholder={text('兑现/延后的正文证据', 'Evidence for progress or delay')} /></fieldset>)}</div>
          {document.viewpointThreads.map((thread, index) => <fieldset key={`${thread.viewpoint}-${index}`} className="mt-2 grid gap-2 rounded border p-2" style={{ borderColor: 'var(--color-border)' }}><legend className="px-1 text-[0.68rem]">{text('视角线索', 'Viewpoint thread')}</legend><div className="grid gap-2 sm:grid-cols-2"><Input aria-label={text('视角人物', 'Viewpoint')} value={thread.viewpoint} onChange={event => updateViewpoint(index, { viewpoint: event.target.value })} /><Input aria-label={text('下次落点', 'Next landing')} value={thread.nextLanding} onChange={event => updateViewpoint(index, { nextLanding: event.target.value })} /></div><Textarea aria-label={text('未解钩子', 'Unresolved hooks')} value={lineText(thread.unresolvedHooks)} onChange={event => updateViewpoint(index, { unresolvedHooks: lines(event.target.value) })} /></fieldset>)}
          <Button variant="outline" size="sm" onClick={() => update({ viewpointThreads: [...document.viewpointThreads, newViewpoint()] })}><Plus size={12} />{text('加视角线', 'Add viewpoint')}</Button>
        </section>

        {notice && <p className="text-xs text-[var(--color-success-text)]">{notice}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={12} />{text('重新读取', 'Reload')}</Button><Button variant="default" size="sm" onClick={() => void save()} disabled={loading || saving}><Save size={12} />{saving ? text('保存中…', 'Saving…') : text('保存工作单', 'Save sheet')}</Button></div>
      </div>
    </details>
  )
}
