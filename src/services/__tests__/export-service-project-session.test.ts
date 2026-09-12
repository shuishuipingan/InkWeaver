import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exportNovel } from '../export-service'
import { ipc } from '../ipc-client'
import { setActiveProjectSessionContext } from '../../shared/project-session-context'
import type { ProjectSessionContext } from '../../shared/ipc-channels'

vi.mock('../ipc-client', () => ({
  ipc: {
    invoke: vi.fn(),
    invokeWithProjectSession: vi.fn(),
  },
}))

const addLog = vi.fn()
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
  novelConfig: {
    genre: 'fantasy',
    targetAudience: 'general',
  },
}

vi.mock('../../stores/project-store', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({ currentProject: projectSnapshot })),
  },
}))

vi.mock('../../stores/workflow-store', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({ addLog })),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  setActiveProjectSessionContext(projectSession)
  const writtenFiles = new Map<string, string>()
  vi.mocked(ipc.invoke).mockImplementation((async (_channel: string, _grantId?: string, relativePath?: string, content?: unknown) => {
    if (_channel === 'fs:grant-write-file') {
      if (typeof relativePath === 'string') writtenFiles.set(relativePath, String(content))
      return { success: true }
    }
    if (_channel === 'fs:grant-read-file') {
      return { success: true, content: typeof relativePath === 'string' ? writtenFiles.get(relativePath) ?? '' : '' }
    }
    return { success: true }
  }) as never)
  vi.mocked(ipc.invokeWithProjectSession).mockImplementation((async (_session: ProjectSessionContext, channel: string) => {
    if (channel === 'db:draft-authority-sequence') return {
      status: 'continuous', lastChapterNumber: 1, nextChapterNumber: 2,
      duplicateChapterNumbers: [], authorityFingerprint: 'a'.repeat(64),
    } as never
    if (channel === 'db:draft-list-all') return [{ id: 1, chapterNumber: 1, chapterTitle: '开篇', version: 1, status: 'finalized', wordCount: 2 }] as never
    if (channel === 'db:draft-get-full') return { content: 'Final chapter' } as never
    if (channel === 'db:project-core-get') return { synopsis: 'Synopsis' } as never
    throw new Error(`Unexpected channel: ${channel}`)
  }) as never)
})

afterEach(() => {
  setActiveProjectSessionContext(null)
})

describe('exportNovel project session ownership', () => {
  it('reads project data through the frozen session and writes only through the granted directory capability', async () => {
    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant', includeOutline: true },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })

    expect(ipc.invoke).toHaveBeenCalledWith(
      'fs:grant-write-file',
      'export-grant',
      'Project A.md',
      expect.stringContaining('Final chapter'),
    )
    expect(ipc.invokeWithProjectSession).toHaveBeenNthCalledWith(
      1,
      projectSession,
      'db:draft-authority-sequence',
      projectPath,
    )
    expect(ipc.invokeWithProjectSession).toHaveBeenNthCalledWith(
      2,
      projectSession,
      'db:draft-list-all',
      projectPath,
    )
    expect(ipc.invokeWithProjectSession).toHaveBeenNthCalledWith(
      3,
      projectSession,
      'db:draft-get-full',
      1,
      projectPath,
    )
  })

  it('passes mixed UTF-8 finalized prose to the export capability without transcoding', async () => {
    const finalizedContent = 'The sign reads “夜航 Café” — déjà vu.'
    vi.mocked(ipc.invokeWithProjectSession).mockImplementation((async (_session: ProjectSessionContext, channel: string) => {
      if (channel === 'db:draft-authority-sequence') return {
        status: 'continuous', lastChapterNumber: 1, nextChapterNumber: 2,
        duplicateChapterNumbers: [], authorityFingerprint: 'a'.repeat(64),
      } as never
      if (channel === 'db:draft-list-all') return [{ id: 1, chapterNumber: 1, chapterTitle: '开篇', version: 1, status: 'finalized', wordCount: 8 }] as never
      if (channel === 'db:draft-get-full') return { content: finalizedContent } as never
      throw new Error(`Unexpected channel: ${channel}`)
    }) as never)

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })

    const writeCall = vi.mocked(ipc.invoke).mock.calls.find(([channel]) => channel === 'fs:grant-write-file')
    const exportedContent = writeCall?.[3]
    expect(exportedContent).toEqual(expect.stringContaining(finalizedContent))
    const exportedFact = (exportedContent as string).slice(
      (exportedContent as string).indexOf(finalizedContent),
      (exportedContent as string).indexOf(finalizedContent) + finalizedContent.length,
    )
    expect(new TextEncoder().encode(exportedFact)).toEqual(new TextEncoder().encode(finalizedContent))
  })

  it('exports finalized authority even when the project has no chapter blueprints', async () => {
    vi.mocked(ipc.invokeWithProjectSession).mockImplementation((async (_session: ProjectSessionContext, channel: string, ...args: unknown[]) => {
      if (channel === 'db:draft-authority-sequence') return {
        status: 'continuous', lastChapterNumber: 2, nextChapterNumber: 3,
        duplicateChapterNumbers: [], authorityFingerprint: 'a'.repeat(64),
      } as never
      if (channel === 'db:draft-list-all') return [
        { id: 21, chapterNumber: 1, chapterTitle: '开篇', version: 1, status: 'finalized', wordCount: 4 },
        { id: 22, chapterNumber: 2, chapterTitle: '转折', version: 1, status: 'finalized', wordCount: 4 },
      ] as never
      if (channel === 'db:draft-get-full') return { content: `正文${String(args[0])}` } as never
      throw new Error(`Unexpected channel: ${channel}`)
    }) as never)
    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })
    expect(vi.mocked(ipc.invoke)).toHaveBeenCalledWith(
      'fs:grant-write-file', 'export-grant', 'Project A.md', expect.any(String),
    )
  })

  it('refuses to export when finalized authority reports a gap or duplicate chapter', async () => {
    vi.mocked(ipc.invokeWithProjectSession).mockImplementation((async (_session: ProjectSessionContext, channel: string) => {
      if (channel === 'db:draft-authority-sequence') return {
        status: 'invalid', lastChapterNumber: 3, firstGapChapterNumber: 2,
        duplicateChapterNumbers: [3], authorityFingerprint: 'b'.repeat(64),
      } as never
      if (channel === 'db:draft-list-all') return [] as never
      throw new Error(`Unexpected channel: ${channel}`)
    }) as never)

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toMatchObject({ success: false, error: expect.stringContaining('缺章或重复') })
    expect(ipc.invoke).not.toHaveBeenCalled()
  })

  it('refuses to export a finalized draft whose stored word count no longer matches its body', async () => {
    vi.mocked(ipc.invokeWithProjectSession).mockImplementation((async (_session: ProjectSessionContext, channel: string) => {
      if (channel === 'db:draft-authority-sequence') return {
        status: 'continuous', lastChapterNumber: 1, nextChapterNumber: 2,
        duplicateChapterNumbers: [], authorityFingerprint: 'c'.repeat(64),
      } as never
      if (channel === 'db:draft-list-all') return [{ id: 8, chapterNumber: 1, chapterTitle: '开篇', version: 1, status: 'finalized', wordCount: 99 }] as never
      if (channel === 'db:draft-get-full') return { content: '两词' } as never
      throw new Error(`Unexpected channel: ${channel}`)
    }) as never)

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toMatchObject({ success: false, error: expect.stringContaining('字数') })
    expect(ipc.invoke).not.toHaveBeenCalled()
  })

  it('writes a source-bound export manifest with chapter title, count, path, and content hash', async () => {
    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toEqual({ success: true, path: 'Project A.md' })

    const manifestCall = vi.mocked(ipc.invoke).mock.calls.find(([channel, _grantId, relativePath]) => (
      channel === 'fs:grant-write-file' && typeof relativePath === 'string' && relativePath.endsWith('.manifest.json')
    ))
    expect(manifestCall).toBeDefined()
    const manifest = JSON.parse(String(manifestCall?.[3])) as {
      schemaVersion: number
      format: string
      authorityFingerprint: string
      chapters: Array<{ chapterNumber: number; title: string; wordCount: number; outputFile: string; contentHash: string }>
    }
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      format: 'merged-md',
      authorityFingerprint: 'a'.repeat(64),
      chapters: [{ chapterNumber: 1, title: '开篇', wordCount: 2, outputFile: 'Project A.md' }],
    })
    expect(manifest.chapters[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('stops after the directory-selection export becomes stale on a same-path reopen', async () => {
    let resolveBlueprints: ((value: Array<{ chapterNumber: number }>) => void) | undefined
    vi.mocked(ipc.invokeWithProjectSession).mockImplementationOnce(() =>
      new Promise((resolve) => { resolveBlueprints = resolve }),
    )

    const exporting = exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )
    await vi.waitFor(() => expect(resolveBlueprints).toBeTypeOf('function'))
    setActiveProjectSessionContext({ ...projectSession, leaseId: 'lease-b' })
    resolveBlueprints!([])

    await expect(exporting).resolves.toEqual({
      success: false,
      error: expect.stringContaining('项目会话'),
    })
    expect(ipc.invokeWithProjectSession).toHaveBeenCalledOnce()
    expect(ipc.invoke).not.toHaveBeenCalled()
  })

  it('fails when the granted directory readback does not match what was written', async () => {
    let relativeReadback = ''
    vi.mocked(ipc.invoke).mockImplementation((async (channel: string, _grantId?: string, relativePath?: string, _content?: unknown) => {
      if (channel === 'fs:grant-write-file') {
        relativeReadback = String(relativePath ?? '')
        return { success: true }
      }
      if (channel === 'fs:grant-read-file') {
        return { success: true, content: '' }
      }
      return { success: true }
    }) as never)

    await expect(exportNovel(
      { format: 'merged-md', grantId: 'export-grant' },
      projectSnapshot,
      projectSession,
    )).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('回读校验失败'),
    })
    expect(relativeReadback).toBe('Project A.md')
  })
})
