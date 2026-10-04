import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Field, Int32, Schema as ArrowSchema, Utf8 } from 'apache-arrow'
import { afterEach, describe, expect, it } from 'vitest'

import {
  addChunks,
  closeConnection,
  getCanonicalChunksForEmbeddingRebuild,
  getConnection,
  getEmbeddingSpaces,
  getStats,
  planEmbeddingRebuild,
  rebuildPlannedEmbeddingSpace,
  searchWithScope,
} from '../vector-store'
import { removeDirectoryWithWindowsRetry } from '../utils/remove-directory'

/**
 * 冷启动救援路径：完全无 vector 列、也无 embedding registry 的知识库。
 *
 * 用户实测状态（1.3.16 上导入的 177 篇参照文档）：chunks 表的 Parquet 列只有
 * fileName/text/chunkIndex，没有 vector 列，也没有 embedding-spaces.json。
 * 1.3.17 修好了「守卫放行」，但「这种表能否被 rebuild 流程救回」此前只有代码分析。
 *
 * 本文件真跑 LanceDB（不 mock 连接），向量用确定性假数据 —— 这一单验证的是
 * LanceDB 侧的落库与代际切换，推理引擎侧已由 knowledge-base-local-protocol 的替身覆盖。
 */
const DIMENSION = 512
const IDENTITY = Object.freeze({ modelFingerprint: 'local|builtin|bge-small-zh-v1.5', distanceMetric: 'l2' })

function probeVector(): number[] {
  return new Array<number>(DIMENSION).fill(0.01)
}

/** 第 index 条块使用一个可区分的确定性向量：仅第 index===0?0:1 维为 1。 */
function chunkVector(index: number): number[] {
  const axis = index === 0 ? 0 : 1
  return Array.from({ length: DIMENSION }, (_, dimension) => (dimension === axis ? 1 : 0))
}

describe('无 vector 列的冷启动知识库可被 rebuild 救回', () => {
  const projects: string[] = []
  const chunks = ['第一段落：设定', '第二段落：冲突', '第三段落：转折']

  function makeProject(): string {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-cold-start-'))
    projects.push(projectPath)
    return projectPath
  }

  afterEach(async () => {
    for (const projectPath of projects.splice(0)) {
      closeConnection(projectPath)
      await removeDirectoryWithWindowsRetry(projectPath)
    }
  })

  /** 复现用户状态：vectors=undefined ⇒ addChunks 不建 vector 列。 */
  async function seedLegacyTable(projectPath: string): Promise<string[]> {
    const added = await addChunks(
      projectPath,
      'legacy-document',
      'reference.txt',
      chunks,
      undefined,
      undefined,
      // 刻意不传 metadata：完全复现用户环境的列集合（fileName/text/chunkIndex，
      // 既无 vector 列、也无 corpusKind 列）——传了 metadata 会额外建出 corpusKind 列，
      // 让夹具偏离被测的真实冷启动状态。
      undefined,
    )
    expect(added).toEqual({ success: true, chunkCount: chunks.length })

    const db = await getConnection(projectPath)
    const legacyTable = await db.openTable('chunks')
    const legacyFields = (await legacyTable.schema()).fields.map(field => field.name)
    expect(legacyFields).toContain('text')
    expect(legacyFields).not.toContain('vector')
    return legacyFields
  }

  /** 走完 canonical → plan → rebuild，返回重建后的 active 代际。 */
  async function rebuildColdStart(projectPath: string) {
    const canonical = await getCanonicalChunksForEmbeddingRebuild(projectPath)
    const planned = await planEmbeddingRebuild(projectPath, IDENTITY, probeVector())
    expect(planned.success).toBe(true)
    if (!planned.success) throw new Error(planned.error)
    const rebuilt = await rebuildPlannedEmbeddingSpace(
      projectPath,
      planned.plan,
      planned.plan.chunks.map((chunk, index) => ({ id: chunk.id, vector: chunkVector(index) })),
    )
    expect(rebuilt.success).toBe(true)
    const registry = await getEmbeddingSpaces(projectPath)
    const active = registry.spaces.find(space => space.generation === registry.activeGeneration)
    return { canonical, planned, rebuilt, registry, active }
  }

  it('无 vector 列 + 无可用代际的冷启动表可被 rebuild 救回为 512 维索引', async () => {
    const projectPath = makeProject()
    await seedLegacyTable(projectPath)

    // 冷启动事实：没有可用向量代际（无论 registry 是否被惰性推断）。
    await expect(getEmbeddingSpaces(projectPath)).resolves.toMatchObject({ activeGeneration: null })
    await expect(getStats(projectPath)).resolves.toMatchObject({ hasVectors: false, vectorDimension: 0 })

    // canonical 是逃出旧表的唯一通道，必须完整返回全部文本块。
    const canonical = await getCanonicalChunksForEmbeddingRebuild(projectPath)
    expect(canonical).toHaveLength(chunks.length)
    expect([...canonical.map(chunk => chunk.text)].sort()).toEqual([...chunks].sort())
    for (const chunk of canonical) expect(typeof chunk.id).toBe('string')

    // plan：512 维探测向量必须判为 rebuild，而不是 up-to-date 或失败。
    const planned = await planEmbeddingRebuild(projectPath, IDENTITY, probeVector())
    expect(planned.success).toBe(true)
    if (!planned.success) throw new Error(planned.error)
    expect(planned.plan.mode).toBe('rebuild')
    expect(planned.plan.vectorDimension).toBe(DIMENSION)
    expect(planned.plan.chunks).toHaveLength(chunks.length)

    // rebuild：写入 512 维向量并切换代际。
    const updates = planned.plan.chunks.map((chunk, index) => ({ id: chunk.id, vector: chunkVector(index) }))
    const rebuilt = await rebuildPlannedEmbeddingSpace(projectPath, planned.plan, updates)
    expect(rebuilt).toMatchObject({ success: true, count: chunks.length })

    // 新表有向量列且固定 512 维。
    const registry = await getEmbeddingSpaces(projectPath)
    expect(registry.activeGeneration).not.toBeNull()
    const active = registry.spaces.find(space => space.generation === registry.activeGeneration)
    expect(active).toMatchObject({
      vectorDimension: DIMENSION,
      status: 'active',
      modelFingerprint: IDENTITY.modelFingerprint,
    })

    const db = await getConnection(projectPath)
    const rebuiltTable = await db.openTable(active!.tableName)
    const rebuiltSchema = await rebuiltTable.schema()
    const vectorField = rebuiltSchema.fields.find(field => field.name === 'vector')
    expect(vectorField).toBeDefined()
    expect((vectorField!.type as unknown as { listSize: number }).listSize).toBe(DIMENSION)
    // 对照：本用例的源数据经 addChunks 写入，带 corpusKind 列 —— 重建表应继承它。
    // （与第三条手工建表的场景互为对照，共同刻画「重建表列集合从源数据继承」这一行为。）
    expect(rebuiltSchema.fields.map(field => field.name)).toContain('corpusKind')

    await expect(getStats(projectPath)).resolves.toMatchObject({ hasVectors: true, vectorDimension: DIMENSION })
  })

  it('重建后的库走向量检索，而不是纯 FTS 降级', async () => {
    const projectPath = makeProject()
    await seedLegacyTable(projectPath)
    await rebuildColdStart(projectPath)

    // 查询文本刻意与所有块都不匹配：若降级为 FTS 将拿不到这条结果。
    const results = await searchWithScope(
      projectPath,
      'zzz-不存在的查询词-zzz',
      chunkVector(0),
      3,
      undefined,
      IDENTITY,
    )

    expect(results.length).toBeGreaterThan(0)
    // 向量检索把与查询向量同向的第 0 条排在最前。
    expect(results[0].text).toBe(chunks[0])
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('手工建出用户确切列集合的表（无 vector、无 corpusKind）后，rebuild 仍能救回', async () => {
    // 前两条用例经 addChunks 造表，而当前 addChunks 总会建出 corpusKind 列。
    // 用户环境的表来自更早的 schema（Lead 实测 Parquet 列只有 fileName/text/chunkIndex），
    // 所以这条按用户的确切列集合手工建表，证明救援路径不依赖 corpusKind 等后加列。
    const projectPath = makeProject()
    const db = await getConnection(projectPath)
    const legacySchema = new ArrowSchema([
      new Field('id', new Utf8()),
      new Field('docId', new Utf8()),
      new Field('fileName', new Utf8()),
      new Field('text', new Utf8()),
      new Field('chunkIndex', new Int32()),
      new Field('totalChunks', new Int32()),
      new Field('importedAt', new Utf8()),
    ])
    await db.createTable('chunks', chunks.map((text, chunkIndex) => ({
      id: `legacy-chunk-${chunkIndex}`,
      docId: 'legacy-document',
      fileName: 'reference.txt',
      text,
      chunkIndex,
      totalChunks: chunks.length,
      importedAt: '2026-09-01T00:00:00.000Z',
    })), { schema: legacySchema })

    const legacyFields = (await (await db.openTable('chunks')).schema()).fields.map(field => field.name)
    expect(legacyFields).not.toContain('vector')
    expect(legacyFields).not.toContain('corpusKind')

    const { rebuilt, active } = await rebuildColdStart(projectPath)

    expect(rebuilt).toMatchObject({ success: true, count: chunks.length })
    expect(active).toMatchObject({ vectorDimension: DIMENSION, status: 'active' })

    const rebuiltFields = (await (await db.openTable(active!.tableName)).schema()).fields.map(field => field.name)
    expect(rebuiltFields).toContain('vector')
    // 实测行为：重建表的列 = 源数据的列 ∪ { vector }。`embeddingChunkSchema`（vector-store.ts:170-184）
    // 声明了 chapterNumber/chapterTitle/corpusKind，但当源数据没有这些列时它们不会出现在新表里。
    // 这不会让状态变差（源表本来也没有），但意味着重建表的 corpusKind 过滤能力取决于源数据。
    expect([...rebuiltFields].sort()).toEqual([...legacyFields, 'vector'].sort())
  })
})
