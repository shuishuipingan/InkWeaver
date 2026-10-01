import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

import type { StepCallbacks, WorkflowContext } from '../../../stores/workflow-store'
import { useProjectStore } from '../../../stores/project-store'
import { createChapterWorkflow, createRepairFinalizeWorkflow } from '../chapter-workflow'

const postProcess = vi.hoisted(() => ({
  params: [] as Array<Record<string, unknown>>,
  execute: vi.fn(async (params: unknown) => {
    void params
    return { allCriticalPassed: true, steps: {} as Record<string, { ok: boolean; label: string; critical: boolean }> }
  }),
}))

vi.mock('../commands/finalize-chapter.command', () => ({
  RunFinalizePostProcessCommand: class {
    constructor(params: Record<string, unknown>) {
      postProcess.params.push(params)
    }

    execute(params: unknown) {
      return postProcess.execute(params)
    }
  },
}))

const PROJECT_PATH = 'C:\\novels\\repair-finalize'
const PROJECT_SESSION = Object.freeze({
  projectId: 'repair-finalize',
  leaseId: 'lease-repair-finalize',
  projectPath: PROJECT_PATH,
})

function context(): WorkflowContext {
  return {
    runId: 'repair-finalize-run',
    projectPath: PROJECT_PATH,
    projectSession: PROJECT_SESSION,
    writingLanguage: 'zh-CN',
    uiLocale: 'zh-CN',
    data: {},
    cancelled: false,
  }
}

function callbacks(): StepCallbacks {
  return { log: vi.fn(), setProgress: vi.fn(), appendText: vi.fn() }
}

beforeEach(() => {
  postProcess.execute.mockResolvedValue({ allCriticalPassed: true, steps: {} })
})

afterEach(() => {
  postProcess.params.length = 0
  postProcess.execute.mockClear()
  vi.unstubAllGlobals()
  useProjectStore.setState({ currentProject: null })
})

describe('createRepairFinalizeWorkflow', () => {
  it('scopes direct writing and repair to the target chapter', () => {
    const writing = createChapterWorkflow({
      projectPath: PROJECT_PATH,
      chapterNumber: 3,
      title: '第三章',
      role: '发展',
      purpose: '推进冲突',
      characters: [],
      keyEvents: '冲突升级',
      wordsTarget: 4200,
    }, PROJECT_SESSION)
    const repair = createRepairFinalizeWorkflow(3, PROJECT_PATH, PROJECT_SESSION)

    expect(writing).toMatchObject({
      chapterWordsTarget: 4200,
      resourceKeys: ['chapter:3'],
      readResourceKeys: ['novel-config', 'architecture', 'blueprints'],
    })
    expect(repair).toMatchObject({
      resourceKeys: [
        'chapter:3',
        'character-roster',
        'continuity',
        'chapter-summary',
      ],
      readResourceKeys: ['novel-config', 'architecture', 'blueprints'],
    })
  })

  it('rebuilds every derived result instead of skipping previously successful steps', async () => {
    useProjectStore.setState({
      currentProject: {
        id: PROJECT_SESSION.projectId,
        name: 'Repair finalize',
        path: PROJECT_PATH,
        sessionLease: PROJECT_SESSION.leaseId,
      } as never,
    })
    const invoke = vi.fn(async (channel: string) => {
      switch (channel) {
        case 'db:draft-get-finalized':
          return { id: 17 }
        case 'db:draft-get-full':
          return { content: '已定稿正文' }
        case 'db:blueprint-get':
          return { title: '定稿标题', characters: ['林舟'] }
        default:
          throw new Error(`unexpected IPC: ${channel}`)
      }
    })
    vi.stubGlobal('window', { velaAPI: { invoke } })

    const workflow = createRepairFinalizeWorkflow(3, PROJECT_PATH, PROJECT_SESSION)
    const step = workflow.steps[0]!
    await step.executor({
      ...step,
      id: 'repair-finalize-step',
      status: 'running',
      logs: [],
    }, context(), callbacks())

    expect(postProcess.params).toEqual([expect.objectContaining({
      chapterNumber: 3,
      draftId: 17,
      onlyFailed: false,
      enableChapterHandoff: true,
      sourceContentHash: createHash('sha256').update('已定稿正文').digest('hex'),
    })])
    expect(postProcess.execute).toHaveBeenCalledOnce()
  })

  it('rejects repair completion when a persisted post-process step still failed', async () => {
    useProjectStore.setState({ currentProject: {
      id: PROJECT_SESSION.projectId, name: 'Repair finalize', path: PROJECT_PATH,
      sessionLease: PROJECT_SESSION.leaseId,
    } as never })
    vi.stubGlobal('window', { velaAPI: { invoke: vi.fn(async (channel: string) => {
      if (channel === 'db:draft-get-finalized') return { id: 17 }
      if (channel === 'db:draft-get-full') return { content: '已定稿正文' }
      if (channel === 'db:blueprint-get') return { title: '定稿标题', characters: [] }
      throw new Error(`unexpected IPC: ${channel}`)
    }) } })
    postProcess.execute.mockResolvedValueOnce({ allCriticalPassed: false,
      steps: { kb_import: { ok: false, label: '导入知识库', critical: true } },
    })
    const step = createRepairFinalizeWorkflow(3, PROJECT_PATH, PROJECT_SESSION).steps[0]!
    await expect(step.executor({ ...step, id: 'repair', status: 'running', logs: [] }, context(), callbacks()))
      .rejects.toThrow('导入知识库')
  })
})
