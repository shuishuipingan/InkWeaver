import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 引擎档位注册护栏（bug 族第三实例）。
 *
 * 修好守卫与路径判定后，本地模型第一次真正走到推理引擎，就撞出
 * 「未知本地向量模型：bge-small-zh-v1.5」——引擎的 specs 默认 null，必须显式注册；
 * 而 electron/embedding.ts 那个**真正用于推理**的单例从未注册过。
 *
 * 本文件把「引擎实例必须能解析内置档位」写成契约。推理组件与 electron 全部用替身拦截，
 * 不加载 24MB 权重、不发生真实 import。
 */
const mocks = vi.hoisted(() => ({
  userDataPath: '',
  pipeline: vi.fn(),
  extractor: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return mocks.userDataPath
      throw new Error('unexpected app.getPath: ' + name)
    },
    getLocale: () => 'zh-CN',
  },
  ipcMain: { handle: vi.fn() },
  dialog: {},
}))

vi.mock('../../services/runtime-logger', () => ({
  runtimeLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// 动态 import 的 transformers.js：替身保证不真正加载推理组件与权重。
vi.mock('@huggingface/transformers', () => ({
  env: {},
  pipeline: mocks.pipeline,
}))

import {
  LocalEmbeddingEngine,
  createLocalEmbeddingEngine,
  type LocalEmbeddingSpec,
  type TransformersModule,
} from '../local-embedding-engine'
import { LOCAL_EMBEDDING_MODELS } from '../local-embedding-catalog'
import { generateEmbeddings, localEmbeddingEngine } from '../../embedding'
import { readNormalizedSource } from '../../../test/source-contract'

const MISSING_SPEC_ERROR = '未知本地向量模型'

function catalogSpecs(): Record<string, LocalEmbeddingSpec> {
  return Object.fromEntries(LOCAL_EMBEDDING_MODELS.map(spec => [spec.id, spec]))
}

describe('本地推理引擎的档位注册', () => {
  const roots: string[] = []

  function makeCacheDir(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-engine-specs-'))
    roots.push(root)
    return root
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userDataPath = makeCacheDir()
    mocks.extractor.mockImplementation(async () => ({ tolist: () => [[0.1, 0.2]] }))
    mocks.pipeline.mockImplementation(async () => mocks.extractor)
  })

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('createLocalEmbeddingEngine({ specs }) 能解析 catalog 中每一个内置档位，且送到正确的 repo', async () => {
    const engine = createLocalEmbeddingEngine({ cacheDir: makeCacheDir(), specs: catalogSpecs() })
    const requestedRepos: string[] = []
    mocks.pipeline.mockImplementation(async (_task: string, repo: string) => {
      requestedRepos.push(repo)
      return mocks.extractor
    })

    for (const spec of LOCAL_EMBEDDING_MODELS) {
      // 每个档位都要真正走一次加载，避免被 isModelLoaded 复用掩盖。
      engine.unload()
      await expect(engine.embed(spec.id, ['文本'])).resolves.toEqual([[0.1, 0.2]])
    }

    expect(requestedRepos).toEqual(LOCAL_EMBEDDING_MODELS.map(spec => spec.repo))
    expect(LOCAL_EMBEDDING_MODELS.length).toBeGreaterThan(0)
  })

  it('不传 specs 时明确抛「未知本地向量模型」，而不是静默降级', async () => {
    const engine = createLocalEmbeddingEngine({ cacheDir: makeCacheDir() })

    await expect(engine.embed('bge-small-zh-v1.5', ['文本']))
      .rejects.toThrow(new RegExp(MISSING_SPEC_ERROR))
    // 必须在触及任何模型加载之前就拒绝。
    expect(mocks.pipeline).not.toHaveBeenCalled()
  })

  it('生产单例（embedding.ts 的 localEmbeddingEngine）能解析 bge-small-zh-v1.5', async () => {
    await expect(localEmbeddingEngine.embed('bge-small-zh-v1.5', ['文本'])).resolves.toEqual([[0.1, 0.2]])

    expect(mocks.pipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/bge-small-zh-v1.5',
      expect.objectContaining({ dtype: 'q8' }),
    )
  })

  it('generateEmbeddings 在 local 协议下不再抛「未知本地向量模型」', async () => {
    const vectors = await generateEmbeddings(
      ['x'],
      'local',
      { baseUrl: '', apiKey: '', modelName: 'bge-small-zh-v1.5' },
    )

    expect(vectors).toEqual([[0.1, 0.2]])
  })

  it('generateEmbeddings 对 catalog 之外的 modelName 仍明确抛错（不静默返回空向量）', async () => {
    await expect(generateEmbeddings(
      ['x'],
      'local',
      { baseUrl: '', apiKey: '', modelName: 'not-a-catalog-model' },
    )).rejects.toThrow(new RegExp(MISSING_SPEC_ERROR))
  })

  it('判别力对照：未注册档位的实例必然抛错，而已注册实例对同一 id 成功', async () => {
    // 旧实现下 createLocalEmbeddingEngine 不做 setSpecs，实例就处于「未注册」状态；
    // 这里直接构造那个状态：它对同一 id 抛错，而生产单例成功 —— 两个状态给出相反结果，
    // 因此一旦工厂/单例的 specs 接线被退回旧形状，上面几条放行断言必然变红。
    const unregistered = new LocalEmbeddingEngine({
      cacheDir: makeCacheDir(),
      loadModule: async () => ({ env: {}, pipeline: mocks.pipeline }) as unknown as TransformersModule,
    })

    await expect(unregistered.embed('bge-small-zh-v1.5', ['文本']))
      .rejects.toThrow(new RegExp(MISSING_SPEC_ERROR))
    await expect(localEmbeddingEngine.embed('bge-small-zh-v1.5', ['文本'])).resolves.toEqual([[0.1, 0.2]])
  })
})

/**
 * 源码契约：把「必须注册档位」这条接线固定在源码形状上。
 * 判别力由紧随其后的自证用例给出——抹掉接线后同样的断言必然失败。
 */
describe('引擎档位接线的源码契约', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
  const engineSource = () => readNormalizedSource(path.join(repoRoot, 'electron', 'services', 'local-embedding-engine.ts'))
  const embeddingSource = () => readNormalizedSource(path.join(repoRoot, 'electron', 'embedding.ts'))

  it('工厂接受 specs 并转交实例，生产单例注入 catalog 登记', () => {
    const engine = engineSource()
    const embedding = embeddingSource()

    // 1. 工厂签名接受可选 specs。
    expect(engine).toMatch(/specs\?:\s*Record<string,\s*LocalEmbeddingSpec>/)
    // 2. 工厂必须把它转交给实例，否则入参形同虚设。
    expect(engine).toMatch(/setSpecs\(options\.specs\)/)
    // 3. 生产单例从内置目录注入登记（这是用户撞到的那处缺陷）。
    expect(embedding).toMatch(/from '\.\/services\/local-embedding-catalog'/)
    expect(embedding).toMatch(/specs:\s*Object\.fromEntries\(LOCAL_EMBEDDING_MODELS/)
  })

  it('判别力自证：抹掉接线后，上面的契约断言必然失败', () => {
    const engineMutated = engineSource()
      .replace(/specs\?:\s*Record<string,\s*LocalEmbeddingSpec>\r?\n?/, '')
      .replace(/setSpecs\(options\.specs\)/, 'void options')
    const embeddingMutated = embeddingSource()
      .replace(/specs:\s*Object\.fromEntries\(LOCAL_EMBEDDING_MODELS[\s\S]*?\),\r?\n/, '')

    expect(engineMutated).not.toMatch(/specs\?:\s*Record<string,\s*LocalEmbeddingSpec>/)
    expect(engineMutated).not.toMatch(/setSpecs\(options\.specs\)/)
    expect(embeddingMutated).not.toMatch(/specs:\s*Object\.fromEntries\(LOCAL_EMBEDDING_MODELS/)
  })
})
