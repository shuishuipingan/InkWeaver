import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type BetterSqlite3 from 'better-sqlite3'

import { setActiveProjectSessionContext } from '../../shared/project-session-context'
import { exportNovel } from '../export-service'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { ProjectSnapshotService } from '../../../electron/services/project-snapshot-service'
import { getCurrentProjectPath, getProjectDb } from '../../../electron/database'
import { ipc } from '../ipc-client'
import { useProjectStore } from '../../stores/project-store'

vi.mock('../../../electron/database', () => ({
  getCurrentProjectPath: vi.fn(),
  getProjectDb: vi.fn(),
}))

vi.mock('../ipc-client', () => ({
  ipc: {
    invoke: vi.fn(),
    invokeWithProjectSession: vi.fn(),
  },
}))

vi.mock('../../stores/project-store', () => ({
  useProjectStore: { getState: vi.fn() },
}))

vi.mock('../../stores/workflow-store', () => ({
  useWorkflowStore: { getState: vi.fn(() => ({ addLog: vi.fn() })) },
}))

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

const session: ProjectSessionContext = {
  projectId: 'journey-j08',
  leaseId: 'journey-j08-lease',
  projectPath: '',
}

let root: string
let restoreTarget: string
let db: BetterSqlite3.Database

beforeEach(async () => {
  root = await mkdtemp(path.join(process.cwd(), '.journey-j08-'))
  restoreTarget = path.join(root, '..', `${path.basename(root)}-restored`)
  await mkdir(path.join(root, '.vela', 'prompts'), { recursive: true })
  await mkdir(path.join(root, 'manuscript'), { recursive: true })
  await require('node:fs').promises.writeFile(path.join(root, '.vela', 'prompts', 'style.md'), '保持克制。', 'utf8')
  db = new Database(':memory:')
  db.exec('CREATE TABLE state (value TEXT); INSERT INTO state VALUES (\'j08-consistent\')')
  session.projectPath = root
  setActiveProjectSessionContext(session)
  vi.mocked(getCurrentProjectPath).mockReturnValue(root)
  vi.mocked(getProjectDb).mockReturnValue(db)
  vi.mocked(useProjectStore.getState).mockReturnValue({
    currentProject: {
      id: session.projectId,
      sessionLease: session.leaseId,
      path: root,
      name: 'J08 无蓝图作品',
      novelConfig: { genre: '推理', targetAudience: 'general' },
    },
  })

  vi.mocked(ipc.invoke).mockImplementation(async (channel: string, grantId?: string, relativePath?: string, content?: unknown) => {
    if (channel === 'fs:grant-write-file' && typeof relativePath === 'string') {
      const target = path.join(root, relativePath)
      await mkdir(path.dirname(target), { recursive: true })
      await require('node:fs').promises.writeFile(target, String(content ?? ''), 'utf8')
      return { success: true } as never
    }
    if (channel === 'fs:grant-read-file' && typeof relativePath === 'string') {
      return { success: true, content: await readFile(path.join(root, relativePath), 'utf8') } as never
    }
    return { success: true } as never
  })
  vi.mocked(ipc.invokeWithProjectSession).mockImplementation(async (_session, channel: string, ...args: unknown[]) => {
    if (channel === 'db:draft-authority-sequence') return {
      status: 'continuous', lastChapterNumber: 2, nextChapterNumber: 3,
      duplicateChapterNumbers: [], authorityFingerprint: 'j08-authority'.padEnd(64, '0'),
    } as never
    if (channel === 'db:draft-list-all') return [
      { id: 1, chapterNumber: 1, chapterTitle: '无蓝图开篇', version: 1, status: 'finalized', wordCount: 5 },
      { id: 2, chapterNumber: 2, chapterTitle: '无蓝图转折', version: 1, status: 'finalized', wordCount: 5 },
    ] as never
    if (channel === 'db:draft-get-full') return { content: `定稿正文${String(args[0])}` } as never
    if (channel === 'db:project-core-get') return { synopsis: '无蓝图导出旅程' } as never
    throw new Error(`Unexpected project-session channel: ${channel}`)
  })
})

afterEach(async () => {
  setActiveProjectSessionContext(null)
  db.close()
  await rm(root, { recursive: true, force: true })
  await rm(restoreTarget, { recursive: true, force: true })
})

describe('J08 no-blueprint export → snapshot → isolated restore journey', () => {
  it('exports finalized authority, snapshots the export, verifies it, and restores it into an isolated directory', async () => {
    const exported = await exportNovel(
      { format: 'merged-md', grantId: 'j08-export-grant' },
      {
        id: session.projectId,
        sessionLease: session.leaseId,
        path: root,
        name: 'J08 无蓝图作品',
        novelConfig: { genre: '推理', targetAudience: 'general' },
      } as never,
      session,
    )
    expect(exported).toEqual({ success: true, path: 'J08 无蓝图作品.md' })

    const exportedManifest = JSON.parse(await readFile(path.join(root, 'J08 无蓝图作品.manifest.json'), 'utf8')) as {
      chapters: Array<{ chapterNumber: number; contentHash: string }>
    }
    expect(exportedManifest.chapters).toHaveLength(2)
    expect(exportedManifest.chapters.map(chapter => chapter.chapterNumber)).toEqual([1, 2])
    expect(exportedManifest.chapters.every(chapter => /^[a-f0-9]{64}$/u.test(chapter.contentHash))).toBe(true)
    // Export output is an external deliverable; the snapshot must preserve the
    // finalized manuscript source and its attachments, not silently absorb an
    // arbitrary export directory. Seed the two finalized manuscript files that
    // correspond to the exported authority before taking the snapshot.
    await require('node:fs').promises.writeFile(path.join(root, 'manuscript', 'chapter_1.md'), '定稿正文1', 'utf8')
    await require('node:fs').promises.writeFile(path.join(root, 'manuscript', 'chapter_2.md'), '定稿正文2', 'utf8')

    const snapshot = await ProjectSnapshotService.create(root)
    await expect(ProjectSnapshotService.verify(snapshot.snapshotId, root)).resolves.toMatchObject({
      valid: true,
      missing: [],
      mismatched: [],
    })
    const preview = await ProjectSnapshotService.previewRestore(snapshot.snapshotId, restoreTarget, root)
    expect(preview).toMatchObject({ canRestore: true, destinationEmpty: true, valid: true })

    const restored = await ProjectSnapshotService.restore(snapshot.snapshotId, restoreTarget, root)
    expect(restored.files).toBe(snapshot.files.length)
    expect(await readFile(path.join(restoreTarget, 'manuscript', 'chapter_1.md'), 'utf8')).toBe('定稿正文1')
    expect(await readFile(path.join(restoreTarget, 'manuscript', 'chapter_2.md'), 'utf8')).toBe('定稿正文2')
    const restoredDb = new Database(path.join(restoreTarget, 'database.sqlite'), { readonly: true })
    expect(restoredDb.prepare('SELECT value FROM state').get()).toEqual({ value: 'j08-consistent' })
    restoredDb.close()
  })
})
