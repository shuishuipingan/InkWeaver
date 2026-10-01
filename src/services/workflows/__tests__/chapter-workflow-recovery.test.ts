import { describe, expect, it, vi } from 'vitest'

import { resumeChapterDraftWorkflowFromCheckpoint } from '../chapter-workflow'
import { ipc } from '../../ipc-client'
import { sha256Hex } from '../../../shared/sha256-hex'
import { useProjectStore } from '../../../stores/project-store'
const { openFile } = vi.hoisted(() => ({ openFile: vi.fn() }))
vi.mock('../../ipc-client', () => ({ ipc: { invokeWithProjectSession: vi.fn() } }))
vi.mock('../../../stores/editor-store', () => ({ useEditorStore: { getState: () => ({ openFile }) } }))

const session = { projectId: 'chapter-project', leaseId: 'lease-a', projectPath: 'C:\\chapter-project' } as const

describe('chapter draft workflow recovery', () => {
  it('restores a committed source-bound draft instead of requesting another generation', async () => {
    useProjectStore.setState({ currentProject: {
      id: session.projectId, path: session.projectPath, sessionLease: session.leaseId, novelConfig: {},
    } as never })
    const content = '保存成功的草稿正文。'
    vi.mocked(ipc.invokeWithProjectSession).mockImplementation((async (_session: typeof session, channel: string) => {
      if (channel === 'db:draft-get-full') return { id: 42, chapterNumber: 3, version: 1, status: 'draft', content }
      if (channel === 'db:draft-get-latest') return { id: 42 }
      throw new Error(`Unexpected model or write call: ${channel}`)
    }) as never)
    const checkpoint = {
      schemaVersion: 1 as const, runId: 'saved-draft-run', projectPath: session.projectPath,
      projectSession: session, type: 'chapter_creation', title: 'Draft', writingLanguage: 'zh-CN' as const,
      uiLocale: 'zh-CN' as const, boundary: 'cancelled' as const, currentStepIndex: 0,
      steps: [{ id: 'draft', name: 'Draft', status: 'failed' as const }], createdAt: '', updatedAt: '',
      resumeMetadata: { kind: 'chapter-draft', chapterNumber: 3, title: '雾港', charactersJson: '[]',
        wordsTarget: 4200, draftId_3: 42, draftContentHash_3: await sha256Hex(content) },
    }
    const workflow = resumeChapterDraftWorkflowFromCheckpoint(checkpoint, session)
    const callbacks = { log: vi.fn(), setProgress: vi.fn(), replaceText: vi.fn(), appendText: vi.fn() }
    const context = { projectPath: session.projectPath, projectSession: session, data: {}, cancelled: false } as never
    await expect(workflow.steps[0].executor({} as never, context, callbacks)).resolves.toBe(content)
    expect(workflow.runId).toBe(checkpoint.runId)
    expect(callbacks.replaceText).toHaveBeenCalledWith(content)
    expect(openFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'vela://draft/42', content }))
    useProjectStore.setState({ currentProject: null })
  })
  it('rebuilds a draft workflow from frozen non-prose chapter inputs', () => {
    const workflow = resumeChapterDraftWorkflowFromCheckpoint({
      schemaVersion: 1,
      runId: 'chapter-run',
      projectPath: session.projectPath,
      projectSession: session,
      type: 'chapter_creation',
      title: '写稿 — 第 3 章 · 雾港',
      writingLanguage: 'zh-CN',
      uiLocale: 'zh-CN',
      boundary: 'failed',
      currentStepIndex: 0,
      steps: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      resumeMetadata: {
        kind: 'chapter-draft',
        chapterNumber: 3,
        title: '雾港',
        role: '发展',
        purpose: '让主角发现线索',
        charactersJson: '["hero","guide"]',
        keyEvents: '发现旧船票',
        suspenseHook: '船票背面有未干的墨迹',
        userGuidance: '保持压迫感',
        wordsTarget: 4200,
        generationModelId: 'frozen-model',
      },
    }, session)

    expect(workflow).toMatchObject({
      type: 'chapter_creation',
      generationModelId: 'frozen-model',
      chapterWordsTarget: 4200,
      resumeMetadata: expect.objectContaining({ kind: 'chapter-draft', chapterNumber: 3 }),
    })
    expect(workflow.steps).toHaveLength(1)
  })
})
