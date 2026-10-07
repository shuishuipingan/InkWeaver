import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectStore } from '../project-store'
import { useAgentStore } from '../agent-store'

const projectA = { id: 'A', sessionLease: 'lease-A', name: 'A', path: 'C:\\novels\\A', novelConfig: {} }
const projectB = { id: 'B', sessionLease: 'lease-B', name: 'B', path: 'C:\\novels\\B', novelConfig: {} }

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
  return invoke
}

function meta(id: string, title: string) {
  return { id, title, mode: 'planning', modelId: null, createdAt: 1, updatedAt: 2, messageCount: 0 }
}

function conversationIds(): string[] {
  return useAgentStore.getState().conversations.map(conversation => conversation.id)
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

describe('agent conversations are scoped to the open project', () => {
  it('never carries the previous project conversations into the next project', async () => {
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话一'), meta('conv-a2', 'A 的会话二')] })
    await useAgentStore.getState().restoreConversations()
    expect(conversationIds()).toEqual(['conv-a1', 'conv-a2'])

    // 切到项目 B：先重置内存，再从 B 的库恢复。
    useProjectStore.setState({ currentProject: projectB as never })
    useAgentStore.getState().resetAgentConversationsForProjectSwitch()
    stubApi({ 'db:agent-conversation-list': [meta('conv-b1', 'B 的会话')] })
    await useAgentStore.getState().restoreConversations()

    expect(conversationIds()).toEqual(['conv-b1'])
    expect(conversationIds()).not.toContain('conv-a1')
    expect(conversationIds()).not.toContain('conv-a2')
  })

  it('clears the active conversation and hydration flag on reset', async () => {
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话')] })
    await useAgentStore.getState().restoreConversations()
    useAgentStore.setState({ activeConversationId: 'conv-a1', lastPersistenceWarning: '追加助手消息' })
    expect(useAgentStore.getState().historyHydrated).toBe(true)

    useAgentStore.getState().resetAgentConversationsForProjectSwitch()

    const state = useAgentStore.getState()
    expect(state.conversations).toEqual([])
    expect(state.activeConversationId).toBeNull()
    expect(state.historyHydrated).toBe(false)
    expect(state.lastPersistenceWarning).toBeNull()
  })

  it('settles a pending tool confirmation as refused when the project switches', () => {
    const resolve = vi.fn()
    useAgentStore.getState().beginToolConfirmation('pending-1', resolve)
    expect(useAgentStore.getState().hasPendingConfirmation('pending-1')).toBe(true)

    useAgentStore.getState().resetAgentConversationsForProjectSwitch()

    expect(resolve).toHaveBeenCalledWith(false)
    expect(useAgentStore.getState().hasPendingConfirmation('pending-1')).toBe(false)
  })

  it('drops a stale restore result when projects switch faster than the reads return', async () => {
    let resolveOld: (value: unknown) => void = () => {}
    const slowProjectARead = new Promise(resolve => { resolveOld = resolve })
    stubApi({ 'db:agent-conversation-list': slowProjectARead })
    const pendingOldRestore = useAgentStore.getState().restoreConversations()

    // 在 A 的读取返回之前切到 B，并发起新一轮恢复。
    useProjectStore.setState({ currentProject: projectB as never })
    useAgentStore.getState().resetAgentConversationsForProjectSwitch()
    stubApi({ 'db:agent-conversation-list': [meta('conv-b1', 'B 的会话')] })
    await useAgentStore.getState().restoreConversations()
    expect(conversationIds()).toEqual(['conv-b1'])

    // A 的旧请求现在才返回：结果必须被丢弃。
    resolveOld([meta('conv-a1', 'A 的会话')])
    await pendingOldRestore

    expect(conversationIds()).toEqual(['conv-b1'])
    expect(conversationIds()).not.toContain('conv-a1')
  })

  it('keeps a not-yet-persisted conversation created in the same project', async () => {
    stubApi({ 'db:agent-conversation-list': [meta('conv-lib', '库里的会话')] })
    useAgentStore.setState({
      conversations: [{
        id: 'conv-local',
        title: '刚建还没落库',
        messages: [{ id: 'm1', role: 'user', content: '你好', createdAt: 1 }],
        createdAt: 1,
        updatedAt: 2,
        mode: 'planning',
        modelId: null,
      }],
      activeConversationId: 'conv-local',
    })

    await useAgentStore.getState().restoreConversations()

    // 同项目：未落库的新会话必须保留下来（这条能力不能被修掉）。
    expect(conversationIds()).toContain('conv-local')
    expect(conversationIds()).toContain('conv-lib')
  })

  it('does not keep showing anything when no project is open', async () => {
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话')] })
    await useAgentStore.getState().restoreConversations()
    expect(conversationIds()).toEqual(['conv-a1'])

    const callsBeforeSwitch = invoke.mock.calls.filter(([channel]) => channel === 'db:agent-conversation-list').length
    useProjectStore.setState({ currentProject: null })
    useAgentStore.getState().resetAgentConversationsForProjectSwitch()
    await useAgentStore.getState().restoreConversations()

    expect(conversationIds()).toEqual([])
    expect(useAgentStore.getState().historyHydrated).toBe(true)
    // 没有打开项目时不再触达库（切换后的 list 调用次数没有增加）。
    const callsAfterSwitch = invoke.mock.calls.filter(([channel]) => channel === 'db:agent-conversation-list').length
    expect(callsAfterSwitch).toBe(callsBeforeSwitch)
  })
})
