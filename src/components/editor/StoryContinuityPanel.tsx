import { useEffect, useState } from 'react'
import { Plus, Save, RefreshCw } from 'lucide-react'
import { ipc } from '../../services/ipc-client'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
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
} from '../../shared/story-continuity'

interface StoryContinuityPanelProps {
  projectKey: string
  chapterNumber: number
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
  const [document, setDocument] = useState<StoryContinuityDocument>(() => emptyStoryContinuityDocument(chapterNumber))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    setLoading(true)
    setError(null)
    try {
      const next = await ipc.invokeWithProjectSession(session, 'db:story-continuity-read', chapterNumber, projectKey)
      if (isProjectSessionCurrent(session)) setDocument(next)
    } catch (cause) {
      if (isProjectSessionCurrent(session)) setError(String(cause))
    } finally {
      if (isProjectSessionCurrent(session)) setLoading(false)
    }
  }

  useEffect(() => { void load() }, [chapterNumber, projectKey, currentProject?.sessionLease])

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

  return (
    <details className="mt-3 rounded-lg border" data-story-continuity-panel="true" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)' }}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[var(--color-text)]">
        <span>{text(`章节连续性工作单 · 第${chapterNumber}章`, `Chapter continuity sheet · Chapter ${chapterNumber}`)}</span>
        <span className="text-[0.68rem] font-normal text-[var(--color-text-muted)]">v{document.revision}</span>
      </summary>
      <div className="space-y-3 border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
        {loading && <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"><RefreshCw size={12} className="animate-spin" />{text('读取中…', 'Loading…')}</div>}
        {error && <div className="rounded border px-2 py-1 text-xs text-[var(--color-error-text)]" style={{ borderColor: 'var(--color-error)' }}>{error}</div>}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">{text('场景因果链（计划 / 实际）', 'Scene causality (plan / observed)')}</h4>
            <Button variant="outline" size="sm" onClick={() => update({ sceneBeats: [...document.sceneBeats, newScene(document.sceneBeats.length + 1)] })}><Plus size={12} />{text('加场景', 'Add scene')}</Button>
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
