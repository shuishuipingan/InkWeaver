import { useEffect, useState } from 'react'
import { Check, Database } from 'lucide-react'

import { ipc } from '../../services/ipc-client'
import { useLocaleStore } from '../../stores/locale-store'
import { LocalEmbeddingCard } from '../settings/LocalEmbeddingCard'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogTitle } from '../ui/Dialog'

const FIRST_RUN_DISMISS_KEY = 'local-embedding-first-run-dismissed'

/**
 * 首跑引导：在没有配置 API 向量模型且没有下载内置模型时出现一次。
 * 用户可以选择下载某个内置向量模型，或跳过改用 API 向量模型。
 */
export function LocalEmbeddingFirstRunDialog() {
  const text = useLocaleStore(state => state.text)
  const [open, setOpen] = useState(false)
  const [hasDownloaded, setHasDownloaded] = useState(false)

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(FIRST_RUN_DISMISS_KEY) === '1') return
    let cancelled = false
    const check = async () => {
      try {
        const [catalog, globalConfig] = await Promise.all([
          ipc.invoke('llm:local-embedding-catalog'),
          ipc.invoke('config:get'),
        ])
        const defaultEmbeddingModelId = (globalConfig as { defaultEmbeddingModelId?: string | null }).defaultEmbeddingModelId
        if (cancelled) return
        const anyDownloaded = (catalog as { downloadedModelIds: string[] }).downloadedModelIds.length > 0
        const apiConfigured = Boolean(defaultEmbeddingModelId)
        setHasDownloaded(anyDownloaded)
        if (!anyDownloaded && !apiConfigured) setOpen(true)
      } catch {
        // 配置读取失败不阻塞首跑；用户可在设置里手动下载。
      }
    }
    void check()
    return () => { cancelled = true }
  }, [])

  // 卡片内完成下载后自动关闭：无需用户再点。派生关闭而非 effect 内 setState。
  const shouldAutoClose = hasDownloaded && open
  if (shouldAutoClose && typeof localStorage !== 'undefined') {
    localStorage.setItem(FIRST_RUN_DISMISS_KEY, '1')
  }

  const dismiss = () => {
    localStorage.setItem(FIRST_RUN_DISMISS_KEY, '1')
    setOpen(false)
  }

  if (!open) return null

  return (
    <Dialog open onOpenChange={(next) => { if (!next) dismiss() }}>
      <DialogContent className="flex flex-col p-5 space-y-4" style={{ width: 'min(94vw, 640px)', maxHeight: '85vh', overflow: 'hidden' }}>
        <DialogTitle className="flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          <Database size={17} style={{ color: 'var(--color-accent)' }} />
          {text('为知识库选择一个向量模型', 'Choose a vector model for your knowledge base')}
        </DialogTitle>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {text(
            '知识库（拆书仿写的资料检索）需要一个向量模型。你可以下载一个内置模型离线使用——完全不需要 API Key；也可以跳过，之后配置 API 向量模型。随时可以在 设置 → 向量模型 里更改。',
            'Your knowledge base (reference retrieval for adaptation) needs a vector model. Download a built-in model to work fully offline without an API key, or skip and configure an API embedding model later. Change this anytime in Settings → Embedding model.',
          )}
        </p>
        <div className="overflow-y-auto pr-1" style={{ maxHeight: '46vh' }}>
          <LocalEmbeddingCard onDownloaded={() => setHasDownloaded(true)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          {hasDownloaded ? (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text)' }}>
              <Check size={13} style={{ color: 'var(--color-accent)' }} />
              {text('本地向量模型已就绪。', 'Local embedding model is ready.')}
            </p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {text('暂时跳过？之后仍可在设置里下载。', 'Skipping for now? You can download later in Settings.')}
            </p>
          )}
          <Button variant="outline" onClick={dismiss}>
            {hasDownloaded
              ? text('完成', 'Done')
              : text('跳过，使用 API 向量模型', 'Skip, use API embedding')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
