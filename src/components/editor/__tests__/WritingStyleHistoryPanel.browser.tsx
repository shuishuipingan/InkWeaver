import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import WritingStyleHistoryPanel from '../WritingStyleHistoryPanel'
import { useProjectStore } from '../../../stores/project-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PROJECT_PATH = 'C:\\novels\\style-history-panel'
const SESSION = { projectId: 'style-history', leaseId: 'style-history-lease', projectPath: PROJECT_PATH }
let root: Root
let container: HTMLDivElement

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  setActiveProjectSessionContext(null)
  useProjectStore.setState({ currentProject: null })
  vi.restoreAllMocks()
})

function stubWindow(invoke: ReturnType<typeof vi.fn>) {
  Object.defineProperty(window, 'velaAPI', { configurable: true, value: { invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn(), setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0) } })
}

describe('WritingStyleHistoryPanel', () => {
  it('lists recorded AI style profile versions', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db:writing-style-history-list') return [
        { id: 2, previousStyle: '旧文风', nextStyle: '新文风', sourceFingerprint: 'abc', createdAt: '2026-09-07 00:00:00' },
      ]
      throw new Error('Unexpected ' + channel)
    })
    stubWindow(invoke)
    useProjectStore.setState({ currentProject: { id: SESSION.projectId, sessionLease: SESSION.leaseId, path: PROJECT_PATH, novelConfig: { writingLanguage: 'zh-CN', writingStyle: '当前文风' } } as never })
    setActiveProjectSessionContext(SESSION)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<WritingStyleHistoryPanel projectKey={PROJECT_PATH} />))
    const summary = container.querySelector('summary')
    expect(summary?.textContent).toContain('文风版本历史')
    await act(async () => summary?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(container.textContent).toContain('旧文风')
    expect(container.textContent).toContain('新文风')
    expect(invoke).toHaveBeenCalledWith('db:writing-style-history-list', PROJECT_PATH, expect.objectContaining({ projectId: SESSION.projectId }))
  })

  it('applies a historical version and persists it through project save', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db:writing-style-history-list') return [
        { id: 2, previousStyle: '旧文风', nextStyle: '新文风', sourceFingerprint: 'abc', createdAt: '2026-09-07 00:00:00' },
      ]
      throw new Error('Unexpected ' + channel)
    })
    stubWindow(invoke)
    useProjectStore.setState({ currentProject: { id: SESSION.projectId, sessionLease: SESSION.leaseId, path: PROJECT_PATH, novelConfig: { writingLanguage: 'zh-CN', writingStyle: '当前文风' } } as never })
    setActiveProjectSessionContext(SESSION)
    const saveSpy = vi.spyOn(useProjectStore.getState(), 'saveProject').mockResolvedValue(true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<WritingStyleHistoryPanel projectKey={PROJECT_PATH} />))
    await act(async () => container.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const apply = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('应用到当前'))
    expect(apply).not.toBeUndefined()
    await act(async () => apply?.click())
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled())
    expect(useProjectStore.getState().currentProject?.novelConfig.writingStyle).toBe('新文风')
  })
})