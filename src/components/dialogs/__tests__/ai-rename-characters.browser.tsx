import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { CharacterData } from '../../../../electron/repositories/character-repository'
import { globalEventBus } from '../../../shared/event-bus'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { useCharacterStore } from '../../../stores/character-store'
import { useEditorStore } from '../../../stores/editor-store'
import { useLLMStore } from '../../../stores/llm-store'
import { useProjectStore } from '../../../stores/project-store'
import AIRenameCharactersDialog from '../AIRenameCharactersDialog'

const invoke = vi.fn()
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const projectPath = 'C:\\novels\\rename-settings-test'
const session = { projectId: 'rename-settings-test', leaseId: 'rename-settings-test-lease', projectPath }
const character: CharacterData = {
  name: '幽狼', role: 'protagonist', gender: '', age: '', appearance: '', personality: '',
  background: '', abilities: '', motivation: '', relationships: '', arc: '', notes: '',
}
const secondCharacter: CharacterData = {
  ...character, name: '灰鸦', role: 'supporting',
}
const saveAll = vi.fn(async () => undefined)
const renameCharactersBatch = vi.fn((pairs: Array<{ from: string; to: string }>) => {
  // 真实 store 会在一次调用里把整份名单改名，这里用同样的语义驱动界面。
  const targets = new Map(pairs.map(pair => [pair.from, pair.to] as const))
  useCharacterStore.setState(state => ({
    characters: state.characters.map(character => (
      targets.has(character.name) ? { ...character, name: targets.get(character.name)! } : character
    )),
  }))
  return true
})
const syncCommittedNovelConfig = vi.fn()
const syncCommittedProjectName = vi.fn(async () => true)
let root: Root | undefined
let host: HTMLDivElement | undefined

beforeEach(() => {
  invoke.mockReset()
  saveAll.mockClear()
  saveAll.mockImplementation(async () => undefined)
  renameCharactersBatch.mockClear()
  syncCommittedNovelConfig.mockClear()
  syncCommittedProjectName.mockClear()
  invoke.mockImplementation(async (channel: string) => {
    if (channel === 'llm:generate') return {
      success: true, finishReason: 'stop',
      content: JSON.stringify({ renames: [
        { from: '幽狼', to: '凤凰', reason: '符合全书设定' },
        { from: '灰鸦', to: '乌雀', reason: '保持角色气质' },
      ] }),
    }
    throw new Error(`Unexpected IPC: ${channel}`)
  })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: { invoke, on: vi.fn(() => () => {}), once: vi.fn(), send: vi.fn() },
  })
  useCharacterStore.setState({
    characters: [character, secondCharacter], identityBusy: false,
    renameCharacter: vi.fn(() => true), renameCharactersBatch, saveAll,
  } as never)
  useEditorStore.setState({ tabs: [], activeTabId: null, draftLedgers: {} })
  useProjectStore.setState({
    currentProject: {
      id: session.projectId, path: projectPath, sessionLease: session.leaseId, name: '幽狼的世界',
      novelConfig: {
        projectName: '幽狼的归途', premise: '幽狼借助黑虫系统脱险',
        protagonistProfile: '幽狼与伙伴并肩行动', totalChapters: 20,
      },
    } as never,
    hasUnsavedNovelConfig: () => false,
    syncCommittedNovelConfig,
    syncCommittedProjectName,
  })
  useLLMStore.setState({ defaultModelId: 'test-model', models: [] })
  setActiveProjectSessionContext(session)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

it('refreshes the open novel settings after roster rename commits them to storage', async () => {
  const refreshedArchitectureFiles: string[] = []
  const unsubscribe = globalEventBus.on('ARCH_FILE_UPDATED', event => refreshedArchitectureFiles.push(event.fileName))
  await act(async () => root?.render(<AIRenameCharactersDialog onClose={vi.fn()} />))
  await act(async () => page.getByRole('checkbox', { name: '同时替换未定稿正文中的角色名' }).click())
  await act(async () => page.getByRole('button', { name: 'AI 生成新名字' }).click())
  await expect.element(page.getByText('幽狼')).toBeVisible()
  await act(async () => page.getByRole('textbox').nth(1).fill('灰鸦'))
  await act(async () => page.getByRole('button', { name: '应用改名' }).click())
  await expect.element(page.getByText('改名完成！')).toBeVisible()

  expect(saveAll).toHaveBeenCalledOnce()
  expect(syncCommittedProjectName).toHaveBeenCalledWith('凤凰的世界', session)
  expect(syncCommittedNovelConfig).toHaveBeenCalledWith(expect.objectContaining({
    projectName: '凤凰的归途',
    premise: '凤凰借助黑虫系统脱险',
    protagonistProfile: '凤凰与伙伴并肩行动',
  }), session)
  expect(useCharacterStore.getState().renameCharacter).not.toHaveBeenCalledWith('灰鸦', '灰鸦')
  expect(renameCharactersBatch).toHaveBeenCalledWith([{ from: '幽狼', to: '凤凰' }])
  expect(refreshedArchitectureFiles).toEqual(['premise.md', 'characters.md', 'worldbuilding.md', 'synopsis.md'])
  unsubscribe()
})

it('finishes the run when a post-commit sync fails instead of returning to the name preview', async () => {
  syncCommittedNovelConfig.mockImplementationOnce(() => {
    throw new Error('配置快照写入失败')
  })
  await act(async () => root?.render(<AIRenameCharactersDialog onClose={vi.fn()} />))
  await act(async () => page.getByRole('button', { name: 'AI 生成新名字' }).click())
  await act(async () => page.getByRole('button', { name: '应用改名' }).click())

  // 改名已经写入名单，界面必须停在完成态并给出可执行的提示，而不是回到预览
  // 把已经替换过的名字重新当成待改名去做重名校验。
  await expect.element(page.getByText('改名完成！')).toBeVisible()
  await expect.element(page.getByText(/同步未完成/)).toBeVisible()
  expect(page.getByRole('button', { name: '应用改名' }).query()).toBeNull()
})

it('keeps the roster state recoverable and retryable when the commit fails', async () => {
  saveAll.mockRejectedValueOnce(new Error('角色名单 revision 已过期，已拒绝覆盖'))
  await act(async () => root?.render(<AIRenameCharactersDialog onClose={vi.fn()} />))
  await act(async () => page.getByRole('button', { name: 'AI 生成新名字' }).click())
  await act(async () => page.getByRole('button', { name: '应用改名' }).click())

  await expect.element(page.getByText(/未能写入项目/)).toBeVisible()
  // 名单已在本地改名：行显示为已应用，按钮仍可再次点击完成落盘。
  await expect.element(page.getByText(/已应用/).first()).toBeVisible()
  const retry = page.getByRole('button', { name: '应用改名' })
  await expect.element(retry).toBeEnabled()
  await act(async () => retry.click())

  await expect.element(page.getByText('改名完成！')).toBeVisible()
  expect(saveAll).toHaveBeenCalledTimes(2)
  // 第二次应用只重试保存，不会把原名再改一遍。
  expect(renameCharactersBatch).toHaveBeenCalledTimes(1)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  setActiveProjectSessionContext(null)
})
