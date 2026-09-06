import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { ipc } from '../../services/ipc-client'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { useEditorStore } from '../../stores/editor-store'
import { captureProjectSession, isProjectSessionCurrent, isProjectSessionPath } from '../project-session-gate'
import { detectNarrativeQualityFindings } from '../../shared/narrative-quality'

interface ReaderChapter {
  id: number
  chapterNumber: number
  title: string
  version: number
  content: string
}

interface ContinuousReaderProps {
  projectKey: string
}

const readerPositionKey = (projectKey: string) => `inkweaver.reader.position:${projectKey}`

export default function ContinuousReader({ projectKey }: ContinuousReaderProps) {
  const text = useLocaleStore(state => state.text)
  const currentProject = useProjectStore(state => state.currentProject)
  const [chapters, setChapters] = useState<ReaderChapter[]>([])
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissedQuality, setDismissedQuality] = useState<Set<string>>(new Set())
  const chapterRefs = useRef(new Map<number, HTMLElement>())

  const load = async () => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    setLoading(true)
    setError(null)
    try {
      const metadata = await ipc.invokeWithProjectSession(session, 'db:draft-list-all', projectKey)
      const latest = new Map<number, (typeof metadata)[number]>()
      for (const item of metadata) {
        if (item.status !== 'finalized') continue
        const previous = latest.get(item.chapterNumber)
        if (!previous || item.version > previous.version || (item.version === previous.version && item.id > previous.id)) latest.set(item.chapterNumber, item)
      }
      const result: ReaderChapter[] = []
      for (const item of [...latest.values()].sort((left, right) => left.chapterNumber - right.chapterNumber)) {
        const full = await ipc.invokeWithProjectSession(session, 'db:draft-get-full', item.id, projectKey)
        if (full?.content) result.push({ id: item.id, chapterNumber: item.chapterNumber, title: item.chapterTitle || `第${item.chapterNumber}章`, version: item.version, content: full.content })
      }
      if (!isProjectSessionCurrent(session)) return
      setChapters(result)
      const stored = Number(localStorage.getItem(readerPositionKey(projectKey)))
      setSelectedChapter(result.some(item => item.chapterNumber === stored) ? stored : result[0]?.chapterNumber ?? null)
    } catch (cause) {
      if (isProjectSessionCurrent(session)) setError(String(cause))
    } finally {
      if (isProjectSessionCurrent(session)) setLoading(false)
    }
  }

  useEffect(() => { void load() }, [projectKey, currentProject?.sessionLease])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`inkweaver.reader.quality-dismissed:${projectKey}`) ?? '[]')
      setDismissedQuality(new Set(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []))
    } catch { setDismissedQuality(new Set()) }
  }, [projectKey])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en-US')
    if (!needle) return chapters
    return chapters.filter(chapter => `${chapter.chapterNumber} ${chapter.title} ${chapter.content}`.toLocaleLowerCase('en-US').includes(needle))
  }, [chapters, query])
  const qualityFindings = useMemo(
    () => detectNarrativeQualityFindings(chapters).filter(finding => !dismissedQuality.has(finding.id)),
    [chapters, dismissedQuality],
  )

  const currentIndex = chapters.findIndex(chapter => chapter.chapterNumber === selectedChapter)
  const jumpTo = (chapterNumber: number) => {
    setSelectedChapter(chapterNumber)
    localStorage.setItem(readerPositionKey(projectKey), String(chapterNumber))
    chapterRefs.current.get(chapterNumber)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openChapter = (chapter: ReaderChapter) => {
    useEditorStore.getState().openFile({
      id: `vela://draft/${chapter.id}`,
      name: `${text(`第${chapter.chapterNumber}章`, `Chapter ${chapter.chapterNumber}`)} ${chapter.title}`,
      type: 'chapter',
      filePath: `vela://draft/${chapter.id}`,
      content: chapter.content,
      savedContent: chapter.content,
      draftId: chapter.id,
      chapterNumber: chapter.chapterNumber,
      draftStatus: 'finalized',
      projectKey,
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" data-continuous-reader="true">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1 text-xs font-semibold"><BookIcon />{text('连续阅读', 'Continuous reader')}</div>
        <div className="ml-auto flex items-center gap-1">
          <label className="flex items-center gap-1 rounded border px-1.5 py-1" style={{ borderColor: 'var(--color-border)' }}><Search size={12} /><input aria-label={text('搜索连读内容', 'Search reader')} value={query} onChange={event => setQuery(event.target.value)} className="w-36 bg-transparent text-xs outline-none" placeholder={text('搜索章节或正文', 'Search chapters or prose')} /></label>
          <button type="button" className="rounded border p-1.5" style={{ borderColor: 'var(--color-border)' }} onClick={() => void load()} disabled={loading} aria-label={text('刷新连读', 'Refresh reader')}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>
      {qualityFindings.length > 0 && (
        <details className="border-b px-3 py-2 text-xs" data-reader-quality="true" style={{ borderColor: 'var(--color-border)' }}>
          <summary className="cursor-pointer text-[var(--color-text-secondary)]">{text(`连读提示 · ${qualityFindings.length} 项（仅建议）`, `Reading notes · ${qualityFindings.length} suggestion(s)`)}</summary>
          <div className="mt-2 space-y-1.5">
            {qualityFindings.map(finding => <div key={finding.id} className="flex items-start gap-2 rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}><span className="min-w-0 flex-1 text-[var(--color-text-muted)]">{text(`第${finding.chapterNumbers.join('、')}章可能重复开头或结尾：${finding.evidence}`, `Chapters ${finding.chapterNumbers.join(', ')} may repeat an opening or ending: ${finding.evidence}`)}</span><button type="button" className="shrink-0 text-[var(--color-accent)]" onClick={() => { const next = new Set(dismissedQuality); next.add(finding.id); setDismissedQuality(next); localStorage.setItem(`inkweaver.reader.quality-dismissed:${projectKey}`, JSON.stringify([...next])) }}>{text('保留刻意复沓', 'Keep repetition')}</button></div>)}
          </div>
        </details>
      )}
      {error && <div className="border-b px-3 py-2 text-xs text-[var(--color-error-text)]" style={{ borderColor: 'var(--color-border)' }}>{error}</div>}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-48 shrink-0 overflow-y-auto border-r p-2 md:block" style={{ borderColor: 'var(--color-border)' }}>
          {filtered.map(chapter => <button key={chapter.chapterNumber} type="button" onClick={() => jumpTo(chapter.chapterNumber)} className="mb-1 block w-full rounded px-2 py-1.5 text-left text-xs" style={{ backgroundColor: selectedChapter === chapter.chapterNumber ? 'var(--color-hover)' : 'transparent', color: 'var(--color-text)' }}>{chapter.chapterNumber}. {chapter.title}</button>)}
          {filtered.length === 0 && !loading && <p className="px-2 py-3 text-xs text-[var(--color-text-muted)]">{text('没有匹配章节', 'No matching chapters')}</p>}
        </aside>
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" onScroll={event => {
          const visible = chapters.find(chapter => {
            const element = chapterRefs.current.get(chapter.chapterNumber)
            if (!element) return false
            const rect = element.getBoundingClientRect()
            return rect.top >= 0 && rect.top < window.innerHeight * 0.45
          })
          if (visible && visible.chapterNumber !== selectedChapter) {
            setSelectedChapter(visible.chapterNumber)
            localStorage.setItem(readerPositionKey(projectKey), String(visible.chapterNumber))
          }
          void event
        }}>
          <div className="mx-auto max-w-3xl">
            {filtered.map((chapter, index) => <article key={chapter.chapterNumber} ref={element => { if (element) chapterRefs.current.set(chapter.chapterNumber, element) }} className="mb-12 scroll-mt-4" data-reader-chapter={chapter.chapterNumber}>
              <header className="mb-5 flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}><div><p className="mb-1 text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{text(`第${chapter.chapterNumber}章`, `Chapter ${chapter.chapterNumber}`)} · v{chapter.version}</p><h1 className="text-xl font-semibold text-[var(--color-text)]">{chapter.title}</h1></div><button type="button" className="flex items-center gap-1 rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--color-border)' }} onClick={() => openChapter(chapter)}>{text('回编辑器', 'Open editor')}<ExternalLink size={12} /></button></header>
              {index > 0 && <div className="mb-5 rounded border px-3 py-2 text-center text-[0.68rem] text-[var(--color-text-muted)]" style={{ borderColor: 'var(--color-border)' }}>{text('章节边界 · 上一章结尾与本章开头在此连续阅读', 'Chapter boundary · previous ending meets this opening here')}</div>}
              <div className="whitespace-pre-wrap break-words text-[0.98rem] leading-8 text-[var(--color-text)]">{chapter.content}</div>
            </article>)}
            {chapters.length === 0 && !loading && <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">{text('还没有可连读的定稿章节', 'No finalized chapters are available yet')}</div>}
          </div>
        </main>
      </div>
      {chapters.length > 0 && currentIndex >= 0 && <div className="flex items-center justify-center gap-2 border-t px-3 py-1.5" style={{ borderColor: 'var(--color-border)' }}><button type="button" aria-label={text('上一章', 'Previous chapter')} disabled={currentIndex <= 0} onClick={() => jumpTo(chapters[currentIndex - 1]!.chapterNumber)}><ArrowLeft size={14} /></button><span className="text-[0.68rem] text-[var(--color-text-muted)]">{currentIndex + 1}/{chapters.length}</span><button type="button" aria-label={text('下一章', 'Next chapter')} disabled={currentIndex >= chapters.length - 1} onClick={() => jumpTo(chapters[currentIndex + 1]!.chapterNumber)}><ArrowRight size={14} /></button></div>}
    </div>
  )
}

function BookIcon() {
  return <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm border-2 border-current" />
}
