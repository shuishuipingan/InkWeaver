import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useAgentStore } from '../../../../stores/agent-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import AgentConversation from '../AgentConversation'

const session = { projectId: 'A', leaseId: 'lease-A', projectPath: 'C:\\novels\\A' }
const project = {
  id: 'A', sessionLease: 'lease-A', path: session.projectPath, name: 'A', characterStates: '', createdAt: '', updatedAt: '',
  novelConfig: {
    genre: '奇幻', subGenre: '', targetAudience: '青年', totalChapters: 10, wordsPerChapter: 3000,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '旧大纲', worldSetting: '',
    goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
}

let container: HTMLDivElement
let root: Root
// 面板挂载后会从项目库恢复一次会话列表：这里的回复必须与用例预置的会话一致。
let conversationListReply: unknown[] = []
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true


beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: project as never })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async (channel: string) => (channel === 'db:agent-conversation-list' ? conversationListReply : [])),
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  conversationListReply = []
  await act(async () => root.unmount())
  container.remove()
  useAgentStore.setState({
    conversations: [],
    activeConversationId: null,
    showHistory: false,
    historyHydrated: false,
    lastPersistenceWarning: null,
  })
  useProjectStore.setState({ currentProject: null })
})

async function renderHistory() {
  await act(async () => { root.render(<AgentConversation />) })
}

describe('agent conversation history persistence surface', () => {
  it('lists restored conversations and says they live in the local project library', async () => {
    conversationListReply = [{ id: 'conv-1', title: '第一章讨论', mode: 'planning', modelId: null, createdAt: 1_700_000_099_000, updatedAt: 1_700_000_100_000, messageCount: 0 }]
    useAgentStore.setState({
      conversations: [],
      activeConversationId: null,
      showHistory: true,
      historyHydrated: false,
    })
    await renderHistory()
    await act(async () => { await Promise.resolve() })

    await expect.element(page.getByText('第一章讨论')).toBeVisible()
    const source = container.querySelector('[data-agent-history-source]')
    expect(source?.textContent ?? '').toContain('本地项目库')
    expect(source?.textContent ?? '').toContain('重启后仍在')
  })

  it('shows a readable empty state before any conversation is stored', async () => {
    conversationListReply = []
    useAgentStore.setState({
      conversations: [],
      activeConversationId: null,
      showHistory: true,
      historyHydrated: true,
    })
    await renderHistory()

    const empty = container.querySelector('[data-agent-history-empty]')
    expect(empty).not.toBeNull()
    expect(empty?.textContent ?? '').toContain('本地项目库')
    expect(empty?.textContent ?? '').toContain('没有会话记录')
    await expect.element(page.getByText(/新对话会自动保存到本地项目库/)).toBeVisible()
  })

  it('marks the delete affordance as a permanent delete', async () => {
    conversationListReply = [{ id: 'conv-1', title: '第一章讨论', mode: 'planning', modelId: null, createdAt: 1_700_000_099_000, updatedAt: 1_700_000_100_000, messageCount: 0 }]
    useAgentStore.setState({
      conversations: [],
      activeConversationId: null,
      showHistory: true,
      historyHydrated: false,
    })
    await renderHistory()
    await act(async () => { await Promise.resolve() })

    const deleteButton = container.querySelector('button[title*="永久删除"]')
    expect(deleteButton).not.toBeNull()
    expect(deleteButton?.getAttribute('title') ?? '').toContain('本地项目库')
    expect(deleteButton?.getAttribute('title') ?? '').toContain('永久删除')
  })

  it('surfaces a persistence warning instead of pretending everything was saved', async () => {
    conversationListReply = [{ id: 'conv-1', title: '第一章讨论', mode: 'planning', modelId: null, createdAt: 1_700_000_099_000, updatedAt: 1_700_000_100_000, messageCount: 0 }]
    useAgentStore.setState({
      conversations: [],
      activeConversationId: null,
      showHistory: true,
      historyHydrated: false,
    })
    await renderHistory()
    await act(async () => { await Promise.resolve() })
    // 恢复成功会清掉旧的警告，所以这次失败要在恢复之后发生（模拟保存失败的那一刻）。
    await act(async () => { useAgentStore.setState({ lastPersistenceWarning: '追加助手消息' }) })

    const source = container.querySelector('[data-agent-history-source]')
    expect(source?.textContent ?? '').toContain('最近一次保存失败')
    expect(source?.textContent ?? '').toContain('追加助手消息')
  })
})
