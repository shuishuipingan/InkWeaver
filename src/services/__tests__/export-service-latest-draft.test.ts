import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exportNovel } from '../export-service'
import { ipc } from '../ipc-client'
import type { AuthoritativeChapterSequence } from '../../shared/author-manuscript-import'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import type { ExportDraftMeta } from '../export-service'
import { setActiveProjectSessionContext } from '../../shared/project-session-context'

vi.mock('../ipc-client', () => ({
  ipc: {
    invoke: vi.fn(),
    invokeWithProjectSession: vi.fn(),
  },
}))

const addLog = vi.fn()
vi.mock('../../stores/workflow-store', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({ addLog })),
  },
}))

const projectPath = 'C:/novels/project-a'
const projectSession: ProjectSessionContext = {
  projectId: 'project-a',
  leaseId: 'lease-a',
  projectPath,
}
const projectSnapshot = {
  id: projectSession.projectId,
  sessionLease: projectSession.leaseId,
  path: projectPath,
  name: 'Project A',
  novelConfig: { genre: 'fantasy', targetAudience: 'general' },
}

let authority: AuthoritativeChapterSequence
let drafts: ExportDraftMeta[]
let writtenFiles: Map<string, string>

function sequence(status: AuthoritativeChapterSequence['status'], lastChapterNumber: number): AuthoritativeChapterSequence {
  return {
    status,
    lastChapterNumber,
    ...(status === 'empty' ? { nextChapterNumber: 1 } : {}),
    duplicateChapterNumbers: [],
    authorityFingerprint: 'a'.repeat(64),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setActiveProjectSessionContext(projectSession)
  authority = sequence('continuous', 1)
  drafts = [{ id: 1, chapterNumber: 1, chapterTitle: '开篇', version: 1, status: 'finalized' }]
  writtenFiles = new Map()

  vi.mocked(ipc.invoke).mockImplementation((async (channel: string, _grantId?: string, relativePath?: string, content?: unknown) => {
    if (channel === 'fs:grant-write-file') {
      if (typeof relativePath === 'string') writtenFiles.set(relativePath, String(content))
      return { success: true }
    }
    if (channel === 'fs:grant-read-file') {
      return { success: true, content: typeof relativePath === 'string' ? writtenFiles.get(relativePath) ?? '' : '' }
    }
    return { success: true }
  }) as never)
  vi.mocked(ipc.invokeWithProjectSession).mockImplementation((async (_session: ProjectSessionContext, channel: string, id?: number) => {
    if (channel === 'db:draft-authority-sequence') return authority as never
    if (channel === 'db:draft-list-all') return drafts as never
    if (channel === 'db:draft-get-full') return { content: `body-${String(id)}` } as never
    throw new Error(`Unexpected channel: ${channel}`)
  }) as never)
})

afterEach(() => {
  setActiveProjectSessionContext(null)
})

describe('exportNovel latest draft selection', () => {
  it('defaults to the newest version per chapter in canonical chapter order', async () => {
    authority = sequence('continuous', 2)
    drafts = [
      { id: 22, chapterNumber: 2, chapterTitle: '转折', version: 2, status: 'draft' },
      { id: 21, chapterNumber: 2, chapterTitle: '转折', version: 1, status: 'finalized' },
      { id: 12, chapterNumber: 1, chapterTitle: '开篇', version: 2, status: 'revised' },
      { id: 11, chapterNumber: 1, chapterTitle: '开篇', version: 1, status: 'finalized' },
    ]

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })

    const selectedIds = vi.mocked(ipc.invokeWithProjectSession).mock.calls
      .filter(call => call[1] === 'db:draft-get-full')
      .map(call => call[2])
    expect(selectedIds).toEqual([12, 22])
    const exported = writtenFiles.get('Project A.md') ?? ''
    expect(exported.indexOf('body-12')).toBeLessThan(exported.indexOf('body-22'))
    expect(exported).not.toContain('body-11')
    expect(exported).not.toContain('body-21')
  })

  it('exports a continuous draft-only manuscript without finalized authority', async () => {
    authority = sequence('empty', 0)
    drafts = [
      { id: 32, chapterNumber: 2, version: 1, status: 'revised' },
      { id: 31, chapterNumber: 1, version: 1, status: 'draft' },
    ]

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })

    const selectedIds = vi.mocked(ipc.invokeWithProjectSession).mock.calls
      .filter(call => call[1] === 'db:draft-get-full')
      .map(call => call[2])
    expect(selectedIds).toEqual([31, 32])
  })

  it('does not treat archived versions as the latest exportable drafts', async () => {
    authority = sequence('empty', 0)
    drafts = [
      { id: 35, chapterNumber: 1, chapterTitle: '当前稿', version: 2, status: 'revised' },
      { id: 36, chapterNumber: 1, chapterTitle: '已封存旧稿', version: 3, status: 'archived' },
    ]

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })

    const selectedIds = vi.mocked(ipc.invokeWithProjectSession).mock.calls
      .filter(call => call[1] === 'db:draft-get-full')
      .map(call => call[2])
    expect(selectedIds).toEqual([35])
    expect(writtenFiles.get('Project A.md')).not.toContain('body-36')
  })

  it('preserves finalized-only export when explicitly selected', async () => {
    drafts = [
      { id: 42, chapterNumber: 1, chapterTitle: '新版', version: 2, status: 'draft' },
      { id: 41, chapterNumber: 1, chapterTitle: '定稿', version: 1, status: 'finalized' },
    ]

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant', includeDrafts: false },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })

    const selectedIds = vi.mocked(ipc.invokeWithProjectSession).mock.calls
      .filter(call => call[1] === 'db:draft-get-full')
      .map(call => call[2])
    expect(selectedIds).toEqual([41])
    expect(writtenFiles.get('Project A.md')).toContain('body-41')
    expect(writtenFiles.get('Project A.md')).not.toContain('body-42')
  })

  it('rejects a gap in the selected latest chapter sequence before writing files', async () => {
    authority = sequence('empty', 0)
    drafts = [
      { id: 51, chapterNumber: 1, version: 1, status: 'draft' },
      { id: 53, chapterNumber: 3, version: 1, status: 'draft' },
    ]

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toMatchObject({ success: false, error: expect.stringContaining('第 2 章') })
    expect(vi.mocked(ipc.invoke).mock.calls.some(([channel]) => channel === 'fs:grant-write-file')).toBe(false)
  })

  it('rejects duplicate versions for a chapter instead of choosing by input order', async () => {
    authority = sequence('empty', 0)
    drafts = [
      { id: 61, chapterNumber: 1, version: 1, status: 'draft' },
      { id: 62, chapterNumber: 1, version: 1, status: 'revised' },
    ]

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toMatchObject({ success: false, error: expect.stringContaining('重复版本') })
    expect(vi.mocked(ipc.invoke).mock.calls.some(([channel]) => channel === 'fs:grant-write-file')).toBe(false)
  })

  it('rejects invalid finalized authority even when newer draft candidates exist', async () => {
    authority = {
      ...sequence('invalid', 2),
      firstGapChapterNumber: 2,
      duplicateChapterNumbers: [1],
    }
    drafts = [
      { id: 71, chapterNumber: 1, version: 1, status: 'finalized' },
      { id: 72, chapterNumber: 1, version: 2, status: 'draft' },
    ]

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toMatchObject({ success: false, error: expect.stringContaining('缺章或重复') })
    expect(vi.mocked(ipc.invoke).mock.calls.some(([channel]) => channel === 'fs:grant-write-file')).toBe(false)
  })

  it('returns a useful empty-content message when no final chapters or drafts exist', async () => {
    authority = sequence('empty', 0)
    drafts = []

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('没有可导出的定稿章节或草稿'),
    })
    expect(vi.mocked(ipc.invoke).mock.calls.some(([channel]) => channel === 'fs:grant-write-file')).toBe(false)
  })
})
