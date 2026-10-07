import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { setActiveProjectSessionContext } from '../../../../shared/project-session-context'
import { useAgentStore } from '../../../../stores/agent-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import ConfirmCard from '../ConfirmCard'

const session = { projectId: 'A', leaseId: 'lease-A', projectPath: 'C:\\novels\\A' }
const project = {
  id: 'A', sessionLease: 'lease-A', path: session.projectPath, name: 'A', characterStates: '', createdAt: '', updatedAt: '',
  novelConfig: {
    genre: '奇幻', subGenre: '', targetAudience: '青年', totalChapters: 10, wordsPerChapter: 3000,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '旧大纲', worldSetting: '',
    goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
}
const currentDraft = '第一段正文。\n第二段正文。'

let container: HTMLDivElement
let root: Root
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
}

function revisionToolCall(id: string, content: string, callSession = session) {
  return {
    id,
    toolName: 'propose_draft_revision',
    arguments: { chapter_number: 2, content, instruction: '收紧开头' },
    status: 'waiting_confirm',
    source: 'builtin',
    projectSession: callSession,
  }
}

function stubApi(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    'db:draft-get-latest': { id: 31, chapterNumber: 2, version: 3, status: 'draft', chapterTitle: '第二章' },
    'db:draft-get-full': { id: 31, content: currentDraft },
    ...overrides,
  }
  const invoke = vi.fn(async (channel: string) => (channel in routes ? routes[channel] : []))
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke,
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  return invoke
}

function mount(toolCall: Record<string, unknown>) {
  return act(async () => {
    root.render(<ConfirmCard toolCall={toolCall as never} />)
  })
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: project as never })
  setActiveProjectSessionContext(session)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useProjectStore.setState({ currentProject: null })
  setActiveProjectSessionContext(null)
  useAgentStore.getState().clearPendingConfirmations()
})

describe('propose_draft_revision confirmation preview', () => {
  it('renders added and removed paragraphs with the change summary instead of raw JSON', async () => {
    stubApi()
    useAgentStore.getState().beginToolConfirmation('rev-diff', () => {})
    await mount(revisionToolCall('rev-diff', '第一段正文（收紧）。\n第二段正文。'))
    await flush()

    await expect.element(page.getByText(/修订预览：第 2 章/)).toBeVisible()
    expect(container.querySelector('[data-draft-revision-preview]')).not.toBeNull()
    expect(container.querySelectorAll('[data-draft-revision-line="add"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-draft-revision-line="remove"]').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('新增')
    // 整篇正文不再以 JSON 形式贴在卡片里。
    expect(container.textContent).not.toContain('"chapter_number"')
  })

  it('explains that an identical revision has nothing to merge and disables approval', async () => {
    stubApi()
    useAgentStore.getState().beginToolConfirmation('rev-same', () => {})
    await mount(revisionToolCall('rev-same', currentDraft))
    await flush()

    await expect.element(page.getByText(/修订正文与当前草稿完全相同/)).toBeVisible()
    expect(container.querySelector('[data-draft-revision-same]')).not.toBeNull()
    await expect.element(page.getByRole('button', { name: '批准执行' })).toBeDisabled()
  })

  it('shows a loading notice while the current draft is still being read', async () => {
    stubApi({ 'db:draft-get-full': new Promise(() => {}) })
    useAgentStore.getState().beginToolConfirmation('rev-loading', () => {})
    await mount(revisionToolCall('rev-loading', '第一段正文（收紧）。\n第二段正文。'))
    await flush()

    await expect.element(page.getByText(/正在读取当前草稿并比对修订正文/)).toBeVisible()
    await expect.element(page.getByRole('button', { name: '批准执行' })).toBeDisabled()
  })

  it('marks the preview stale when the frozen session no longer matches the project', async () => {
    stubApi()
    useAgentStore.getState().beginToolConfirmation('rev-stale', () => {})
    await mount(revisionToolCall('rev-stale', '第一段正文（收紧）。', { ...session, leaseId: 'lease-OLD' }))
    await flush()

    await expect.element(page.getByText(/项目会话已变化，请重新发起这次改稿/)).toBeVisible()
    expect(container.querySelector('[data-draft-revision-stale]')).not.toBeNull()
    await expect.element(page.getByRole('button', { name: '批准执行' })).toBeDisabled()
  })
})
