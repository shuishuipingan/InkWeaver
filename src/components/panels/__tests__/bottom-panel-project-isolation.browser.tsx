import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import BottomPanel from '../BottomPanel'
import { LogsView } from '../BottomPanel'

const projectA = {
  id: 'A', sessionLease: 'lease-A', path: 'C:\\novels\\A', name: 'A', characterStates: '', createdAt: '', updatedAt: '',
  novelConfig: { genre: '奇幻', subGenre: '', targetAudience: '青年', totalChapters: 10, wordsPerChapter: 3000, plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '', worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '' },
}
const projectB = { ...projectA, id: 'B', sessionLease: 'lease-B', path: 'C:\\novels\\B', name: 'B' }

let container: HTMLDivElement
let root: Root
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function run(id: string, title: string, projectPath: string) {
  return {
    id,
    projectPath,
    projectSession: { projectId: id, leaseId: 'lease', projectPath },
    writingLanguage: 'zh-CN',
    uiLocale: 'zh-CN',
    type: 'chapter',
    title,
    status: 'completed',
    steps: [{ id: 's1', name: '步骤一', status: 'completed' }],
    currentStepIndex: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as never
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: projectA as never })
  useLayoutStore.setState({ bottomTab: 'tasks' })
  useWorkflowStore.setState({ activeRuns: [], history: [], globalLogs: [] })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async (channel: string) => (
        channel === 'runtime:log-page' ? { events: [], status: null } : []
      )),
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useProjectStore.setState({ currentProject: null })
  useWorkflowStore.setState({ activeRuns: [], history: [], globalLogs: [] })
})

describe('workflow history and logs stay inside their project', () => {
  it('only shows the current project history and keeps it when switching back', async () => {
    useWorkflowStore.setState({
      history: [run('run-a', 'A 项目的任务', projectA.path), run('run-b', 'B 项目的任务', projectB.path)],
      activeRuns: [],
    })
    await act(async () => { root.render(<BottomPanel />) })

    await expect.element(page.getByText('A 项目的任务')).toBeVisible()
    expect(container.textContent ?? '').not.toContain('B 项目的任务')

    // 切到项目 B：只应看到 B 的任务。
    await act(async () => { useProjectStore.setState({ currentProject: projectB as never }) })
    await expect.element(page.getByText('B 项目的任务')).toBeVisible()
    expect(container.textContent ?? '').not.toContain('A 项目的任务')

    // 切回项目 A：A 的历史仍在（证明是过滤而不是清空）。
    await act(async () => { useProjectStore.setState({ currentProject: projectA as never }) })
    await expect.element(page.getByText('A 项目的任务')).toBeVisible()
    expect(container.textContent ?? '').not.toContain('B 项目的任务')
  })

  it('hides project-owned logs in another project but keeps app-level logs', async () => {
    useWorkflowStore.setState({
      globalLogs: [
        { time: '10:00:00', level: 'info', message: 'A 项目的日志', projectPath: projectA.path },
        { time: '10:00:01', level: 'info', message: '应用启动日志' },
      ],
      history: [],
      activeRuns: [],
    })
    useProjectStore.setState({ currentProject: projectB as never })
    await act(async () => { root.render(<LogsView />) })
    await act(async () => { await Promise.resolve() })

    await expect.element(page.getByText('应用启动日志')).toBeVisible()
    expect(container.textContent ?? '').not.toContain('A 项目的日志')

    // 回到项目 A：属于 A 的日志重新可见。
    await act(async () => { useProjectStore.setState({ currentProject: projectA as never }) })
    await expect.element(page.getByText('A 项目的日志')).toBeVisible()
  })
})
