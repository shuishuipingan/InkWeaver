/**
 * 本地向量模型引擎 — 下载、加载、推理（transformers.js + ONNX Runtime）。
 *
 * 设计约束：
 * - 设备优先级：GPU → 核显 → CPU。Windows 走 DirectML（自动覆盖独显与核显），
 *   macOS 走 CoreML，Linux 仅在有 CUDA 库时尝试；任一加速后端初始化失败即回退 CPU。
 * - 同一模型只加载一次；空闲超时后卸载释放内存。
 * - 下载复用 transformers.js 自带缓存（userData/models/embedding），进度经回调上报。
 */

export interface LocalEmbeddingProgress {
  modelId: string
  status: 'downloading' | 'loading' | 'ready' | 'error' | 'uninstalled'
  /** 0-100，仅 downloading 阶段有意义。 */
  progress: number
  file?: string
  error?: string
}

type ProgressListener = (progress: LocalEmbeddingProgress) => void

/** 纯函数：按平台与用户偏好给出设备尝试顺序（GPU → 核显 → CPU）。 */
export function resolveDeviceCandidates(
  preference: 'auto' | 'gpu' | 'cpu',
  platform: NodeJS.Platform,
): string[] {
  if (preference === 'cpu') return ['cpu']
  const accelerators = platform === 'win32'
    ? ['dml']
    : platform === 'darwin'
      ? ['coreml']
      : ['cuda']
  return [...accelerators, 'cpu']
}

/** 权重下载源：官方优先，失败后自动尝试国内镜像（有代理时官方可直连，无代理时镜像可用）。 */
export const OFFICIAL_REMOTE_HOST = 'https://huggingface.co'
export const MIRROR_REMOTE_HOST = 'https://hf-mirror.com'

/**
 * 纯函数：按顺序给出下载源主机列表。
 * - 环境变量 AI_NOVEL_EMBEDDING_REMOTE_HOST 指定时只用它；
 * - 否则官方优先、镜像兜底。
 */
export function resolveRemoteHosts(configured = process.env.AI_NOVEL_EMBEDDING_REMOTE_HOST): string[] {
  const value = configured?.trim()
  if (value && /^https?:\/\/[a-z0-9.-]+/iu.test(value)) return [value.replace(/\/+$/u, '')]
  return [OFFICIAL_REMOTE_HOST, MIRROR_REMOTE_HOST]
}

/** 纯函数：判断 transformers.js 上报的进度事件里是否已完成全部文件。 */
export function isDownloadComplete(event: { status?: string }): boolean {
  return event.status === 'ready' || event.status === 'done'
}

interface LoadedModel {
  extractor: (texts: readonly string[], options: Record<string, unknown>) => Promise<{ tolist: () => number[][] }>
  pooling: 'cls' | 'mean'
}

export class LocalEmbeddingEngine {
  private loaded: LoadedModel | null = null
  private loadedModelId: string | null = null
  private loadPromise: Promise<LoadedModel> | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private readonly listeners = new Set<ProgressListener>()

  constructor(
    private readonly options: {
      cacheDir: string
      /** 空闲多久后卸载模型释放内存。 */
      idleUnloadMs?: number
      devicePreference?: 'auto' | 'gpu' | 'cpu'
      loadModule: () => Promise<TransformersModule>
      now?: () => number
    },
  ) {}

  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(progress: LocalEmbeddingProgress): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(progress)
      } catch {
        // 单个监听器异常不影响下载/推理主流程。
      }
    }
  }

  isModelLoaded(modelId: string): boolean {
    return this.loadedModelId === modelId && this.loaded !== null
  }

  /** 下载（或补全）指定模型的权重文件；transformers.js 自带断点内的文件级去重。 */
  async download(modelId: string): Promise<void> {
    const { loadModule } = this.options
    const mod = await loadModule()
    const spec = this.requireSpec(modelId)
    this.emit({ modelId, status: 'downloading', progress: 0 })
    await this.withRemoteHostFallback(mod, async () => await mod.pipeline('feature-extraction', spec.repo, {
      dtype: spec.dtype,
      device: 'cpu',
      progress_callback: (event: { status?: string; progress?: number; file?: string }) => {
        this.emit({
          modelId,
          status: 'downloading',
          progress: Math.max(0, Math.min(100, Math.round(event.progress ?? 0))),
          file: event.file,
        })
      },
    }))
    this.emit({ modelId, status: 'ready', progress: 100 })
  }

  private requireSpec(modelId: string): LocalEmbeddingSpec {
    const spec = this.specs?.[modelId]
    if (!spec) throw new Error(`未知本地向量模型：${modelId}`)
    return spec
  }

  private specs: Record<string, LocalEmbeddingSpec> | null = null

  setSpecs(specs: Record<string, LocalEmbeddingSpec>): void {
    this.specs = specs
  }

  /** 加载（或复用已加载的）抽取器。 */
  private async ensureLoaded(modelId: string): Promise<LoadedModel> {
    if (this.isModelLoaded(modelId)) {
      this.scheduleIdleUnload()
      return this.loaded!
    }
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = this.load(modelId)
    try {
      return await this.loadPromise
    } finally {
      this.loadPromise = null
    }
  }

  /** 应用 transformers.js 的缓存目录与下载源。 */
  private applyEnvironment(mod: TransformersModule, remoteHost: string): void {
    try {
      mod.env.cacheDir = this.options.cacheDir
      mod.env.remoteHost = remoteHost
      mod.env.allowLocalModels = true
    } catch {
      // 版本差异导致 env 不可写时不影响推理本身。
    }
  }

  private async withRemoteHostFallback<T>(
    mod: TransformersModule,
    attempt: () => Promise<T>,
  ): Promise<T> {
    const hosts = resolveRemoteHosts()
    let lastError: unknown = null
    for (const host of hosts) {
      this.applyEnvironment(mod, host)
      try {
        return await attempt()
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private async load(modelId: string): Promise<LoadedModel> {
    const spec = this.requireSpec(modelId)
    this.emit({ modelId, status: 'loading', progress: 100 })
    const { loadModule } = this.options
    const mod = await loadModule()
    const devices = resolveDeviceCandidates(this.options.devicePreference ?? 'auto', process.platform)
    let lastError: unknown = null
    for (const device of devices) {
      try {
        const extractor = await mod.pipeline('feature-extraction', spec.repo, {
          dtype: spec.dtype,
          device,
        }) as LoadedModel['extractor']
        this.loaded = { extractor, pooling: spec.pooling }
        this.loadedModelId = modelId
        this.scheduleIdleUnload()
        this.emit({ modelId, status: 'ready', progress: 100 })
        return this.loaded
      } catch (error) {
        lastError = error
      }
    }
    this.emit({
      modelId, status: 'error', progress: 100,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    })
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private scheduleIdleUnload(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    const idleMs = this.options.idleUnloadMs ?? 5 * 60_000
    this.idleTimer = setTimeout(() => {
      this.loaded = null
      this.loadedModelId = null
    }, idleMs)
  }

  /** 批量向量化。返回向量数量与输入一致；维度由模型决定。 */
  async embed(modelId: string, texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const loaded = await this.ensureLoaded(modelId)
    const output = await loaded.extractor(texts, {
      pooling: loaded.pooling,
      normalize: true,
    })
    const vectors = output.tolist() as number[][]
    if (vectors.length !== texts.length) {
      throw new Error(`本地向量模型返回数量不匹配：期望 ${texts.length}，实际 ${vectors.length}`)
    }
    return vectors
  }

  unload(): void {
    this.loaded = null
    this.loadedModelId = null
    if (this.idleTimer) clearTimeout(this.idleTimer)
  }
}

export interface LocalEmbeddingSpec {
  id: string
  repo: string
  dtype: 'fp32' | 'fp16' | 'q8' | 'int8' | 'q4f16' | 'q4'
  pooling: 'cls' | 'mean'
}

/** transformers.js 的最小接口面（运行时动态 import，避免静态依赖）。 */
export interface TransformersModule {
  pipeline(
    task: 'feature-extraction',
    repo: string,
    options: Record<string, unknown>,
  ): Promise<LoadedModel['extractor']>
  env: {
    cacheDir?: string
    remoteHost?: string
    allowLocalModels?: boolean
    useBrowserCache?: boolean
  }
}

/** 应用级单例：所有本地向量调用共用一个引擎（模型只加载一次）。 */
export function createLocalEmbeddingEngine(options: {
  cacheDir: string | (() => string)
  idleUnloadMs?: number
  devicePreference?: 'auto' | 'gpu' | 'cpu'
}): LocalEmbeddingEngine {
  const resolveCacheDir = () => (typeof options.cacheDir === 'string' ? options.cacheDir : options.cacheDir())
  return new LocalEmbeddingEngine({
    get cacheDir() {
      return resolveCacheDir()
    },
    idleUnloadMs: options.idleUnloadMs,
    devicePreference: options.devicePreference,
    // 运行时解析：推理组件是可选增强，缺失时相关功能优雅降级。
    loadModule: async () => await import(/* webpackIgnore: true */ '@huggingface/transformers' as string) as unknown as TransformersModule,
  })
}
