import { afterEach, describe, expect, it, vi } from 'vitest'

import { runAgentLoop, type ToolCallInfo, type ToolConfirmationDecision } from '../agent-engine'
import { toolRegistry, type AgentTool, type ToolArtifact } from '../tool-registry'
import { runtimeLog } from '../../runtime-log'

const registered: string[] = []

function register(tool: AgentTool): void {
  toolRegistry.register(tool)
  registered.push(tool.name)
}

function tool(name: string, requiresConfirmation: boolean, execute: AgentTool['execute']): void {
  register({
    name,
    description: 'ledger test tool ' + name,
    source: 'builtin',
    inputSchema: { type: 'object', properties: {} },
    requiresConfirmation,
    isReadOnly: !requiresConfirmation,
    execute,
  })
}

function toolCall(name: string, args: Record<string, unknown> = {}): string {
  return '<tool_call>' + JSON.stringify({ name, arguments: args }) + '</tool_call>'
}

function callbacks(confirm: () => Promise<boolean | ToolConfirmationDecision> = async () => true) {
  return {
    onTextChunk: vi.fn<(chunk: string) => void>(),
    onToolCallStart: vi.fn<(toolCall: ToolCallInfo) => void>(),
    onToolCallComplete: vi.fn<(toolCall: ToolCallInfo) => void>(),
    onToolCallConfirmRequired: vi.fn<(toolCall: ToolCallInfo) => Promise<boolean | ToolConfirmationDecision>>(confirm),
    onDone: vi.fn<(fullText: string, toolCalls: ToolCallInfo[], artifacts: ToolArtifact[]) => void>(),
    onError: vi.fn<(error: string) => void>(),
  }
}

function closingDetails(info: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const closing = info.mock.calls.filter(
    (call: unknown[]) => call[1] === 'Agent 循环结束（无工具调用）' || call[1] === 'Agent 循环结束',
  )
  expect(closing).toHaveLength(1)
  return closing[0]![2] as Record<string, unknown>
}

afterEach(() => {
  for (const name of registered.splice(0)) toolRegistry.unregister(name)
  vi.restoreAllMocks()
})

describe('Agent loop tool call ledger', () => {
  it('names every tool that ran and its final status in the closing log', async () => {
    tool('__test_ledger_read', false, async () => ({ success: true, content: '读到了' }))
    tool('__test_ledger_write', true, async () => ({ success: true, content: '写好了' }))
    const info = vi.spyOn(runtimeLog, 'info').mockReturnValue(undefined)

    const generate = vi.fn(async () => '')
    generate
      .mockResolvedValueOnce(toolCall('__test_ledger_read') + '\n' + toolCall('__test_ledger_write'))
      .mockResolvedValueOnce('都处理好了。')
    const sink = callbacks()

    await runAgentLoop('system', [], '请把开头改紧凑些', 'model', generate, sink)

    const details = closingDetails(info)
    expect(details.toolNames).toEqual(['__test_ledger_read', '__test_ledger_write'])
    expect(details.toolOutcomes).toEqual(['__test_ledger_read:completed', '__test_ledger_write:completed'])
    expect(details.toolCalls).toBe(2)
  })

  it('records a refused confirmation as failed instead of hiding it', async () => {
    tool('__test_ledger_refused', true, async () => ({ success: true, content: '不应执行' }))
    const info = vi.spyOn(runtimeLog, 'info').mockReturnValue(undefined)
    const warn = vi.spyOn(runtimeLog, 'warn').mockReturnValue(undefined)

    const generate = vi.fn(async () => '')
    generate
      .mockResolvedValueOnce(toolCall('__test_ledger_refused'))
      .mockResolvedValueOnce('好的，那我不改了。')
    const sink = callbacks(async () => false)

    await runAgentLoop('system', [], '帮我改稿', 'model', generate, sink)

    expect(closingDetails(info).toolOutcomes).toEqual(['__test_ledger_refused:failed'])
    expect(warn.mock.calls.some(call => String(call[1]).includes('作者拒绝执行工具'))).toBe(true)
  })

  it('logs a waiting confirmation and never logs tool argument bodies', async () => {
    const secret = '作者正文机密片段：他在雨里站了很久'
    tool('__test_ledger_secret', true, async () => ({ success: true, content: 'ok' }))
    const info = vi.spyOn(runtimeLog, 'info').mockReturnValue(undefined)

    const generate = vi.fn(async () => '')
    generate
      .mockResolvedValueOnce(toolCall('__test_ledger_secret', { prompt: secret, chapter_number: 2 }))
      .mockResolvedValueOnce('收到。')
    const sink = callbacks()

    await runAgentLoop('system', [], '请改稿', 'model', generate, sink)

    const serialized = JSON.stringify(info.mock.calls)
    expect(serialized).not.toContain(secret)
    expect(serialized).toContain('argumentKeys')
    expect(serialized).toContain('prompt')
    expect(info.mock.calls.some(call => String(call[1]).includes('等待作者确认'))).toBe(true)
  })
})
