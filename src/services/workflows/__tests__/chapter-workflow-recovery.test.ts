import { describe, expect, it } from 'vitest'

import { resumeChapterDraftWorkflowFromCheckpoint } from '../chapter-workflow'

const session = { projectId: 'chapter-project', leaseId: 'lease-a', projectPath: 'C:\\chapter-project' } as const

describe('chapter draft workflow recovery', () => {
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
