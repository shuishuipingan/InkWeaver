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
let finalizedContent: string | null
let allDocumentsFixture: unknown[]

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useProjectStore.setState({ currentProject: { id: SESSION.projectId, sessionLease: SESSION.leaseId, path: PROJECT_PATH, novelConfig: { writingLanguage: 'zh-CN' } } as never })
  useCharacterStore.setState({ characters: [], loaded: false, dataProjectKey: null, dataProjectSession: null } as never)
  setActiveProjectSessionContext(SESSION)
  const empty = emptyStoryContinuityDocument(2)
  reviewEvents = []
  timelineFixtures = []
  finalizedContent = null
  allDocumentsFixture = []
  invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:story-continuity-read') return empty
    if (channel === 'db:continuity-list-before') return timelineFixtures
    if (channel === 'db:story-continuity-list-all') return allDocumentsFixture
    if (channel === 'db:blueprint-get-all') return []
    if (channel === 'db:chapter-handoff-latest-before') return null
    if (channel === 'db:narrative-thread-list-relevant') return []
    if (channel === 'db:draft-get-finalized') return finalizedContent === null ? null : { id: 7 }
    if (channel === 'db:draft-get-full') return finalizedContent === null ? null : { id: 7, content: finalizedContent }
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
    expect(container.querySelector('[data-writing-preparation="true"]')).not.toBeNull()
    expect(container.textContent).toContain('写前准备摘要')
    await act(async () => summary?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const addScene = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('加场景'))
    await act(async () => addScene?.click())
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

  it('adds evidence-only scene candidates from finalized prose without auto-confirming them', async () => {
    finalizedContent = '她在码头停下，听见仓门里的金属声。\n\n林夏没有推门，先观察守门人的手势。\n\n潮水退去后，暗锁露出一角。'
    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    const extract = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('从定稿提取候选'))
    expect(extract).not.toBeUndefined()
    await act(async () => extract?.click())
    await vi.waitFor(() => expect(container.textContent).toContain('已加入 3 个场景候选'))
    expect([...container.querySelectorAll<HTMLSelectElement>('select')].some(select => select.value === 'candidate')).toBe(true)
    expect(container.textContent).toContain('码头')
  })

  it('surfaces dormant and overdue thread alerts in the writing preparation summary', async () => {
    timelineFixtures = []
    reviewEvents = []
    finalizedContent = null
    invoke = vi.fn(async (channel: string, ..._args: unknown[]) => {
      if (channel === 'db:narrative-thread-list-relevant') {
        return [{ id: 3, title: '灯塔暗语', type: 'mystery', targetStartChapter: 2, targetEndChapter: 6, authorIntent: '逐步揭示', status: 'progressing', dormantChapters: 5, overdue: true, events: [], createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z' }]
      }
      if (channel === 'db:story-continuity-read') return emptyStoryContinuityDocument(2)
      if (channel === 'db:continuity-list-before') return []
      if (channel === 'db:story-continuity-list-all') return []
      if (channel === 'db:blueprint-get-all') return []
      if (channel === 'db:chapter-handoff-latest-before') return null
      if (channel === 'db:knowledge-event-list-for-chapter') return []
      if (channel === 'db:knowledge-event-list-review') return []
      throw new Error('Unexpected IPC ' + channel)
    })
    Object.defineProperty(window, 'velaAPI', { configurable: true, value: { invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn(), setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0) } })
    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    await vi.waitFor(() => expect(container.querySelector('[data-thread-dormant-alerts="true"]')).not.toBeNull())
    expect(container.textContent).toContain('叙事线提醒')
    expect(container.textContent).toContain('灯塔暗语')
    expect(container.textContent).toContain('已逾期')
  })


  it('warns about previous-chapter emotional carry-over not yet picked up', async () => {
    timelineFixtures = []
    reviewEvents = []
    finalizedContent = null
    const previous = emptyStoryContinuityDocument(1)
    previous.emotionalCarryOver = [{
      character: '林夏', previousState: '恐惧', trigger: '看见暗门', choice: '推门',
      cost: '手受伤', nextState: '执拗', evidence: ['她推开了暗门。'],
    }]
    allDocumentsFixture = [previous]

    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    await vi.waitFor(() => expect(container.querySelector('[data-emotional-carryover-alert="true"]')).not.toBeNull())
    expect(container.textContent).toContain('上一章情绪余波待承接')
    expect(container.textContent).toContain('林夏')
    expect(container.textContent).toContain('执拗')
  })


  it('shows reader expectations that are due in the current chapter', async () => {
    timelineFixtures = []
    reviewEvents = []
    finalizedContent = null
    const previous = emptyStoryContinuityDocument(1)
    previous.readerExpectations = [{
      id: 'expect-door', question: '门后的人是谁？', introducedChapter: 1,
      expectedProgress: '本章揭晓声音来源', dueChapter: 2, status: 'open', delayReason: '', evidence: [],
    }]
    allDocumentsFixture = [previous]

    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    await vi.waitFor(() => expect(container.querySelector('[data-due-expectations-alert="true"]')).not.toBeNull())
    expect(container.textContent).toContain('本章到期读者期待')
    expect(container.textContent).toContain('门后的人是谁？')
  })


  it('shows previous viewpoint landing points and reader knowledge', async () => {
    timelineFixtures = []
    reviewEvents = []
    finalizedContent = null
    const previous = emptyStoryContinuityDocument(1)
    previous.viewpointThreads = [{
      viewpoint: '林夏', lastChapter: 1, unresolvedHooks: ['信是谁寄出的'],
      readerKnowledge: '读者知道信来自未来', nextLanding: '第二章回码头',
    }]
    allDocumentsFixture = [previous]

    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={2} />))
    await vi.waitFor(() => expect(container.querySelector('[data-previous-viewpoint-knowledge="true"]')).not.toBeNull())
    expect(container.textContent).toContain('林夏')
    expect(container.textContent).toContain('读者知道信来自未来')
    expect(container.textContent).toContain('信是谁寄出的')
  })

  it('shows a chronological reader-knowledge ledger separate from character knowledge', async () => {
    const first = emptyStoryContinuityDocument(1)
    first.viewpointThreads = [{
      viewpoint: '林夏', lastChapter: 1, unresolvedHooks: ['信是谁寄出的'],
      readerKnowledge: '读者知道信来自未来', nextLanding: '第二章回码头',
    }]
    const second = emptyStoryContinuityDocument(2)
    second.viewpointThreads = [{
      viewpoint: '顾舟', lastChapter: 2, unresolvedHooks: ['谁在跟踪他'],
      readerKnowledge: '读者知道跟踪者拿着旧钥匙', nextLanding: '第三章切回林夏',
    }]
    allDocumentsFixture = [first, second]

    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={3} />))
    await vi.waitFor(() => expect(container.querySelector('[data-reader-knowledge-ledger="true"]')).not.toBeNull())
    const ledger = container.querySelector('[data-reader-knowledge-ledger="true"]')
    expect(ledger?.textContent).toContain('读者知识账本')
    expect(ledger?.textContent).toContain('第1章')
    expect(ledger?.textContent).toContain('读者知道信来自未来')
    expect(ledger?.textContent).toContain('谁在跟踪他')
    expect(container.querySelector('[data-knowledge-boundary="true"]')).toBeNull()
  })

  it('shows cross-volume trends as an accessible progression of continuing and new threads', async () => {
    const firstVolume = emptyStoryContinuityDocument(1)
    firstVolume.arcContribution = {
      ...firstVolume.arcContribution,
      volume: '第一卷',
      mainline: '建立日常',
      subplots: ['神秘信'],
    }
    const secondVolume = emptyStoryContinuityDocument(2)
    secondVolume.arcContribution = {
      ...secondVolume.arcContribution,
      volume: '第二卷',
      mainline: '建立日常',
      subplots: ['神秘信', '新支线'],
    }
    allDocumentsFixture = [firstVolume, secondVolume]

    await act(async () => root.render(<StoryContinuityPanel projectKey={PROJECT_PATH} chapterNumber={3} />))
    await vi.waitFor(() => expect(container.querySelector('[data-volume-trends="true"]')).not.toBeNull())
    expect(container.textContent).toContain('跨卷趋势')
    expect(container.textContent).toContain('第一卷')
    expect(container.textContent).toContain('第二卷')
    expect(container.textContent).toContain('延续主线：建立日常')
    expect(container.textContent).toContain('新支线：新支线')
  })
})
