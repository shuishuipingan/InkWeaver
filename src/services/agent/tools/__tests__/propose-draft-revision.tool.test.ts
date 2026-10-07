import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectStore } from '../../../../stores/project-store'
import { countDraftUnits } from '../../../../shared/draft-units'
import { textFingerprint } from '../../../../shared/character-extraction'
import { builtinTools } from '..'
import { createAgentExecutionContext } from '../project-context'
import { proposeDraftRevisionTool } from '../propose-draft-revision.tool'

const projectPath = 'C:\\novels\\A'
const currentDraft = '第一段正文。\n第二段正文。'

function draftMeta() {
  return { id: 31, chapterNumber: 2, version: 3, status: 'draft', chapterTitle: '第二章' }
}

function stubApi(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    'db:draft-get-latest': draftMeta(),
    'db:draft-get-full': { id: 31, content: currentDraft },
    'db:revision-replace-pending': { success: true, id: 42, revisionIndex: 3 },
    ...overrides,
  }
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

describe('propose_draft_revision tool', () => {
  it('registers as a confirmation-required writing tool', () => {
    expect(builtinTools.map(tool => tool.name)).toContain('propose_draft_revision')
    expect(proposeDraftRevisionTool.requiresConfirmation).toBe(true)
    expect(proposeDraftRevisionTool.isReadOnly).toBe(false)
    // 硬边界必须写在给模型看的 description 里。
    expect(proposeDraftRevisionTool.description).toContain('不会直接改写草稿或定稿')
    expect(proposeDraftRevisionTool.description).toContain('write_file')
    expect(builtinTools.filter(tool => !tool.requiresConfirmation)).toHaveLength(18)
    expect(builtinTools).toHaveLength(25)
  })

  it('rejects an invalid chapter number before touching any channel', async () => {
    const invoke = stubApi()
    const result = await proposeDraftRevisionTool.execute({ chapter_number: 0, content: '正文' }, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('章节号无效')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects empty or missing revision content', async () => {
    stubApi()
    const missing = await proposeDraftRevisionTool.execute({ chapter_number: 2 }, createAgentExecutionContext())
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('缺少修订正文')
    const blank = await proposeDraftRevisionTool.execute({ chapter_number: 2, content: '   ' }, createAgentExecutionContext())
    expect(blank.success).toBe(false)
    expect(blank.error).toContain('修订正文为空')
  })

  it('rejects content above the character limit with a readable error', async () => {
    const invoke = stubApi()
    const result = await proposeDraftRevisionTool.execute(
      { chapter_number: 2, content: '字'.repeat(120_001) },
      createAgentExecutionContext(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('修订正文过长')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects a chapter without a draft', async () => {
    stubApi({ 'db:draft-get-latest': null })
    const result = await proposeDraftRevisionTool.execute({ chapter_number: 9, content: '新正文' }, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('还没有草稿')
  })

  it('rejects a revision identical to the current draft', async () => {
    const invoke = stubApi()
    const result = await proposeDraftRevisionTool.execute(
      { chapter_number: 2, content: currentDraft },
      createAgentExecutionContext(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('完全相同')
    expect(invoke.mock.calls.every(([channel]) => channel !== 'db:revision-replace-pending')).toBe(true)
  })

  it('creates the pending revision with the shared fingerprint and unit count', async () => {
    const invoke = stubApi()
    const proposed = '第一段正文，收紧后。\n第二段正文。'
    const result = await proposeDraftRevisionTool.execute(
      { chapter_number: 2, content: proposed, instruction: '把开头收紧' },
      createAgentExecutionContext(),
    )

    expect(result.success).toBe(true)
    expect(result.content).toContain('r3')
    expect(result.content).toContain('草稿 ID 31')
    const createCall = invoke.mock.calls.find(([channel]) => channel === 'db:revision-replace-pending')
    expect(createCall).toBeDefined()
    const params = createCall?.[1] as Record<string, unknown>
    expect(params.baseDraftId).toBe(31)
    expect(params.revisionType).toBe('refine')
    expect(params.content).toBe(proposed)
    expect(params.userPrompt).toBe('把开头收紧')
    // 与 refine-draft.command.ts 同源的两个函数，而不是各写一份。
    expect(params.baseContentHash).toBe(textFingerprint(currentDraft))
    expect(params.wordCount).toBe(countDraftUnits(proposed))
    expect((createCall?.[2])).toBe(projectPath)
  })

  it('surfaces a persistence failure instead of reporting success', async () => {
    stubApi({ 'db:revision-replace-pending': { success: false, error: '基准正文已变化' } })
    const result = await proposeDraftRevisionTool.execute(
      { chapter_number: 2, content: '换一段' },
      createAgentExecutionContext(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('基准正文已变化')
  })
})
