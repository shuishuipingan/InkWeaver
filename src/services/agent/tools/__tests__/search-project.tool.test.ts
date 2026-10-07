import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectStore } from '../../../../stores/project-store'
import { builtinTools } from '..'
import { SEARCH_PROJECT_MAX_QUERY_CHARS, highlightExcerpt, searchProjectTool } from '../search-project.tool'
import { createAgentExecutionContext } from '../project-context'

const projectPath = 'C:\\novels\\A'

function hit(overrides: Record<string, unknown> = {}) {
  return {
    chapterNumber: 12,
    version: 3,
    status: 'draft',
    contentId: 88,
    draftId: 42,
    wordCount: 3200,
    matchCount: 5,
    excerpts: [
      { text: '她摸出那枚旧钥匙，铜绿沾了指纹。', matchStart: 12, matchLength: 2 },
      { text: '钥匙挂在钉子上，像一句没说完的话。', matchStart: 0, matchLength: 2 },
    ],
    ...overrides,
  }
}

function stubApi(hits: unknown = [hit()]) {
  const routes: Record<string, unknown> = { 'db:content-search': hits }
  const invoke = vi.fn(async (channel: string, ...rest: unknown[]) => {
    void rest
    return channel in routes ? routes[channel] : []
  })
  vi.stubGlobal('window', {
    velaAPI: {
      invoke,
      on: vi.fn(),
      once: vi.fn(),
      send: vi.fn(),
      setZoomLevel: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomLevel: vi.fn(),
    },
  })
  return invoke
}

beforeEach(() => {
  useProjectStore.setState({
    currentProject: { id: 'main', sessionLease: 'lease-A', name: 'A', path: projectPath, novelConfig: {} } as never,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useProjectStore.setState({ currentProject: null })
})

describe('search_project tool', () => {
  it('registers as a read-only tool that runs without confirmation', () => {
    const names = builtinTools.map(tool => tool.name)
    expect(names).toContain('search_project')
    expect(searchProjectTool.requiresConfirmation).toBe(false)
    expect(searchProjectTool.isReadOnly).toBe(true)
    expect(searchProjectTool.description).toContain('自己作品的正文')
    expect(searchProjectTool.description).toContain('search_knowledge')
    expect(builtinTools.filter(tool => !tool.requiresConfirmation)).toHaveLength(18)
    expect(builtinTools).toHaveLength(26)
  })

  it('rejects an empty query without touching the channel', async () => {
    const invoke = stubApi()
    const missing = await searchProjectTool.execute({}, createAgentExecutionContext())
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('缺少检索关键词')

    const blank = await searchProjectTool.execute({ query: '   ' }, createAgentExecutionContext())
    expect(blank.success).toBe(false)
    expect(blank.error).toContain('缺少检索关键词')

    const tooLong = await searchProjectTool.execute(
      { query: '字'.repeat(SEARCH_PROJECT_MAX_QUERY_CHARS + 1) },
      createAgentExecutionContext(),
    )
    expect(tooLong.success).toBe(false)
    expect(tooLong.error).toContain('检索关键词过长')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects an unsupported scope before searching', async () => {
    const invoke = stubApi()
    const result = await searchProjectTool.execute({ query: '钥匙', scope: 'everything' }, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('不支持的检索范围')
    expect(invoke.mock.calls.every(([channel]) => channel !== 'db:content-search')).toBe(true)
  })

  it('passes the normalized scope and clamped limit and renders chapter evidence', async () => {
    const invoke = stubApi()
    const result = await searchProjectTool.execute(
      { query: '  钥匙  ', scope: 'drafts', limit: 5 },
      createAgentExecutionContext(),
    )

    expect(result.success).toBe(true)
    const call = invoke.mock.calls.find(([channel]) => channel === 'db:content-search')
    expect(call).toBeDefined()
    const params = call?.[1] as Record<string, unknown>
    expect(params.query).toBe('钥匙')
    expect(params.scope).toBe('drafts')
    expect(params.limit).toBe(5)
    expect(call?.[2]).toBe(projectPath)

    expect(result.content).toContain('第 12 章')
    expect(result.content).toContain('草稿 v3')
    expect(result.content).toContain('draftId 42')
    expect(result.content).toContain('contentId 88')
    expect(result.content).toContain('钥匙')
  })

  it('clamps the limit into the tool range and defaults the scope to all', async () => {
    const invoke = stubApi()
    await searchProjectTool.execute({ query: '钥匙', limit: 999 }, createAgentExecutionContext())
    const params = invoke.mock.calls.find(([channel]) => channel === 'db:content-search')?.[1] as Record<string, unknown>
    expect(params.limit).toBe(20)
    expect(params.scope).toBe('all')
  })

  it('reports the chapter match total separately from the returned excerpts', async () => {
    stubApi([hit({ matchCount: 5 })])
    const result = await searchProjectTool.execute({ query: '钥匙' }, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('命中 5 处')
    expect(result.content).toContain('这里列出前 2 处')
    expect(result.content).toContain('共 5 处')
  })

  it('returns a readable empty state instead of throwing when nothing matches', async () => {
    stubApi([])
    const result = await searchProjectTool.execute({ query: '不存在的信物' }, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.error ?? '').toBe('')
    expect(result.content).toContain('没有找到')
    expect(result.content).toContain('search_knowledge')
  })

  it('survives malformed hits without throwing', async () => {
    stubApi([{}, { chapterNumber: 7, excerpts: [{}] }])
    const result = await searchProjectTool.execute({ query: '钥匙' }, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('第 7 章')
  })

  it('highlights the match and tolerates invalid offsets', () => {
    expect(highlightExcerpt('她摸出那枚旧钥匙，铜绿沾了指纹。', 6, 2)).toContain('【钥匙】')
    expect(highlightExcerpt('没有匹配点', -1, 2)).toBe('没有匹配点')
    expect(highlightExcerpt('没有匹配点', 99, 2)).toBe('没有匹配点')
    expect(highlightExcerpt(undefined, 0, 0)).toBe('')
  })
})
