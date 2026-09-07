import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import StoryContinuityPanel from '../StoryContinuityPanel'
import { useProjectStore } from '../../../stores/project-store'
import { useCharacterStore } from '../../../stores/character-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { emptyStoryContinuityDocument } from '../../../shared/story-continuity'

const PROJECT_PATH = 'C:\\novels\\story-continuity-panel'
const SESSION = { projectId: 'story-continuity', leaseId: 'story-continuity-lease', projectPath: PROJECT_PATH }
let root: Root
let container: HTMLDivElement
let invoke: ReturnType<typeof vi.fn>
let reviewEvents: Array<Record<string, unknown>>
let timelineFixtures: unknown[]

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useProjectStore.setState({ currentProject: { id: SESSION.projectId, sessionLease: SESSION.leaseId, path: PROJECT_PATH, novelConfig: { writingLanguage: 'zh-CN' } } as never })
  useCharacterStore.setState({ characters: [], loaded: false, dataProjectKey: null, dataProjectSession: null } as never)
  setActiveProjectSessionContext(SESSION)
  const empty = emptyStoryContinuityDocument(2)
  reviewEvents = []
  timelineFixtures = []
  invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:story-continuity-read') return empty
    if (channel === 'db:continuity-list-before') return timelineFixtures
    if (channel === 'db:story-continuity-list-all') return []
    if (channel === 'db:knowledge-event-list-for-chapter') return []
    if (channel === 'db:knowledge-event-list-review') return reviewEvents
    if (channel === 'db:knowledge-event-status') {
      const event = reviewEvents.find(candidate => candidate.eventId === args[0])
      return { success: true, event: event ? Object.assign({}, event, { status: args[1] }) : undefined }
    }
    if (channel === 'db:story-continuity-save') return { success: true, document: { ...(args[0] as { document: typeof empty }).document, revision: 1 } }
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
  useCharacterStore.setState({ characters: [], loaded: false, dataProjectKey: null, dataProjectSession: null } as never)
})

describe('StoryContinuityPanel', () => {
  it('opens the author continuity sheet, adds a scene card, and saves with a revision', async () => {
    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    const summary = container.querySelector('summary')
    expect(summary?.textContent).toContain('章节连续性工作单')
    await act(async () => summary?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => container.querySelector('button')?.click())
    expect(container.textContent).toContain('场景 1')
    const goal = [...container.querySelectorAll<HTMLInputElement>('input')].find(input => input.getAttribute('aria-label') === '场景目标')
    expect(goal).not.toBeUndefined()
    if (goal) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(goal, '找到暗锁')
        goal.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('保存工作单'))
    expect(save).not.toBeUndefined()
    await act(async () => save?.click())
    await vi.waitFor(() => expect(invoke.mock.calls.some(([channel]) => channel === 'db:story-continuity-save')).toBe(true))
    expect(container.textContent).toContain('章节连续性计划已保存')
  })

  it('keeps a knowledge candidate out of the writing context until the author confirms it', async () => {
    useCharacterStore.setState({ characters: [{ name: '林夏' }], loaded: true, dataProjectKey: PROJECT_PATH, dataProjectSession: SESSION } as never)
    reviewEvents = [{
      eventId: 'knowledge:candidate', character: '林夏', information: '灯塔会在午夜熄灭',
      certainty: 'fact', falseBelief: false, learnedBy: '亲眼见到', sourceChapter: 1,
      evidence: '她看见灯塔熄灭。', status: 'candidate',
    }]
    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    await vi.waitFor(() => expect(container.textContent).toContain('待确认知情候选'))
    expect(container.textContent).not.toContain('当前角色知情范围（已确认）')
    const confirm = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label')?.includes('确认知情事件'))
    expect(confirm).not.toBeUndefined()
    await act(async () => confirm?.click())
    await vi.waitFor(() => expect(invoke.mock.calls.some(([channel, eventId, status]) => channel === 'db:knowledge-event-status' && eventId === 'knowledge:candidate' && status === 'confirmed')).toBe(true))
    expect(container.textContent).toContain('知情事件已确认并可用于本章写作')
  })

  it('shows active finalized facts in the cross-chapter timeline without editing them', async () => {
    timelineFixtures = [{
      draftId: 7, chapterNumber: 1, chapterTitle: '第一章', chapterNotes: '灯塔异动',
      facts: [{ category: 'plot', entities: ['林夏'], statement: '灯塔会在午夜熄灭', sourceChapter: 1, evidence: '她看见灯塔熄灭。' }],
    }]
    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    await vi.waitFor(() => expect(container.querySelector('[data-continuity-timeline="true"]')).not.toBeNull())
    expect(container.textContent).toContain('灯塔会在午夜熄灭')
    expect(container.textContent).toContain('证据：她看见灯塔熄灭。')
  })
})
