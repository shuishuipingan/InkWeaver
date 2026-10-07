import { afterEach, describe, expect, it } from 'vitest'

import { toolRegistry } from '../tool-registry'
import { builtinTools } from '../tools'

const registered: string[] = []

afterEach(() => {
  for (const name of registered.splice(0)) toolRegistry.unregister(name)
})

function promptWithBuiltinTools(): string {
  toolRegistry.registerAll(builtinTools)
  registered.push(...builtinTools.map(tool => tool.name))
  return toolRegistry.generateToolPrompt()
}

describe('tool prompt execution contract', () => {
  it('states that announcing an action in prose executes nothing', () => {
    const prompt = promptWithBuiltinTools()
    expect(prompt).toContain('只在正文里说明你要做什么，不会执行任何操作')
    expect(prompt).toContain('不会看到任何确认卡片')
    expect(prompt).toContain('不要分两步、不要只给承诺')
    // 说明工具真正运行的条件。
    expect(prompt).toContain('只有在你真的写出 <tool_call> 标签时才会运行')
  })

  it('keeps rule 8 strict about landing every step as a real tool call', () => {
    const prompt = promptWithBuiltinTools()
    expect(prompt).toContain('先用 analyze_change_impact 算出会牵涉哪些方面，再用 propose_change_plan 提交联动改动')
    expect(prompt).toContain('每一步都必须以真实的 <tool_call> 落地')
    expect(prompt).toContain('不能以文字描述代替调用')
  })

  it('shows a wrong-way and right-way example pair', () => {
    const prompt = promptWithBuiltinTools()
    expect(prompt).toContain('❌ 错误写法')
    expect(prompt).toContain('✅ 正确写法')
    expect(prompt).toContain('"name": "analyze_change_impact"')
    expect(prompt).toContain('"change"')
  })

  it('keeps every pre-existing rule intact', () => {
    const prompt = promptWithBuiltinTools()
    expect(prompt).toContain('需要多项**互不依赖**的信息')
    expect(prompt).toContain('**需要用户确认的工具**（标记 ⚠️）每次回复最多放一个')
    expect(prompt).toContain('调用工具后，系统会自动执行并返回 <tool_result> 结果')
    expect(prompt).toContain('收到 <tool_result> 后你必须继续推理')
    expect(prompt).toContain('不要在正文中引用或复述 <tool_call> 标签的内容')
    expect(prompt).toContain('只读工具自动执行。写入型工具（标记 ⚠️）需要用户确认。')
  })

  it('keeps the declared tool inventory unchanged', () => {
    const prompt = promptWithBuiltinTools()
    expect(prompt).toContain('#### write_file ⚠️需确认')
    expect(prompt).toContain('#### propose_change_plan ⚠️需确认')
    expect(prompt).toContain('#### propose_draft_revision ⚠️需确认')
    expect(prompt).toContain('#### read_drafts')
  })
})
