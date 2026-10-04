import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LocalEmbeddingEngine,
  MIRROR_REMOTE_HOST,
  OFFICIAL_REMOTE_HOST,
  type TransformersModule,
} from '../local-embedding-engine'
import { LOCAL_EMBEDDING_MODELS } from '../local-embedding-catalog'
import { readNormalizedSource } from '../../../test/source-contract'

/**
 * 推理路径必须使用配置的缓存目录（bug 族第四实例）。
 *
 * transformers.js 的默认 env.cacheDir 指向**包内**的 .cache 目录；打包后它位于只读的
 * app.asar 内，FileCache.put 的 mkdir 必然 ENOTDIR，同时也不会去读
 * <userData>/models/embedding 下已下载的权重。
 * download() 会经 withRemoteHostFallback → applyEnvironment 设置缓存目录，
 * 但 load()（真正推理路径）此前从不设置 —— 于是「模型已下载、只做推理」的用户必现。
 *
 * 本文件用替身 transformers 模块记录「env 写入」与「pipeline 调用」的**顺序**，
 * 不加载任何权重。
 */
const SENTINEL_CACHE_DIR = path.join(os.tmpdir(), 'transformers-package-default-cache')

type EngineEvent =
  | { type: 'env'; key: string; value: unknown; reverted?: boolean }
  | { type: 'pipeline'; repo: string; callIndex: number }

const extractorStub = async () => ({ tolist: () => [[0.1, 0.2]] })

/**
 * 引擎自身不认识任何模型 id（task-24 立下的契约）：必须显式注册档位，
 * 否则 requireSpec 会先于缓存设置抛「未知本地向量模型」，测不到本文件关心的行为。
 */
function makeEngine(cacheDir: string, loadModule: () => Promise<TransformersModule>): LocalEmbeddingEngine {
  const engine = new LocalEmbeddingEngine({ cacheDir, loadModule })
  engine.setSpecs(Object.fromEntries(LOCAL_EMBEDDING_MODELS.map(spec => [spec.id, spec])))
  return engine
}

function recordingTransformers(options: {
  /** 把 cacheDir 的写入立刻还原为替身初始值——等价于生产代码从不设置它。 */
  revertCacheDir?: boolean
  onPipeline?: (repo: string, callIndex: number) => unknown
} = {}) {
  const events: EngineEvent[] = []
  const target: Record<string, unknown> = { cacheDir: SENTINEL_CACHE_DIR }
  const env = new Proxy(target, {
    set(_target, key, value) {
      const name = String(key)
      if (name === 'cacheDir' && options.revertCacheDir) {
        events.push({ type: 'env', key: name, value, reverted: true })
        target[name] = SENTINEL_CACHE_DIR
        return true
      }
      events.push({ type: 'env', key: name, value })
      target[name] = value
      return true
    },
  })
  let calls = 0
  const pipeline = vi.fn(async (_task: string, repo: string) => {
    calls += 1
    events.push({ type: 'pipeline', repo, callIndex: calls })
    return options.onPipeline ? options.onPipeline(repo, calls) : extractorStub
  })
  return {
    module: { env, pipeline } as unknown as TransformersModule,
    events,
    env: target,
  }
}

type Recorder = ReturnType<typeof recordingTransformers>

/**
 * 核心判据：env.cacheDir 必须在**第一次 pipeline 调用之前**被写入，且值等于引擎配置。
 * 两条真实路径（download / 推理）共用同一条判据——把设置抹掉时它会失败。
 */
function expectCacheDirAppliedBeforeFirstPipeline(
  events: EngineEvent[],
  env: Record<string, unknown>,
  cacheDir: string,
): void {
  const writeIndex = events.findIndex(event => event.type === 'env' && event.key === 'cacheDir')
  const pipelineIndex = events.findIndex(event => event.type === 'pipeline')
  expect(writeIndex, '未观察到 env.cacheDir 的写入').toBeGreaterThanOrEqual(0)
  expect(pipelineIndex, '未观察到 pipeline 调用').toBeGreaterThanOrEqual(0)
  expect(writeIndex, 'env.cacheDir 必须写在 pipeline 之前').toBeLessThan(pipelineIndex)
  expect(events[writeIndex]).toMatchObject({ value: cacheDir })
  // 写入必须**实际生效**：只检查事件会被「记录了却被还原」的替身骗过。
  expect(env.cacheDir, 'env.cacheDir 必须实际生效，而非被还原或被忽略').toBe(cacheDir)
}

function cacheDirWrites(recorder: Recorder): unknown[] {
  return recorder.events
    .filter(event => event.type === 'env' && event.key === 'cacheDir')
    .map(event => (event as { value: unknown }).value)
}

describe('推理路径使用配置的缓存目录', () => {
  const roots: string[] = []

  function makeCacheDir(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-engine-cache-'))
    roots.push(root)
    return root
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('推理路径（embed）在调用 pipeline 之前把 env.cacheDir 设为引擎配置的缓存目录', async () => {
    const cacheDir = makeCacheDir()
    const recorder = recordingTransformers()
    const engine = makeEngine(cacheDir, async () => recorder.module)

    await engine.embed('bge-small-zh-v1.5', ['文本'])

    expectCacheDirAppliedBeforeFirstPipeline(recorder.events, recorder.env, cacheDir)
    // 包内默认 .cache 必须被替换掉，而不是继续生效。
    expect(recorder.env.cacheDir).toBe(cacheDir)
  })

  it('判别力自证：替身把 cacheDir 写入还原为初始值时（等价旧实现），核心判据必然变红', async () => {
    const cacheDir = makeCacheDir()
    const recorder = recordingTransformers({ revertCacheDir: true })
    const engine = makeEngine(cacheDir, async () => recorder.module)

    await engine.embed('bge-small-zh-v1.5', ['文本'])

    // 旧实现的形态：cacheDir 仍是包内默认值，而 pipeline 已经跑过。
    expect(recorder.env.cacheDir).toBe(SENTINEL_CACHE_DIR)
    expect(recorder.events.some(event => event.type === 'pipeline')).toBe(true)

    // 同一判据在这种形态下必须抛错 —— 这是本文件的判别力来源。
    expect(() => expectCacheDirAppliedBeforeFirstPipeline(recorder.events, recorder.env, cacheDir)).toThrow()
  })

  it('download 路径既有行为未被破坏：仍设置 cacheDir，并按官方→镜像回退 remoteHost', async () => {
    const cacheDir = makeCacheDir()
    const recorder = recordingTransformers({
      onPipeline: (_repo, callIndex) => {
        if (callIndex === 1) throw new Error('official host unavailable')
        return extractorStub
      },
    })
    const engine = makeEngine(cacheDir, async () => recorder.module)

    await engine.download('bge-small-zh-v1.5')

    expectCacheDirAppliedBeforeFirstPipeline(recorder.events, recorder.env, cacheDir)
    expect(recorder.events.filter(event => event.type === 'pipeline')).toHaveLength(2)
    const remoteHosts = recorder.events
      .filter(event => event.type === 'env' && event.key === 'remoteHost')
      .map(event => (event as { value: unknown }).value)
    expect(remoteHosts).toEqual([OFFICIAL_REMOTE_HOST, MIRROR_REMOTE_HOST])
  })

  it('download 与推理路径设置的是同一个 cacheDir（防止将来再次分叉）', async () => {
    const cacheDir = makeCacheDir()
    const downloadRecorder = recordingTransformers()
    await makeEngine(cacheDir, async () => downloadRecorder.module)
      .download('bge-small-zh-v1.5')
    const embedRecorder = recordingTransformers()
    await makeEngine(cacheDir, async () => embedRecorder.module)
      .embed('bge-small-zh-v1.5', ['文本'])

    expect(cacheDirWrites(downloadRecorder)).toEqual([cacheDir])
    expect(cacheDirWrites(embedRecorder)).toEqual([cacheDir])
  })
})

/** 静态层的互补护栏：推理路径的加载实现里必须出现环境应用。 */
describe('推理路径缓存设置的源码契约', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
  const enginePath = path.join(repoRoot, 'electron', 'services', 'local-embedding-engine.ts')

  function loadMethodBody(source: string): string {
    const start = source.indexOf('private async load(')
    const end = source.indexOf('private scheduleIdleUnload(')
    return start >= 0 && end > start ? source.slice(start, end) : ''
  }

  it('load() 必须应用引擎环境（applyEnvironment 或 withRemoteHostFallback）', () => {
    const body = loadMethodBody(readNormalizedSource(enginePath))
    expect(body).not.toBe('')
    // 不锁死方法名：只要推理路径确实调用了「应用环境」这一类私有方法（applyEnvironment /
  })

  it('判别力自证：抹掉 load() 里的环境应用后，上面的契约断言必然失败', () => {
    const mutated = loadMethodBody(readNormalizedSource(enginePath))
      .replace(/this\.[A-Za-z]*[Aa]pply[A-Za-z]*\(/g, 'void (')
      .replace(/this\.withRemoteHostFallback\(/g, 'void (')
      .replace(/withRemoteHostFallback\(/g, 'void (')

    expect(mutated).not.toMatch(/this\.[A-Za-z]*[Aa]pply[A-Za-z]*\(|withRemoteHostFallback\(/)
  })
})