import { useEffect, useState } from 'react'
import { Clock, History, RotateCcw } from 'lucide-react'
import { ipc } from '../../services/ipc-client'
import type { WritingStyleHistoryRecord } from '../../shared/ipc-channels'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import {
  captureProjectSession,
  isProjectSessionCurrent,
  isProjectSessionPath,
} from '../project-session-gate'

/** 文风档案版本历史：列出最近 AI 自动生成的风格档案变更，并可一键应用到当前项目配置。 */
export default function WritingStyleHistoryPanel({ projectKey }: { projectKey: string }) {
  const currentProject = useProjectStore(state => state.currentProject)
  const updateNovelConfig = useProjectStore(state => state.updateNovelConfig)
  const text = useLocaleStore(state => state.text)
  const [records, setRecords] = useState<WritingStyleHistoryRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) {
      setRecords([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void ipc.invokeWithProjectSession(session, 'db:writing-style-history-list', projectKey)
      .then(result => {
        if (cancelled || !isProjectSessionCurrent(session)) return
        setRecords(Array.isArray(result) ? result : [])
      })
      .catch(cause => {
        if (cancelled || !isProjectSessionCurrent(session)) return
        setError(String(cause))
      })
      .finally(() => {
        if (cancelled || !isProjectSessionCurrent(session)) return
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [currentProject?.sessionLease, projectKey])

  if (records.length === 0 && !loading && !error) return null

  const applyVersion = (nextStyle: string) => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionPath(session, projectKey)) return
    updateNovelConfig({ writingStyle: nextStyle }, session)
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
                className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
                onClick={() => applyVersion(record.nextStyle)}
              >
                <RotateCcw size={10} aria-hidden="true" />
                {text('应用到当前', 'Apply to current')}
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