import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { onProjectOpened } from '../../services/project-service'
import { useProjectStore } from '../project-store'
import { useAgentStore } from '../agent-store'

const pathA = 'C:\\novels\\A'
const pathB = 'C:\\novels\\B'
const projectA = { id: 'A', sessionLease: 'lease-A', name: 'A', path: pathA, novelConfig: {} }
const projectB = { id: 'B', sessionLease: 'lease-B', name: 'B', path: pathB, novelConfig: {} }
const sessionB = { projectId: 'B', leaseId: 'lease-B', projectPath: pathB }

let invoke: ReturnType<typeof vi.fn>

function stubApi(routes: Record<string, unknown> = {}) {
  invoke = vi.fn(async (channel: string, ...rest: unknown[]) => {
    void rest
    return channel in routes ? routes[channel] : []
  })
  vi.stubGlobal('window', {
    velaAPI: {
      invoke,
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
}

function meta(id: string, title: string) {
  return { id, title, mode: 'planning', modelId: null, createdAt: 1, updatedAt: 2, messageCount: 0 }
}

beforeEach(() => {
  useAgentStore.setState({
    conversations: [],
    activeConversationId: null,
    showHistory: false,
    generating: false,
    activeRequestId: null,
    historyHydrated: false,
    lastPersistenceWarning: null,
    toolsInitialized: true,
  })
  useProjectStore.setState({ currentProject: projectA as never })
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid') })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useProjectStore.setState({ currentProject: null })
})

describe('agent conversations reset through the unified project entry', () => {
  it('resets and restores without any component being mounted', async () => {
    // 项目 A：恢复出一批会话，并让激活指针指向它。
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话')] })
    await useAgentStore.getState().restoreConversations()
    useAgentStore.setState({ activeConversationId: 'conv-a1' })
    expect(useAgentStore.getState().conversations).toHaveLength(1)

    // 切到项目 B：只调用统一入口（project-service），不渲染任何组件。
    useProjectStore.setState({ currentProject: projectB as never })
    stubApi({ 'db:agent-conversation-list': [meta('conv-b1', 'B 的会话')] })
    await onProjectOpened(sessionB)
    // 统一入口用懒加载恢复助手会话（不阻塞项目打开）：等一个微任务让它落地。
    await new Promise(resolve => setTimeout(resolve, 0))

    const state = useAgentStore.getState()
    expect(state.conversations.map(conversation => conversation.id)).toEqual(['conv-b1'])
    // reset 后才可能为 null：恢复本身不会清激活指针。
    expect(state.activeConversationId).toBeNull()
    expect(state.historyHydrated).toBe(true)
  })

  it('settles a pending confirmation when the unified entry runs', async () => {
    stubApi({})
    const resolve = vi.fn()
    useAgentStore.getState().beginToolConfirmation('pending-entry', resolve)

    useProjectStore.setState({ currentProject: projectB as never })
    stubApi({ 'db:agent-conversation-list': [] })
    await onProjectOpened(sessionB)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(resolve).toHaveBeenCalledWith(false)
    expect(useAgentStore.getState().hasPendingConfirmation('pending-entry')).toBe(false)
  })

  it('clears conversations when bindings are disabled (project closed)', async () => {
    const { disableProjectBindingsPreservingDrafts } = await import('../../services/project-service')
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话')] })
    await useAgentStore.getState().restoreConversations()
    expect(useAgentStore.getState().conversations).toHaveLength(1)

    disableProjectBindingsPreservingDrafts(pathA)
    // 该路径用动态 import 加载 agent-store：等一个微任务让 reset 落地。
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(useAgentStore.getState().conversations).toEqual([])
    expect(useAgentStore.getState().historyHydrated).toBe(false)
  })

  it('keeps the component free of a second reset path', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/panels/agent/AgentConversation.tsx'), 'utf8')
    // 统一入口是唯一的重置点；组件只允许调用幂等兜底。
    expect(source).not.toContain('resetAgentConversationsForProjectSwitch')
    expect(source).not.toContain('restoreConversations')
    expect(source).toContain('ensureAgentConversationsRestored')
  })
})
