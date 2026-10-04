import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 本地内置向量模型（protocol === 'local'）没有 baseUrl / apiKey。
 *
 * 修复前 knowledge-base.ts 用 `model.apiKey` / `model.baseUrl` 当作「是否配置了
 * 向量模型」的判据，于是本地模型在导入 / 检索 / 回填三条链路上被静默降级成纯 FTS；
 * backfillVectors 更是在凭据检查处立即返回「未配置 Embedding 模型」（用户日志里
 * 该调用耗时 2–4ms，与"判定失败立即 return"完全吻合）。
 *
 * 本文件把「local 恒可生成、API 仍需凭据」固化为回归护栏。
 * 引擎与存储层一律用替身拦截，不产生真实网络调用、不触碰本地推理引擎与 LanceDB。
 */
type EmbeddingModel = { baseUrl: string; apiKey: string; modelName?: string }

const mocks = vi.hoisted(() => ({
  currentProjectPath: '',
  chunkText: vi.fn(),
  generateEmbeddings: vi.fn(),
  getCanonicalChunksForEmbeddingRebuild: vi.fn(),
  addChunks: vi.fn(),
  listDocuments: vi.fn(),
  removeDocument: vi.fn(),
  planEmbeddingRebuild: vi.fn(),
  activatePlannedEmbeddingSpace: vi.fn(),
  rebuildPlannedEmbeddingSpace: vi.fn(),
  migrateFromJSON: vi.fn(),
  clearAll: vi.fn(),
  searchWithScope: vi.fn(),
  getStats: vi.fn(),
  getChunksWithoutVectors: vi.fn(),
  getDocumentIntegrity: vi.fn(),
  hashCanonicalChunkSet: vi.fn(),
}))

vi.mock('../../embedding', () => ({
  chunkText: mocks.chunkText,
  generateEmbeddings: mocks.generateEmbeddings,
}))

vi.mock('../../vector-store', () => ({
  addChunks: mocks.addChunks,
  removeDocument: mocks.removeDocument,
  clearAll: mocks.clearAll,
  searchWithScope: mocks.searchWithScope,
  listDocuments: mocks.listDocuments,
  getStats: mocks.getStats,
  migrateFromJSON: mocks.migrateFromJSON,
  getChunksWithoutVectors: mocks.getChunksWithoutVectors,
  getCanonicalChunksForEmbeddingRebuild: mocks.getCanonicalChunksForEmbeddingRebuild,
  getDocumentIntegrity: mocks.getDocumentIntegrity,
  hashCanonicalChunkSet: mocks.hashCanonicalChunkSet,
  planEmbeddingRebuild: mocks.planEmbeddingRebuild,
  activatePlannedEmbeddingSpace: mocks.activatePlannedEmbeddingSpace,
  rebuildPlannedEmbeddingSpace: mocks.rebuildPlannedEmbeddingSpace,
}))

vi.mock('../../database', () => ({
  getCurrentProjectPath: () => mocks.currentProjectPath,
  getProjectDb: vi.fn(),
}))

import { backfillVectors, importText } from '../../knowledge-base'
import { readNormalizedSource } from '../../../test/source-contract'

const MISSING_EMBEDDING_ERROR = '未配置 Embedding 模型'
const localModel: EmbeddingModel = { baseUrl: '', apiKey: '', modelName: 'bge-small-zh-v1.5' }

describe('本地协议不再被凭据守卫拦截', () => {
  let projectPath: string

  beforeEach(() => {
    vi.clearAllMocks()
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-kb-local-protocol-'))
    mocks.currentProjectPath = projectPath
    mocks.migrateFromJSON.mockResolvedValue({ success: true })
    mocks.getCanonicalChunksForEmbeddingRebuild.mockResolvedValue([])
    mocks.getChunksWithoutVectors.mockResolvedValue({ count: 0 })
    mocks.listDocuments.mockResolvedValue([])
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
  })

  it('固化根因：旧守卫在本地模型（空 baseUrl / apiKey）下必然短路', () => {
    // 逐字复刻修复前 knowledge-base.ts:738 的判据。
    const legacyGuardBlocks = !localModel.apiKey.trim() || !localModel.baseUrl.trim()
    expect(legacyGuardBlocks).toBe(true)

    // 该判据对本地模型恒为 true（凭据字段本来就是空的），因此本文件里所有
    // local 断言的放行期望，只要把守卫改回这一行就必然变红——这是本护栏的判别力来源。
  })

  it('backfillVectors 在本地协议下不再返回「未配置 Embedding 模型」', async () => {
    const result = await backfillVectors(projectPath, 'local', localModel)

    expect(result.error).not.toBe(MISSING_EMBEDDING_ERROR)
    expect(result).toEqual({ success: true, processed: 0, failed: 0 })
  })

  it('backfillVectors 在本地协议下真正走到向量生成（非空语料）', async () => {
    mocks.getCanonicalChunksForEmbeddingRebuild.mockResolvedValue([{ id: 'chunk-1', text: '第一章正文' }])
    mocks.generateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]])
    mocks.planEmbeddingRebuild.mockResolvedValue({
      success: true,
      plan: { mode: 'rebuild', chunks: [{ id: 'chunk-1', text: '第一章正文' }] },
    })
    mocks.rebuildPlannedEmbeddingSpace.mockResolvedValue({ success: true, count: 1 })

    const result = await backfillVectors(projectPath, 'local', localModel)

    expect(mocks.generateEmbeddings).toHaveBeenCalledWith(
      ['第一章正文'], 'local', localModel, undefined,
    )
    expect(mocks.rebuildPlannedEmbeddingSpace).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true, processed: 1, failed: 0 })
  })

  it('判别力对照：旧守卫在同一夹具下必然产出原错误，生产实现不产出', async () => {
    // 旧守卫在本地模型上恒为 true → 必然短路。把两条路径的返回值摆在一起：
    // 只要有人把守卫改回 apiKey/baseUrl 判据，liveResult 就会与 legacyResult 相等，本断言随之变红。
    const legacyGuardBlocks = !localModel.apiKey.trim() || !localModel.baseUrl.trim()
    const legacyResult = legacyGuardBlocks
      ? { success: false, processed: 0, failed: 0, error: MISSING_EMBEDDING_ERROR }
      : { success: true, processed: 0, failed: 0 }

    expect(legacyResult).toEqual({ success: false, processed: 0, failed: 0, error: MISSING_EMBEDDING_ERROR })

    const liveResult = await backfillVectors(projectPath, 'local', localModel)

    expect(liveResult).not.toEqual(legacyResult)
    expect(liveResult).toEqual({ success: true, processed: 0, failed: 0 })
  })

  it('backfillVectors 在 openai 协议缺 apiKey 时仍返回原错误', async () => {
    const result = await backfillVectors(
      projectPath,
      'openai',
      { baseUrl: 'https://api.example/v1', apiKey: '' },
    )

    expect(result).toEqual({ success: false, processed: 0, failed: 0, error: MISSING_EMBEDDING_ERROR })
    expect(mocks.generateEmbeddings).not.toHaveBeenCalled()
  })

  it('backfillVectors 在 gemini 协议缺 baseUrl 时仍返回原错误', async () => {
    const result = await backfillVectors(
      projectPath,
      'gemini',
      { baseUrl: '', apiKey: 'secret' },
    )

    expect(result).toEqual({ success: false, processed: 0, failed: 0, error: MISSING_EMBEDDING_ERROR })
    expect(mocks.generateEmbeddings).not.toHaveBeenCalled()
  })

  it('importText 在本地协议下真正调用 generateEmbeddings，而不是静默降级 FTS', async () => {
    mocks.chunkText.mockReturnValue(['第一段', '第二段'])
    mocks.generateEmbeddings.mockResolvedValue([[0.1], [0.2]])
    mocks.addChunks.mockResolvedValue({ success: true, count: 2 })

    const result = await importText('第一段\n第二段', 'chapter.txt', projectPath, 'local', localModel)

    expect(mocks.generateEmbeddings).toHaveBeenCalledWith(
      ['第一段', '第二段'], 'local', localModel, undefined,
    )
    // 向量必须随块一起落库（第三个之后的参数是 vectors）。
    expect(mocks.addChunks).toHaveBeenCalledWith(
      projectPath,
      expect.any(String),
      'chapter.txt',
      ['第一段', '第二段'],
      [[0.1], [0.2]],
      undefined,
      undefined,
      expect.anything(),
    )
    expect(result).toEqual({ success: true, docId: expect.any(String), chunkCount: 2 })
  })

  it('importText 在 openai 协议缺 apiKey 时保持跳过向量化（FTS-only 降级不变）', async () => {
    mocks.chunkText.mockReturnValue(['第一段'])
    mocks.addChunks.mockResolvedValue({ success: true, count: 1 })

    const result = await importText(
      '第一段',
      'chapter.txt',
      projectPath,
      'openai',
      { baseUrl: 'https://api.example/v1', apiKey: '' },
    )

    expect(mocks.generateEmbeddings).not.toHaveBeenCalled()
    // 仍然落库，但向量为 undefined——纯 FTS。
    expect(mocks.addChunks).toHaveBeenCalledWith(
      projectPath,
      expect.any(String),
      'chapter.txt',
      ['第一段'],
      undefined,
      undefined,
      undefined,
      expect.anything(),
    )
    expect(result.success).toBe(true)
  })
})

/**
 * 源码契约：守卫不得回到"直接读 apiKey/baseUrl"的写法。
 *
 * 这一组是「改回 if (model.apiKey) 就会变红」的可执行形式——不必改动生产文件
 * （磐石在改 knowledge-base.ts），而是把契约本身固定下来。判别力由紧随其后的
 * 自证用例给出：把源码文本按旧守卫改写后，同一条契约断言必然失败。
 */
describe('knowledge-base 守卫源码契约', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
  const knowledgeBaseSourcePath = path.join(repoRoot, 'electron', 'knowledge-base.ts')

  function readKnowledgeBaseSource(): string {
    return readNormalizedSource(knowledgeBaseSourcePath)
  }

  function unifiedGuardCallCount(source: string): number {
    return source.match(/canGenerateEmbeddings\(protocol, model\)/g)?.length ?? 0
  }

  it('local 协议无条件放行，且旧守卫写法不得残留', () => {
    const source = readKnowledgeBaseSource()

    // 1. 本地协议必须直接放行（没有凭据可用）。
    expect(source).toContain("if (protocol === 'local') return true")
    // 2. 修复前的两种裸露判据不得回到源码里。
    expect(source).not.toContain('if (model.apiKey)')
    expect(source).not.toContain('if (!model.apiKey')
    expect(source).not.toContain('if (!model.baseUrl')
    // 3. 五条链路（importDocument / searchKnowledge / importText /
    //    importReferenceText / backfillVectors）统一经由同一判据。
    expect(unifiedGuardCallCount(source)).toBeGreaterThanOrEqual(5)
  })

  it('判别力自证：把守卫改写回旧写法后，上面的契约断言必然失败', () => {
    const source = readKnowledgeBaseSource()

    // 模拟"改回旧守卫"：local 放行分支被移除，统一判据被裸判据替换。
    const mutated = source
      .replace("if (protocol === 'local') return true", 'if (false) return true')
      .replace(/canGenerateEmbeddings\(protocol, model\)/g, 'model.apiKey')

    expect(mutated).not.toContain("if (protocol === 'local') return true")
    expect(mutated).toContain('if (model.apiKey)')
    expect(unifiedGuardCallCount(mutated)).toBe(0)

    // 因此原契约的三条断言在旧写法下全部命中失败路径。
  })
})
