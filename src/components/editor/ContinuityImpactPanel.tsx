import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Play, RefreshCw } from 'lucide-react'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { ipc } from '../../services/ipc-client'
import { collectContinuityImpact, type ContinuityImpactItem } from '../../services/continuity-impact'
import { createContinuityRebuildWorkflow } from '../../services/workflows/continuity-rebuild-workflow'
import { captureProjectSession, isProjectSessionCurrent, isProjectSessionPath } from '../project-session-gate'
import { Button } from '../ui/Button'
import { toast } from '../ui/Toast'

interface ContinuityImpactPanelProps {
  projectKey: string
  changedChapter: number
}

const EMPTY_ITEMS: ContinuityImpactItem[] = []
const EMPTY_SELECTION = new Set<string>()

/**
 * Read-only impact surface for historical edits. Rebuild selection is kept in
 * local UI state until a source-bound rebuild job is explicitly confirmed.
 */
export default function ContinuityImpactPanel({ projectKey, changedChapter }: ContinuityImpactPanelProps) {
  const text = useLocaleStore(state => state.text)
  const currentProject = useProjectStore(state => state.currentProject)
  const projectSessionKey = currentProject?.id && currentProject.path && currentProject.sessionLease
    ? `${currentProject.id}\u0000${currentProject.sessionLease}\u0000${currentProject.path}`
    : ''
  const requestKey = projectSessionKey
    && currentProject?.path === projectKey
    && changedChapter > 0
    ? `${projectSessionKey}\u0000${changedChapter}`
    : ''
  const [loadResult, setLoadResult] = useState<{
    requestKey: string
    items: ContinuityImpactItem[]
    selected: Set<string>
    error: string | null
  } | null>(null)
  const currentResult = loadResult?.requestKey === requestKey ? loadResult : null
  const items = currentResult?.items ?? EMPTY_ITEMS
  const selected = currentResult?.selected ?? EMPTY_SELECTION
  const loading = Boolean(requestKey && !currentResult)
  const error = currentResult?.error ?? null
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!requestKey) return
    const session = captureProjectSession(useProjectStore.getState().currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    const activeRequestKey = `${session.projectId}\u0000${session.leaseId}\u0000${session.projectPath}\u0000${changedChapter}`
    if (activeRequestKey !== requestKey) return
    let cancelled = false
    void (async () => {
      try {
        const [projections, handoffs, threadPlans] = await Promise.all([
          ipc.invokeBackgroundWithProjectSession(session, 'db:continuity-list-all', projectKey),
          ipc.invokeBackgroundWithProjectSession(session, 'db:chapter-handoff-list-all', projectKey),
          ipc.invokeBackgroundWithProjectSession(session, 'db:narrative-thread-list', projectKey),
        ])
        if (
          !projections
          || !handoffs
          || !threadPlans
          || cancelled
          || !isProjectSessionCurrent(session)
        ) return
        const next = collectContinuityImpact(changedChapter, {
          projections,
          handoffs,
          threadPlans,
        })
        setLoadResult({
          requestKey,
          items: next,
          selected: new Set(next.map(item => item.id)),
          error: null,
        })
      } catch (cause) {
        if (!cancelled && isProjectSessionCurrent(session)) {
          setLoadResult({ requestKey, items: [], selected: new Set(), error: String(cause) })
        }
      }
    })()
    return () => { cancelled = true }
  }, [changedChapter, projectKey, projectSessionKey, requestKey])

  const selectedCount = useMemo(() => [...selected].filter(id => items.some(item => item.id === id)).length, [items, selected])
  const startRebuild = () => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey) || selectedCount === 0 || starting) return
    const selectedItems = items.filter(item => selected.has(item.id))
    setStarting(true)
    try {
      const workflow = createContinuityRebuildWorkflow({
        projectPath: projectKey,
        changedChapter,
        impacts: selectedItems,
      }, session)
      void useWorkflowStore.getState().startWorkflow(workflow, false)
        .then(() => toast.success(text('已启动历史改稿重建，可在任务面板暂停或恢复', 'Historical edit rebuild started; pause or resume it from the task panel')))
        .catch(cause => toast.error(text(`启动重建失败：${String(cause)}`, `Could not start rebuild: ${String(cause)}`)))
        .finally(() => setStarting(false))
    } catch (cause) {
      setStarting(false)
      toast.error(text(`启动重建失败：${String(cause)}`, `Could not start rebuild: ${String(cause)}`))
    }
  }
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={selectedCount === 0 || starting}
              onClick={startRebuild}
              data-start-continuity-rebuild="true"
            >
              <Play size={12} aria-hidden="true" />
              {starting
                ? text('启动中…', 'Starting…')
                : text('开始重建', 'Start rebuild')}
            </Button>
          </div>
          <div className="mt-1 space-y-1">
            {items.map(item => (
              <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-[var(--color-hover)]">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => setLoadResult(current => {
                    if (!current || current.requestKey !== requestKey) return current
                    const next = new Set(current.selected)
                    if (next.has(item.id)) next.delete(item.id)
                    else next.add(item.id)
                    return { ...current, selected: next }
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
