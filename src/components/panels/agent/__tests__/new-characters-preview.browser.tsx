import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { setActiveProjectSessionContext } from '../../../../shared/project-session-context'
import { useAgentStore } from '../../../../stores/agent-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import ConfirmCard from '../ConfirmCard'

const session = { projectId: 'A', leaseId: 'lease-A', projectPath: 'C:\\novels\\A' }
const project = {
  id: 'A', sessionLease: 'lease-A', path: session.projectPath, name: 'A', characterStates: '', createdAt: '', updatedAt: '',
  novelConfig: {
    genre: '奇幻', subGenre: '', targetAudience: '青年', totalChapters: 10, wordsPerChapter: 3000,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '旧大纲', worldSetting: '',
    goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
}
const existingEntries = [
  { name: '沈瑶光', aliases: ['瑶光'], role: 'protagonist', gender: '女', age: '19', appearance: '', personality: '', background: '', abilities: '', motivation: '', relationships: [], arc: '', notes: '' },
  { name: '顾长安', aliases: [], role: 'supporting', gender: '男', age: '22', appearance: '', personality: '', background: '', abilities: '', motivation: '', relationships: [], arc: '', notes: '' },
]

let container: HTMLDivElement
let root: Root
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
}

function newCharactersToolCall(id: string, characters: Array<Record<string, unknown>>) {
  return {
    id,
    toolName: 'propose_new_characters',
    arguments: { characters, summary: '补齐五位角色' },
    status: 'waiting_confirm',
    source: 'builtin',
    projectSession: session,
  }
}

function mount(toolCall: Record<string, unknown>) {
  return act(async () => {
    root.render(<ConfirmCard toolCall={toolCall as never} />)
  })
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: project as never })
  setActiveProjectSessionContext(session)
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async (channel: string) => (
        channel === 'db:character-roster-read'
          ? { schemaVersion: 1, revision: 7, entries: existingEntries, migrationState: 'ready', status: 'ready' }
          : []
      )),
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useProjectStore.setState({ currentProject: null })
  setActiveProjectSessionContext(null)
  useAgentStore.getState().clearPendingConfirmations()
})

describe('propose_new_characters confirmation preview', () => {
  it('lists each new character with its roster delta instead of raw JSON', async () => {
    useAgentStore.getState().beginToolConfirmation('cast-ok', () => {})
    await mount(newCharactersToolCall('cast-ok', [
      { name: '鹿鸣', role: '配角', personality: '寡言', background: '药庐学徒' },
      { name: '谢无尘', role: 'antagonist', aliases: ['无尘'] },
    ]))
    await flush()

    await expect.element(page.getByText(/新增角色预览：2 名（当前 2 人 → 提交后 4 人）/)).toBeVisible()
    expect(container.querySelectorAll('[data-new-character-row]').length).toBe(2)
    expect(container.textContent).toContain('鹿鸣')
    expect(container.textContent).toContain('谢无尘')
    expect(container.textContent).toContain('已填')
    // 整批参数不再以 JSON 形式贴出来。
    expect(container.textContent).not.toContain('"characters"')
    await expect.element(page.getByRole('button', { name: '批准执行' })).not.toBeDisabled()
  })

  it('blocks approval with a visible reason when a new name collides with the roster', async () => {
    useAgentStore.getState().beginToolConfirmation('cast-dupe', () => {})
    await mount(newCharactersToolCall('cast-dupe', [
      { name: '沈瑶光', role: 'protagonist' },
    ]))
    await flush()

    await expect.element(page.getByText(/与现有角色「沈瑶光」重名/)).toBeVisible()
    expect(container.querySelector('[data-new-characters-conflicts]')).not.toBeNull()
    await expect.element(page.getByRole('button', { name: '批准执行' })).toBeDisabled()
    await expect.element(page.getByText(/有角色与现有名单重名/)).toBeVisible()
  })

  it('disables approval when the batch itself is malformed', async () => {
    useAgentStore.getState().beginToolConfirmation('cast-invalid', () => {})
    await mount(newCharactersToolCall('cast-invalid', [
      { name: '温辞' },
    ]))
    await flush()

    await expect.element(page.getByText(/无法预览这批角色/)).toBeVisible()
    expect(container.querySelector('[data-new-characters-invalid]')).not.toBeNull()
    await expect.element(page.getByRole('button', { name: '批准执行' })).toBeDisabled()
  })
})
