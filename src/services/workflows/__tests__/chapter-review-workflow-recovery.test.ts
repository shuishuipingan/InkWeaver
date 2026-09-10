import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../ipc-client', () => ({ ipc: { invokeWithProjectSession: ipcMocks.invoke } }))

import { resumeChapterRefineWorkflowFromCheckpoint, resumeChapterReviewWorkflowFromCheckpoint } from '../chapter-workflow'

const session = { projectId: 'review-project', leaseId: 'lease-a', projectPath: 'C:\\review-project' } as const

beforeEach(() => {
  vi.clearAllMocks()
  ipcMocks.invoke.mockImplementation(async (_session, channel: string) => {
    if (channel === 'db:draft-get-meta') return { id: 9, chapterNumber: 3, version: 1, status: 'draft', source: 'write' }
    if (channel === 'db:draft-get-full') return { id: 9, content: '旧港的雾压在屋檐下。' }
    throw new Error(`unexpected channel: ${channel}`)
  })
})

describe('chapter review workflow recovery', () => {
  it('reloads draft authority instead of storing draft prose in the checkpoint', async () => {
    const workflow = await resumeChapterReviewWorkflowFromCheckpoint({
      schemaVersion: 1,
      runId: 'review-run',
      projectPath: session.projectPath,
      projectSession: session,
      type: 'chapter_creation',
      title: '审稿 — 第3章 雾港',
      writingLanguage: 'zh-CN',
      uiLocale: 'zh-CN',
      boundary: 'failed',
      currentStepIndex: 0,
      steps: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      resumeMetadata: {
        kind: 'chapter-review',
        draftPath: 'vela://draft/9',
        chapterNumber: 3,
        chapterTitle: '雾港',
        reviewFocus: '衔接和情绪余波',
      },
    }, session)

    expect(workflow).toMatchObject({ type: 'chapter_creation', projectSession: session })
    expect(workflow.steps).toHaveLength(1)
    expect(ipcMocks.invoke).toHaveBeenCalledWith(session, 'db:draft-get-meta', 9, session.projectPath)
    expect(ipcMocks.invoke).toHaveBeenCalledWith(session, 'db:draft-get-full', 9, session.projectPath)
  })

  it('reloads draft authority for a refine-only recovery without persisting prose', async () => {
    const workflow = await resumeChapterRefineWorkflowFromCheckpoint({
      schemaVersion: 1,
      runId: 'refine-run',
      projectPath: session.projectPath,
      projectSession: session,
      type: 'chapter_creation',
      title: '修稿 — 第3章 雾港',
      writingLanguage: 'zh-CN',
      uiLocale: 'zh-CN',
      boundary: 'failed',
      currentStepIndex: 0,
      steps: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      resumeMetadata: {
        kind: 'chapter-refine',
        draftPath: 'vela://draft/9',
        chapterNumber: 3,
        chapterTitle: '雾港',
        userRefinePrompt: '加强节奏和情绪余波',
      },
    }, session)

    expect(workflow).toMatchObject({ type: 'chapter_creation', projectSession: session })
    expect(workflow.steps).toHaveLength(1)
  })
})
