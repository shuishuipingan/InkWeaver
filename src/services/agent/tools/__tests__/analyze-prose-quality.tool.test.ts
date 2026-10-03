import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeWithProjectSession = vi.hoisted(() => vi.fn())
vi.mock('../../../ipc-client', () => ({ ipc: { invokeWithProjectSession } }))

import { useProjectStore } from '../../../../stores/project-store'
import { createAgentExecutionContext } from '../project-context'
import { analyzeProseQualityTool } from '../analyze-prose-quality.tool'

beforeEach(() => {
  useProjectStore.setState({ currentProject: {
    id: 'project', sessionLease: 'lease', path: 'C:\\novels\\project', name: 'Project', novelConfig: {},
  } as never })
  invokeWithProjectSession.mockReset()
})

describe('analyze_prose_quality tool', () => {
  it('analyzes an inline text fragment without touching the project database', async () => {
    const result = await analyzeProseQualityTool.execute(
      { text: '他缓缓抬起头。他缓缓转过身。他缓缓开口。' },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('句首重复 3 次：他缓')
    expect(result.content).toContain('对话占比')
    expect(invokeWithProjectSession).not.toHaveBeenCalled()
  })

  it('analyzes the newest draft of a chapter through the frozen project session', async () => {
    invokeWithProjectSession.mockImplementation(async (_session, channel) => {
      if (channel === 'db:draft-list') return [{ id: 7, version: 2 }]
      if (channel === 'db:draft-get-full') return { content: '夜色深沉。夜色深沉。' }
      throw new Error(`unexpected IPC: ${channel}`)
    })
    const result = await analyzeProseQualityTool.execute(
      { chapter_number: 3 },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('第 3 章草稿 v2 文风体检')
    expect(invokeWithProjectSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ projectId: 'project' }),
      'db:draft-list',
      3,
      'C:\\novels\\project',
    )
  })

  it('asks for an analysis target instead of failing silently', async () => {
    const result = await analyzeProseQualityTool.execute({}, createAgentExecutionContext('model'))

    expect(result.success).toBe(false)
    expect(result.error).toContain('chapter_number')
    expect(result.error).toContain('text')
  })

  it('reports a chapter without drafts as an empty result, not an error', async () => {
    invokeWithProjectSession.mockResolvedValue([])
    const result = await analyzeProseQualityTool.execute(
      { chapter_number: 9 },
      createAgentExecutionContext('model'),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('暂无草稿')
  })

  it('is registered as a read-only builtin tool that needs no confirmation', () => {
    expect(analyzeProseQualityTool.source).toBe('builtin')
    expect(analyzeProseQualityTool.isReadOnly).toBe(true)
    expect(analyzeProseQualityTool.requiresConfirmation).toBe(false)
  })
})
