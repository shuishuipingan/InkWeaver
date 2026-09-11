import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ContinuousReader from '../ContinuousReader'
import { useProjectStore } from '../../../stores/project-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'

const PROJECT_PATH = 'C:\\novels\\continuous-reader'
const SESSION = { projectId: 'continuous-reader', leaseId: 'continuous-reader-lease', projectPath: PROJECT_PATH }
let root: Root
let container: HTMLDivElement
let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useProjectStore.setState({ currentProject: { id: SESSION.projectId, sessionLease: SESSION.leaseId, path: PROJECT_PATH, novelConfig: { writingLanguage: 'zh-CN' } } as never })
  setActiveProjectSessionContext(SESSION)
  const records = [
    { id: 11, chapterNumber: 1, chapterTitle: '潮汐来信', version: 1, status: 'finalized' },
    { id: 12, chapterNumber: 2, chapterTitle: '灯塔回声', version: 1, status: 'finalized' },
  ]
  invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:draft-list-all') return records
    if (channel === 'db:draft-get-full') return { id: args[0], content: `第${args[0] === 11 ? 1 : 2}章正文` }
    if (channel === 'db:chapter-handoff-list-all') return [{
      handoffId: 'handoff-1', draftId: 11, chapterNumber: 1, sourceContentHash: 'a'.repeat(64),
      sceneLocation: '灯塔下的信匣', viewpoint: '林夏', presentCharacters: ['林夏'],
      unfinishedActions: ['核对寄信人'], immediateGoal: '确认信件来源', emotionalState: '警惕但克制',
      constraints: ['不能惊动守门人'], openQuestions: ['寄信人是谁？'], transition: 'viewpoint-change',
      evidence: ['她把信封压在灯塔地图下，听见门外脚步声。'], status: 'confirmed', createdAt: '', updatedAt: '',
    }]
    if (channel === 'db:continuity-list-all') return [{
      draftId: 11, chapterNumber: 1, chapterTitle: '潮汐来信', chapterNotes: '林夏发现未来信件。',
      facts: [{ category: 'open-thread', entities: ['林夏'], statement: '寄信人身份仍未揭示', sourceChapter: 1, evidence: '信封没有署名。' }],
    }]
    throw new Error(`Unexpected IPC ${channel}`)
  })
  Object.defineProperty(window, 'velaAPI', { configurable: true, value: { invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn(), setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0) } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(window, 'velaAPI')
  setActiveProjectSessionContext(null)
  useProjectStore.setState({ currentProject: null })
})

describe('ContinuousReader', () => {
  it('loads finalized chapters as one readable stream and preserves chapter navigation', async () => {
    await act(async () => root.render(<ContinuousReader projectKey={PROJECT_PATH} />))
    await vi.waitFor(() => expect(container.querySelector('[data-continuous-reader="true"]')).not.toBeNull())
    expect(container.textContent).toContain('潮汐来信')
    expect(container.textContent).toContain('灯塔回声')
    expect(container.textContent).toContain('章节边界')
    expect(container.textContent).toContain('她把信封压在灯塔地图下')
    expect(container.textContent).toContain('寄信人身份仍未揭示')
    const next = container.querySelector('button[aria-label="下一章"]') as HTMLButtonElement | null
    expect(next).not.toBeNull()
    await act(async () => next?.click())
    expect(container.textContent).toContain('2/2')
  })
})
