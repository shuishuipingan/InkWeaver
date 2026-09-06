import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { ipc } from '../../services/ipc-client'
import { collectContinuityImpact, type ContinuityImpactItem } from '../../services/continuity-impact'
import { captureProjectSession, isProjectSessionPath } from '../project-session-gate'

interface ContinuityImpactPanelProps {
  projectKey: string
  changedChapter: number
}

/**
 * Read-only impact surface for historical edits. Rebuild selection is kept in
 * local UI state until a source-bound rebuild job is explicitly confirmed.
 */
export default function ContinuityImpactPanel({ projectKey, changedChapter }: ContinuityImpactPanelProps) {
  const text = useLocaleStore(state => state.text)
  const currentProject = useProjectStore(state => state.currentProject)
  const [items, setItems] = useState<ContinuityImpactItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey) || changedChapter < 1) {
      setItems([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [projections, handoffs, threadPlans] = await Promise.all([
          ipc.invokeWithProjectSession(session, 'db:continuity-list-all', projectKey),
          ipc.invokeWithProjectSession(session, 'db:chapter-handoff-list-all', projectKey),
          ipc.invokeWithProjectSession(session, 'db:narrative-thread-list', projectKey),
        ])
        if (cancelled) return
        const next = collectContinuityImpact(changedChapter, {
          projections,
          handoffs,
          threadPlans,
        })
        setItems(next)
        setSelected(new Set(next.map(item => item.id)))
      } catch (cause) {
        if (!cancelled) setError(String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [changedChapter, currentProject, projectKey])

  const selectedCount = useMemo(() => [...selected].filter(id => items.some(item => item.id === id)).length, [items, selected])
  if (changedChapter < 1 || (!loading && items.length === 0 && !error)) return null

  return (
    <section
      data-continuity-impact="true"
      className="mt-3 rounded-lg border p-3"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)]">
            <AlertTriangle size={14} className="text-[var(--color-warning)]" />
            {text(`历史改稿影响 · 第${changedChapter}章`, `Historical edit impact · Chapter ${changedChapter}`)}
          </h3>
          <p className="mt-1 text-[0.68rem] text-[var(--color-text-muted)]">
            {text('只列出可能失效的派生记录；不会自动覆盖作者事实或计划。', 'Lists potentially stale projections only; author facts and plans are never overwritten automatically.')}
          </p>
        </div>
        {loading && <RefreshCw size={13} className="animate-spin text-[var(--color-text-muted)]" aria-label={text('加载中', 'Loading')} />}
      </div>
      {error && <p className="mt-2 text-[0.7rem] text-[var(--color-error-text)]">{error}</p>}
      {items.length > 0 && (
        <>
          <div className="mt-2 flex items-center justify-between text-[0.68rem] text-[var(--color-text-muted)]">
            <span>{text(`已选择 ${selectedCount}/${items.length} 项待重建`, `${selectedCount}/${items.length} selected for rebuild`)}</span>
            <span>{text('重建将在后续恢复任务中执行', 'Rebuild runs through the resumable task flow')}</span>
          </div>
          <div className="mt-1 space-y-1">
            {items.map(item => (
              <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-[var(--color-hover)]">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => setSelected(current => {
                    const next = new Set(current)
                    if (next.has(item.id)) next.delete(item.id)
                    else next.add(item.id)
                    return next
                  })}
                  aria-label={item.label}
                />
                <span className="min-w-0 text-[0.7rem] text-[var(--color-text-secondary)]">
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-1 text-[var(--color-text-muted)]">
                    {text(`受影响章节：${item.affectedChapters.join('、')}`, `Affected chapters: ${item.affectedChapters.join(', ')}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
