import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { globalEventBus } from '../../../shared/event-bus'
import { useProjectStore } from '../../../stores/project-store'
import { useLLMStore } from '../../../stores/llm-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { useEditorStore } from '../../../stores/editor-store'
import type { StoryDirectionRun, StoryDirectionSnapshot } from '../../../shared/story-direction'
import StoryDirectionDialog from '../StoryDirectionDialog'

const invoke = vi.fn()
const syncCommittedProjectName = vi.fn(async () => true)
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const projectPath = 'C:\\novels\\direction-test'
const session = { projectId: 'direction-test', leaseId: 'direction-test-lease', projectPath }
const snapshot: StoryDirectionSnapshot = {
  core: { premise: '主角独自面对危机', coreOutline: '主角成长', globalGuidance: '' } as StoryDirectionSnapshot['core'],
  blueprints: [
    { chapterNumber: 1, title: '定稿章', role: '开篇', purpose: '旧事实', keyEvents: '主角独自脱险', characters: ['主角'], suspenseHook: '', userGuidance: '', notes: '', notesUpdatedAt: '' },
    { chapterNumber: 2, title: '危机', role: '冲突', purpose: '旧目的', keyEvents: '遭遇追兵', characters: ['主角'], suspenseHook: '', userGuidance: '', notes: '', notesUpdatedAt: '' },
  ],
  drafts: [
    { id: 1, chapterNumber: 1, version: 1, status: 'finalized' },
    { id: 2, chapterNumber: 2, version: 1, status: 'draft' },
  ],
  threadPlans: [],
  fingerprint: 'a'.repeat(64),
}
let root: Root | undefined
let host: HTMLDivElement | undefined
let appliedRun: StoryDirectionRun | null

beforeEach(() => {
  invoke.mockReset()
  syncCommittedProjectName.mockReset()
  syncCommittedProjectName.mockResolvedValue(true)
  appliedRun = null
  invoke.mockImplementation(async (channel: string, request: { purpose: string }) => {
    if (channel === 'db:story-direction-snapshot') return snapshot
    if (channel === 'db:character-roster-read') return { status: 'ready', revision: 0, entries: [{ name: '主角', role: 'protagonist', personality: '', abilities: '', arc: '' }] }
    if (channel === 'db:story-direction-latest-run') return appliedRun
    if (channel === 'db:story-direction-apply') {
      const plan = request as unknown as { idea: string; modelId: string; coreChanges: StoryDirectionRun['coreChanges']; blueprintChanges: StoryDirectionRun['blueprintChanges']; terminologyReplacements: StoryDirectionRun['terminologyReplacements']; generateDraftCandidates: boolean }
      appliedRun = {
        id: 'test-run', idea: plan.idea, modelId: plan.modelId, coreChanges: plan.coreChanges,
        characterChanges: [],
        terminologyReplacements: plan.terminologyReplacements,
        newNarrativeThreads: [],
        blueprintChanges: plan.blueprintChanges,
        drafts: plan.generateDraftCandidates ? [{ draftId: 2, chapterNumber: 2, status: 'pending' }] : [],
      }
      return { success: true, snapshot, runId: 'test-run' }
    }
    if (channel === 'db:draft-get-full') return { id: 2, status: 'draft', content: '主角遭遇追兵。' }
    if (channel === 'db:story-direction-save-candidate') {
      if (appliedRun) appliedRun = { ...appliedRun, drafts: [{ draftId: 2, chapterNumber: 2, status: 'completed', revisionId: 3 }] }
      return { success: true, revisionId: 3 }
    }
    if (channel !== 'llm:generate') throw new Error(channel)
    return {
      success: true, finishReason: 'stop',
      content: request.purpose === 'story-direction-global'
        ? JSON.stringify({ coreChanges: { premise: '第二人格在危机时帮助主角' }, summary: '埋下人格伏笔', conflicts: [] })
        : request.purpose === 'story-direction-characters'
          ? JSON.stringify({ coreChanges: {}, characterChanges: [], conflicts: [] })
        : request.purpose === 'story-direction-blueprints'
          ? JSON.stringify({ changes: [{ chapterNumber: 2, changes: { purpose: '第二人格帮助主角脱险' } }] })
          : '主角遭遇追兵。第二人格出现，帮助主角脱险。',
    }
  })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0),
    },
  })
  useProjectStore.setState({
    currentProject: { id: session.projectId, path: projectPath, sessionLease: session.leaseId, name: '测试小说',
      novelConfig: { totalChapters: 2 } } as never,
    hasUnsavedNovelConfig: () => false,
    syncCommittedNovelConfig: vi.fn(),
    syncCommittedProjectName,
  })
  useLLMStore.setState({ defaultModelId: 'model' })
  useWorkflowStore.setState({ activeRuns: [] })
  useEditorStore.setState({ tabs: [] })
  setActiveProjectSessionContext(session)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

it('creates a source-bound candidate revision without overwriting the unfinished draft', async () => {
  await act(async () => root?.render(<StoryDirectionDialog open onClose={vi.fn()} onApplied={vi.fn()} />))
  await expect.element(page.getByText(/将分析 1 章/)).toBeVisible()
  await act(async () => page.getByPlaceholder(/主角有第二人格/).fill('主角有第二人格'))
  await act(async () => page.getByRole('button', { name: '生成调整方案' }).click())
  await expect.element(page.getByText('埋下人格伏笔')).toBeVisible()
  await act(async () => page.getByRole('button', { name: '确认并应用规划' }).click())
  await expect.element(page.getByText(/候选修稿成功 1 章/)).toBeVisible()
  const revisionCall = invoke.mock.calls.find(([channel]) => channel === 'db:story-direction-save-candidate')
  expect(revisionCall?.[1]).toMatchObject({ runId: 'test-run', draftId: 2 })
  expect(revisionCall?.[1].baseContentHash).toMatch(/^[a-f0-9]{64}$/)
  expect(invoke.mock.calls.some(([channel]) => channel === 'db:draft-update-content')).toBe(false)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  setActiveProjectSessionContext(null)
})

it('previews a direction plan and applies only the unfinished chapter after confirmation', async () => {
  await act(async () => root?.render(<StoryDirectionDialog open onClose={vi.fn()} onApplied={vi.fn()} />))
  await expect.element(page.getByText(/将分析 1 章/)).toBeVisible()
  await act(async () => page.getByPlaceholder(/主角有第二人格/).fill('主角有第二人格，关键时刻帮忙'))
  await act(async () => page.getByRole('checkbox', { name: /同时替换|未定稿正文/ }).click())
  await act(async () => page.getByRole('button', { name: '生成调整方案' }).click())
  await expect.element(page.getByText('埋下人格伏笔')).toBeVisible()
  expect(invoke.mock.calls.some(([channel]) => channel === 'db:story-direction-apply')).toBe(false)
  await act(async () => page.getByRole('button', { name: '确认并应用规划' }).click())
  await expect.element(page.getByText(/规划已提交/)).toBeVisible()
  const applied = invoke.mock.calls.find(([channel]) => channel === 'db:story-direction-apply')?.[1]
  expect(applied).toMatchObject({
    expectedFingerprint: snapshot.fingerprint,
    coreChanges: { premise: '第二人格在危机时帮助主角' },
    blueprintChanges: [{ chapterNumber: 2, changes: { purpose: '第二人格帮助主角脱险' } }],
  })
})

it('requires acknowledgement of finalized-fact conflicts before applying', async () => {
  const normalInvoke = invoke.getMockImplementation()!
  invoke.mockImplementation(async (...args: unknown[]) => {
    if (args[0] === 'llm:generate' && (args[1] as { purpose: string }).purpose === 'story-direction-global') {
      return { success: true, finishReason: 'stop', content: JSON.stringify({
        coreChanges: { premise: '第二人格一直存在' }, summary: '增加伏笔',
        conflicts: ['第1章已定稿，不能改写其表现'],
      }) }
    }
    return normalInvoke(...args)
  })
  await act(async () => root?.render(<StoryDirectionDialog open onClose={vi.fn()} onApplied={vi.fn()} />))
  await expect.element(page.getByText(/将分析 1 章/)).toBeVisible()
  await act(async () => page.getByPlaceholder(/主角有第二人格/).fill('主角有第二人格'))
  await act(async () => page.getByRole('checkbox', { name: /同时替换|未定稿正文/ }).click())
  await act(async () => page.getByRole('button', { name: '生成调整方案' }).click())
  await expect.element(page.getByText('第1章已定稿，不能改写其表现')).toBeVisible()
  await expect.element(page.getByRole('button', { name: '确认并应用规划' })).toBeDisabled()
  await act(async () => page.getByRole('checkbox', { name: /我已核对这些冲突/ }).click())
  await expect.element(page.getByRole('button', { name: '确认并应用规划' })).not.toBeDisabled()
})

it('resumes pending candidate revisions after reopening the dialog', async () => {
  appliedRun = {
    id: 'test-run', idea: '主角有第二人格', modelId: 'model',
    coreChanges: { premise: '第二人格在危机时出现' },
    characterChanges: [],
    terminologyReplacements: [],
    newNarrativeThreads: [],
    blueprintChanges: [{ chapterNumber: 2, changes: { purpose: '第二人格帮助主角脱险' } }],
    drafts: [{ draftId: 2, chapterNumber: 2, status: 'pending' }],
  }
  await act(async () => root?.render(<StoryDirectionDialog open onClose={vi.fn()} onApplied={vi.fn()} />))
  await expect.element(page.getByText(/上次方向调整仍有 1 章/)).toBeVisible()
  await act(async () => page.getByRole('button', { name: '继续上次候选修稿' }).click())
  await expect.element(page.getByText(/候选修稿成功 1 章/)).toBeVisible()
  expect(invoke.mock.calls.some(([channel]) => channel === 'db:story-direction-apply')).toBe(false)
  expect(invoke.mock.calls.some(([channel]) => channel === 'db:story-direction-save-candidate')).toBe(true)
})

it('analyzes character cards beyond the first 80 in separate batches', async () => {
  const normalInvoke = invoke.getMockImplementation()!
  invoke.mockImplementation(async (...args: unknown[]) => {
    if (args[0] === 'db:character-roster-read') return {
      status: 'ready', revision: 0,
      entries: Array.from({ length: 81 }, (_, index) => ({
        name: `角色${index + 1}`, role: 'supporting', personality: '', abilities: '',
        motivation: '', arc: '', notes: '',
      })),
    }
    if (args[0] === 'llm:generate' && (args[1] as { purpose: string }).purpose === 'story-direction-characters') {
      const prompt = JSON.parse((args[1] as { messages: Array<{ content: string }> }).messages[1].content) as {
        characters: Array<{ name: string }>
      }
      return { success: true, finishReason: 'stop', content: JSON.stringify({
        coreChanges: {}, conflicts: [],
        characterChanges: prompt.characters.some(item => item.name === '角色81')
          ? [{ name: '角色81', changes: { arc: '与第二人格和解' } }] : [],
      }) }
    }
    return normalInvoke(...args)
  })
  await act(async () => root?.render(<StoryDirectionDialog open onClose={vi.fn()} onApplied={vi.fn()} />))
  await expect.element(page.getByText(/将分析 1 章/)).toBeVisible()
  await act(async () => page.getByPlaceholder(/主角有第二人格/).fill('主角有第二人格'))
  await act(async () => page.getByRole('button', { name: '生成调整方案' }).click())
  await expect.element(page.getByText(/角色卡调整（1 人）/)).toBeVisible()
  expect(invoke.mock.calls.filter(([channel, request]) => channel === 'llm:generate'
    && request.purpose === 'story-direction-characters')).toHaveLength(5)
})

it('previews explicit term mappings and keeps the same replacements in candidate prose', async () => {
  const renamedSnapshot: StoryDirectionSnapshot = {
    ...snapshot,
    blueprints: snapshot.blueprints.map(blueprint => blueprint.chapterNumber === 2
      ? { ...blueprint, characters: ['幽狼'] }
      : blueprint),
  }
  const defaultInvoke = invoke.getMockImplementation()!
  const refreshedArchitectureFiles: string[] = []
  const unsubscribe = globalEventBus.on('ARCH_FILE_UPDATED', event => refreshedArchitectureFiles.push(event.fileName))
  const currentProject = useProjectStore.getState().currentProject!
  useProjectStore.setState({ currentProject: { ...currentProject, name: '幽狼的世界' } })
  invoke.mockImplementation(async (channel: string, request: { purpose: string; messages?: Array<{ content: string }> }) => {
    if (channel === 'db:story-direction-snapshot') return renamedSnapshot
    if (channel === 'db:character-roster-read') return {
      status: 'ready', revision: 4, entries: [{ name: '幽狼', role: 'protagonist', personality: '', abilities: '', arc: '' }],
    }
    if (channel === 'llm:generate' && request.purpose === 'story-direction-global') {
      return { success: true, finishReason: 'stop', content: JSON.stringify({
        coreChanges: { terminology: { 幽狼: '凤凰', 黑虫系统: '智虫' } },
        summary: '替换角色名与系统名', conflicts: [],
      }) }
    }
    if (channel === 'llm:generate' && request.purpose === 'story-direction-blueprints') {
      return { success: true, finishReason: 'stop', content: JSON.stringify({
        changes: [{ chapterNumber: 2, changes: { characters: ['凤凰'], purpose: '凤凰使用智虫追踪线索' } }],
      }) }
    }
    if (channel === 'llm:generate' && request.purpose === 'story-direction-draft-candidate') {
      return { success: true, finishReason: 'stop', content: '幽狼再次检查黑虫系统。' }
    }
    if (channel === 'db:draft-get-full') return { id: 2, status: 'draft', content: '幽狼遭遇追兵，黑虫系统记录线索。' }
    return defaultInvoke(channel, request)
  })

  await act(async () => root?.render(<StoryDirectionDialog open onClose={vi.fn()} onApplied={vi.fn()} />))
  await expect.element(page.getByText(/将分析 1 章/)).toBeVisible()
  await act(async () => page.getByPlaceholder(/主角有第二人格/).fill('幽狼换成凤凰，黑虫系统换成智虫'))
  await act(async () => page.getByRole('button', { name: '生成调整方案' }).click())
  await expect.element(page.getByText('幽狼 → 凤凰')).toBeVisible()
  await expect.element(page.getByText('黑虫系统 → 智虫')).toBeVisible()
  await act(async () => page.getByRole('button', { name: '确认并应用规划' }).click())
  await expect.element(page.getByText(/候选修稿成功 1 章/)).toBeVisible()

  const applied = invoke.mock.calls.find(([channel]) => channel === 'db:story-direction-apply')?.[1]
  expect(applied).toMatchObject({
    terminologyReplacements: [{ from: '幽狼', to: '凤凰' }, { from: '黑虫系统', to: '智虫' }],
    expectedRosterRevision: 4,
    draftCandidateChapterNumbers: [2],
  })
  expect(syncCommittedProjectName).toHaveBeenCalledWith('凤凰的世界', session)
  expect(refreshedArchitectureFiles).toEqual(['premise.md', 'worldbuilding.md', 'synopsis.md', 'characters.md'])
  const revision = invoke.mock.calls.find(([channel]) => channel === 'db:story-direction-save-candidate')?.[1]
  expect(revision?.content).toBe('凤凰再次检查智虫。')
  unsubscribe()
})
