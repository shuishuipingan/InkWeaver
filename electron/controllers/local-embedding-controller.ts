/**
 * 本地向量模型控制器 — 首跑下载、来源选择与状态查询的 IPC 门面。
 *
 * 配置语义（持久化到 ~/.vela/config.json）：
 * - embeddingSource: 'auto'（默认）| 'local' | 'api'
 *   auto：已下载内置模型则用本地，否则走 API；都没有则 FTS。
 * - localEmbeddingModelId: 当前选中的内置模型（auto 与 local 都读取它）。
 */

import { ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

import { GlobalConfig } from '../../src/shared/ipc-channels'
import { readJsonFile, writeJsonFile, GLOBAL_CONFIG_PATH, DEFAULT_GLOBAL_CONFIG } from '../utils/config-utils'
import {
  LOCAL_EMBEDDING_MODELS,
  getLocalEmbeddingModelSpec,
  formatApproxBytes,
} from '../services/local-embedding-catalog'
import { LocalEmbeddingEngine, type TransformersModule } from '../services/local-embedding-engine'
import { safeConsole } from '../utils/safe-console'

export interface LocalEmbeddingEntryStatus {
  modelId: string
  displayName: string
  dimension: number
  approxSizeText: string
  license: string
  descriptionZh: string
  descriptionEn: string
  downloaded: boolean
}

export type LocalEmbeddingSource = 'auto' | 'local' | 'api'

export function readLocalEmbeddingConfig(config?: GlobalConfig): {
  source: LocalEmbeddingSource
  localModelId: string | null
} {
  const global = config ?? readJsonFile<GlobalConfig>(GLOBAL_CONFIG_PATH, DEFAULT_GLOBAL_CONFIG)
  const source: LocalEmbeddingSource = global.embeddingSource === 'local' || global.embeddingSource === 'api'
    ? global.embeddingSource
    : 'auto'
  const localModelId = typeof global.localEmbeddingModelId === 'string' && global.localEmbeddingModelId.trim()
    ? global.localEmbeddingModelId.trim()
    : null
  return { source, localModelId }
}

export function writeLocalEmbeddingConfig(update: {
  embeddingSource?: LocalEmbeddingSource
  localEmbeddingModelId?: string | null
  addDownloadedModelId?: string
}): GlobalConfig {
  const existing = readJsonFile<GlobalConfig>(GLOBAL_CONFIG_PATH, DEFAULT_GLOBAL_CONFIG)
  const downloaded = new Set(existing.localEmbeddingDownloadedModels ?? [])
  if (update.addDownloadedModelId) downloaded.add(update.addDownloadedModelId)
  const updated: GlobalConfig = {
    ...existing,
    ...(update.embeddingSource !== undefined ? { embeddingSource: update.embeddingSource } : {}),
    ...(update.localEmbeddingModelId !== undefined ? { localEmbeddingModelId: update.localEmbeddingModelId } : {}),
    localEmbeddingDownloadedModels: [...downloaded].sort(),
  }
  writeJsonFile(GLOBAL_CONFIG_PATH, updated)
  return updated
}

/** 模型权重缓存目录（transformers.js 下载落点）。 */
export function localEmbeddingCacheDir(): string {
  // 延迟解析 userData：模块加载期不触碰 electron.app（部分测试会部分 mock electron）。
  const root = process.env.AI_NOVEL_LOCAL_EMBEDDING_CACHE?.trim()
  if (root) return root
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as { app: { getPath(name: 'userData'): string } }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('node:path') as typeof import('node:path')
  return nodePath.join(electron.app.getPath('userData'), 'models', 'embedding')
}

function modelDir(modelId: string): string {
  return path.join(localEmbeddingCacheDir(), modelId)
}

function isDownloaded(modelId: string): boolean {
  const dir = modelDir(modelId)
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir, { recursive: true }).some(entry => String(entry).endsWith('.onnx'))
  } catch {
    return false
  }
}

export class LocalEmbeddingController {
  private readonly engine: LocalEmbeddingEngine

  constructor() {
    this.engine = new LocalEmbeddingEngine({
      cacheDir: localEmbeddingCacheDir(),
      // 动态 import：推理组件缺失或未下载模型时，其余功能不受影响。
      loadModule: async () => await import(/* webpackIgnore: true */ '@huggingface/transformers' as string) as unknown as TransformersModule,
    })
    this.engine.setSpecs(Object.fromEntries(LOCAL_EMBEDDING_MODELS.map(spec => [spec.id, spec])))
  }

  register(): void {
    ipcMain.handle('llm:local-embedding-catalog', async () => {
      const config = readLocalEmbeddingConfig()
      const entries = LOCAL_EMBEDDING_MODELS.map(spec => ({
        modelId: spec.id,
        displayName: spec.displayName,
        dimension: spec.dimension,
        approxSizeText: formatApproxBytes(spec.approxBytes),
        license: spec.license,
        descriptionZh: spec.descriptionZh,
        descriptionEn: spec.descriptionEn,
        downloaded: isDownloaded(spec.id),
      }))
      return {
        entries: entries satisfies LocalEmbeddingEntryStatus[],
        source: config.source,
        selectedModelId: config.localModelId,
        downloadedModelIds: entries.filter(entry => entry.downloaded).map(entry => entry.modelId),
        cacheDir: localEmbeddingCacheDir(),
      }
    })

    ipcMain.handle('llm:local-embedding-set-source', async (_event, source: unknown) => {
      if (source !== 'auto' && source !== 'local' && source !== 'api') {
        return { success: false, error: '未知向量来源' }
      }
      const config = writeLocalEmbeddingConfig({ embeddingSource: source })
      return { success: true, source: readLocalEmbeddingConfig(config).source }
    })

    ipcMain.handle('llm:local-embedding-select-model', async (_event, modelId: unknown) => {
      const spec = getLocalEmbeddingModelSpec(typeof modelId === 'string' ? modelId : '')
      if (!spec) return { success: false, error: '未知本地向量模型' }
      const config = writeLocalEmbeddingConfig({ localEmbeddingModelId: spec.id })
      return { success: true, selectedModelId: readLocalEmbeddingConfig(config).localModelId }
    })

    ipcMain.handle('llm:local-embedding-download', async (event, modelId: unknown) => {
      const spec = getLocalEmbeddingModelSpec(typeof modelId === 'string' ? modelId : '')
      if (!spec) return { success: false, error: '未知本地向量模型' }
      const sender = event.sender
      const forward = (progress: { modelId: string; status: string; progress: number; error?: string }) => {
        if (!sender.isDestroyed()) sender.send('llm:local-embedding-progress', progress)
      }
      const unsubscribe = this.engine.onProgress(progress => forward(progress))
      try {
        fs.mkdirSync(localEmbeddingCacheDir(), { recursive: true })
        await this.engine.download(spec.id)
        writeLocalEmbeddingConfig({ addDownloadedModelId: spec.id, localEmbeddingModelId: spec.id })
        forward({ modelId: spec.id, status: 'ready', progress: 100 })
        return { success: true, modelId: spec.id }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        safeConsole.error('[InkWeaver KB] 本地向量模型下载失败:', message)
        forward({ modelId: spec.id, status: 'error', progress: 100, error: message })
        return { success: false, error: message }
      } finally {
        unsubscribe()
      }
    })

    ipcMain.handle('llm:local-embedding-delete', async (_event, modelId: unknown) => {
      const spec = getLocalEmbeddingModelSpec(typeof modelId === 'string' ? modelId : '')
      if (!spec) return { success: false, error: '未知本地向量模型' }
      try {
        fs.rmSync(modelDir(spec.id), { recursive: true, force: true })
        const config = readLocalEmbeddingConfig()
        const global = readJsonFile<GlobalConfig>(GLOBAL_CONFIG_PATH, DEFAULT_GLOBAL_CONFIG)
        writeJsonFile(GLOBAL_CONFIG_PATH, {
          ...global,
          localEmbeddingDownloadedModels: (global.localEmbeddingDownloadedModels ?? []).filter(id => id !== spec.id),
          ...(config.localModelId === spec.id ? { localEmbeddingModelId: null } : {}),
        })
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })
  }
}

export interface LocalEmbeddingExtractor {
  (texts: readonly string[], options: Record<string, unknown>): Promise<{ tolist: () => number[][] }>
}

/** 注册本地向量模型相关 IPC 通道（由 ipc-handlers 统一调用）。 */
export function registerLocalEmbeddingController(): void {
  new LocalEmbeddingController().register()
}

declare module '../../src/shared/ipc-channels' {
  interface GlobalConfig {
    /** 向量来源：auto=本地优先回退 API；local=仅本地；api=仅 API。缺省 auto。 */
    embeddingSource?: LocalEmbeddingSource
    /** 选中的内置本地向量模型 id。 */
    localEmbeddingModelId?: string | null
    /** 已成功下载的内置模型 id 列表。 */
    localEmbeddingDownloadedModels?: string[]
  }
}
