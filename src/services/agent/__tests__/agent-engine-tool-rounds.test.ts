import { afterEach, describe, expect, it, vi } from 'vitest'

import { runAgentLoop, type LLMMessage, type ToolCallInfo, type ToolConfirmationDecision } from '../agent-engine'
import { toolRegistry, type AgentTool, type ToolArtifact } from '../tool-registry'
import { GenerationHarnessError } from '../../generation/generation-harness'

const registeredTools: string[] = []

function registerTool(tool: AgentTool): AgentTool {
  toolRegistry.register(tool)
  registeredTools.push(tool.name)
  return tool
}

function readOnlyTool(
  name: string,
  execute: AgentTool['execute'],
  extra: Partial<AgentTool> = {},
): AgentTool {
  return registerTool({
    name,
    description: `test read-only tool ${name}`,
    source: 'builtin',
    inputSchema: { type: 'object', properties: {} },
    requiresConfirmation: false,
    isReadOnly: true,
    execute,
    ...extra,
  })
}

function callbacks() {
  return {
    onTextChunk: vi.fn<(chunk: string) => void>(),
    onToolCallStart: vi.fn<(toolCall: ToolCallInfo) => void>(),
    onToolCallComplete: vi.fn<(toolCall: ToolCallInfo) => void>(),
    onToolCallConfirmRequired: vi.fn<(toolCall: ToolCallInfo) => Promise<boolean | ToolConfirmationDecision>>(
      async () => true,
    ),
    onDone: vi.fn<(fullText: string, toolCalls: ToolCallInfo[], artifacts: ToolArtifact[]) => void>(),
    onError: vi.fn<(error: string) => void>(),
  }
}

function toolCall(name: string, args: Record<string, unknown> = {}): string {
  return `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`
}

afterEach(() => {
  for (const name of registeredTools.splice(0)) toolRegistry.unregister(name)
})

describe('Agent engine tool rounds', () => {
  it('overlaps consecutive read-only tool calls while preserving observation order', async () => {
    // 观测并发度而不是耗时：两个 execute 会先同步进入函数体，因此并行执行时
    // 第二个调用在第一个 await 之前就已计入 inFlight，串行执行则不会。
    let inFlight = 0
    let maxInFlight = 0
    const tick = () => new Promise(resolve => setTimeout(resolve, 0))
    const track = (content: string) => async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await tick()
      inFlight -= 1
      return { success: true, content }
    }
    readOnlyTool('__test_read_one', track('结果甲'))
    readOnlyTool('__test_read_two', track('结果乙'))

    const rounds: LLMMessage[][] = []
    const generate = vi.fn(async (messages: LLMMessage[]) => {
      rounds.push(messages.map(message => ({ ...message })))
      return rounds.length === 1
        ? `${toolCall('__test_read_one')}\n${toolCall('__test_read_two')}`
        : '两个结果都拿到了。'
    })
    const sink = callbacks()

    await runAgentLoop('system', [], '同时读取两份资料', 'model', generate, sink)

    expect(maxInFlight).toBe(2)
    const observation = rounds[1]!.at(-1)!.content
    expect(observation).toContain('结果甲')
    expect(observation).toContain('结果乙')
    expect(observation.indexOf('结果甲')).toBeLessThan(observation.indexOf('结果乙'))
    expect(sink.onToolCallComplete).toHaveBeenCalledTimes(2)
    expect(sink.onError).not.toHaveBeenCalled()
  })

  it('returns the tool contract instead of executing a call with missing required arguments', async () => {
    const execute = vi.fn(async () => ({ success: true, content: '不应执行' }))
    readOnlyTool('__test_needs_argument', execute, {
      inputSchema: {
        type: 'object',
        properties: {
          chapter_number: { type: 'number', description: '章节号' },
          mode: { type: 'string', description: '分析模式', enum: ['fast', 'deep'] },
        },
        required: ['chapter_number'],
      },
    })

    const rounds: LLMMessage[][] = []
    const generate = vi.fn(async (messages: LLMMessage[]) => {
      rounds.push(messages.map(message => ({ ...message })))
      return rounds.length === 1 ? toolCall('__test_needs_argument') : '我会先补齐参数。'
    })
    const sink = callbacks()

    await runAgentLoop('system', [], '分析第一章', 'model', generate, sink)

    expect(execute).not.toHaveBeenCalled()
    const observation = rounds[1]!.at(-1)!.content
    expect(observation).toContain('缺少必填参数：chapter_number')
    expect(observation).toContain('chapter_number（必填，number）')
    expect(observation).toContain('可选值：fast | deep')
    expect(observation).toContain('请补齐参数后重新调用')
  })

  it('keeps a prefetched result bound to its own call when a confirmed proposal inserts new calls', async () => {
    readOnlyTool('__test_read_one', async () => ({ success: true, content: '甲内容' }))
    readOnlyTool('__test_read_two', async () => ({ success: true, content: '乙内容' }))
    const proposalExecute = vi.fn(async () => ({ success: true, content: '蓝图提案已生成' }))
    registerTool({
      name: 'propose_chapter_blueprint',
      description: 'test blueprint proposal',
      source: 'builtin',
      inputSchema: { type: 'object', properties: {} },
      requiresConfirmation: true,
      isReadOnly: false,
      execute: proposalExecute,
    })
    registerTool({
      name: 'propose_novel_config',
      description: 'test config proposal',
      source: 'builtin',
      inputSchema: { type: 'object', properties: {} },
      requiresConfirmation: true,
      isReadOnly: false,
      execute: async () => ({ success: true, content: '配置提案已生成' }),
    })

    const rounds: LLMMessage[][] = []
    const generate = vi.fn(async (messages: LLMMessage[]) => {
      rounds.push(messages.map(message => ({ ...message })))
      return rounds.length === 1
        ? `${toolCall('propose_novel_config')}\n${toolCall('__test_read_one')}\n${toolCall('__test_read_two')}`
        : '都处理完了。'
    })
    const sink = callbacks()
    sink.onToolCallConfirmRequired.mockImplementation(async (toolCall: { toolName: string }) => (
      toolCall.toolName === 'propose_novel_config'
        ? {
          confirmed: true,
          blueprintProposals: [{ name: 'propose_chapter_blueprint', arguments: { chapter_number: 1 } }],
        }
        : true
    ))

    await runAgentLoop('system', [], '同时提案并读取资料', 'model', generate, sink)

    const observation = rounds[1]!.at(-1)!.content
    expect(observation).toContain('<tool_result name="__test_read_one">\n甲内容')
    expect(observation).toContain('<tool_result name="__test_read_two">\n乙内容')
    expect(observation).toContain('蓝图提案已生成')
    expect(proposalExecute).toHaveBeenCalledWith(
      { chapter_number: 1 },
      expect.any(Object),
    )
  })

  it('suggests registered tools when the model names an unknown one', async () => {
    readOnlyTool('__test_chapter_lister', async () => ({ success: true, content: '章节列表' }))

    const rounds: LLMMessage[][] = []
    const generate = vi.fn(async (messages: LLMMessage[]) => {
      rounds.push(messages.map(message => ({ ...message })))
      return rounds.length === 1 ? toolCall('list_every_chapter') : '我会改用正确的工具。'
    })
    const sink = callbacks()

    await runAgentLoop('system', [], '列出章节', 'model', generate, sink)

    const observation = rounds[1]!.at(-1)!.content
    expect(observation).toContain('未知工具：list_every_chapter')
    expect(observation).toContain('__test_chapter_lister')
  })

  it('keeps the produced text when the generation session reaches its planned budget', async () => {
    readOnlyTool('__test_read_one', async () => ({ success: true, content: '资料' }))
    const generate = vi.fn()
      .mockResolvedValueOnce(`先给出结论。\n${toolCall('__test_read_one')}`)
      .mockRejectedValueOnce(new GenerationHarnessError(
        'REQUESTED_TOKEN_BUDGET_EXHAUSTED',
        '生成会话已用尽请求 Token 预算。',
      ))
    const sink = callbacks()

    await runAgentLoop('system', [], '帮我分析', 'model', generate, sink)

    expect(sink.onError).not.toHaveBeenCalled()
    expect(sink.onDone).toHaveBeenCalledOnce()
    const [finalText] = sink.onDone.mock.calls[0]!
    expect(finalText).toContain('先给出结论。')
    expect(finalText).toContain('已达到模型调用预算上限')
  })

  it('does not report a cancelled generation as a failure', async () => {
    const controller = new AbortController()
    const generate = vi.fn(async () => {
      controller.abort()
      throw new GenerationHarnessError('CANCELLED', '生成请求已取消。')
    })
    const sink = callbacks()

    await runAgentLoop('system', [], '写一段开头', 'model', generate, sink, controller.signal)

    expect(sink.onError).not.toHaveBeenCalled()
    // 停止状态由 store 的取消流程写入，循环不得再覆盖或重复收尾。
    expect(sink.onDone).not.toHaveBeenCalled()
  })

  it('still reports unexpected provider failures', async () => {
    const generate = vi.fn(async () => {
      throw new Error('provider unavailable')
    })
    const sink = callbacks()

    await runAgentLoop('system', [], '写一段开头', 'model', generate, sink)

    expect(sink.onDone).not.toHaveBeenCalled()
    expect(sink.onError).toHaveBeenCalledWith('LLM 调用失败：Error: provider unavailable')
  })
})
