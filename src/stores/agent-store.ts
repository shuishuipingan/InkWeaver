import { create } from 'zustand'
import { buildAgentSystemPrompt } from '../services/agent/context-builder'
import {
  runAgentLoop,
  type ConfigImpactBlueprintProposal,
  type ToolCallInfo,
  type LLMMessage,
  type ToolConfirmationDecision,
} from '../services/agent/agent-engine'
import { registerBuiltinTools } from '../services/agent/tools'
import { skillRegistry } from '../services/agent/skill-registry'
import { parseSlashCommand, parseMentions, mentionsToToolCalls } from '../services/agent/intent-router'
import { toolRegistry } from '../services/agent/tool-registry'
import type { ToolArtifact } from '../services/agent/tool-registry'
import { createAgentExecutionContext } from '../services/agent/tools/project-context'
import { createGenerationRuntime } from '../services/generation/generation-runtime'
import { runtimeLog } from '../services/runtime-log'
import { ipc } from '../services/ipc-client'
import type { AgentConversationMeta, AgentMessageRecord, ProjectSessionContext } from '../shared/ipc-channels'
import { projectSessionContextFromProject } from '../shared/project-session-context'
import { useProjectStore } from './project-store'

export const AGENT_GENERATION_BUDGET = Object.freeze({
  // MAX_TOOL_ROUNDS 的 8 轮之外，上下文压缩摘要也在这份预算内发起请求，
  // 因此调用次数上限要留出压缩余量，让轮次上限先于它生效。
  maxAttempts: 16,
  maxRequestedOutputTokens: 262_144,
  maxRequestedOutputTokensPerAttempt: 131_072,
  deadlineMs: 45 * 60_000,
})

// ===== 类型定义 =====

/** 对话模式：Planning（深度推理）/ Fast（快速执行） */
export type AgentMode = 'planning' | 'fast'

/** 单条消息 */
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  /** 是否正在流式生成中 */
  streaming?: boolean
  /** Tool 调用信息（Agent 回复时） */
  toolCalls?: ToolCallInfo[]
  /** 产物列表（Agent 创建/修改的文件、触发的工作流等） */
  artifacts?: ToolArtifact[]
}

/** 单个会话 */
export interface AgentConversation {
  id: string
  /** 会话标题（取自第一条用户消息前 20 个字符） */
  title: string
  messages: AgentMessage[]
  createdAt: number
  updatedAt: number
  /** 当前会话使用的模式 */
  mode: AgentMode
  /** 当前会话使用的模型 ID（null 表示使用默认） */
  modelId: string | null
  /**
   * 正文是否已从项目库加载（或本来就是本进程新建的空会话）。
   * 列表通道只返回元数据，正文在 selectConversation 时按需 load 一次。
   */
  messagesLoaded?: boolean
}

// ===== Store 状态接口 =====

interface AgentState {
  /** 所有会话列表（最新的排在前面） */
  conversations: AgentConversation[]
  /** 当前活跃会话 ID */
  activeConversationId: string | null
  /** 是否显示历史面板 */
  showHistory: boolean
  /** 全局默认模式 */
  defaultMode: AgentMode
  /** 当前是否正在生成（用于 UI 状态） */
  generating: boolean
  /** 当前流式请求 ID（用于取消） */
  activeRequestId: string | null
  /** Tool 系统是否已初始化 */
  toolsInitialized: boolean

  // ===== 计算属性（Getters） =====
  /** 获取当前活跃会话 */
  getActiveConversation: () => AgentConversation | null

  // ===== Actions =====
  /** 初始化 Tool 系统 */
  initializeTools: () => void
  /** 新建会话并激活 */
  createConversation: () => AgentConversation
  /** 激活指定会话 */
  selectConversation: (id: string) => void
  /** 删除指定会话 */
  deleteConversation: (id: string) => void
  /** 清空所有会话（永久删除：同时删除本地项目库中的记录） */
  clearAll: () => void
  /** 会话是否已从项目库恢复（UI 据此显示「会话已保存在本地项目库」）。 */
  historyHydrated: boolean
  /** 最近一次落库失败的说明；仅供状态展示，不影响对话。 */
  lastPersistenceWarning: string | null
  /**
   * 切换项目时重置助手会话的内存态（必须先重置、再恢复，顺序不能颠倒）。
   * 不变式：助手会话只属于打开中的项目，上一个项目的会话绝不允许活下来。
   */
  resetAgentConversationsForProjectSwitch: () => void
  /** 从项目库恢复会话元数据（统一入口：project-service 在项目打开时调用）。 */
  restoreConversations: () => Promise<void>
  /**
   * 幂等兜底：视图挂载时若还没恢复过就恢复一次。
   * 重置与恢复的**主入口是 project-service**，这里只处理「视图先挂载、项目后打开」的时序，
   * 不参与项目切换判断——避免与统一入口形成两套真相。
   */
  ensureAgentConversationsRestored: () => void
  /** 按需加载某个会话的正文（已加载过则不再请求）。 */
  loadConversationMessages: (id: string) => Promise<void>
  /** 把某条助手消息的当前内存版本落库（幂等；一轮结束时调用）。 */
  persistAssistantMessage: (conversationId: string, messageId: string) => Promise<void>
  /** 切换历史面板 */
  toggleHistory: () => void
  /** 设置历史面板可见性 */
  setShowHistory: (show: boolean) => void
  /** 设置当前会话模式 */
  setMode: (mode: AgentMode) => void
  /** 设置当前会话使用的模型 */
  setModelId: (modelId: string | null) => void
  /** 发送消息（触发 Agent ReAct 循环） */
  sendMessage: (content: string) => Promise<void>
  /** 取消当前生成 */
  cancelGeneration: () => Promise<void>
  /** 响应 Tool 确认（用于 ConfirmCard）；返回 false 表示该确认已失效（没有等待中的 Promise）。 */
  resolveToolConfirmation: (
    toolCallId: string,
    confirmed: boolean,
    options?: { blueprintProposals?: readonly ConfigImpactBlueprintProposal[] },
  ) => boolean
  /**
   * 等待确认的集合发生变化的计数。pendingConfirmations 是模块级 Map（不在 state 里），
   * 组件订阅这个计数再调用 hasPendingConfirmation，才能拿到「这张卡是否还有效」的实时答案。
   */
  pendingConfirmationRevision: number
  /** Agent 运行时登记一次等待用户确认的工具调用。 */
  beginToolConfirmation: (
    toolCallId: string,
    resolve: (decision: boolean | ToolConfirmationDecision) => void,
  ) => void
  /** 该 toolCallId 是否仍在等待确认（读的就是那份 pendingConfirmations）。 */
  hasPendingConfirmation: (toolCallId: string) => boolean
  /** 按拒绝结算并清空所有等待中的确认（取消、超时、测试清理）。 */
  clearPendingConfirmations: () => void
  /**
   * 把一次「改动计划校验失败」作为新的用户回合回注给助手，让模型修正后重新提交。
   * 先按拒绝结算悬挂的确认；助手仍在忙时返回 false（未发送）。
   */
  requestPlanRevision: (toolCallId: string, feedback: string) => Promise<boolean>
}

// ===== 工具函数 =====

/** 「请助手修正此计划」等待当前回合收尾的上限；超时则不发新回合，让作者稍后重试。 */
const AGENT_PLAN_REVISION_IDLE_TIMEOUT_MS = 45_000

/** 轮询等待 Agent 回到空闲；读取函数由调用方注入，避免引用尚未定义的 store。 */
async function waitForAgentIdle(isGenerating: () => boolean, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now()
  while (isGenerating()) {
    if (Date.now() - startedAt >= timeoutMs) return false
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return true
}

/** 生成唯一 ID */
const genId = () => crypto.randomUUID()

/** 从消息内容生成会话标题 */
const generateTitle = (content: string): string => {
  const cleaned = content.replace(/\s+/g, ' ').trim()
  return cleaned.length > 24 ? cleaned.slice(0, 24) + '…' : cleaned
}

/** 生成 /help 命令的帮助文本 */
const generateHelpText = (): string => {
  const toolCount = toolRegistry.listAll().length
  const skillCount = skillRegistry.listAll().length
  const lines: string[] = [
    '## 织墨 AI 助手 — 帮助',
    '',
    '### 可用命令',
    '- `/clear` — 清空当前对话',
    '- `/new` — 开始新对话',
    '- `/help` — 显示此帮助信息',
    '- `/status` — 查看项目状态',
    '',
    '### @ 提及',
    '输入 `@` 可引用项目上下文：故事架构、角色卡、蓝图、知识库等。',
    '',
    '### 可用工具',
    '当前已加载 **' + toolCount + '** 个工具、**' + skillCount + '** 个 Skill。',
    '',
    '### Skill 命令',
  ]
  for (const s of skillRegistry.listAll()) {
    lines.push('- `/' + s.metadata.name + '` — ' + s.metadata.description)
  }
  lines.push('', '有任何创作问题，直接问我即可！')
  return lines.join('\n')
}

// ===== Tool 确认回调管理 =====
/** 存储待确认的 Tool 回调 */
const pendingConfirmations = new Map<string, {
  resolve: (decision: boolean | ToolConfirmationDecision) => void
}>()

/** 当前活跃的 AbortController（用于取消 ReAct 循环） */
let activeAbortController: AbortController | null = null

/**
 * 会话级 system prompt 缓存（缓存命中优化）。
 * 同一会话内 system prompt 字节冻结，避免每轮重建导致 DeepSeek 前缀缓存失效。
 * 会话切换/项目切换时失效重建。
 */
let cachedSystemPrompt: { convId: string; prompt: string } | null = null

/**
 * 当前 Agent 运行的全局兜底定时器。
 *
 * ReAct 循环内部的工具调用与模型请求若因底层 IPC/网络异常而永久挂起，
 * 即使 AbortSignal 已触发也可能无法自行结束。该定时器保证发送消息后的
 * 状态一定能复位（generating=false），避免界面卡在"生成中"。
 */
let activeDeadlineTimer: ReturnType<typeof setTimeout> | null = null

function clearActiveDeadlineTimer(): void {
  if (activeDeadlineTimer !== null) {
    clearTimeout(activeDeadlineTimer)
    activeDeadlineTimer = null
  }
}

// ===== 会话持久化（项目库） =====

/** 当前项目的冻结会话；没有打开项目时助手会话只存在于内存，不落库。 */
function activeProjectSession(): ProjectSessionContext | null {
  return projectSessionContextFromProject(useProjectStore.getState().currentProject)
}

/**
 * 会话恢复的代次。
 * 恢复是异步的：快速连续切换项目时，先发出的请求可能后返回，
 * 必须靠代次判断「这次结果是否已经过期」，否则会把旧项目的会话写进新项目。
 */
let conversationRestoreSequence = 0

/**
 * 会话落库的统一出口。
 *
 * 写入节流：流式生成期间**不落库**（逐条增量会在流式输出时打出成百上千次写），
 * 只在「一轮结束」的三个出口落最终助手消息 —— onDone / onError / cancelGeneration；
 * 用户消息在发送时立即落库。
 *
 * 失败降级：任何落库失败或异常都只记一条 runtimeLog 警告并返回 false，绝不抛出。
 * 对话不依赖持久化，落库失败不能打断作者，UI 也不弹错误（只更新状态提示）。
 */
async function persistAgentState(
  description: string,
  task: () => Promise<{ ok: boolean; error?: string }>,
): Promise<boolean> {
  try {
    const result = await task()
    if (!result.ok) {
      runtimeLog.warn('agent', `会话落库失败：${description}`, { error: result.error ?? '未知原因' })
      return false
    }
    return true
  } catch (error) {
    runtimeLog.warn('agent', `会话落库异常：${description}`, { error: String(error) })
    return false
  }
}

// ===== Zustand Store =====

export const useAgentStore = create<AgentState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  showHistory: false,
  defaultMode: 'planning',
  generating: false,
  activeRequestId: null,
  toolsInitialized: false,
  pendingConfirmationRevision: 0,
  historyHydrated: false,
  lastPersistenceWarning: null,

  getActiveConversation: () => {
    const { conversations, activeConversationId } = get()
    return conversations.find(c => c.id === activeConversationId) ?? null
  },

  initializeTools: () => {
    if (get().toolsInitialized) return
    registerBuiltinTools()
    // 加载 Skill（内置 + 用户 + 项目级）
    skillRegistry.loadAll().catch(e => console.warn('[Agent] Skill 加载失败:', e))
    set({ toolsInitialized: true })
  },

  createConversation: () => {
    // 确保 Tool 已初始化
    get().initializeTools()

    const newConv: AgentConversation = {
      id: genId(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: get().defaultMode,
      // Null means “use the default once when a run starts”; the runtime then
      // freezes the selected lease across the entire ReAct loop.
      modelId: null,
    }
    set(state => ({
      conversations: [newConv, ...state.conversations],
      activeConversationId: newConv.id,
      showHistory: false,
      // 新会话立刻与项目库对齐：元数据马上落库，正文为空。
      historyHydrated: true,
    }))
    const session = activeProjectSession()
    if (session) {
      void persistAgentState('保存会话元数据', async () => {
        const saved = await ipc.invokeWithProjectSession(session, 'db:agent-conversation-save', {
          id: newConv.id,
          title: newConv.title,
          mode: newConv.mode,
          modelId: newConv.modelId,
        }, session.projectPath)
        return { ok: Boolean(saved) }
      }).then(ok => {
        if (!ok) set({ lastPersistenceWarning: '保存会话元数据' })
      })
    }
    return newConv
  },

  selectConversation: (id) => {
    set({ activeConversationId: id, showHistory: false })
    // 正文按需加载：列表通道只给元数据，这里补一次（已加载过则直接返回，不重复请求）。
    void get().loadConversationMessages(id)
  },

  deleteConversation: (id) => {
    set(state => {
      const filtered = state.conversations.filter(c => c.id !== id)
      // 如果删除的是当前会话，激活下一条或 null
      const nextId = state.activeConversationId === id
        ? (filtered[0]?.id ?? null)
        : state.activeConversationId
      return { conversations: filtered, activeConversationId: nextId }
    })
    // 永久删除：连同该会话在本地项目库中的记录一起删除（失败只记警告，不回滚内存状态）。
    const session = activeProjectSession()
    if (session) {
      void persistAgentState('删除会话', async () => {
        const result = await ipc.invokeWithProjectSession(session, 'db:agent-conversation-delete', id, session.projectPath) as { success?: boolean; error?: string }
        return { ok: result?.success === true, error: result?.error }
      }).then(ok => {
        if (!ok) set({ lastPersistenceWarning: '删除会话' })
      })
    }
  },

  clearAll: () => {
    set({ conversations: [], activeConversationId: null })
    // 永久清空：删除本地项目库里本项目的全部助手会话与消息（不触及其它项目）。
    const session = activeProjectSession()
    if (session) {
      void persistAgentState('清空会话', async () => {
        const result = await ipc.invokeWithProjectSession(session, 'db:agent-conversation-clear', session.projectPath) as { success?: boolean; error?: string }
        return { ok: result?.success === true, error: result?.error }
      }).then(ok => {
        if (!ok) set({ lastPersistenceWarning: '清空会话' })
      })
    }
  },

  resetAgentConversationsForProjectSwitch: () => {
    // 悬挂确认属于上一个项目：按拒绝结算并清空（复用既有实现）。
    get().clearPendingConfirmations()
    // 正在进行的生成：中止请求，但**不**写任何「已停止生成」文案——
    // 那些消息属于上一个项目，随这次重置一起丢弃。
    if (activeAbortController) {
      activeAbortController.abort()
      activeAbortController = null
    }
    clearActiveDeadlineTimer()
    // 让在途的恢复结果立即过期。
    conversationRestoreSequence += 1
    set({
      conversations: [],
      activeConversationId: null,
      historyHydrated: false,
      lastPersistenceWarning: null,
      generating: false,
      activeRequestId: null,
    })
  },

  restoreConversations: async () => {
    // 代次：先发出的请求若后返回，必须被丢弃。
    const sequence = ++conversationRestoreSequence
    const session = activeProjectSession()
    if (!session) {
      // 没打开项目：助手会话只存在于内存、不落库，
      // 也不该继续展示上一个项目的内容（同一套「会话属于当前项目」的不变式）。
      set({ conversations: [], activeConversationId: null, historyHydrated: true })
      return
    }
    const requestedProjectPath = session.projectPath
    try {
      const rows = await ipc.invokeWithProjectSession(session, 'db:agent-conversation-list', session.projectPath)
      // 期间又切了项目（或发起了新一轮恢复）：这次结果已经过期，丢弃。
      if (sequence !== conversationRestoreSequence) return
      if (activeProjectSession()?.projectPath !== requestedProjectPath) return
      const metas = (Array.isArray(rows) ? rows : []) as AgentConversationMeta[]
      set(state => {
        const inMemory = new Map(state.conversations.map(conversation => [conversation.id, conversation]))
        const restored: AgentConversation[] = metas.map(meta => {
          const existing = inMemory.get(meta.id)
          if (existing) {
            return {
              ...existing,
              title: meta.title,
              mode: meta.mode as AgentMode,
              modelId: meta.modelId,
              createdAt: meta.createdAt,
              updatedAt: meta.updatedAt,
            }
          }
          return {
            id: meta.id,
            title: meta.title,
            // 列表通道不返回正文：先占位，选中时再 load。
            messages: [],
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
            mode: meta.mode as AgentMode,
            modelId: meta.modelId,
          }
        })
        const restoredIds = new Set(metas.map(meta => meta.id))
        // 不变式：切项目时已先执行过 reset，所以此刻内存里不可能还有别的项目的会话——
        // 这里的 notPersisted 只可能是「同一项目里刚建、还没来得及落库」的会话，按需要保留。
        const notPersisted = state.conversations.filter(conversation => !restoredIds.has(conversation.id) && conversation.messages.length > 0)
        return {
          conversations: [...restored, ...notPersisted],
          historyHydrated: true,
          lastPersistenceWarning: null,
        }
      })
    } catch (error) {
      runtimeLog.warn('agent', '恢复助手会话失败', { error: String(error) })
      set({ historyHydrated: true, lastPersistenceWarning: '恢复会话列表' })
    }
  },

  ensureAgentConversationsRestored: () => {
    if (get().historyHydrated) return
    void get().restoreConversations()
  },

  loadConversationMessages: async (id) => {
    const conversation = get().conversations.find(item => item.id === id)
    if (!conversation) return
    // 只加载一次：已加载过、或本会话在内存里已有消息（例如正在进行的对话）都不再请求。
    if (conversation.messagesLoaded || conversation.messages.length > 0) {
      if (!conversation.messagesLoaded) {
        set(state => ({
          conversations: state.conversations.map(item => (item.id === id ? { ...item, messagesLoaded: true } : item)),
        }))
      }
      return
    }
    const session = activeProjectSession()
    if (!session) return
    try {
      const loaded = await ipc.invokeWithProjectSession(session, 'db:agent-conversation-load', id, session.projectPath) as {
        conversation?: AgentConversationMeta | null
        messages?: AgentMessageRecord[]
      }
      const records = Array.isArray(loaded?.messages) ? loaded.messages : []
      const loadedMessages: AgentMessage[] = records.map(record => ({
        id: record.id,
        role: record.role as AgentMessage['role'],
        content: record.content,
        createdAt: record.createdAt,
        ...(Array.isArray(record.toolCalls) && record.toolCalls.length > 0 ? { toolCalls: record.toolCalls as ToolCallInfo[] } : {}),
        ...(Array.isArray(record.artifacts) && record.artifacts.length > 0 ? { artifacts: record.artifacts as ToolArtifact[] } : {}),
      }))
      set(state => ({
        conversations: state.conversations.map(item => (item.id === id
          ? {
              ...item,
              title: loaded?.conversation?.title ?? item.title,
              updatedAt: loaded?.conversation?.updatedAt ?? item.updatedAt,
              messages: loadedMessages,
              messagesLoaded: true,
            }
          : item)),
      }))
    } catch (error) {
      runtimeLog.warn('agent', '加载会话正文失败', { error: String(error) })
      set(state => ({
        lastPersistenceWarning: '加载会话正文',
        conversations: state.conversations.map(item => (item.id === id ? { ...item, messagesLoaded: true } : item)),
      }))
    }
  },

  /**
   * 一轮结束（onDone / onError / cancelGeneration）时落最终助手消息。
   * 流式期间的增量只更新内存，不落库；同 id 重复 append 在主进程幂等，重复调用安全。
   */
  persistAssistantMessage: async (conversationId, messageId) => {
    const session = activeProjectSession()
    if (!session) return
    const conversation = get().conversations.find(item => item.id === conversationId)
    const message = conversation?.messages.find(item => item.id === messageId)
    if (!conversation || !message) return
    const ok = await persistAgentState('追加助手消息', async () => {
      const result = await ipc.invokeWithProjectSession(session, 'db:agent-message-append', {
        conversationId,
        message: {
          id: message.id,
          role: 'assistant' as const,
          content: message.content,
          createdAt: message.createdAt,
          ...(message.toolCalls && message.toolCalls.length > 0 ? { toolCalls: message.toolCalls } : {}),
          ...(message.artifacts && message.artifacts.length > 0 ? { artifacts: message.artifacts } : {}),
        },
      }, session.projectPath) as { success?: boolean; error?: string }
      return { ok: result?.success === true, error: result?.error }
    })
    // 不再补 save：append 会顺带刷新 updated_at，逐条 save 只会让历史面板顺序自己动。
    if (!ok) set({ lastPersistenceWarning: '追加助手消息' })
  },

  toggleHistory: () => {
    set(state => ({ showHistory: !state.showHistory }))
  },

  setShowHistory: (show) => {
    set({ showHistory: show })
  },

  setMode: (mode) => {
    const conv = get().getActiveConversation()
    if (!conv) {
      set({ defaultMode: mode })
      return
    }
    set(state => ({
      defaultMode: mode,
      conversations: state.conversations.map(c =>
        c.id === conv.id ? { ...c, mode } : c
      ),
    }))
  },

  setModelId: (modelId) => {
    const conv = get().getActiveConversation()
    if (!conv) return
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conv.id ? { ...c, modelId } : c
      ),
    }))
  },

  sendMessage: async (content) => {
    if (!content.trim() || get().generating) return
    runtimeLog.info('agent', '发送消息', { contentChars: content.trim().length })

    // 确保 Tool 已初始化
    get().initializeTools()

    // ===== P0-4: / 命令拦截 =====
    const trimmedContent = content.trim()
    if (trimmedContent.startsWith('/')) {
      const { command, args } = parseSlashCommand(trimmedContent)
      if (command) {
        switch (command.name) {
          case 'clear': {
            const activeConv = get().getActiveConversation()
            if (activeConv) {
              set(state => ({
                conversations: state.conversations.map(c =>
                  c.id === activeConv.id ? { ...c, messages: [] } : c
                ),
              }))
            }
            return
          }
          case 'new':
            get().createConversation()
            return
          case 'help': {
            // 构造帮助信息作为系统消息
            const helpConv = get().getActiveConversation() ?? get().createConversation()
            const helpMsg: AgentMessage = {
              id: genId(), role: 'assistant', content: generateHelpText(), createdAt: Date.now(),
            }
            set(state => ({
              conversations: state.conversations.map(c =>
                c.id === helpConv.id ? { ...c, messages: [...c.messages, helpMsg] } : c
              ),
            }))
            return
          }
          case 'status': {
            // /status → 直接将 read_project_state 的结果展示
            // 不拦截，作为普通消息让 Agent 处理（它会调用 read_project_state）
            break
          }
          default:
            // Skill 命令：把 Skill 内容注入到用户消息中
            if (command.source === 'skill' && command.skill) {
              let skillContent = command.skill.content
              if (args) {
                skillContent = skillContent.replace(/\$\{args\}/g, args).replace(/\$1/g, args)
              }
              // 改写 content：用户意图 + Skill 指令拼接
              content = `[用户使用了 Skill: ${command.skill.metadata.displayName ?? command.name}]\n\n用户输入: ${args || '(无额外参数)'}\n\n---\n\n${skillContent}`
            }
            break
        }
      }
    }

    // 确保有活跃会话（无则创建）
    let conv = get().getActiveConversation()
    if (!conv) {
      conv = get().createConversation()
    }
    const convId = conv.id

    // 构建用户消息
    const userMsg: AgentMessage = {
      id: genId(),
      role: 'user',
      content: content.trim(),
      createdAt: Date.now(),
    }

    // 构建占位助手消息（ReAct 循环中实时更新）
    const assistantMsg: AgentMessage = {
      id: genId(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      streaming: true,
      toolCalls: [],
      artifacts: [],
    }

    // 更新会话标题（取第一条用户消息）
    const isFirstMsg = conv.messages.length === 0
    const newTitle = isFirstMsg ? generateTitle(content) : conv.title

    // 把用户消息 + 空助手消息写入会话
    set(state => ({
      generating: true,
      conversations: state.conversations.map(c =>
        c.id === convId
          ? {
              ...c,
              title: newTitle,
              messages: [...c.messages, userMsg, assistantMsg],
              updatedAt: Date.now(),
            }
          : c
      ),
    }))

    // 用户消息在发送时立即落库；助手消息要等一轮结束（onDone / onError / cancelGeneration）。
    const persistSession = activeProjectSession()
    if (persistSession) {
      void persistAgentState('追加用户消息', async () => {
        const result = await ipc.invokeWithProjectSession(persistSession, 'db:agent-message-append', {
          conversationId: convId,
          message: {
            id: userMsg.id,
            role: 'user' as const,
            content: userMsg.content,
            createdAt: userMsg.createdAt,
          },
        }, persistSession.projectPath) as { success?: boolean; error?: string }
        return { ok: result?.success === true, error: result?.error }
      }).then(ok => {
        if (!ok) set({ lastPersistenceWarning: '追加用户消息' })
      })
    }

    // 首条消息会把标题从「新对话」改成真实标题：这是唯一需要补 save 的时机。
    if (isFirstMsg && persistSession) {
      void persistAgentState('更新会话元数据', async () => {
        const saved = await ipc.invokeWithProjectSession(persistSession, 'db:agent-conversation-save', {
          id: convId,
          title: newTitle,
          mode: conv.mode,
          modelId: conv.modelId,
        }, persistSession.projectPath)
        return { ok: Boolean(saved) }
      }).then(ok => {
        if (!ok) set({ lastPersistenceWarning: '更新会话元数据' })
      })
    }

    // 辅助函数：更新助手消息
    const updateAssistantMsg = (updater: (msg: AgentMessage) => AgentMessage) => {
      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMsg.id ? updater(m) : m
                ),
              }
            : c
        ),
      }))
    }

    try {
      const currentConv = get().conversations.find(c => c.id === convId)!
      const modelId = currentConv.modelId ?? undefined

      // @ 引用预取和随后 ReAct 循环必须共享同一个项目 lease。
      const executionContext = createAgentExecutionContext(modelId)
      // 系统提示词、@ 引用预取和随后 ReAct 循环必须共享同一个项目 lease。
      // 同一会话内缓存 system prompt（字节冻结），避免每轮重建破坏前缀缓存。
      let systemPrompt: string
      if (cachedSystemPrompt && cachedSystemPrompt.convId === convId) {
        systemPrompt = cachedSystemPrompt.prompt
      } else {
        systemPrompt = buildAgentSystemPrompt(currentConv.mode, executionContext)
        cachedSystemPrompt = { convId, prompt: systemPrompt }
      }

      // ===== P1-5: @ 提及预取 =====
      let enrichedUserMessage = content.trim()
      const mentions = parseMentions(enrichedUserMessage)
      if (mentions.length > 0) {
        const prefetchCalls = mentionsToToolCalls(mentions)
        const prefetchResults: string[] = []
        for (const call of prefetchCalls) {
          const tool = toolRegistry.get(call.toolName)
          if (tool) {
            try {
              const result = await tool.execute(call.args, executionContext)
              if (result.success && result.content) {
                prefetchResults.push(`[预加载上下文 @${call.toolName}]\n${result.content}`)
              }
            } catch {
              // 预取失败不阻塞主流程
            }
          }
        }
        if (prefetchResults.length > 0) {
          enrichedUserMessage = `${enrichedUserMessage}\n\n---\n以下是用户 @ 引用的上下文数据（已自动获取）：\n\n${prefetchResults.join('\n\n---\n\n')}`
        }
      }

      // 构造历史消息（取最近 16 条非流式消息）
      const historyMessages: LLMMessage[] = currentConv.messages
        .filter(m => !m.streaming && m.role !== 'system')
        .slice(-16)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      // AbortController 用于取消（P1-7: 提升到模块级变量以便 cancelGeneration 访问）
      const abortController = new AbortController()
      activeAbortController = abortController
      set({ activeRequestId: assistantMsg.id })

      // 全局兜底：整个 ReAct 循环必须在预算截止时间内结束，否则强制复位。
      clearActiveDeadlineTimer()
      activeDeadlineTimer = setTimeout(() => {
        abortController.abort()
        get().clearPendingConfirmations()
        if (activeAbortController === abortController) activeAbortController = null
        updateAssistantMsg(m => ({
          ...m,
          content: (m.content || '') + '\n\n_（生成超时，已自动停止）_',
          streaming: false,
        }))
        set({ generating: false, activeRequestId: null })
      }, AGENT_GENERATION_BUDGET.deadlineMs)

      // 整个 ReAct 循环只冻结一个模型租约和一份调用/token/deadline预算。
      runtimeLog.info('agent', '创建生成运行时', { modelId: modelId ?? '(default)' })
      const runtime = await createGenerationRuntime({
        ...(modelId ? { modelId } : {}),
        budget: AGENT_GENERATION_BUDGET,
      })
      await runtime.execute(async ({ session }) => runAgentLoop(
        systemPrompt,
        historyMessages,
        enrichedUserMessage,
        modelId,
        async (messages) => {
          const outcome = await session.complete({
            purpose: 'agent',
            reasoningStage: 'general',
            output: 'visible-text',
            messages: messages.map(message => ({
              role: message.role,
              content: message.content,
            })),
          }, { signal: abortController.signal })
          if (outcome.status !== 'completed') {
            switch (outcome.finishReason) {
              case 'length': {
                // 输出达到长度上限：把已生成的内容交还循环继续。
                // 若一个字都没产出（纯思考耗尽），注入提示让模型在下一轮精简。
                const partial = outcome.content?.trim() ?? ''
                if (!partial) {
                  return '[系统提示：上一轮输出因达到长度上限而中断，且未产出任何内容。请在下一轮回复中显著精简输出长度：只输出最关键的信息，避免长篇规划，直接给出结论。]'
                }
                return partial + '\n\n[系统提示：以上内容因达到输出长度上限而被截断。请在下一轮回复中精简输出，不要重复已输出的内容。]'
              }
              case 'content_filter':
                throw new Error('AI 输出因内容限制而未完成，未将不完整内容写入对话或执行工具。')
              default:
                throw new Error('AI 未正常完成生成，未将不完整内容写入对话或执行工具。')
            }
          }
          return outcome.content
        },
        {
          onTextChunk: (chunk) => {
            // 清理所有形式的 tool_call/tool_result 标签（完整对 + 孤立片段）
            const cleaned = chunk
              .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
              .replace(/<\/?tool_call>/g, '')
              .replace(/<\/?tool_result[^>]*>/g, '')
              .trim()
            if (!cleaned) return
            updateAssistantMsg(m => ({
              ...m,
              content: m.content + cleaned,
            }))
          },
          onToolCallStart: (toolCall) => {
            updateAssistantMsg(m => ({
              ...m,
              toolCalls: [...(m.toolCalls ?? []), toolCall],
            }))
          },
          onToolCallComplete: (toolCall) => {
            updateAssistantMsg(m => ({
              ...m,
              toolCalls: (m.toolCalls ?? []).map(tc =>
                tc.id === toolCall.id ? toolCall : tc
              ),
            }))
          },
          onToolCallConfirmRequired: (toolCall) => {
            // 更新 UI 显示确认状态
            updateAssistantMsg(m => ({
              ...m,
              toolCalls: (m.toolCalls ?? []).map(tc =>
                tc.id === toolCall.id ? { ...tc, status: 'waiting_confirm' as const } : tc
              ),
            }))

            // 返回 Promise，等待用户通过 resolveToolConfirmation 响应
            return new Promise<boolean | ToolConfirmationDecision>((resolve) => {
              // 通过 store 方法登记：确认集合一变化，失效的卡片就能立刻看到禁用原因。
              get().beginToolConfirmation(toolCall.id, resolve)
            })
          },
          onDone: (fullText, toolCalls, artifacts) => {
            // 最终文本全量清洗，去除所有形式的 tool_call / tool_result 标签
            const cleanedText = fullText
              .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
              .replace(/<tool_result[\s\S]*?<\/tool_result>/g, '')
              .replace(/<\/?tool_call>/g, '')
              .replace(/<\/?tool_result[^>]*>/g, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
            clearActiveDeadlineTimer()
            updateAssistantMsg(m => ({
              ...m,
              content: cleanedText,
              streaming: false,
              toolCalls,
              artifacts: artifacts.length > 0 ? artifacts : undefined,
            }))
            set(state => ({
              generating: false,
              activeRequestId: null,
              conversations: state.conversations.map(c =>
                c.id === convId ? { ...c, updatedAt: Date.now() } : c
              ),
            }))
            // 一轮在这里结束：落最终助手消息（流式期间的增量从未落库）。
            void get().persistAssistantMessage(convId, assistantMsg.id)
          },
          onError: (error) => {
            clearActiveDeadlineTimer()
            updateAssistantMsg(m => ({
              ...m,
              content: `❌ 生成失败：${error}`,
              streaming: false,
            }))
            set({ generating: false, activeRequestId: null })
            // 失败也是一轮的结束：把已经产出的内容落库，便于下次打开时看到。
            void get().persistAssistantMessage(convId, assistantMsg.id)
          },
        },
        abortController.signal,
        executionContext,
        async (messages) => {
          // 上下文压缩摘要：用当前模型把最旧的几轮消息压缩为交接摘要。
          // 采用 OpenAI Codex 的 "CONTEXT CHECKPOINT COMPACTION" 语义。
          // 缓存优化：复用会话主 system prompt（字节冻结）作为前缀，压缩指令
          // 作为消息末尾的 user 指令追加——这样摘要请求能命中主对话的稳定前缀
          // （system prompt + 历史），而不是从全新 system prompt 开始（100% miss）。
          // 失败/不可用时返回 null，压缩逻辑会跳过摘要步骤。
          try {
            const outcome = await session.complete({
              purpose: 'agent-context-compaction',
              reasoningStage: 'low' as never,
              output: 'visible-text',
              messages: [
                {
                  role: 'system',
                  content: systemPrompt,
                },
                ...messages,
                {
                  role: 'user',
                  content: [
                    '[CONTEXT CHECKPOINT COMPACTION 请求]',
                    '请把上面的早期对话压缩为一份交接摘要（给后续模型继续工作使用）。',
                    '',
                    'Include:',
                    '- 当前进度和关键决策',
                    '- 重要上下文、约束和用户偏好',
                    '- 剩余工作与明确的下一步',
                    '- 任何继续所需的关键数据、示例或引用',
                    '- 所有已确认的角色名和事实',
                    '',
                    'Be concise, structured. 只输出摘要正文，不要解释或开场白。',
                  ].join('\n'),
                },
              ],
            }, { signal: abortController.signal })
            if (outcome.status !== 'completed') return null
            const text = outcome.content?.trim()
            return text && text.length > 0 && text.length < 4000 ? text : null
          } catch {
            return null
          }
        },
      ))
    } catch (error) {
      clearActiveDeadlineTimer()
      runtimeLog.error('agent', 'Agent 运行异常', { error: String(error) })
      updateAssistantMsg(m => ({
        ...m,
        content: `❌ 发生异常：${String(error)}`,
        streaming: false,
      }))
      set({ generating: false, activeRequestId: null })
    }
  },

  cancelGeneration: async () => {
    runtimeLog.warn('agent', '用户取消生成')
    clearActiveDeadlineTimer()
    // P1-7: 触发 AbortSignal，使 ReAct 循环真正中止
    if (activeAbortController) {
      activeAbortController.abort()
      activeAbortController = null
    }

    // P1-8: 清理所有等待确认的 Promise（取消时默认拒绝），并让失效卡片立即进入过期态
    get().clearPendingConfirmations()

    // 找到正在 streaming 的消息：先记下它们，关闭状态后再把最终内容落库。
    const streamingTargets = get().conversations.flatMap(conversation =>
      conversation.messages
        .filter(message => message.streaming)
        .map(message => ({ conversationId: conversation.id, messageId: message.id })),
    )
    set(state => ({
      generating: false,
      activeRequestId: null,
      conversations: state.conversations.map(c => ({
        ...c,
        messages: c.messages.map(m =>
          m.streaming ? { ...m, streaming: false, content: m.content + '\n\n_（已停止生成）_' } : m
        ),
      })),
    }))
    // 取消同样是一轮的结束：把被中止的助手消息按最终内容落库（同 id 重复 append 幂等）。
    for (const target of streamingTargets) {
      void get().persistAssistantMessage(target.conversationId, target.messageId)
    }
  },

  resolveToolConfirmation: (toolCallId, confirmed, options) => {
    const pending = pendingConfirmations.get(toolCallId)
    // 找不到等待中的 Promise 说明这张卡已经失效（生成超时/被取消/已结算）；
    // 返回 false 让调用方可以据此给出反馈，而不是静默吞掉点击。
    if (!pending) return false
    pending.resolve(confirmed && options?.blueprintProposals?.length
      ? { confirmed: true, blueprintProposals: options.blueprintProposals }
      : confirmed)
    pendingConfirmations.delete(toolCallId)
    set(state => ({ pendingConfirmationRevision: state.pendingConfirmationRevision + 1 }))
    return true
  },

  beginToolConfirmation: (toolCallId, resolve) => {
    pendingConfirmations.set(toolCallId, { resolve })
    set(state => ({ pendingConfirmationRevision: state.pendingConfirmationRevision + 1 }))
  },

  hasPendingConfirmation: (toolCallId) => pendingConfirmations.has(toolCallId),

  clearPendingConfirmations: () => {
    for (const [, pending] of pendingConfirmations) {
      pending.resolve(false)
    }
    pendingConfirmations.clear()
    set(state => ({ pendingConfirmationRevision: state.pendingConfirmationRevision + 1 }))
  },

  requestPlanRevision: async (toolCallId, feedback) => {
    // 悬挂的确认先按「拒绝」结算：这次修正是一个新的助手回合，不能留着永远不落的 Promise。
    get().resolveToolConfirmation(toolCallId, false)
    // 拒绝会让 ReAct 循环继续；等它回到空闲再发送，避免与正在进行的循环抢同一会话。
    const idle = await waitForAgentIdle(() => get().generating, AGENT_PLAN_REVISION_IDLE_TIMEOUT_MS)
    if (!idle) return false
    // 不 await 整个回合：生成进度交给既有的流式状态驱动 UI。
    void get().sendMessage(feedback)
    return true
  },
}))
