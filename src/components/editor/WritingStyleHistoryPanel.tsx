import { useEffect, useState } from 'react'
import { Clock, History, RotateCcw } from 'lucide-react'
import { ipc } from '../../services/ipc-client'
import type { WritingStyleHistoryRecord } from '../../shared/ipc-channels'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { toast } from '../ui/Toast'
import {
  captureProjectSession,
  isProjectSessionCurrent,
  isProjectSessionPath,
} from '../project-session-gate'

/** 文风档案版本历史：列出最近 AI 自动生成的风格档案变更，并可一键应用到当前项目配置。 */
export default function WritingStyleHistoryPanel({ projectKey }: { projectKey: string }) {
  const currentProject = useProjectStore(state => state.currentProject)
  const updateNovelConfig = useProjectStore(state => state.updateNovelConfig)
  const saveProject = useProjectStore(state => state.saveProject)
  const text = useLocaleStore(state => state.text)
  const projectSessionKey = currentProject?.id && currentProject.path && currentProject.sessionLease
    ? `${currentProject.id}\u0000${currentProject.sessionLease}\u0000${currentProject.path}`
    : ''
  const requestKey = projectSessionKey && currentProject?.path === projectKey ? projectSessionKey : ''
  const [loadResult, setLoadResult] = useState<{
    requestKey: string
    records: WritingStyleHistoryRecord[]
    error: string | null
  } | null>(null)
  const currentResult = loadResult?.requestKey === requestKey ? loadResult : null
  const records = currentResult?.records ?? []
  const error = currentResult?.error ?? null
  const loading = Boolean(requestKey && !currentResult)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!requestKey) return
    const session = captureProjectSession(useProjectStore.getState().currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    const activeRequestKey = `${session.projectId}\u0000${session.leaseId}\u0000${session.projectPath}`
    if (activeRequestKey !== requestKey) return
    let cancelled = false
    void ipc.invokeBackgroundWithProjectSession(session, 'db:writing-style-history-list', projectKey)
      .then(result => {
        if (cancelled || !isProjectSessionCurrent(session)) return
        if (result) setLoadResult({ requestKey, records: result, error: null })
      })
      .catch(cause => {
        if (cancelled || !isProjectSessionCurrent(session)) return
        setLoadResult({ requestKey, records: [], error: String(cause) })
      })
    return () => { cancelled = true }
  }, [projectKey, projectSessionKey, requestKey])

  if (records.length === 0 && !loading && !error) return null

  const applyVersion = async (nextStyle: string) => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey) || applying) return
    setApplying(true)
    setLoadResult(current => current?.requestKey === requestKey
      ? { ...current, error: null }
      : current)
    try {
      updateNovelConfig({ writingStyle: nextStyle }, session)
      const saved = await saveProject(session)
      if (!isProjectSessionCurrent(session)) return
      if (!saved) throw new Error(text('文风已应用，但保存到磁盘失败；请手动保存项目。', 'Style applied, but saving to disk failed; save the project manually.'))
      toast.success(text('已应用并保存该文风版本。', 'Applied and saved this style version.'))
    } catch (cause) {
      if (!isProjectSessionCurrent(session)) return
      setLoadResult(current => current?.requestKey === requestKey
        ? { ...current, error: String(cause) }
        : current)
      toast.error(String(cause))
    } finally {
      if (isProjectSessionCurrent(session)) setApplying(false)
    }
  }

  return (
    <details className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
      <summary className="cursor-pointer font-medium flex items-center gap-1.5">
        <History size={13} aria-hidden="true" />
        {text('文风版本历史', 'Writing style history')}
        {loading ? ` · ${text('读取中…', 'Loading…')}` : ` · ${records.length}`}
      </summary>
      <div className="mt-2 space-y-2">
        {error && <p role="alert" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
        {records.length === 0 && !error && (
          <p style={{ color: 'var(--color-text-muted)' }}>{text('还没有 AI 生成的文风档案版本。', 'No AI-generated style profile versions yet.')}</p>
        )}
        {records.map(record => (
          <div key={record.id} className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <Clock size={11} aria-hidden="true" />
              {new Date(record.createdAt.replace(' ', 'T') + 'Z').toLocaleString()}
              <button
                type="button"
                disabled={applying}
                className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
                onClick={() => void applyVersion(record.nextStyle)}
              >
                <RotateCcw size={10} aria-hidden="true" />
                {applying ? text('应用中…', 'Applying…') : text('应用到当前', 'Apply to current')}
              </button>
            </div>
            {record.previousStyle
              ? <p className="mt-1 text-[var(--color-text-secondary)]">{text('旧：', 'Old: ')}{record.previousStyle}</p>
              : undefined}
            <p className="mt-0.5 text-[var(--color-text-secondary)]">{text('新：', 'New: ')}{record.nextStyle}</p>
          </div>
        ))}
      </div>
    </details>
  )
}
