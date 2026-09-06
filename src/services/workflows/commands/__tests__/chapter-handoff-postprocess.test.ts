import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StepCallbacks, WorkflowContext } from '../../../../stores/workflow-store'
import { buildFinalizePostProcessSteps, type FinalizePostProcessGeneration } from '../finalize-chapter.command'

const PROJECT_PATH = 'C:\\novels\\handoff-postprocess'
const SESSION = { projectId: 'handoff-project', leaseId: 'handoff-lease', projectPath: PROJECT_PATH }

function context(): WorkflowContext {
  return {
    runId: 'handoff-run',
    projectPath: PROJECT_PATH,
    projectSession: SESSION,
    writingLanguage: 'zh-CN',
    uiLocale: 'zh-CN',
    data: {},
    cancelled: false,
  }
}

function callbacks(): StepCallbacks {
  return { log: vi.fn(), setProgress: vi.fn(), appendText: vi.fn() }
}

function generation(): FinalizePostProcessGeneration {
  return {
    complete: vi.fn(async () => JSON.stringify({
      sceneLocation: '旧码头',
      viewpoint: '林舟',
      presentCharacters: ['林舟'],
      unfinishedActions: ['打开暗锁'],
      immediateGoal: '确认门后是否有人',
      emotionalState: '警惕',
      constraints: ['不能遗失钥匙'],
      openQuestions: ['门后是谁？'],
      transition: 'continue-scene',
      evidence: ['林舟握着钥匙，听见门后有人叫出了他的名字。'],
    })),
  }
}

beforeEach(() => {
  vi.stubGlobal('window', {
    velaAPI: {
      invoke: vi.fn(async (channel: string) => {
        if (channel === 'db:chapter-handoff-save-candidate') {
          return { success: true, handoff: { handoffId: 'chapter-handoff-handoff-run-3' } }
        }
        throw new Error(`unexpected IPC: ${channel}`)
      }),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chapter handoff post-process step', () => {
  it('saves a non-critical source-bound candidate after finalization', async () => {
    const steps = buildFinalizePostProcessSteps(
      { path: PROJECT_PATH },
      3,
      '暗锁',
      '林舟握着钥匙，听见门后有人叫出了他的名字。',
      generation(),
      17,
      ['林舟'],
      { enableChapterHandoff: true, sourceContentHash: 'c'.repeat(64) },
    )
    const step = steps.find(candidate => candidate.key === 'chapter_handoff')

    expect(step).toMatchObject({ label: '章节交接候选', critical: false })
    await step!.executor(callbacks(), context())

    const invoke = (window as unknown as { velaAPI: { invoke: ReturnType<typeof vi.fn> } }).velaAPI.invoke
    expect(invoke).toHaveBeenCalledWith(
      'db:chapter-handoff-save-candidate',
      expect.objectContaining({
        draftId: 17,
        chapterNumber: 3,
        sourceContentHash: 'c'.repeat(64),
        transition: 'continue-scene',
      }),
      PROJECT_PATH,
      SESSION,
    )
  })
})
