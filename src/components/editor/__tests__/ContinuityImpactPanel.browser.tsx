import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ContinuityImpactPanel from '../ContinuityImpactPanel'
import { useProjectStore } from '../../../stores/project-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'

const PROJECT_PATH = 'C:\\novels\\impact-panel'
const SESSION = {
  projectId: 'impact-panel-project',
  leaseId: 'impact-panel-lease',
  projectPath: PROJECT_PATH,
}

let root: Root
let container: HTMLDivElement
let invoke: ReturnType<typeof vi.fn>
let startWorkflow: ReturnType<typeof vi.fn>
const originalStartWorkflow = useWorkflowStore.getState().startWorkflow

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useProjectStore.setState({
    currentProject: {
      id: SESSION.projectId,
      sessionLease: SESSION.leaseId,
      path: PROJECT_PATH,
      novelConfig: { writingLanguage: 'zh-CN' },
    } as never,
  })
  setActiveProjectSessionContext(SESSION)
  startWorkflow = vi.fn(async () => 'continuity-rebuild-run')
  useWorkflowStore.setState({ startWorkflow: startWorkflow as never })
  invoke = vi.fn(async (channel: string) => {
    if (channel === 'db:continuity-list-all') {
      return [{ draftId: 12, chapterNumber: 4, chapterTitle: '雨夜', chapterNotes: '桥上冲突', facts: [] }]
    }
    if (channel === 'db:chapter-handoff-list-all') {
      return [{
        handoffId: 'handoff-3', draftId: 11, chapterNumber: 3, sourceContentHash: 'a'.repeat(64),
        sceneLocation: '桥', viewpoint: '林岚', presentCharacters: ['林岚'], unfinishedActions: ['开门'],
        immediateGoal: '追上去', emotionalState: '紧张', constraints: [], openQuestions: [],
        transition: 'continue-scene', evidence: ['桥上'], status: 'confirmed',
        createdAt: '', updatedAt: '',
      }]
    }
    if (channel === 'db:narrative-thread-list') {
      return [{
        id: 2, title: '匿名信', type: 'mystery', targetStartChapter: 4, targetEndChapter: 7,
        authorIntent: '在第七章揭示', status: 'planned', dormantChapters: 0, overdue: false,
        events: [], createdAt: '', updatedAt: '',
      }]
    }
    throw new Error(`Unexpected IPC: ${channel}`)
  })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke,
      on: vi.fn(() => () => {}),
      once: vi.fn(),
      send: vi.fn(),
      setZoomLevel: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(window, 'velaAPI')
  setActiveProjectSessionContext(null)
  useProjectStore.setState({ currentProject: null })
  useWorkflowStore.setState({ startWorkflow: originalStartWorkflow })
})

describe('ContinuityImpactPanel', () => {
  it('lists source-bound downstream records and allows selective rebuild selection', async () => {
    await act(async () => root.render(<ContinuityImpactPanel projectKey={PROJECT_PATH} changedChapter={3} />))
    await vi.waitFor(() => expect(container.querySelector('[data-continuity-impact="true"]')).not.toBeNull())
    expect(container.textContent).toContain('雨夜')
    expect(container.textContent).toContain('第3章章节交接')
    expect(container.textContent).toContain('匿名信')
    const checkboxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes.every(input => input.checked)).toBe(true)
    await act(async () => {
      checkboxes[0]?.click()
    })
    expect(container.textContent).toContain('已选择 2/3 项待重建')
  })

  it('starts a resumable rebuild with only the selected source-bound impacts', async () => {
    await act(async () => root.render(<ContinuityImpactPanel projectKey={PROJECT_PATH} changedChapter={3} />))
    await vi.waitFor(() => expect(container.querySelector('[data-continuity-impact="true"]')).not.toBeNull())
    const checkboxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    await act(async () => checkboxes[0]?.click())
    const start = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('开始重建'))
    expect(start).not.toBeUndefined()
    await act(async () => start?.click())
    await vi.waitFor(() => expect(startWorkflow).toHaveBeenCalledOnce())
    const [definition, stepByStep] = startWorkflow.mock.calls[0] as [{ type: string; resumeMetadata?: Record<string, unknown>; steps: unknown[] }, boolean]
    expect(stepByStep).toBe(false)
    expect(definition.type).toBe('post_process')
    expect(definition.steps).toHaveLength(4)
    expect(definition.resumeMetadata).toMatchObject({ kind: 'continuity-rebuild', changedChapter: 3 })
  })
})
