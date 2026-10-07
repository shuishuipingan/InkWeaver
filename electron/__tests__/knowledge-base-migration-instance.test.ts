/**
 * task-80 第 1 条：知识库迁移检查的缓存键必须是**项目实例**而不是路径。
 *
 * 复现原始缺陷：打开项目 A（触发 ensureMigration）→ 删除 A → 在原路径重建 A' →
 * 旧实现按路径缓存，会静默跳过 A' 的迁移检查。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  migrateFromJSON: vi.fn(async (_projectPath?: unknown) => ({ success: true, migrated: 1 })),
  storeListDocuments: vi.fn(async (_projectPath?: unknown) => [] as unknown[]),
  captureCurrentSession: vi.fn(),
  sameCanonicalProjectRoot: vi.fn((_left?: unknown, _right?: unknown) => true),
}))

vi.mock('../services/project-access', () => ({
  projectAccess: {
    captureCurrentSession: () => mocks.captureCurrentSession(),
    sameCanonicalProjectRoot: (left: unknown, right: unknown) => mocks.sameCanonicalProjectRoot(left, right),
  },
}))

vi.mock('../database', () => ({
  getCurrentProjectPath: vi.fn(() => null),
  getProjectDb: vi.fn(() => null),
}))

vi.mock('../embedding', () => ({
  chunkText: vi.fn(() => []),
  generateEmbeddings: vi.fn(async () => []),
}))

vi.mock('../vector-store', () => ({
  addChunks: vi.fn(),
  removeDocument: vi.fn(),
  clearAll: vi.fn(),
  searchWithScope: vi.fn(),
  listDocuments: (projectPath: unknown) => mocks.storeListDocuments(projectPath),
  getStats: vi.fn(),
  migrateFromJSON: (projectPath: unknown) => mocks.migrateFromJSON(projectPath),
  getChunksWithoutVectors: vi.fn(async () => []),
  getCanonicalChunksForEmbeddingRebuild: vi.fn(async () => []),
  getDocumentIntegrity: vi.fn(async () => undefined),
  hashCanonicalChunkSet: vi.fn(() => 'hash'),
  planEmbeddingRebuild: vi.fn(),
  activatePlannedEmbeddingSpace: vi.fn(),
  rebuildPlannedEmbeddingSpace: vi.fn(),
}))

import { listDocuments, resolveKnowledgeBaseMigrationKey } from '../knowledge-base'

let projectPath = ''

beforeEach(() => {
  mocks.migrateFromJSON.mockClear()
  mocks.storeListDocuments.mockClear()
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-kb-instance-'))
  fs.mkdirSync(path.join(projectPath, '.vela'), { recursive: true })
  // 只有存在旧 vectors.json 时 ensureMigration 才会真的调用迁移
  fs.writeFileSync(path.join(projectPath, '.vela', 'vectors.json'), JSON.stringify({ documents: [] }))
})

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true })
})

describe('知识库迁移检查按项目实例而非路径', () => {
  it('同一实例只迁移一次；原路径重建的新实例会重新检查', async () => {
    mocks.captureCurrentSession.mockReturnValue({ projectId: 'instance-a', leaseId: 'lease-1', rootPath: projectPath })

    await listDocuments(projectPath)
    expect(mocks.migrateFromJSON).toHaveBeenCalledTimes(1)

    await listDocuments(projectPath)
    expect(mocks.migrateFromJSON).toHaveBeenCalledTimes(1)

    // 删除项目 + 原路径重建：路径字符串不变，实例 id 变成新的
    mocks.captureCurrentSession.mockReturnValue({ projectId: 'instance-b', leaseId: 'lease-2', rootPath: projectPath })
    await listDocuments(projectPath)
    expect(mocks.migrateFromJSON).toHaveBeenCalledTimes(2)
  })

  it('缓存键：有活动会话时按实例，取不到实例时退回路径', () => {
    mocks.captureCurrentSession.mockReturnValue(null)
    expect(resolveKnowledgeBaseMigrationKey(projectPath)).toBe(`path:${path.resolve(projectPath)}`)

    mocks.captureCurrentSession.mockReturnValue({ projectId: 'instance-a', leaseId: 'lease-1', rootPath: projectPath })
    expect(resolveKnowledgeBaseMigrationKey(projectPath)).toBe('instance:instance-a')

    // 会话指向别的项目时也退回路径键，避免把 A 的实例键用到 B 上
    mocks.sameCanonicalProjectRoot.mockReturnValueOnce(false)
    expect(resolveKnowledgeBaseMigrationKey(projectPath)).toBe(`path:${path.resolve(projectPath)}`)
  })
})
