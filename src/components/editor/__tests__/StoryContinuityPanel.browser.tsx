import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import StoryContinuityPanel from '../StoryContinuityPanel'
import { useProjectStore } from '../../../stores/project-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { emptyStoryContinuityDocument } from '../../../shared/story-continuity'

const PROJECT_PATH = 'C:\\novels\\story-continuity-panel'
const SESSION = { projectId: 'story-continuity', leaseId: 'story-continuity-lease', projectPath: PROJECT_PATH }
let root: Root
let container: HTMLDivElement
let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useProjectStore.setState({ currentProject: { id: SESSION.projectId, sessionLease: SESSION.leaseId, path: PROJECT_PATH, novelConfig: { writingLanguage: 'zh-CN' } } as never })
  setActiveProjectSessionContext(SESSION)
  const empty = emptyStoryContinuityDocument(2)
  invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:story-continuity-read') return empty
    if (channel === 'db:story-continuity-save') return { success: true, document: { ...(args[0] as { document: typeof empty }).document, revision: 1 } }
    throw new Error(`Unexpected IPC ${channel}`)
  })
  Object.defineProperty(window, 'velaAPI', { configurable: true, value: { invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn(), setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0) } })
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
})

describe('StoryContinuityPanel', () => {
  it('opens the author continuity sheet, adds a scene card, and saves with a revision', async () => {
    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    const summary = container.querySelector('summary')
    expect(summary?.textContent).toContain('章节连续性工作单')
    await act(async () => summary?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => container.querySelector('button')?.click())
    expect(container.textContent).toContain('场景 1')
    const goal = [...container.querySelectorAll<HTMLInputElement>('input')].find(input => input.getAttribute('aria-label') === '场景目标')
    expect(goal).not.toBeUndefined()
    if (goal) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(goal, '找到暗锁')
        goal.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('保存工作单'))
    expect(save).not.toBeUndefined()
    await act(async () => save?.click())
    await vi.waitFor(() => expect(invoke.mock.calls.some(([channel]) => channel === 'db:story-continuity-save')).toBe(true))
    expect(container.textContent).toContain('章节连续性计划已保存')
  })
})
