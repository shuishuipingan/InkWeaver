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
})

describe('WritingStyleHistoryPanel', () => {
  it('lists recorded AI style profile versions without editing them', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'db:writing-style-history-list') return [
        { id: 2, previousStyle: '旧文风', nextStyle: '新文风', sourceFingerprint: 'abc', createdAt: '2026-09-07 00:00:00' },
      ]
      throw new Error('Unexpected ' + channel)
    })
    Object.defineProperty(window, 'velaAPI', { configurable: true, value: { invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn(), setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0) } })
    useProjectStore.setState({ currentProject: { id: SESSION.projectId, sessionLease: SESSION.leaseId, path: PROJECT_PATH, novelConfig: { writingLanguage: 'zh-CN' } } as never })
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
})