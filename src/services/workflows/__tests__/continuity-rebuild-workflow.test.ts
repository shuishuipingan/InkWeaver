import { describe, expect, it } from 'vitest'

import type { ProjectSessionContext } from '../../../shared/ipc-channels'
import type { WorkflowRecoveryCheckpoint } from '../../../shared/workflow-recovery'
import { createContinuityRebuildWorkflow, resumeContinuityRebuildWorkflowFromCheckpoint } from '../continuity-rebuild-workflow'

const session: ProjectSessionContext = {
  projectId: 'continuity-project',
  leaseId: 'continuity-lease',
  projectPath: 'C:\\novels\\continuity-project',
}

describe('continuity rebuild workflow', () => {
  it('freezes selected affected chapters in safe metadata and resumes in chapter order', () => {
    const workflow = createContinuityRebuildWorkflow({
      projectPath: session.projectPath,
      changedChapter: 3,
      impacts: [
        { kind: 'continuity-projection', id: 'projection:5', label: '第五章', sourceChapter: 5, affectedChapters: [5] },
        { kind: 'chapter-handoff', id: 'handoff:3', label: '第三章交接', sourceChapter: 3, affectedChapters: [4] },
        { kind: 'narrative-thread', id: 'thread:2', label: '匿名信', sourceChapter: 4, affectedChapters: [4, 5] },
      ],
    }, session)

    expect(workflow.type).toBe('post_process')
    expect(workflow.steps.map(step => step.name)).toEqual([
      '重建第4章派生内容',
      '重建第5章派生内容',
    ])
    expect(workflow.resumeMetadata).toEqual({
      kind: 'continuity-rebuild',
      changedChapter: 3,
      affectedChaptersJson: '[4,5]',
      impactIdsJson: '["handoff:3","projection:5","thread:2"]',
    })
  })

  it('rebuilds the same frozen chapter set from a paused checkpoint without prose', () => {
    const checkpoint: WorkflowRecoveryCheckpoint = {
      schemaVersion: 1,
      runId: 'continuity-rebuild-run',
      projectPath: session.projectPath,
      projectSession: session,
      type: 'post_process',
      title: '历史改稿影响重建',
      writingLanguage: 'zh-CN',
      uiLocale: 'zh-CN',
      boundary: 'paused',
      currentStepIndex: 1,
      steps: [{ id: 'step-4', name: '重建第4章派生内容', status: 'completed' }],
      createdAt: '2026-09-12T00:00:00.000Z',
      updatedAt: '2026-09-12T00:01:00.000Z',
      resumeMetadata: {
        kind: 'continuity-rebuild',
        changedChapter: 3,
        affectedChaptersJson: '[4,5]',
        impactIdsJson: '["handoff:3","projection:5"]',
      },
    }

    const resumed = resumeContinuityRebuildWorkflowFromCheckpoint(checkpoint, session)
    expect(resumed.steps).toHaveLength(2)
    expect(resumed.steps.map(step => step.name)).toEqual(['重建第4章派生内容', '重建第5章派生内容'])
    expect(resumed.resumeMetadata).not.toHaveProperty('draftContent')
    expect(resumed.resumeMetadata).not.toHaveProperty('chapterContent')
  })
})
