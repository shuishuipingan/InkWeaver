import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectStore } from '../../../../stores/project-store'
import { builtinTools } from '..'
import { createAgentExecutionContext } from '../project-context'
import { readReviewsTool } from '../read-reviews.tool'
import { readNarrativeThreadsTool } from '../read-narrative-threads.tool'
import { readChapterHandoffTool } from '../read-chapter-handoff.tool'
import { readKnowledgeEventsTool } from '../read-knowledge-events.tool'
import { readStoryContinuityTool } from '../read-story-continuity.tool'
import { readRevisionProposalsTool } from '../read-revision-proposals.tool'

const projectPath = 'C:\\novels\\A'
const creationStateTools = [
  readReviewsTool,
  readNarrativeThreadsTool,
  readChapterHandoffTool,
  readKnowledgeEventsTool,
  readStoryContinuityTool,
  readRevisionProposalsTool,
]

/** 只读工具在空项目下的返回：命中的通道按 routes 返回，其余一律返回空数组。 */
function stubApi(routes: Record<string, unknown> = {}) {
  const invoke = vi.fn(async (channel: string) => (channel in routes ? routes[channel] : []))
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

function draft(id: number, chapterNumber: number, version = 1) {
  return { id, chapterNumber, version, status: 'draft', chapterTitle: '第 ' + chapterNumber + ' 章' }
}

beforeEach(() => {
  useProjectStore.setState({
    currentProject: {
      id: 'main',
      sessionLease: 'lease-A',
      name: 'A',
      path: projectPath,
      novelConfig: {},
    } as never,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useProjectStore.setState({ currentProject: null })
})

describe('creation state read tools', () => {
  it('registers six read-only tools and keeps the read-only group at 17', () => {
    const names = builtinTools.map(tool => tool.name)
    for (const tool of creationStateTools) {
      expect(names).toContain(tool.name)
      expect(tool.requiresConfirmation).toBe(false)
      expect(tool.description.length).toBeGreaterThan(20)
    }
    expect(builtinTools.filter(tool => !tool.requiresConfirmation)).toHaveLength(18)
    expect(builtinTools).toHaveLength(26)
  })

  it.each(creationStateTools.map(tool => [tool.name, tool] as const))(
    'returns a readable empty state for %s when the project has no data',
    async (_name, tool) => {
      stubApi({})
      const result = await tool.execute({}, createAgentExecutionContext())
      expect(result.success).toBe(true)
      expect(result.error ?? '').toBe('')
      expect(result.content.length).toBeGreaterThan(0)
    },
  )

  it('rejects an unsupported narrative thread status with a readable error', async () => {
    stubApi({})
    const result = await readNarrativeThreadsTool.execute({ status: '不存在的状态' }, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('不支持的状态过滤')
    expect(result.error).toContain('planned')
  })

  it('rejects an unsupported revision status with a readable error', async () => {
    stubApi({})
    const result = await readRevisionProposalsTool.execute({ status: 'whatever' }, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('不支持的修订状态')
  })

  it('lists narrative threads with status projection and recent evidence fingerprints', async () => {
    stubApi({
      'db:narrative-thread-list': [{
        id: 7, title: '蓝色的钥匙', type: 'foreshadowing', status: 'progressing',
        targetStartChapter: 2, targetEndChapter: 6, authorIntent: '揭示证人',
        dormantChapters: 1, overdue: true, createdAt: '', updatedAt: '',
        events: [{
          id: 1, planId: 7, draftId: 3, type: 'planted', chapterNumber: 3, chapterTitle: '门',
          evidence: '钥匙挂在钉子上', reason: '首次出现', evidenceContentHash: 'abcdef0123456789', createdAt: '',
        }],
      }],
    })
    const result = await readNarrativeThreadsTool.execute({}, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('蓝色的钥匙')
    expect(result.content).toContain('progressing')
    expect(result.content).toContain('已逾期')
    expect(result.content).toContain('abcdef012345')
  })

  it('reads reviews of the latest chapter through draft-scoped channels', async () => {
    stubApi({
      'db:draft-list-all': [draft(11, 4, 2)],
      'db:draft-list': [draft(11, 4, 2)],
      'db:review-list': [{ id: 5, baseDraftId: 11, reviewIndex: 1, contentId: 1, createdAt: '2026-01-01' }],
      'db:review-get-full': {
        id: 5, baseDraftId: 11, reviewIndex: 1, contentId: 1, createdAt: '2026-01-01',
        content: '节奏在第 2 段拖沓',
      },
    })
    const result = await readReviewsTool.execute({}, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('第 4 章')
    expect(result.content).toContain('节奏在第 2 段拖沓')
  })

  it('marks pending knowledge events separately from confirmed ones', async () => {
    stubApi({
      'db:character-get-all': [{ name: '林舟' }],
      'db:draft-list-all': [draft(1, 3)],
      'db:knowledge-event-list-for-chapter': [{
        eventId: 'e1', character: '林舟', information: '父亲还活着', certainty: 'knows', falseBelief: false,
        learnedBy: '亲眼所见', sourceChapter: 3, evidence: '信', status: 'confirmed',
      }],
      'db:knowledge-event-list-review': [
        {
          eventId: 'e1', character: '林舟', information: '父亲还活着', certainty: 'knows', falseBelief: false,
          learnedBy: '亲眼所见', sourceChapter: 3, evidence: '信', status: 'confirmed',
        },
        {
          eventId: 'e2', character: '林舟', information: '钥匙在抽屉里', certainty: 'rumor', falseBelief: true,
          learnedBy: '听人说起', sourceChapter: 3, evidence: '', status: 'candidate',
        },
      ],
    })
    const result = await readKnowledgeEventsTool.execute({ include_pending: true }, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('父亲还活着')
    expect(result.content).not.toContain('［候选·未确认］父亲还活着')
    expect(result.content).toContain('钥匙在抽屉里')
    expect(result.content).toContain('［候选·未确认］')
  })

  it('formats a chapter handoff with its source fingerprint', async () => {
    stubApi({
      'db:chapter-handoff-list-all': [{
        handoffId: 'h1', draftId: 9, chapterNumber: 5, sourceContentHash: '0123456789abcdef',
        sceneLocation: '码头', viewpoint: '林舟', presentCharacters: ['林舟', '老陈'],
        unfinishedActions: ['交出钥匙'], immediateGoal: '离开港口', emotionalState: '戒备',
        constraints: ['不能暴露身份'], openQuestions: ['谁在跟踪'], transition: 'time-jump',
        evidence: ['船票'], status: 'confirmed', createdAt: '', updatedAt: '2026-01-02',
      }],
    })
    const result = await readChapterHandoffTool.execute({}, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('码头')
    expect(result.content).toContain('0123456789ab')
    expect(result.content).toContain('谁在跟踪')
  })

  it('surfaces the continuity worksheet including scene causality', async () => {
    stubApi({
      'db:continuity-list-all': [{ draftId: 1, chapterNumber: 6, chapterTitle: '第六章', chapterNotes: '' }],
      'db:story-continuity-read': {
        schemaVersion: 1, chapterNumber: 6, revision: 2,
        sceneBeats: [{
          id: 's1', sceneNumber: 1, status: 'confirmed', entryState: '在雨里', goal: '找到证人',
          obstacle: '门锁着', choice: '撬锁', consequence: '惊动邻居', exitState: '被看见', evidence: ['第 3 段'],
        }],
        arcContribution: {
          volume: '第一卷', mainline: '追查真相', subplots: [], characterArcs: [],
          turningPoint: '第一次撒谎', cost: '失去信任', unresolvedQuestions: [],
        },
        emotionalCarryOver: [], readerExpectations: [], viewpointThreads: [],
      },
      'db:continuity-list-before': [],
    })
    const result = await readStoryContinuityTool.execute({ chapter_number: 6 }, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('场景 1')
    expect(result.content).toContain('撬锁')
    expect(result.content).toContain('追查真相')
  })

  it('summarizes revision proposals with their base fingerprint', async () => {
    stubApi({
      'db:draft-list-all': [draft(4, 2)],
      'db:draft-list': [draft(4, 2)],
      'db:revision-list': [{
        id: 8, baseDraftId: 4, revisionIndex: 1, revisionType: 'refine', status: 'pending',
        mergedToDraftId: null, userPrompt: '收紧开头', reviewSourceId: null, contentId: 1,
        wordCount: 1200, createdAt: '2026-01-03', updatedAt: '', baseContentHash: 'deadbeefcafe0123',
      }],
      'db:revision-get-full': {
        id: 8, baseDraftId: 4, revisionIndex: 1, revisionType: 'refine', status: 'pending',
        mergedToDraftId: null, userPrompt: '收紧开头', reviewSourceId: null, contentId: 1,
        wordCount: 1200, createdAt: '2026-01-03', updatedAt: '', baseContentHash: 'deadbeefcafe0123',
        content: '开头改成雨夜',
      },
    })
    const result = await readRevisionProposalsTool.execute({}, createAgentExecutionContext())
    expect(result.success).toBe(true)
    expect(result.content).toContain('待处理 1 条')
    expect(result.content).toContain('deadbeefcafe')
    expect(result.content).toContain('雨夜')
  })
})
