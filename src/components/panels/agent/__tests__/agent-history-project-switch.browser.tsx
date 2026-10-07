import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useAgentStore } from '../../../../stores/agent-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import AgentConversation from '../AgentConversation'

const projectA = {
  id: 'A', sessionLease: 'lease-A', path: 'C:\\novels\\A', name: 'A', characterStates: '', createdAt: '', updatedAt: '',
  novelConfig: { genre: '奇幻', subGenre: '', targetAudience: '青年', totalChapters: 10, wordsPerChapter: 3000, plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '', worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '' },
}
const projectB = { ...projectA, id: 'B', sessionLease: 'lease-B', path: 'C:\\novels\\B', name: 'B' }

let container: HTMLDivElement
let root: Root
let conversationListReply: unknown[] = []
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function meta(id: string, title: string) {
  return { id, title, mode: 'planning', modelId: null, createdAt: 1, updatedAt: 2, messageCount: 0 }
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: projectA as never })
  useAgentStore.setState({
    conversations: [],
    activeConversationId: null,
    showHistory: true,
    historyHydrated: false,
    lastPersistenceWarning: null,
  })
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
  useProjectStore.setState({ currentProject: null })
  useAgentStore.setState({ conversations: [], activeConversationId: null, showHistory: false, historyHydrated: false, lastPersistenceWarning: null })
})

describe('agent history across a project switch', () => {
  it('shows the new project conversations and never the previous project ones', async () => {
    conversationListReply = [meta('conv-a1', 'A 项目的会话')]
    await act(async () => { root.render(<AgentConversation />) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    await expect.element(page.getByText('A 项目的会话')).toBeVisible()

    // 切到项目 B：重置 + 恢复现在由统一入口（project-service）驱动，
    // 组件不再自己判断项目路径变化——这里模拟统一入口的调用顺序。
    conversationListReply = [meta('conv-b1', 'B 项目的会话')]
    await act(async () => {
      useProjectStore.setState({ currentProject: projectB as never })
      useAgentStore.getState().resetAgentConversationsForProjectSwitch()
    })
    await act(async () => { await useAgentStore.getState().restoreConversations() })

    await expect.element(page.getByText('B 项目的会话')).toBeVisible()
    expect(container.textContent ?? '').not.toContain('A 项目的会话')
    expect(container.querySelector('[data-agent-history-source]')?.textContent ?? '').toContain('本地项目库')
  })
})
