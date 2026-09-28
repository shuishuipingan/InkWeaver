import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { useProjectStore } from '../../../stores/project-store'
import { useLLMStore } from '../../../stores/llm-store'
import type { StoryDirectionSnapshot } from '../../../shared/story-direction'
import '../../../index.css'
import BlueprintTitleBatchDialog from '../BlueprintTitleBatchDialog'

const invoke = vi.fn()
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const projectPath = 'C:\\novels\\title-batch-test'
const session = { projectId: 'title-batch-test', leaseId: 'title-batch-test-lease', projectPath }
const snapshot: StoryDirectionSnapshot = {
  core: {
    projectName: '测试小说', genre: '悬疑', subGenre: '', targetAudience: '', totalChapters: 3,
    wordsPerChapter: 3_000, writingLanguage: 'zh-CN', creativeStrategy: 'auto',
    narrativeThreadDormantChapterThreshold: 8, plotStructure: '', narrativePov: '', writingStyle: '',
    referenceWorks: '', globalGuidance: '', goldenFinger: '', coreOutline: '', worldSetting: '',
    protagonistProfile: '', premise: '主角追查一封旧信', worldbuilding: '', charactersArch: '',
    synopsis: '', characterStates: '',
  },
  blueprints: [1, 2, 3].map(chapterNumber => ({
    chapterNumber,
    title: ['定稿标题', '旧标题二', '旧标题三'][chapterNumber - 1]!,
    role: '发展', purpose: `第${chapterNumber}章追查旧信`, keyEvents: `主角发现第${chapterNumber}条线索。`,
    characters: ['主角'], suspenseHook: '信件来源仍未查明。', userGuidance: '', notes: '', notesUpdatedAt: '',
  })),
  drafts: [
    { id: 1, chapterNumber: 1, version: 1, status: 'finalized' },
    { id: 2, chapterNumber: 2, version: 1, status: 'draft' },
  ],
  threadPlans: [],
  fingerprint: 'b'.repeat(64),
}

let root: Root | undefined
let host: HTMLDivElement | undefined
const onClose = vi.fn()
const onApplied = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  onClose.mockReset()
  onApplied.mockReset()
  invoke.mockImplementation(async (channel: string, request?: { purpose?: string }) => {
    if (channel === 'db:story-direction-snapshot') return snapshot
    if (channel === 'llm:generate') return {
      success: true,
      finishReason: 'stop',
      content: JSON.stringify({ titles: [
        { chapterNumber: 2, title: '雨夜来信' },
        { chapterNumber: 3, title: '信封里的第三道痕迹' },
      ] }),
    }
    if (channel === 'db:story-direction-apply') {
      const plan = request as unknown as { blueprintChanges?: Array<{ chapterNumber: number; changes: { title?: string } }> }
      return {
        success: true,
        snapshot: {
          ...snapshot,
          blueprints: snapshot.blueprints.map(blueprint => ({
            ...blueprint,
            ...(plan.blueprintChanges?.find(change => change.chapterNumber === blueprint.chapterNumber)?.changes ?? {}),
          })),
          fingerprint: 'f'.repeat(64),
        },
      }
    }
    if (channel.startsWith('runtime:')) return { success: true }
    throw new Error(`Unexpected IPC: ${channel} (${request?.purpose ?? ''})`)
  })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: { invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn(), setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0) },
  })
  useProjectStore.setState({
    currentProject: { id: session.projectId, path: projectPath, sessionLease: session.leaseId, name: '测试小说' } as never,
  })
  useLLMStore.setState({ defaultModelId: 'test-model', models: [] })
  setActiveProjectSessionContext(session)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

it('previews editable title suggestions and applies only selected unfinished chapters', async () => {
  await act(async () => root?.render(<BlueprintTitleBatchDialog open onClose={onClose} onApplied={onApplied} />))
  await expect.element(page.getByText(/待处理 2 章/u)).toBeVisible()
  await expect.element(page.getByText('定稿标题')).not.toBeInTheDocument()

  await act(async () => page.getByRole('button', { name: 'AI 生成标题' }).click())
  await expect.element(page.getByRole('textbox', { name: '第 2 章候选标题' })).toHaveValue('雨夜来信')
  await expect.element(page.getByRole('textbox', { name: '第 3 章候选标题' })).toHaveValue('信封里的第三道痕迹')
  await act(async () => page.getByRole('textbox', { name: '第 2 章候选标题' }).fill('信笺背面的脚印'))
  await act(async () => page.getByRole('checkbox', { name: '应用第 3 章标题' }).click())
  await act(async () => page.getByRole('button', { name: '应用选中 (1)' }).click())

  const applied = invoke.mock.calls.find(([channel]) => channel === 'db:story-direction-apply')?.[1] as {
    expectedFingerprint: string
    blueprintChanges: Array<{ chapterNumber: number; changes: { title: string } }>
  } | undefined
  expect(applied).toMatchObject({
    expectedFingerprint: snapshot.fingerprint,
    blueprintChanges: [{ chapterNumber: 2, changes: { title: '信笺背面的脚印' } }],
  })
  await expect.element(page.getByRole('textbox', { name: '第 3 章候选标题' })).toHaveValue('信封里的第三道痕迹')
  expect(onApplied).toHaveBeenCalledOnce()
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => page.getByRole('button', { name: '关闭' }).first().click())
  expect(onClose).toHaveBeenCalledOnce()
})

it('keeps the completed last batch selectable when generation is stopped after its response', async () => {
  const defaultImplementation = invoke.getMockImplementation()!
  let resolveTitleResponse: ((response: { success: boolean; finishReason: string; content: string }) => void) | undefined
  invoke.mockImplementation(async (...args: unknown[]) => {
    if (args[0] === 'llm:generate') {
      return new Promise(resolve => {
        resolveTitleResponse = resolve
      })
    }
    return defaultImplementation(...args)
  })

  await act(async () => root?.render(<BlueprintTitleBatchDialog open onClose={onClose} onApplied={onApplied} />))
  await expect.element(page.getByText(/待处理 2 章/u)).toBeVisible()
  await act(async () => page.getByRole('button', { name: 'AI 生成标题' }).click())
  await expect.element(page.getByRole('status').getByText('已生成或应用 0/2')).toBeVisible()
  await act(async () => page.getByRole('button', { name: '停止后续批次' }).click())
  await act(async () => resolveTitleResponse?.({
    success: true,
    finishReason: 'stop',
    content: JSON.stringify({ titles: [
      { chapterNumber: 2, title: '雨夜来信' },
      { chapterNumber: 3, title: '信封里的第三道痕迹' },
    ] }),
  }))

  await expect.element(page.getByRole('button', { name: '应用选中 (2)' })).not.toBeDisabled()
})

it('applies selected generated titles before all chapter batches have finished', async () => {
  const pendingSnapshot: StoryDirectionSnapshot = {
    ...snapshot,
    core: { ...snapshot.core, totalChapters: 11 },
    blueprints: Array.from({ length: 11 }, (_, index) => ({
      chapterNumber: index + 1,
      title: `旧标题${index + 1}`,
      role: '发展', purpose: `第${index + 1}章目标`, keyEvents: `第${index + 1}章事件`,
      characters: ['主角'], suspenseHook: '线索尚未揭晓。', userGuidance: '', notes: '', notesUpdatedAt: '',
    })),
    drafts: [],
    fingerprint: 'c'.repeat(64),
  }
  const savedSnapshot: StoryDirectionSnapshot = {
    ...pendingSnapshot,
    blueprints: pendingSnapshot.blueprints.map(blueprint => blueprint.chapterNumber === 1
      ? { ...blueprint, title: 'AI新标题1' }
      : blueprint),
    fingerprint: 'd'.repeat(64),
  }
  const defaultImplementation = invoke.getMockImplementation()!
  let resolveFirstBatch: ((response: { success: boolean; finishReason: string; content: string }) => void) | undefined
  invoke.mockImplementation(async (...args: unknown[]) => {
    if (args[0] === 'db:story-direction-snapshot') return pendingSnapshot
    if (args[0] === 'llm:generate') {
      return new Promise(resolve => { resolveFirstBatch = resolve })
    }
    if (args[0] === 'db:story-direction-apply') return { success: true, snapshot: savedSnapshot }
    return defaultImplementation(...args)
  })

  await act(async () => root?.render(<BlueprintTitleBatchDialog open onClose={onClose} onApplied={onApplied} />))
  await expect.element(page.getByText(/待处理 11 章/u)).toBeVisible()
  await act(async () => page.getByRole('button', { name: 'AI 生成标题' }).click())
  await expect.element(page.getByRole('status').getByText('已生成或应用 0/11')).toBeVisible()
  await act(async () => page.getByRole('button', { name: '停止后续批次' }).click())
  await act(async () => resolveFirstBatch?.({
    success: true,
    finishReason: 'stop',
    content: JSON.stringify({ titles: Array.from({ length: 10 }, (_, index) => ({
      chapterNumber: index + 1, title: `AI新标题${index + 1}`,
    })) }),
  }))

  await expect.element(page.getByText(/已暂停。已处理 10\/11 章/u)).toBeVisible()
  await act(async () => page.getByRole('checkbox', { name: '应用第 1 章标题' }).click())
  const applyButton = page.getByRole('button', { name: '应用选中 (1)' })
  await expect.element(applyButton).not.toBeDisabled()
  await act(async () => applyButton.click())

  const applied = invoke.mock.calls.find(([channel]) => channel === 'db:story-direction-apply')?.[1] as {
    blueprintChanges: Array<{ chapterNumber: number; changes: { title: string } }>
  } | undefined
  expect(applied?.blueprintChanges).toEqual([{ chapterNumber: 1, changes: { title: 'AI新标题1' } }])
  expect(onApplied).toHaveBeenCalledOnce()

  await act(async () => page.getByRole('button', { name: '继续生成' }).click())
  await expect.element(page.getByRole('status').getByText('已生成或应用 10/11')).toBeVisible()
  await act(async () => resolveFirstBatch?.({
    success: true,
    finishReason: 'stop',
    content: JSON.stringify({ titles: [{ chapterNumber: 11, title: 'AI新标题11' }] }),
  }))
  await expect.element(page.getByRole('textbox', { name: '第 11 章候选标题' })).toHaveValue('AI新标题11')
})

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  setActiveProjectSessionContext(null)
})
