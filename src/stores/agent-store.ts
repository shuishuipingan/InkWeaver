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

export const AGENT_GENERATION_BUDGET = Object.freeze({
  maxAttempts: 8,
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
  /** 清空所有会话 */
  clearAll: () => void
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
  /** 响应 Tool 确认（用于 ConfirmCard） */
  resolveToolConfirmation: (
    toolCallId: string,
    confirmed: boolean,
    options?: { blueprintProposals?: readonly ConfigImpactBlueprintProposal[] },
  ) => void
}

// ===== 工具函数 =====

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

// ===== Zustand Store =====

export const useAgentStore = create<AgentState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  showHistory: false,
  defaultMode: 'planning',
  generating: false,
  activeRequestId: null,
  toolsInitialized: false,

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
    }))
    return newConv
  },

  selectConversation: (id) => {
    set({ activeConversationId: id, showHistory: false })
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
  },

  clearAll: () => {
    set({ conversations: [], activeConversationId: null })
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
        for (const [, pending] of pendingConfirmations) {
          pending.resolve(false)
        }
        pendingConfirmations.clear()
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
              pendingConfirmations.set(toolCall.id, { resolve })
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
          },
          onError: (error) => {
            clearActiveDeadlineTimer()
            updateAssistantMsg(m => ({
              ...m,
              content: `❌ 生成失败：${error}`,
              streaming: false,
            }))
            set({ generating: false, activeRequestId: null })
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

    // P1-8: 清理所有等待确认的 Promise，防止内存泄漏
    for (const [, pending] of pendingConfirmations) {
      pending.resolve(false) // 取消时默认拒绝
    }
    pendingConfirmations.clear()

    // 找到正在 streaming 的消息，关闭其状态
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
  },

  resolveToolConfirmation: (toolCallId, confirmed, options) => {
    const pending = pendingConfirmations.get(toolCallId)
    if (pending) {
      pending.resolve(confirmed && options?.blueprintProposals?.length
        ? { confirmed: true, blueprintProposals: options.blueprintProposals }
        : confirmed)
      pendingConfirmations.delete(toolCallId)
    }
  },
}))
