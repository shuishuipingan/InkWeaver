import { afterEach, describe, expect, it } from 'vitest'

import { useProjectStore } from '../../../stores/project-store'
import type { WorkflowRecoveryCheckpoint } from '../../../shared/workflow-recovery'
import {
  resumeConfigGenerationWorkflowFromCheckpoint,
} from '../architecture-workflow'
import {
  resumeDirectoryWorkflowFromCheckpoint,
} from '../directory-workflow'

const session = {
  projectId: 'project-A',
  leaseId: 'lease-A',
  projectPath: 'C:/projects/A',
} as const

const project = {
  id: session.projectId,
  sessionLease: session.leaseId,
  name: 'A',
  path: session.projectPath,
  novelConfig: {
    totalChapters: 80,
    wordsPerChapter: 2800,
    globalGuidance: 'Keep the causal chain visible.',
    genre: 'fantasy',
  },
  characterStates: '',
  createdAt: '',
  updatedAt: '',
}

function checkpoint(
  type: string,
  resumeMetadata: Record<string, string | number | boolean>,
): WorkflowRecoveryCheckpoint {
  return {
    schemaVersion: 1,
    runId: `run-${type}`,
    projectPath: session.projectPath,
    projectSession: session,
    type,
    title: type,
    writingLanguage: 'zh-CN',
    uiLocale: 'zh-CN',
    boundary: 'failed',
    currentStepIndex: 0,
    steps: [{ id: 'step-1', name: 'step', status: 'failed' }],
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:01:00.000Z',
    resumeMetadata,
  }
}

afterEach(() => {
  useProjectStore.setState({ currentProject: null })
})

describe('generation workflow recovery factories', () => {
  it('rebuilds configuration generation from serialized inputs and uses the current project as the result sink', () => {
    useProjectStore.setState({ currentProject: project as never })

    const resumed = resumeConfigGenerationWorkflowFromCheckpoint(
      checkpoint('config_generation', {
        kind: 'config-generation',
        idea: 'A courier discovers a city that remembers every lie.',
        totalChapters: 80,
        wordsPerChapter: 2800,
      }),
      session,
    )

    expect(resumed).toMatchObject({
      type: 'config_generation',
      projectPath: session.projectPath,
      projectSession: session,
      resumeMetadata: {
        kind: 'config-generation',
        idea: 'A courier discovers a city that remembers every lie.',
        totalChapters: 80,
        wordsPerChapter: 2800,
      },
    })
  })

  it('rebuilds directory generation without replaying generated blueprints from the checkpoint', () => {
    useProjectStore.setState({ currentProject: project as never })

    const resumed = resumeDirectoryWorkflowFromCheckpoint(
      checkpoint('directory', {
        kind: 'directory-generation',
        mode: 'append',
        startChapter: 81,
        count: 20,
        pacingGuidance: 'Let the unresolved witness thread surface by chapter 90.',
      }),
      session,
    )

    expect(resumed).toMatchObject({
      type: 'directory',
      projectPath: session.projectPath,
      projectSession: session,
      resumeMetadata: {
        kind: 'directory-generation',
        mode: 'append',
        startChapter: 81,
        count: 20,
        pacingGuidance: 'Let the unresolved witness thread surface by chapter 90.',
      },
    })
    expect(resumed.steps).toHaveLength(2)
  })
})
