/**
 * Agent 核心引擎 — ReAct（Reasoning + Acting）循环
 *
 * 这是 Agent 的大脑，负责：
 * 1. 将用户消息、系统提示、Tool 描述组装为 LLM 输入
 * 2. 解析 LLM 输出中的 <tool_call> 标签
 * 3. 执行 Tool 并将结果注入为 observation
 * 4. 循环直到 LLM 不再调用 Tool 或达到最大循环次数
 *
 * 参考 Claude Code 的 query.ts 和 QueryEngine 设计，
 * 但简化为 InkWeaver 的 Electron + React 架构。
 */

import {
  toolRegistry,
  type AgentExecutionContext,
  type ToolResult,
  type ToolArtifact,
} from './tool-registry'
import { runtimeLog } from '../../services/runtime-log'
import { createAgentExecutionContext } from './tools/project-context'

// ===== 常量 =====

/** ReAct 循环最大次数（防止死循环） */
const MAX_TOOL_ROUNDS = 8

/** Tool 执行超时（毫秒） */
const TOOL_TIMEOUT_MS = 30_000

/** Tool 返回内容最大长度（字符） */
const TOOL_RESULT_MAX_CHARS = 8000

/**
 * Agent 上下文压缩阈值（字符）。
 * 当消息总长度超过该值时，最早轮次的工具结果会被压缩为摘要，
 * 防止上下文无限滚雪球（变慢变贵，甚至触发输出长度问题）。
 */
const AGENT_CONTEXT_MAX_CHARS = 100_000

/**
 * 工具结果修剪预算（字符），借鉴 DeepSeek Harness 的 tool-result-pruner：
 * 保留头部 + 省略标记 + 尾部，而不是只保留头部。
 * 尾部对角色列表/章节清单等场景很重要——被截断的中间往往是重复的条目，
 * 而开头和结尾通常包含关键信息（如总数、最后条目）。
 */
const AGENT_PRUNE_HEAD_CHARS = 2000
const AGENT_PRUNE_TAIL_CHARS = 1000
const AGENT_PRUNE_MARKER = '\n\n…（旧工具结果已修剪，原始 {total} 字符）\n\n'
/**
 * 压缩 messages 中最旧的非系统内容，控制上下文体积。
 *
 * 策略：从最旧的 user 消息开始，把 tool_result 内容替换为截断摘要
 * （保留工具名与开头关键内容），并给 assistant 的 tool_call 部分做同样处理。
 * 仅在总字符超过 AGENT_CONTEXT_MAX_CHARS 时触发，保证普通对话不受影响。
 */
async function compressContextIfNeeded(
  messages: LLMMessage[],
  contextSummarizer?: (messages: LLMMessage[]) => Promise<string | null>,
): Promise<void> {
  let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  if (totalChars <= AGENT_CONTEXT_MAX_CHARS) return

  runtimeLog.info('agent', '触发上下文压缩', {
    totalChars,
    threshold: AGENT_CONTEXT_MAX_CHARS,
    messageCount: messages.length,
  })

  // 从最旧到最新压缩 user 消息（跳过第一条原始用户消息，它是任务描述）
  for (let i = 1; i < messages.length && totalChars > AGENT_CONTEXT_MAX_CHARS; i += 1) {
    const message = messages[i]
    if (message.role !== 'user' || message.content.includes('以下是用户 @ 引用的上下文数据')) {
      continue
    }
    const original = message.content
    // 仅压缩包含 tool_result 的消息（旧工具输出）
    if (!original.includes('<tool_result')) continue
    const compressed = compressToolResultMessage(original)
    if (compressed.length >= original.length) continue
    totalChars = totalChars - original.length + compressed.length
    messages[i] = { ...message, content: compressed }
  }

  // 如果还不够，压缩最旧的 assistant 消息中的 tool_call 部分
  for (let i = 1; i < messages.length && totalChars > AGENT_CONTEXT_MAX_CHARS; i += 1) {
    const message = messages[i]
    if (message.role !== 'assistant' || !message.content.includes('<tool_call>')) continue
    const original = message.content
    // 只保留文本部分，去掉 tool_call XML（旧轮次的调用已无意义）
    const cleaned = original
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '（旧工具调用已压缩）')
      .replace(/<\/?tool_call>/g, '')
      .trim()
    if (cleaned.length >= original.length) continue
    totalChars = totalChars - original.length + cleaned.length
    messages[i] = { ...message, content: cleaned }
  }

  // 纯文本修剪后仍超限：用 LLM 摘要压缩最旧的非系统内容（如可用）。
  if (totalChars > AGENT_CONTEXT_MAX_CHARS && contextSummarizer) {
    const summarized = await summarizeOldestWithLLM(messages, contextSummarizer)
    if (summarized) {
      runtimeLog.info('agent', 'LLM 摘要压缩完成', {
        totalCharsAfter: messages.reduce((sum, m) => sum + m.content.length, 0),
      })
    }
  } else if (totalChars > AGENT_CONTEXT_MAX_CHARS) {
    runtimeLog.warn('agent', '上下文仍超限，但无摘要器可用', {
      totalCharsAfter: messages.reduce((sum, m) => sum + m.content.length, 0),
    })
  }

  runtimeLog.info('agent', '上下文压缩完成', {
    totalCharsAfter: messages.reduce((sum, m) => sum + m.content.length, 0),
  })
}

/**
 * 压缩后摘要注入时的框架前缀（借鉴 OpenAI Codex 的 SUMMARY_PREFIX）。
 * 明确告诉后续模型：这是另一个模型对早期工作的交接摘要，应基于它继续，
 * 而不是当作新的用户指令。
 */
const COMPACTED_SUMMARY_PREFIX =
  '以下是本任务早期对话的交接摘要（由压缩机制生成，用于替代已被压缩的早期轮次）。请基于此摘要继续工作，避免重复已完成的工作：'

/**
 * 用 LLM 把最旧的一批非系统消息压缩成交接摘要（OpenAI Codex 风格）。
 * 返回 true 表示压缩成功。摘要会作为新的 user 消息替换最旧的消息，
 * 并保留最近的真实用户消息（保护用户最新意图）。
 */
async function summarizeOldestWithLLM(
  messages: LLMMessage[],
  summarizer: (msgs: LLMMessage[]) => Promise<string | null>,
): Promise<boolean> {
  // 找最旧的非系统连续消息段（跳过第一条用户任务描述）
  const startIndex = 1
  if (messages.length - startIndex < 3) return false

  // 保护最近的用户消息：最多压缩到倒数第 2 条 user 消息之前
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= startIndex; i -= 1) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }
  const maxCompressEnd = lastUserIndex > startIndex + 2
    ? lastUserIndex - 1
    : startIndex + 6

  const oldest = messages.slice(startIndex, Math.min(maxCompressEnd, startIndex + 8))
  if (oldest.every((m) => m.content.length < 500)) return false // 都太小，不值得摘要

  const summary = await summarizer(oldest)
  if (!summary || !summary.trim()) return false

  const summaryText = summary.trim()
  const compressed = messages.filter((_, i) => i < startIndex || i >= startIndex + oldest.length)
  compressed.splice(startIndex, 0, {
    role: 'user',
    content: `[早期对话已压缩]\n${COMPACTED_SUMMARY_PREFIX}\n<compacted-summary>\n${summaryText}\n</compacted-summary>`,
  })
  messages.splice(0, messages.length, ...compressed)
  return true
}

/**
 * 修剪一条 tool_result 消息：超长结果保留头部 + 尾部，中间用省略标记。
 * 借鉴 DeepSeek Harness tool-result-pruner 的 head+marker+tail 策略。
 * 代码点切片不会切断 UTF-16 代理对。
 */
function compressToolResultMessage(content: string): string {
  const resultRegex = /<tool_result([^>]*)>\n([\s\S]*?)\n<\/tool_result>/g
  const replaced = content.replace(resultRegex, (whole, attrs, body) => {
    const bodyTrimmed = body.trim()
    if (bodyTrimmed.length <= AGENT_PRUNE_HEAD_CHARS + AGENT_PRUNE_TAIL_CHARS) return whole
    const head = sliceCodePoints(bodyTrimmed, 0, AGENT_PRUNE_HEAD_CHARS)
    const tail = sliceCodePoints(bodyTrimmed, bodyTrimmed.length - AGENT_PRUNE_TAIL_CHARS)
    const marker = AGENT_PRUNE_MARKER.replace('{total}', String(bodyTrimmed.length))
    return `<tool_result${attrs}>\n${head}${marker}${tail}\n</tool_result>`
  })
  return replaced
}

/** 按 Unicode 码点切片，避免切断代理对。 */
function sliceCodePoints(text: string, start: number, end?: number): string {
  const points = Array.from(text)
  return points.slice(start, end).join('')
}


// ===== 类型 =====

/** Tool 调用信息 */
export interface ToolCallInfo {
  id: string
  toolName: string
  arguments: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_confirm'
  result?: string
  error?: string
  /** Tool 来源标记 */
  source?: string
  /** Frozen project identity used to render and execute a confirmed domain proposal. */
  projectSession?: AgentExecutionContext['projectSession']
}

/** One optional blueprint diff selected from a transient novel-config impact preview. */
export interface ConfigImpactBlueprintProposal {
  readonly name: 'propose_chapter_blueprint'
  readonly arguments: Record<string, unknown>
}

export interface ToolConfirmationDecision {
  readonly confirmed: boolean
  readonly blueprintProposals?: readonly ConfigImpactBlueprintProposal[]
}

/** Agent Engine 回调 */
export interface AgentEngineCallbacks {
  /** 流式文本片段 */
  onTextChunk: (chunk: string) => void
  /** Tool 调用开始 */
  onToolCallStart: (toolCall: ToolCallInfo) => void
  /** Tool 调用完成 */
  onToolCallComplete: (toolCall: ToolCallInfo) => void
  /** Tool 需要用户确认 */
  onToolCallConfirmRequired: (toolCall: ToolCallInfo) => Promise<boolean | ToolConfirmationDecision>
  /** 全部完成 */
  onDone: (fullText: string, toolCalls: ToolCallInfo[], artifacts: ToolArtifact[]) => void
  /** 错误 */
  onError: (error: string) => void
}

/** LLM 消息格式 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** LLM 生成函数签名（由 agent-store 提供实际实现） */
export type LLMGenerateFn = (
  messages: LLMMessage[],
  modelId: string,
) => Promise<string>

// ===== 核心引擎 =====

/**
 * 执行 Agent ReAct 循环
 *
 * 流程：
 * 1. 将系统提示（含 Tool 描述）+ 历史消息 + 用户消息发送给 LLM
 * 2. 解析 LLM 回复中的 <tool_call> 标签
 * 3. 如果有 tool_call → 执行 Tool → 将结果作为 observation 追加到消息历史 → 重新调用 LLM
 * 4. 循环直到 LLM 不再调用 Tool 或达到 MAX_TOOL_ROUNDS
 * 5. 返回最终文本回复
 */
export async function runAgentLoop(
  systemPrompt: string,
  historyMessages: LLMMessage[],
  userMessage: string,
  modelId: string | undefined,
  generateFn: LLMGenerateFn,
  callbacks: AgentEngineCallbacks,
  abortSignal?: AbortSignal,
  providedExecutionContext?: AgentExecutionContext,
  contextSummarizer?: (messages: LLMMessage[]) => Promise<string | null>,
): Promise<void> {
  const allToolCalls: ToolCallInfo[] = []
  const allArtifacts: ToolArtifact[] = []
  // One agent run gets one immutable project identity. Tool calls later in the
  // loop must not silently borrow a lease issued after a same-path reopen.
  const executionContext = providedExecutionContext ?? createAgentExecutionContext(modelId)

  // 构建消息列表
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userMessage },
  ]

  let rounds = 0
  let fullAssistantText = ''

  runtimeLog.info('agent', 'Agent 循环开始', {
    historyMessages: historyMessages.length,
    userMessageChars: userMessage.length,
    modelId: modelId ?? null,
  })

  while (rounds < MAX_TOOL_ROUNDS) {
    // 检查中止信号
    if (abortSignal?.aborted) {
      callbacks.onDone(fullAssistantText + '\n\n_（已停止生成）_', allToolCalls, allArtifacts)
      return
    }

    rounds++

    // 调用 LLM
    let llmResponse: string
    const roundStartedAt = Date.now()
    runtimeLog.info('agent', `Agent 第 ${rounds} 轮 LLM 调用开始`, {
      messageCount: messages.length,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
    })
    try {
      llmResponse = await generateFn(messages, modelId ?? '')
    } catch (error) {
      runtimeLog.error('agent', `Agent 第 ${rounds} 轮 LLM 调用失败`, {
        error: String(error),
        elapsedMs: Date.now() - roundStartedAt,
      })
      callbacks.onError(`LLM 调用失败：${String(error)}`)
      return
    }
    runtimeLog.info('agent', `Agent 第 ${rounds} 轮 LLM 调用完成`, {
      responseChars: llmResponse.length,
      elapsedMs: Date.now() - roundStartedAt,
    })

    // 检查中止
    if (abortSignal?.aborted) {
      callbacks.onDone(fullAssistantText + '\n\n_（已停止生成）_', allToolCalls, allArtifacts)
      return
    }

    // 解析 LLM 回复：分离文本和 tool_call
    const { textParts, toolCalls } = parseToolCalls(llmResponse)

    // 输出文本部分（清理可能残留的 tool_call/tool_result 标记）
    let textContent = textParts.join('')
    textContent = textContent
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/<tool_result[\s\S]*?<\/tool_result>/g, '')
      .replace(/<\/?tool_call>/g, '')      // 清理孤立的开/闭标签
      .replace(/<\/?tool_result>/g, '')     // 清理孤立的 result 标签
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (textContent) {
      callbacks.onTextChunk(textContent)
      fullAssistantText += textContent
    }

    // 如果没有 tool_call，循环结束
    if (toolCalls.length === 0) {
      runtimeLog.info('agent', 'Agent 循环结束（无工具调用）', {
        rounds,
        fullTextChars: fullAssistantText.length,
        toolCalls: allToolCalls.length,
      })
      callbacks.onDone(fullAssistantText, allToolCalls, allArtifacts)
      return
    }

    // 将 LLM 的完整回复加入历史（包含 tool_call 标签）
    messages.push({ role: 'assistant', content: llmResponse })

    // 依次执行每个 tool_call。配置影响预览中明确选择的蓝图差异会在
    // 配置写入成功后插入此轮，并继续走同一条确认与工具执行路径。
    const observationParts: string[] = []
    const roundToolCalls = [...toolCalls]

    for (let toolIndex = 0; toolIndex < roundToolCalls.length; toolIndex++) {
      if (abortSignal?.aborted) break
      const tc = roundToolCalls[toolIndex]
      const toolCallInfo: ToolCallInfo = {
        id: crypto.randomUUID(),
        toolName: tc.name,
        arguments: tc.arguments,
        status: 'pending',
        projectSession: executionContext.projectSession,
      }
      allToolCalls.push(toolCallInfo)

      // 查找 Tool
      const tool = toolRegistry.get(tc.name)
      if (!tool) {
        toolCallInfo.status = 'failed'
        toolCallInfo.error = `未知工具：${tc.name}`
        callbacks.onToolCallComplete(toolCallInfo)
        observationParts.push(`<tool_result name="${tc.name}" error="true">\n未知工具：${tc.name}。可用工具：${toolRegistry.listAll().map(t => t.name).join(', ')}\n</tool_result>`)
        continue
      }

      // 记录来源
      toolCallInfo.source = tool.source

      // 需要用户确认的 Tool
      let confirmationDecision: ToolConfirmationDecision = { confirmed: true }
      if (tool.requiresConfirmation) {
        toolCallInfo.status = 'waiting_confirm'
        callbacks.onToolCallStart(toolCallInfo)

        const response = await callbacks.onToolCallConfirmRequired(toolCallInfo)
        confirmationDecision = typeof response === 'boolean' ? { confirmed: response } : response
        if (!confirmationDecision.confirmed) {
          toolCallInfo.status = 'failed'
          toolCallInfo.error = '用户拒绝执行'
          callbacks.onToolCallComplete(toolCallInfo)
          observationParts.push(`<tool_result name="${tc.name}" error="true">\n用户拒绝了此操作\n</tool_result>`)
          continue
        }
        // The waiting confirmation card already represents this call. Its
        // completion below updates that same card instead of appending a
        // second one when execution begins.
        toolCallInfo.status = 'running'
      } else {
        // Non-confirming tools still need one visible lifecycle card.
        toolCallInfo.status = 'running'
        callbacks.onToolCallStart(toolCallInfo)
      }

      // 执行 Tool
      const toolStartedAt = Date.now()
      runtimeLog.info('agent', `执行工具 ${tc.name}`, {
        toolName: tc.name,
        arguments: tc.arguments,
      })

      try {
        const result = await executeToolWithTimeout(
          tool.execute,
          tc.arguments,
          executionContext,
          TOOL_TIMEOUT_MS,
          abortSignal,
        )
        runtimeLog.info('agent', `工具 ${tc.name} 执行完成`, {
          success: result.success,
          contentChars: result.content?.length ?? 0,
          elapsedMs: Date.now() - toolStartedAt,
          error: result.error ?? undefined,
        })

        // 截断过长的结果
        const truncatedContent = truncateResult(result.content, TOOL_RESULT_MAX_CHARS)

        toolCallInfo.status = result.success ? 'completed' : 'failed'
        toolCallInfo.result = truncatedContent
        if (result.error) toolCallInfo.error = result.error
        if (result.artifacts) allArtifacts.push(...result.artifacts)

        callbacks.onToolCallComplete(toolCallInfo)

        if (result.success) {
          observationParts.push(`<tool_result name="${tc.name}">\n${truncatedContent}\n</tool_result>`)
          if (tc.name === 'propose_novel_config' && confirmationDecision.blueprintProposals?.length) {
            roundToolCalls.splice(toolIndex + 1, 0, ...confirmationDecision.blueprintProposals)
          }
        } else {
          observationParts.push(`<tool_result name="${tc.name}" error="true">\n${result.error ?? truncatedContent}\n</tool_result>`)
        }
      } catch (error) {
        toolCallInfo.status = 'failed'
        toolCallInfo.error = `执行异常：${String(error)}`
        runtimeLog.error('agent', `工具 ${tc.name} 执行异常`, {
          error: String(error),
          elapsedMs: Date.now() - toolStartedAt,
        })
        callbacks.onToolCallComplete(toolCallInfo)
        observationParts.push(`<tool_result name="${tc.name}" error="true">\n执行异常：${String(error)}\n</tool_result>`)
      }
    }

    // 将所有 tool 结果作为 user role 的 observation 注入
    // 加上明确提示，防止 LLM 误以为这是用户新发言
    const observation = `[以下是工具执行结果，请根据结果继续回答用户的问题]\n\n${observationParts.join('\n\n')}\n\n[请根据上面的工具结果，继续回答用户的原始问题。如果需要更多信息可以继续调用工具。]`
    messages.push({ role: 'user', content: observation })
    // 上下文超过阈值时压缩最旧的工具结果，防止无限滚雪球
    await compressContextIfNeeded(messages, contextSummarizer)
  }

  // 达到最大循环次数
  if (rounds >= MAX_TOOL_ROUNDS) {
    runtimeLog.warn('agent', 'Agent 达到最大工具调用轮次', { rounds: MAX_TOOL_ROUNDS })
    fullAssistantText += '\n\n⚠️ 已达到最大工具调用次数限制，自动停止。'
  }

  runtimeLog.info('agent', 'Agent 循环结束', {
    rounds,
    fullTextChars: fullAssistantText.length,
    toolCalls: allToolCalls.length,
    artifacts: allArtifacts.length,
  })
  callbacks.onDone(fullAssistantText, allToolCalls, allArtifacts)
}

// ===== 工具函数 =====

/** 解析的 Tool 调用 */
interface ParsedToolCall {
  name: string
  arguments: Record<string, unknown>
}

/**
 * Some providers emit a function-style tool call as two plain-text lines
 * instead of the XML shape requested by the system prompt.  Treat that form
 * as a command only when it consumes the *entire* response and names a tool
 * already registered for this agent run.  This keeps ordinary prose and
 * arbitrary JSON from acquiring side effects.
 */
function parseRegisteredRawToolCall(text: string): ParsedToolCall | null {
  const match = /^\s*([A-Za-z][\w.-]*)[ \t]*\r?\n\s*(\{[\s\S]*\})\s*$/.exec(text)
  if (!match) return null

  const [, name, rawArguments] = match
  if (!toolRegistry.get(name)) return null

  try {
    const argumentsValue: unknown = JSON.parse(rawArguments)
    if (
      typeof argumentsValue !== 'object'
      || argumentsValue === null
      || Array.isArray(argumentsValue)
    ) return null
    return { name, arguments: argumentsValue as Record<string, unknown> }
  } catch {
    return null
  }
}

/**
 * 从 LLM 输出中解析 <tool_call>...</tool_call> 标签
 *
 * 返回分离后的文本片段和 tool 调用列表。
 * 增强版：支持 JSON 前后有多余文字的容错解析。
 */
export function parseToolCalls(text: string): {
  textParts: string[]
  toolCalls: ParsedToolCall[]
} {
  const rawToolCall = parseRegisteredRawToolCall(text)
  if (rawToolCall) {
    return { textParts: [], toolCalls: [rawToolCall] }
  }

  const toolCalls: ParsedToolCall[] = []
  const textParts: string[] = []

  // 匹配 <tool_call>...</tool_call> 标签
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
  let lastIndex = 0
  let match: RegExpExecArray | null = null

  while ((match = regex.exec(text)) !== null) {
    // 收集标签前的文本
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim()
      if (before) textParts.push(before)
    }
    lastIndex = regex.lastIndex

    // 解析 JSON（增强容错）
    const rawContent = match[1].trim()
    let parsed = false

    // 策略 1：直接解析整个内容
    try {
      const data = JSON.parse(rawContent)
      if (data.name && typeof data.name === 'string') {
        toolCalls.push({ name: data.name, arguments: data.arguments ?? {} })
        parsed = true
      }
    } catch { /* 尝试容错解析 */ }

    // 策略 2：从内容中提取 JSON 对象（LLM 可能在 JSON 前后加了额外文字）
    if (!parsed) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0])
          if (data.name && typeof data.name === 'string') {
            toolCalls.push({ name: data.name, arguments: data.arguments ?? {} })
            parsed = true
          }
        } catch {
          console.warn('[AgentEngine] tool_call JSON 容错解析也失败:', rawContent)
        }
      }
    }

    // 完全解析失败，丢弃该标签（不再打回 textParts，避免泄露 XML）
    if (!parsed) {
      console.warn('[AgentEngine] tool_call 标签解析失败，已丢弃:', rawContent)
    }
  }

  // 收集最后一个标签后的文本
  if (lastIndex < text.length) {
    const after = text.slice(lastIndex).trim()
    if (after) textParts.push(after)
  }

  // 如果没有匹配到任何标签，整个文本都是 textParts
  if (toolCalls.length === 0 && textParts.length === 0) {
    textParts.push(text)
  }

  return { textParts, toolCalls }
}

/**
 * 带超时的 Tool 执行
 *
 * 超时或外部中止信号触发时立即拒绝，并确保底层 async 操作（IPC/网络）
 * 的发起方不再无限等待。底层操作若支持 AbortSignal 也能随之取消。
 */
async function executeToolWithTimeout(
  executeFn: (
    args: Record<string, unknown>,
    context?: AgentExecutionContext,
  ) => Promise<ToolResult>,
  args: Record<string, unknown>,
  context: AgentExecutionContext,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<ToolResult> {
  if (abortSignal?.aborted) {
    throw new Error('工具执行已中止')
  }
  return new Promise<ToolResult>((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('工具执行已中止'))
    }
    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      abortSignal?.removeEventListener('abort', onAbort)
    }
    timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`工具执行超时（${timeoutMs / 1000}s）`))
    }, timeoutMs)
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    executeFn(args, context).then(
      (result) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      },
      (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      },
    )
  })
}

/**
 * 截断过长的 Tool 结果
 */
function truncateResult(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + `\n\n…（内容已截断，完整内容共 ${content.length} 字符。可使用 read_file 工具获取完整文件内容）`
}
