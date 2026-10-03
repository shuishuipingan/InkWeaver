import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type IpcHandler = (...args: unknown[]) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  /** 由 app.getPath('userData') 返回；每个用例指向自己的临时目录。 */
  userDataPath: '',
  handlers: new Map<string, IpcHandler>(),
  currentProjectPath: 'C:/projects/embedding',
  run: vi.fn(),
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  assertCurrentProjectContext: vi.fn(),
  assertKnowledgeBaseStoragePathSupported: vi.fn(),
  projectStoragePreflightFailure: vi.fn(),
}))

// 沿用 kb-controller-project-context.test.ts 的 electron mock 套式：
// 只提供控制器真正解引用的三个入口，其余一律不造。
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return mocks.userDataPath
      throw new Error('unexpected app.getPath: ' + name)
    }),
    getLocale: vi.fn(() => 'zh-CN'),
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      mocks.handlers.set(channel, handler)
    }),
  },
}))

vi.mock('../../database', () => ({
  getCurrentProjectPath: () => mocks.currentProjectPath,
}))

vi.mock('../../services/project-access', () => ({
  projectAccess: { assertCurrentProjectContext: mocks.assertCurrentProjectContext },
}))

vi.mock('../../services/project-storage-preflight', () => ({
  assertKnowledgeBaseStoragePathSupported: mocks.assertKnowledgeBaseStoragePathSupported,
  projectStoragePreflightFailure: mocks.projectStoragePreflightFailure,
}))

vi.mock('../../utils/config-utils', () => ({
  readJsonFile: mocks.readJsonFile,
  writeJsonFile: mocks.writeJsonFile,
  GLOBAL_CONFIG_PATH: 'global.json',
  DEFAULT_GLOBAL_CONFIG: {},
  MODELS_CONFIG_PATH: 'models.json',
}))

vi.mock('../../services/knowledge-base-loader', () => ({
  knowledgeBaseLoader: { run: mocks.run },
}))

vi.mock('../../i18n', () => ({
  mainText: vi.fn((_locale: string, zh: string) => zh),
}))


import {
  LOCAL_EMBEDDING_DTYPE_FILES,
  LOCAL_EMBEDDING_MODELS,
  getLocalEmbeddingModelSpec,
  localEmbeddingFingerprint,
  localEmbeddingWeightFile,
  formatApproxBytes,
} from '../../services/local-embedding-catalog'
import { resolveDeviceCandidates } from '../../services/local-embedding-engine'
import type { GlobalConfig, ModelProfile } from '../../../src/shared/ipc-channels'
import { registerKBController, resolveEmbeddingCall } from '../kb-controller'
import { LocalEmbeddingController } from '../local-embedding-controller'

describe('local embedding catalog', () => {
  // 实测各仓库 onnx/ 目录文件清单后固定：dtype 与文件名一一对应，
  // 任何一条写错都会在用户下载时失败。
  //
  // 这两份表刻意保留为「外部事实」的独立副本，而不是直接引用
  // LOCAL_EMBEDDING_DTYPE_FILES：后者是代码内登记，前者是 HF 仓库实际发布了什么。
  // 保留两份才能让下面的交叉校验抓住单边改错——若测试直接引用被断言的常量，
  // 代码与断言会一起错，外部事实校验即失效。
  const dtypeToFile: Record<string, string> = {
    fp32: 'model.onnx',
    fp16: 'model_fp16.onnx',
    q8: 'model_quantized.onnx',
    int8: 'model_int8.onnx',
    uint8: 'model_uint8.onnx',
    q4: 'model_q4.onnx',
    q4f16: 'model_q4f16.onnx',
  }
  const available: Record<string, string[]> = {
    'Xenova/bge-small-zh-v1.5': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
    'onnx-community/embeddinggemma-300m-ONNX': ['model.onnx', 'model_fp16.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx'],
    'Xenova/all-MiniLM-L6-v2': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
    'Xenova/paraphrase-multilingual-MiniLM-L12-v2': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
    'onnx-community/Qwen3-Embedding-0.6B-ONNX': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
  }

  it('includes the user-requested models with distinct ids and valid specs', () => {
    const ids = LOCAL_EMBEDDING_MODELS.map(model => model.id)
    expect(ids).toEqual(expect.arrayContaining([
      'bge-small-zh-v1.5',
      'all-minilm-l6-v2',
      'qwen3-embedding-0.6b-q8',
      'paraphrase-multilingual-minilm-l12-v2',
    ]))
    // EmbeddingGemma 以 F32 与 Q8 两个量化档位收录（Q5_K 是 GGUF 量化名，ONNX 等价档位为 int8/q4）。
    expect(ids.filter(id => id.startsWith('embeddinggemma')).length).toBeGreaterThanOrEqual(2)
    for (const model of LOCAL_EMBEDDING_MODELS) {
      expect(model.repo).toMatch(/^[^/]+\/[^/]+$/)
      expect(model.dimension).toBeGreaterThan(0)
      expect(model.maxSequenceTokens).toBeGreaterThan(0)
      expect(['cls', 'mean']).toContain(model.pooling)
    }
  })

  it('maps every catalog dtype to a file the model repo actually publishes', () => {
    for (const model of LOCAL_EMBEDDING_MODELS) {
      const file = dtypeToFile[model.dtype]
      expect(file, `${model.id} 的 dtype ${model.dtype} 未映射到文件名`).toBeTruthy()
      expect(available[model.repo], `${model.id} 的仓库未登记`).toContain(file)
    }
  })

  it('LOCAL_EMBEDDING_DTYPE_FILES 与各仓库实际发布的文件清单逐条一致', () => {
    for (const [dtype, file] of Object.entries(dtypeToFile)) {
      expect(
        LOCAL_EMBEDDING_DTYPE_FILES[dtype as keyof typeof LOCAL_EMBEDDING_DTYPE_FILES],
        `dtype=${dtype} 在 LOCAL_EMBEDDING_DTYPE_FILES 里的登记与仓库实际文件不一致`,
      ).toBe(file)
    }
  })

  it('登记表的 dtype 键集合与外部事实表完全对齐，没有漏登记或多登记', () => {
    const registered = Object.keys(LOCAL_EMBEDDING_DTYPE_FILES).sort()

    expect(registered).toEqual(Object.keys(dtypeToFile).sort())
    for (const model of LOCAL_EMBEDDING_MODELS) {
      expect(registered, `${model.id} 的 dtype=${model.dtype} 未登记`).toContain(model.dtype)
    }
  })

  it('每个档位的权重文件名都能由 localEmbeddingWeightFile 解析出来', () => {
    for (const model of LOCAL_EMBEDDING_MODELS) {
      expect(localEmbeddingWeightFile(model.dtype)).toBe(dtypeToFile[model.dtype])
    }
    expect(localEmbeddingWeightFile('q8')).toBe('model_quantized.onnx')
    expect(localEmbeddingWeightFile('q4f16')).toBe('model_q4f16.onnx')
    expect(localEmbeddingWeightFile('fp32')).toBe('model.onnx')
  })

  it('resolves specs by id and builds stable fingerprints', () => {
    expect(getLocalEmbeddingModelSpec('bge-small-zh-v1.5')?.dimension).toBe(512)
    expect(localEmbeddingFingerprint('bge-small-zh-v1.5')).toBe('local|builtin|bge-small-zh-v1.5')
    expect(formatApproxBytes(33_000_000)).toBe('33 MB')
    expect(formatApproxBytes(1_200_000_000)).toBe('1.2 GB')
  })
})

describe('device candidates (GPU → 核显 → CPU)', () => {
  it('tries DirectML on Windows, CoreML on macOS, CUDA on Linux, then CPU', () => {
    expect(resolveDeviceCandidates('auto', 'win32')).toEqual(['dml', 'cpu'])
    expect(resolveDeviceCandidates('auto', 'darwin')).toEqual(['coreml', 'cpu'])
    expect(resolveDeviceCandidates('auto', 'linux')).toEqual(['cuda', 'cpu'])
  })
  it('honors an explicit CPU preference', () => {
    expect(resolveDeviceCandidates('cpu', 'win32')).toEqual(['cpu'])
  })
})

describe('embedding source resolution', () => {
  const models: ModelProfile[] = [
    { id: 'main-chat', name: '主力对话', provider: 'deepseek', protocol: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: 'key', modelName: 'deepseek-flash', temperature: 0.7, maxTokens: 1000, purposes: ['generation'] },
    { id: 'api-embed', name: 'API 向量', provider: 'siliconflow' as ModelProfile['provider'], protocol: 'openai', baseUrl: 'https://api.siliconflow.cn', apiKey: 'key', modelName: 'bge-m3', temperature: 0.7, maxTokens: 1000, purposes: ['embedding'] },
  ]
  const global = (overrides: Partial<GlobalConfig>): GlobalConfig => ({
    theme: 'dark', defaultModelId: 'main-chat', ...overrides,
  }) as GlobalConfig

  it('never falls back to the main chat model when no embedding source is available', () => {
    // 回归：此前 getEmbeddingConfig 在缺省向量模型时回退 defaultModelId，
    // 导致每个分块批次都对主力对话模型反复调用 /embeddings。
    expect(resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: null }),
      models,
      () => false,
    )).toBeNull()
    expect(resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: 'main-chat' }),
      models,
      () => false,
    )).toBeNull()
  })

  it('prefers the downloaded local model in auto mode even when API is configured', () => {
    const call = resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: 'api-embed', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => true,
    )
    expect(call).toMatchObject({ protocol: 'local', model: { modelName: 'bge-small-zh-v1.5' } })
  })

  it('falls back to the API model in auto mode when local is not downloaded', () => {
    const call = resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: 'api-embed' }),
      models,
      () => false,
    )
    expect(call).toMatchObject({ protocol: 'openai', model: { modelName: 'bge-m3' } })
  })

  it('honors explicit local-only and api-only sources', () => {
    expect(resolveEmbeddingCall(
      global({ embeddingSource: 'local', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => true,
    )).toMatchObject({ protocol: 'local', model: { modelName: 'bge-small-zh-v1.5' } })
    // local-only 但模型未下载 → null（FTS + 提示下载）。
    expect(resolveEmbeddingCall(
      global({ embeddingSource: 'local', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => false,
    )).toBeNull()
    expect(resolveEmbeddingCall(
      global({ embeddingSource: 'api', defaultEmbeddingModelId: 'api-embed', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => true,
    )).toMatchObject({ protocol: 'openai', model: { modelName: 'bge-m3' } })
  })
})

/**
 * 端到端回归：UI 已选中的内置模型被判为「未配置」。
 *
 * 根因是下载侧（transformers.js HF Hub 布局）与判定侧（扁平 modelId）
 * 约定不一致。本组用例走真实的 kb-controller 调用链
 * （kb:import-text → getEmbeddingConfig → resolveEmbeddingCall → localEmbeddingReady），
 * 只把 electron.app.getPath('userData') 注入到临时目录，其余文件系统操作都是真实的。
 */
describe('生产判定（localEmbeddingReady）识别真实 transformers.js Hub 布局', () => {
  let userData: string
  let externalCache: string | undefined

  const cacheLayout = (...segments: string[]): string =>
    path.join(userData, 'models', 'embedding', ...segments)

  function writeInto(base: string, ...segments: string[]): string {
    const target = path.join(base, ...segments)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'w'.repeat(64))
    return target
  }

  function invokeImportText(): Promise<unknown> {
    const handler = mocks.handlers.get('kb:import-text')
    if (!handler) throw new Error('kb:import-text 未注册')
    // 第三个参数是 expectedProjectPath（不是 session context），与 renderer 调用一致。
    return handler({}, '正文内容', 'chapter.txt', mocks.currentProjectPath)
  }

  function configureLocalEmbedding(): void {
    mocks.readJsonFile.mockImplementation((filePath: string, fallback: unknown) => {
      if (filePath === 'global.json') {
        return {
          theme: 'dark',
          defaultModelId: 'main-chat',
          // 用户报告的真实配置：auto + 已选中本地模型 + 无 API 备用模型。
          embeddingSource: 'auto',
          localEmbeddingModelId: 'bge-small-zh-v1.5',
          defaultEmbeddingModelId: null,
        }
      }
      if (filePath === 'models.json') return []
      return fallback
    })
  }

  function makeExternalCache(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-embedding-cache-'))
    externalCache = dir
    vi.stubEnv('AI_NOVEL_LOCAL_EMBEDDING_CACHE', dir)
    return dir
  }

  beforeAll(() => {
    registerKBController()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-embedding-userdata-'))
    mocks.userDataPath = userData
    mocks.currentProjectPath = 'C:/projects/embedding'
    configureLocalEmbedding()
    mocks.assertCurrentProjectContext.mockReturnValue({ rootPath: mocks.currentProjectPath })
    mocks.assertKnowledgeBaseStoragePathSupported.mockImplementation(() => undefined)
    mocks.projectStoragePreflightFailure.mockImplementation(() => undefined)
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
    if (externalCache) fs.rmSync(externalCache, { recursive: true, force: true })
    externalCache = undefined
    vi.unstubAllEnvs()
  })

  it('Hub 布局下把请求交给本地向量模型，而不是报 EMBEDDING_MODEL_NOT_CONFIGURED', async () => {
    writeInto(cacheLayout(), 'Xenova', 'bge-small-zh-v1.5', 'onnx', 'model_quantized.onnx')
    const importText = vi.fn().mockResolvedValue({ success: true, docId: 'hub-doc' })
    mocks.run.mockImplementation(async (operation: (kb: { importText: typeof importText }) => unknown) => operation({ importText }))

    await expect(invokeImportText()).resolves.toEqual({ success: true, docId: 'hub-doc' })
    expect(importText).toHaveBeenCalledWith(
      '正文内容',
      'chapter.txt',
      'C:/projects/embedding',
      'local',
      { baseUrl: '', apiKey: '', modelName: 'bge-small-zh-v1.5' },
    )
  })

  it('扁平布局继续可用（向后兼容），且文件名必须匹配该档位的 dtype', async () => {
    // bge-small-zh-v1.5 的 dtype 是 q8，对应权重 model_quantized.onnx。
    // 扁平目录从来不是本应用的下载落点（下载恒为 Hub 布局），这里覆盖的是
    // 历史遗留或手工放置的目录，因此文件名同样必须匹配档位。
    writeInto(cacheLayout(), 'bge-small-zh-v1.5', 'model_quantized.onnx')
    const importText = vi.fn().mockResolvedValue({ success: true, docId: 'flat-doc' })
    mocks.run.mockImplementation(async (operation: (kb: { importText: typeof importText }) => unknown) => operation({ importText }))

    await expect(invokeImportText()).resolves.toEqual({ success: true, docId: 'flat-doc' })
  })

  it('扁平布局里只有别的档位文件名时仍报未配置（dtype 精确在扁平布局同样成立）', async () => {
    // 只放 fp32 的 model.onnx，而选中档位是 q8 → 不得判为已下载。
    writeInto(cacheLayout(), 'bge-small-zh-v1.5', 'model.onnx')

    await expect(invokeImportText()).resolves.toMatchObject({
      success: false,
      errorCode: 'EMBEDDING_MODEL_NOT_CONFIGURED',
    })
  })

  it('目录存在但只有 config/tokenizer（下载未完成）时仍报未配置', async () => {
    writeInto(cacheLayout(), 'Xenova', 'bge-small-zh-v1.5', 'config.json')
    writeInto(cacheLayout(), 'Xenova', 'bge-small-zh-v1.5', 'tokenizer.json')

    await expect(invokeImportText()).resolves.toMatchObject({
      success: false,
      errorCode: 'EMBEDDING_MODEL_NOT_CONFIGURED',
    })
  })

  it('防串味：只有别的模型的 Hub 权重时，目标模型仍报未配置', async () => {
    writeInto(cacheLayout(), 'Xenova', 'all-MiniLM-L6-v2', 'onnx', 'model.onnx')
    writeInto(cacheLayout(), 'onnx-community', 'Qwen3-Embedding-0.6B-ONNX', 'onnx', 'model_quantized.onnx')

    await expect(invokeImportText()).resolves.toMatchObject({
      success: false,
      errorCode: 'EMBEDDING_MODEL_NOT_CONFIGURED',
    })
  })

  it('env 覆盖 AI_NOVEL_LOCAL_EMBEDDING_CACHE 时按覆盖目录判定，userData 下无需重复下载', async () => {
    const overrideCache = makeExternalCache()
    writeInto(overrideCache, 'Xenova', 'bge-small-zh-v1.5', 'onnx', 'model_quantized.onnx')
    const importText = vi.fn().mockResolvedValue({ success: true, docId: 'override-doc' })
    mocks.run.mockImplementation(async (operation: (kb: { importText: typeof importText }) => unknown) => operation({ importText }))

    await expect(invokeImportText()).resolves.toEqual({ success: true, docId: 'override-doc' })
  })

  it('env 覆盖生效时 userData 下的权重不再被采信（覆盖而非叠加）', async () => {
    writeInto(cacheLayout(), 'Xenova', 'bge-small-zh-v1.5', 'onnx', 'model_quantized.onnx')
    makeExternalCache()

    await expect(invokeImportText()).resolves.toMatchObject({
      success: false,
      errorCode: 'EMBEDDING_MODEL_NOT_CONFIGURED',
    })
  })
})

/**
 * 同一根因的第 3 处落点：删除模型时只删扁平目录，Hub 布局的真实权重
 * 会留在磁盘上（用户点了删除，占用却不释放）。
 */
describe('删除本地模型清理全部落点', () => {
  let userData: string

  beforeAll(() => {
    new LocalEmbeddingController().register()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-embedding-delete-'))
    mocks.userDataPath = userData
    mocks.readJsonFile.mockImplementation((filePath: string, fallback: unknown) => (
      filePath === 'global.json'
        ? {
            theme: 'dark',
            localEmbeddingModelId: 'bge-small-zh-v1.5',
            localEmbeddingDownloadedModels: ['bge-small-zh-v1.5'],
          }
        : fallback
    ))
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('Hub 布局与历史扁平目录同时被清除，磁盘上不残留权重', async () => {
    const cache = path.join(userData, 'models', 'embedding')
    const hubDir = path.join(cache, 'Xenova', 'bge-small-zh-v1.5')
    const flatDir = path.join(cache, 'bge-small-zh-v1.5')
    fs.mkdirSync(path.join(hubDir, 'onnx'), { recursive: true })
    fs.writeFileSync(path.join(hubDir, 'onnx', 'model_quantized.onnx'), 'w'.repeat(64))
    fs.mkdirSync(flatDir, { recursive: true })
    fs.writeFileSync(path.join(flatDir, 'model.onnx'), 'w'.repeat(64))

    const handler = mocks.handlers.get('llm:local-embedding-delete')
    if (!handler) throw new Error('llm:local-embedding-delete 未注册')
    await expect(handler({}, 'bge-small-zh-v1.5')).resolves.toEqual({ success: true })

    expect(fs.existsSync(hubDir)).toBe(false)
    expect(fs.existsSync(flatDir)).toBe(false)
  })

  it('删除不在 catalog 中的模型 id 时返回失败且不抛异常', async () => {
    const handler = mocks.handlers.get('llm:local-embedding-delete')
    if (!handler) throw new Error('llm:local-embedding-delete 未注册')

    await expect(handler({}, 'not-a-catalog-model')).resolves.toEqual({
      success: false,
      error: '未知本地向量模型',
    })
  })
})
