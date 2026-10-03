import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, HardDrive, Loader2, MonitorDown, Trash2 } from 'lucide-react'

import { ipc } from '../../services/ipc-client'
import { useLocaleStore } from '../../stores/locale-store'

interface CatalogEntry {
  modelId: string
  displayName: string
  dimension: number
  approxSizeText: string
  license: string
  descriptionZh: string
  descriptionEn: string
  downloaded: boolean
}

interface CatalogResponse {
  entries: CatalogEntry[]
  source: 'auto' | 'local' | 'api'
  selectedModelId: string | null
  downloadedModelIds: string[]
  cacheDir: string
}

export type LocalEmbeddingSource = 'auto' | 'local' | 'api'

interface DownloadProgress {
  modelId: string
  status: 'downloading' | 'loading' | 'ready' | 'error' | 'uninstalled'
  progress: number
  error?: string
}

const SOURCE_OPTIONS: ReadonlyArray<{ value: LocalEmbeddingSource; zh: string; en: string; hintZh: string; hintEn: string }> = [
  {
    value: 'auto', zh: '自动（推荐）', en: 'Auto (recommended)',
    hintZh: '已下载内置模型时优先本地离线，否则走 API 向量模型。', hintEn: 'Prefers the downloaded local model offline; otherwise uses the API embedding model.',
  },
  {
    value: 'local', zh: '仅本地模型', en: 'Local model only',
    hintZh: '只使用已下载的内置向量模型；未下载时知识库退化为全文检索。', hintEn: 'Only the downloaded built-in model; without it the library falls back to full-text search.',
  },
  {
    value: 'api', zh: '仅 API 向量模型', en: 'API embedding only',
    hintZh: '只使用上方配置的 API 向量模型，不加载本地权重。', hintEn: 'Only the API embedding model configured above; local weights are not loaded.',
  },
]

/** 内置本地向量模型卡片：目录选择、下载进度、来源切换（auto/local/api）。 */
export function LocalEmbeddingCard({ onDownloaded }: { onDownloaded?: (modelId: string) => void } = {}) {
  const text = useLocaleStore(state => state.text)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const loadCatalog = useCallback(async () => {
    try {
      const result = await ipc.invoke('llm:local-embedding-catalog')
      if (mountedRef.current) setCatalog(result as CatalogResponse)
    } catch (reason) {
      if (mountedRef.current) setLoadError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let unsubscribe: (() => void) | undefined
    const bootstrap = async () => {
      await loadCatalog()
      if (!mountedRef.current) return
      // 订阅必须在目录加载完成后建立，回调里再 setState 不属于同步 effect 体。
      unsubscribe = ipc.on('llm:local-embedding-progress', (payload: DownloadProgress) => {
        if (!mountedRef.current) return
        setProgress(previous => ({ ...previous, [payload.modelId]: payload.progress }))
        if (payload.status === 'ready' || payload.status === 'error') {
          setDownloading(previous => (previous === payload.modelId ? null : previous))
          if (payload.status === 'error' && mountedRef.current) setActionError(payload.error ?? null)
          if (payload.status === 'ready') onDownloaded?.(payload.modelId)
          void loadCatalog()
        }
      })
    }
    void bootstrap()
    return () => {
      mountedRef.current = false
      unsubscribe?.()
    }
  }, [loadCatalog, onDownloaded])

  const setSource = async (source: LocalEmbeddingSource) => {
    setActionError(null)
    const result = await ipc.invoke('llm:local-embedding-set-source', source)
    if (!result.success) setActionError(result.error ?? null)
    await loadCatalog()
  }

  const selectModel = async (modelId: string) => {
    setActionError(null)
    const result = await ipc.invoke('llm:local-embedding-select-model', modelId)
    if (!result.success) setActionError(result.error ?? null)
    await loadCatalog()
  }

  const download = async (modelId: string) => {
    setActionError(null)
    setDownloading(modelId)
    setProgress(previous => ({ ...previous, [modelId]: 0 }))
    const result = await ipc.invoke('llm:local-embedding-download', modelId)
    if (!result.success && mountedRef.current) setActionError(result.error ?? null)
    // 完成态由进度事件回调刷新目录。
  }

  const remove = async (modelId: string) => {
    setActionError(null)
    const result = await ipc.invoke('llm:local-embedding-delete', modelId)
    if (!result.success && mountedRef.current) setActionError(result.error ?? null)
    await loadCatalog()
  }

  if (loadError) {
    return (
      <div className="rounded-xl px-4 py-3 text-xs" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-panel)', color: 'var(--color-text-muted)' }}>
        {text('内置本地向量模型组件未安装；运行 pnpm install 后重启应用即可启用。', 'The local embedding runtime is not installed; run pnpm install and restart to enable it.')}
      </div>
    )
  }
  if (!catalog) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-panel)', color: 'var(--color-text-muted)' }}>
        <Loader2 size={14} className="animate-spin" /> {text('正在读取本地向量模型目录…', 'Loading local embedding catalog…')}
      </div>
    )
  }

  return (
    <div
      className="rounded-xl px-4 py-3 space-y-3"
      style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-panel)' }}
      data-local-embedding-card
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
            <HardDrive size={13} /> {text('内置本地向量模型（离线）', 'Built-in local embedding models (offline)')}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {text('下载后无需 API Key 即可使用知识库检索；数据完全保存在本机。', 'Download once and use knowledge retrieval without an API key; everything stays on this machine.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(previous => !previous)}
          className="text-xs flex-shrink-0"
          style={{ color: 'var(--color-accent)' }}
        >
          {expanded ? text('收起', 'Collapse') : text('浏览模型', 'Browse models')}
        </button>
      </div>

      {catalog.selectedModelId && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
          <Check size={12} style={{ color: 'var(--color-text-muted)' }} />
          {text(`当前选中：${catalog.selectedModelId}`, `Selected: ${catalog.selectedModelId}`)}
        </p>
      )}

      <div>
        <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {text('向量来源', 'Embedding source')}
        </p>
        <div className="space-y-1.5">
          {SOURCE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="local-embedding-source"
                checked={catalog.source === option.value}
                onChange={() => void setSource(option.value)}
              />
              <span>
                <span style={{ color: 'var(--color-text)' }}>{text(option.zh, option.en)}</span>
                <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                  {text(option.hintZh, option.hintEn)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="space-y-2">
          {catalog.entries.map(entry => {
            const isDownloading = downloading === entry.modelId
            const pct = progress[entry.modelId]
            return (
              <div key={entry.modelId} className="rounded-lg p-2.5 space-y-1.5" style={{ border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                    {entry.displayName}
                    <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                      {entry.dimension} 维 · 约 {entry.approxSizeText} · {entry.license}
                    </span>
                  </p>
                  {isDownloading ? (
                    <span className="flex items-center gap-1.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      <Loader2 size={13} className="animate-spin" />
                      {pct !== undefined ? `${pct}%` : text('准备中…', 'Preparing…')}
                    </span>
                  ) : entry.downloaded ? (
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {catalog.selectedModelId === entry.modelId ? (
                        <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                          <Check size={12} /> {text('使用中', 'Active')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-xs"
                          style={{ color: 'var(--color-accent)' }}
                          onClick={() => void selectModel(entry.modelId)}
                        >
                          {text('设为使用', 'Use')}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={text(`删除 ${entry.modelId}`, `Delete ${entry.modelId}`)}
                        className="p-1"
                        style={{ color: 'var(--color-text-muted)' }}
                        onClick={() => void remove(entry.modelId)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs flex-shrink-0"
                      style={{ color: 'var(--color-accent)' }}
                      onClick={() => void download(entry.modelId)}
                    >
                      <Download size={13} /> {text('下载', 'Download')}
                    </button>
                  )}
                </div>
                <p className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
                  {text(entry.descriptionZh, entry.descriptionEn)}
                </p>
                {isDownloading && pct !== undefined && (
                  <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)' }} />
                  </div>
                )}
              </div>
            )
          })}
          <p className="text-[0.65rem] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
            <MonitorDown size={11} />
            {text('下载来源为模型官方仓库，权重缓存在本机应用数据目录。', 'Weights download from the model repository and cache in the app data directory.')}
          </p>
        </div>
      )}

      {actionError && (
        <p className="text-xs" style={{ color: 'var(--color-error-text)' }}>{actionError}</p>
      )}
    </div>
  )
}
