import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRuntime } from '../../services/generation/generation-runtime'
import type { GenerationSession } from '../../services/generation/generation-harness'
import { toolRegistry } from '../../services/agent/tool-registry'
import { useLLMStore } from '../llm-store'
import { useProjectStore } from '../project-store'
import { AGENT_GENERATION_BUDGET, useAgentStore } from '../agent-store'

const generationRuntime = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('../../services/generation/generation-runtime', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/generation/generation-runtime')>(),
  createGenerationRuntime: generationRuntime.create,
}))

const projectPath = 'C:\\novels\\A'
const project = { id: 'main', sessionLease: 'lease-A', name: 'A', path: projectPath, novelConfig: {} }

function completed(content: string, attempt: number) {
  return {
    status: 'completed' as const,
    content,
    finishReason: 'stop' as const,
    receipt: {
      model: { id: 'model-a', configurationRevision: 'r1', endpointFingerprint: 'f1' },
      capabilities: {
        contextWindowTokens: null,
        maxOutputTokens: 2048,
        reasoning: null,
        structuredOutput: null,
        usage: null,
        source: {
          contextWindowTokens: 'unknown' as const,
          maxOutputTokens: 'user-operational-cap' as const,
          featureFlags: 'unknown' as const,
        },
      },
      budget: {
        attempt,
        maxAttempts: 8,
        requestedOutputTokens: 2048,
        cumulativeRequestedOutputTokens: attempt * 2048,
        maxRequestedOutputTokens: 65_536,
        maxRequestedOutputTokensPerAttempt: 8192,
        deadlineAt: Date.now() + 60_000,
      },
      finishReason: 'stop' as const,
    },
  }
}

let invoke: ReturnType<typeof vi.fn>

function stubApi(routes: Record<string, unknown> = {}) {
  invoke = vi.fn(async (channel: string, ...rest: unknown[]) => {
    void rest
    if (channel in routes) return routes[channel]
    if (channel === 'db:agent-conversation-list') return []
    if (channel === 'db:agent-message-append') return { success: true, message: { id: 'm' } }
    if (channel === 'db:agent-conversation-save') return { id: 'c' }
    return []
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

function callsFor(channel: string): unknown[][] {
  return invoke.mock.calls.filter(([name]) => name === channel) as unknown[][]
}

function appendRoles(): string[] {
  return callsFor('db:agent-message-append').map(call => String((call[1] as { message?: { role?: string } })?.message?.role ?? ''))
}

function stubRuntime(complete: GenerationSession['complete']): void {
  const runtime = {
    execute: async (operation: (args: { session: unknown }) => Promise<unknown>) => operation({
      session: {
        complete,
        budget: {
          maxAttempts: AGENT_GENERATION_BUDGET.maxAttempts,
          maxRequestedOutputTokens: AGENT_GENERATION_BUDGET.maxRequestedOutputTokens,
          maxRequestedOutputTokensPerAttempt: AGENT_GENERATION_BUDGET.maxRequestedOutputTokensPerAttempt,
          deadlineAt: Date.now() + AGENT_GENERATION_BUDGET.deadlineMs,
        },
      },
    }),
  } as unknown as GenerationRuntime
  generationRuntime.create.mockResolvedValue(runtime)
}

beforeEach(() => {
  useAgentStore.setState({
    conversations: [],
    activeConversationId: null,
    generating: false,
    activeRequestId: null,
    historyHydrated: false,
    lastPersistenceWarning: null,
    toolsInitialized: true,
  })
  useLLMStore.setState({ defaultModelId: 'model-a' })
  useProjectStore.setState({ currentProject: project as never })
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid') })
})

afterEach(() => {
  generationRuntime.create.mockReset()
  for (const tool of toolRegistry.listAll()) toolRegistry.unregister(tool.name)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useProjectStore.setState({ currentProject: null })
})

describe('agent conversation persistence', () => {
  it('restores conversation metadata from the project library without loading bodies', async () => {
    stubApi({
      'db:agent-conversation-list': [
        { id: 'conv-1', title: '第一章讨论', mode: 'planning', modelId: null, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000, messageCount: 4 },
        { id: 'conv-2', title: '伏笔盘点', mode: 'fast', modelId: 'model-a', createdAt: 1_700_000_200_000, updatedAt: 1_700_000_300_000, messageCount: 2 },
      ],
    })

    await useAgentStore.getState().restoreConversations()

    const state = useAgentStore.getState()
    expect(state.historyHydrated).toBe(true)
    expect(state.conversations.map(conversation => conversation.id)).toEqual(['conv-1', 'conv-2'])
    expect(state.conversations[0]!.title).toBe('第一章讨论')
    expect(state.conversations[0]!.createdAt).toBe(1_700_000_000_000)
    // 列表通道不返回正文：正文在选中时才加载。
    expect(state.conversations.every(conversation => conversation.messages.length === 0)).toBe(true)
    expect(callsFor('db:agent-conversation-list')).toHaveLength(1)
    expect(callsFor('db:agent-conversation-load')).toHaveLength(0)
  })

  it('loads a conversation body on selection exactly once', async () => {
    stubApi({
      'db:agent-conversation-list': [
        { id: 'conv-1', title: '第一章讨论', mode: 'planning', modelId: null, createdAt: 1, updatedAt: 2, messageCount: 1 },
      ],
      'db:agent-conversation-load': {
        conversation: { id: 'conv-1', title: '第一章讨论', mode: 'planning', modelId: null, createdAt: 1, updatedAt: 2, messageCount: 1 },
        messages: [
          { id: 'msg-1', conversationId: 'conv-1', seq: 1, role: 'user', content: '这一章怎么开', toolCalls: null, artifacts: null, createdAt: 3 },
        ],
      },
    })

    await useAgentStore.getState().restoreConversations()
    useAgentStore.getState().selectConversation('conv-1')
    await vi.waitFor(() => {
      expect(useAgentStore.getState().conversations[0]!.messages).toHaveLength(1)
    })
    useAgentStore.getState().selectConversation('conv-1')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(callsFor('db:agent-conversation-load')).toHaveLength(1)
    expect(useAgentStore.getState().conversations[0]!.messages[0]!.content).toBe('这一章怎么开')
    expect(useAgentStore.getState().conversations[0]!.messagesLoaded).toBe(true)
  })

  it('persists the user message immediately but the assistant message only when the round ends', async () => {
    stubApi()
    const complete = vi.fn<GenerationSession['complete']>()
    complete.mockImplementation(async () => {
      // 模型被调用的瞬间：用户消息必须已经落库，助手消息必须还没有（流式期间的增量不落库）。
      expect(appendRoles()).toContain('user')
      expect(appendRoles()).not.toContain('assistant')
      return completed('已经写在草稿里了。', 1)
    })
    stubRuntime(complete)

    useAgentStore.getState().createConversation()
    await useAgentStore.getState().sendMessage('帮我把开头收紧')

    const roles = appendRoles()
    expect(roles).toContain('user')
    expect(roles.filter(role => role === 'assistant')).toHaveLength(1)
    // 首条消息改标题时 upsert 一次元数据；append 自己会刷新 updated_at，之后不再补 save。
    expect(callsFor('db:agent-conversation-save').length).toBeGreaterThanOrEqual(1)
    expect(useAgentStore.getState().conversations[0]!.messages).toHaveLength(2)
  })

  it('keeps the conversation alive and only warns when persistence fails', async () => {
    stubApi({
      'db:agent-message-append': { success: false, error: '磁盘忙' },
    })
    const complete = vi.fn<GenerationSession['complete']>().mockResolvedValue(completed('回复', 1))
    stubRuntime(complete)

    useAgentStore.getState().createConversation()
    await expect(useAgentStore.getState().sendMessage('你好')).resolves.toBeUndefined()

    const state = useAgentStore.getState()
    // 对话本身不受影响：消息仍在内存里、生成状态已复位。
    expect(state.conversations[0]!.messages).toHaveLength(2)
    expect(state.generating).toBe(false)
    // 用户消息与助手消息都会落库失败；记下的是最近一次失败的动作名（末尾是助手消息）。
    expect(['追加用户消息', '追加助手消息', '更新会话元数据']).toContain(state.lastPersistenceWarning)
    expect(state.lastPersistenceWarning).toBe('追加助手消息')
  })
})
