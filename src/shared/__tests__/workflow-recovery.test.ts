import { describe, expect, it, beforeEach } from 'vitest'
import {
  canResumeWorkflowCheckpoint,
  checkpointFromRun,
  clearWorkflowRecoveryCheckpoint,
  listWorkflowRecoveryCheckpoints,
  saveWorkflowRecoveryCheckpoint,
} from '../workflow-recovery'

const session = { projectId: 'project-a', leaseId: 'lease-a', projectPath: 'C:/novels/a' } as const

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
})

describe('workflow recovery checkpoints', () => {
  it('ignores malformed persisted rows without discarding valid recovery receipts', () => {
    const valid = checkpointFromRun({
      id: 'valid-run', projectPath: session.projectPath, projectSession: session,
      type: 'chapter_creation', title: 'Draft', writingLanguage: 'zh-CN', uiLocale: 'zh-CN',
      status: 'failed', currentStepIndex: 0, steps: [{ id: 'draft', name: 'Draft', status: 'failed' }],
      createdAt: '2026-01-01',
    }, 'failed')!
    localStorage.setItem('inkweaver.workflow-recovery.v1', JSON.stringify({
      valid, nullRow: null, broken: { ...valid, steps: 'not an array' },
    }))
    expect(listWorkflowRecoveryCheckpoints(session.projectPath)).toEqual([valid])
  })

  it('can save a new checkpoint after the stored root was corrupted', () => {
    localStorage.setItem('inkweaver.workflow-recovery.v1', 'null')
    const checkpoint = checkpointFromRun({
      id: 'new-run', projectPath: session.projectPath, projectSession: session,
      type: 'chapter_creation', title: 'Draft', writingLanguage: 'zh-CN', uiLocale: 'zh-CN',
      status: 'failed', currentStepIndex: 0, steps: [], createdAt: '2026-01-01',
    }, 'failed')!
    saveWorkflowRecoveryCheckpoint(checkpoint)
    expect(listWorkflowRecoveryCheckpoints()).toEqual([checkpoint])
  })
  it('persists safe step metadata without model output and rejects another lease', () => {
    const checkpoint = checkpointFromRun({
      id: 'run-1', projectPath: session.projectPath, projectSession: session, type: 'chapter_creation', title: '写稿',
      writingLanguage: 'zh-CN', uiLocale: 'zh-CN', status: 'cancelling', currentStepIndex: 1,
      steps: [{ id: 'step-1', name: '写稿', status: 'running', progress: 48, result: 'private prose' } as never],
      createdAt: '2026-09-07T00:00:00.000Z',
      resumeMetadata: {
        startChapterNumber: 3,
        chapterCount: 2,
        completionMode: 'auto_finalize',
        generationModelId: 'frozen-model',
        chapterWordsTarget: 4200,
      },
    }, 'cancelled', '2026-09-07T00:01:00.000Z')!
    saveWorkflowRecoveryCheckpoint(checkpoint)
    expect(JSON.stringify(listWorkflowRecoveryCheckpoints())).not.toContain('private prose')
    expect(listWorkflowRecoveryCheckpoints()[0]?.resumeMetadata).toEqual({
      startChapterNumber: 3,
      chapterCount: 2,
      completionMode: 'auto_finalize',
      generationModelId: 'frozen-model',
      chapterWordsTarget: 4200,
    })
    expect(canResumeWorkflowCheckpoint(checkpoint, session)).toBe(true)
    expect(canResumeWorkflowCheckpoint(checkpoint, { ...session, leaseId: 'lease-b' })).toBe(false)
    clearWorkflowRecoveryCheckpoint('run-1')
    expect(listWorkflowRecoveryCheckpoints()).toEqual([])
  })
})
