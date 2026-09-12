import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useProjectStore } from '../../../stores/project-store'
import { createArchitectureWorkflow, resumeArchitectureWorkflowFromCheckpoint } from '../architecture-workflow'

const session = { projectId: 'architecture-project', leaseId: 'lease-a', projectPath: 'C:\\architecture-project' } as const

beforeEach(() => {
  useProjectStore.setState({
    currentProject: {
      id: session.projectId,
      sessionLease: session.leaseId,
      name: 'Architecture project',
      path: session.projectPath,
      novelConfig: {},
    } as never,
  })
})

afterEach(() => useProjectStore.setState({ currentProject: null }))

describe('architecture workflow recovery', () => {
  it('rebuilds selected steps and frozen guidance from safe metadata', () => {
    const workflow = resumeArchitectureWorkflowFromCheckpoint({
      schemaVersion: 1,
      runId: 'architecture-run',
      projectPath: session.projectPath,
      projectSession: session,
      type: 'architecture_generation',
      title: '生成故事架构',
      writingLanguage: 'zh-CN',
      uiLocale: 'zh-CN',
      boundary: 'failed',
      currentStepIndex: 1,
      steps: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      resumeMetadata: {
        kind: 'architecture',
        selectedStepsJson: '["premise","synopsis"]',
        stepGuidanceJson: '{"premise":"强调代价","synopsis":"保留悬念"}',
      },
    }, session)

    expect(workflow).toMatchObject({ type: 'architecture_generation', projectSession: session })
    expect(workflow.steps).toHaveLength(2)
    expect(workflow.resumeMetadata).toMatchObject({ kind: 'architecture' })
    expect(createArchitectureWorkflow({ projectPath: session.projectPath, projectSession: session, selectedSteps: ['premise'] }).steps).toHaveLength(1)
  })
})
