import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import ExportDialog from '../ExportDialog'
import { useProjectStore } from '../../../stores/project-store'
import { useEditorStore } from '../../../stores/editor-store'
import { useNotificationStore } from '../../../stores/notification-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const projectPath = 'C:\\novels\\export-test'
const session = { projectId: 'export-test', leaseId: 'export-test-lease', projectPath }
let writtenFiles: Map<string, string>
let drafts: Array<{ id: number; chapterNumber: number; chapterTitle: string; version: number; status: string }>
let authorityStatus: 'empty' | 'continuous'
let root: Root | undefined
let host: HTMLDivElement | undefined
const invoke = vi.fn()

function configureProject() {
  useProjectStore.setState({
    currentProject: {
      id: session.projectId,
      path: projectPath,
      sessionLease: session.leaseId,
      name: 'Export Test',
      novelConfig: { genre: 'fantasy', targetAudience: 'general' },
    } as never,
  })
  setActiveProjectSessionContext(session)
}

async function renderDialog() {
  await act(async () => root?.render(<ExportDialog isOpen onClose={vi.fn()} />))
}

beforeEach(() => {
  vi.clearAllMocks()
  writtenFiles = new Map()
  authorityStatus = 'continuous'
  drafts = [
    { id: 82, chapterNumber: 1, chapterTitle: 'Opening', version: 2, status: 'draft' },
    { id: 81, chapterNumber: 1, chapterTitle: 'Opening', version: 1, status: 'finalized' },
  ]
  configureProject()
  useEditorStore.setState({ tabs: [], activeTabId: null, draftLedgers: {} })
  useNotificationStore.setState({ notifications: [] })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke,
      on: vi.fn(() => () => {}),
      once: vi.fn(),
      send: vi.fn(),
      setZoomLevel: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
    },
  })
  invoke.mockImplementation((async (channel: string, ...args: unknown[]) => {
    const [, relativePath, content] = args
    if (channel === 'dialog:select-export-directory') return { grantId: 'export-grant', displayName: 'Books' }
    if (channel === 'fs:grant-write-file') {
      if (typeof relativePath === 'string') writtenFiles.set(relativePath, String(content))
      return { success: true }
    }
    if (channel === 'fs:grant-read-file') {
      return { success: true, content: typeof relativePath === 'string' ? writtenFiles.get(relativePath) ?? '' : '' }
    }
    if (channel === 'db:draft-authority-sequence') {
      return {
        status: authorityStatus,
        lastChapterNumber: authorityStatus === 'empty' ? 0 : 1,
        ...(authorityStatus === 'empty' ? { nextChapterNumber: 1 } : { nextChapterNumber: 2 }),
        duplicateChapterNumbers: [],
        authorityFingerprint: 'c'.repeat(64),
      }
    }
    if (channel === 'db:draft-list-all') return drafts
    if (channel === 'db:draft-get-full') {
      const id = Number(args[0])
      const draft = drafts.find(candidate => candidate.id === id)
      return {
        id,
        chapterNumber: draft?.chapterNumber,
        version: draft?.version,
        status: draft?.status,
        content: id === 81 ? 'final prose' : 'latest draft prose',
      }
    }
    if (channel === 'db:project-core-get') return {}
    throw new Error(`Unexpected channel: ${channel}`)
  }) as never)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

it('selects latest drafts by default and exports only the newest chapter version', async () => {
  await renderDialog()

  const latestOption = page.getByRole('radio', { name: /包含最新草稿|Include latest drafts/i })
  await expect.element(latestOption).toBeChecked()
  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await expect.element(page.getByText(/已导出到：Books|Exported to: Books/i)).toBeVisible()

  const selectedIds = invoke.mock.calls
    .filter(([channel]) => channel === 'db:draft-get-full')
    .map(([, id]) => id)
  expect(selectedIds).toEqual([82, 82])
  expect(writtenFiles.get('Export Test.md')).toContain('latest draft prose')
  expect(writtenFiles.get('Export Test.md')).not.toContain('final prose')
})

it('uses the current unsaved editor buffer when it is the selected latest draft', async () => {
  useEditorStore.setState({
    tabs: [{
      id: 'draft-tab', name: 'Opening', type: 'chapter', projectKey: projectPath,
      filePath: 'vela://draft/82', chapterNumber: 1, draftId: 82, draftStatus: 'draft',
      content: 'unsaved editor buffer', savedContent: 'latest draft prose', dirty: true,
      instanceId: 'draft-tab-instance', contentRevision: 1,
    }],
    activeTabId: 'draft-tab',
  })
  await renderDialog()

  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await expect.element(page.getByText(/已导出到：Books|Exported to: Books/i)).toBeVisible()

  expect(writtenFiles.get('Export Test.md')).toContain('unsaved editor buffer')
  expect(writtenFiles.get('Export Test.md')).not.toContain('latest draft prose')
})

it('opens only one destination picker for rapid duplicate export clicks', async () => {
  const normalInvoke = invoke.getMockImplementation()!
  let pickerCalls = 0
  let resolvePicker: ((value: { grantId: string; displayName: string }) => void) | undefined
  invoke.mockImplementation((async (channel: string, ...args: unknown[]) => {
    if (channel === 'dialog:select-export-directory') {
      pickerCalls += 1
      return await new Promise<{ grantId: string; displayName: string }>(resolve => {
        resolvePicker = resolve
      })
    }
    return normalInvoke(channel, ...args)
  }) as never)
  await renderDialog()

  const button = [...document.querySelectorAll('button')].find(element => (
    element.textContent?.includes('选择目录并导出') || element.textContent?.includes('Choose folder and export')
  ))
  expect(button).toBeDefined()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect(pickerCalls).toBe(1)

  await act(async () => resolvePicker?.({ grantId: 'export-grant', displayName: 'Books' }))
  await expect.element(page.getByText(/已导出到：Books|Exported to: Books/i)).toBeVisible()
})

it('keeps export disabled while the originating project picker is still open after switching projects', async () => {
  const normalInvoke = invoke.getMockImplementation()!
  let resolvePicker: ((value: { grantId: string; displayName: string }) => void) | undefined
  invoke.mockImplementation((async (channel: string, ...args: unknown[]) => {
    if (channel === 'dialog:select-export-directory') {
      return await new Promise<{ grantId: string; displayName: string }>(resolve => {
        resolvePicker = resolve
      })
    }
    return normalInvoke(channel, ...args)
  }) as never)
  await renderDialog()

  const button = [...document.querySelectorAll('button')].find(element => (
    element.textContent?.includes('选择目录并导出') || element.textContent?.includes('Choose folder and export')
  ))
  expect(button).toBeDefined()
  await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

  const nextSession = {
    projectId: 'other-project', leaseId: 'other-project-lease', projectPath: 'C:\\novels\\other-project',
  }
  await act(async () => {
    useProjectStore.setState({
      currentProject: {
        id: nextSession.projectId,
        path: nextSession.projectPath,
        sessionLease: nextSession.leaseId,
        name: 'Other Project',
        novelConfig: { genre: 'fantasy', targetAudience: 'general' },
      } as never,
    })
    setActiveProjectSessionContext(nextSession)
  })
  await renderDialog()

  expect(button?.disabled).toBe(true)
  await act(async () => {
    resolvePicker?.({ grantId: 'export-grant', displayName: 'Books' })
    await Promise.resolve()
  })
  await expect.element(page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i })).toBeEnabled()
})

it('releases the export lock when the destination picker is canceled', async () => {
  const normalInvoke = invoke.getMockImplementation()!
  invoke.mockImplementation((async (channel: string, ...args: unknown[]) => {
    if (channel === 'dialog:select-export-directory') return null
    return normalInvoke(channel, ...args)
  }) as never)
  await renderDialog()

  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await expect.element(page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i })).toBeEnabled()
  expect(invoke.mock.calls.some(([channel]) => channel === 'db:draft-authority-sequence')).toBe(false)
})

it('shows picker failures and releases the export lock for retry', async () => {
  const normalInvoke = invoke.getMockImplementation()!
  invoke.mockImplementation((async (channel: string, ...args: unknown[]) => {
    if (channel === 'dialog:select-export-directory') throw new Error('picker unavailable')
    return normalInvoke(channel, ...args)
  }) as never)
  await renderDialog()

  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await expect.element(page.getByText(/picker unavailable/i)).toBeVisible()
  await expect.element(page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i })).toBeEnabled()
})

it('notifies the author when a validated export completes after switching projects', async () => {
  const normalInvoke = invoke.getMockImplementation()!
  let signalReadbackStarted!: () => void
  let completeReadback: (() => Promise<void>) | undefined
  const readbackStarted = new Promise<void>(resolve => { signalReadbackStarted = resolve })
  let deferredReadback = false
  invoke.mockImplementation((async (channel: string, ...args: unknown[]) => {
    if (channel === 'fs:grant-read-file' && !deferredReadback) {
      deferredReadback = true
      signalReadbackStarted()
      return await new Promise(resolve => {
        completeReadback = async () => resolve(await normalInvoke(channel, ...args))
      })
    }
    return normalInvoke(channel, ...args)
  }) as never)
  await renderDialog()

  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await readbackStarted
  const nextSession = {
    projectId: 'other-project', leaseId: 'other-project-lease', projectPath: 'C:\\novels\\other-project',
  }
  await act(async () => {
    useProjectStore.setState({
      currentProject: {
        id: nextSession.projectId,
        path: nextSession.projectPath,
        sessionLease: nextSession.leaseId,
        name: 'Other Project',
        novelConfig: { genre: 'fantasy', targetAudience: 'general' },
      } as never,
    })
    setActiveProjectSessionContext(nextSession)
  })
  await act(async () => { await completeReadback?.() })

  await vi.waitFor(() => {
    expect(useNotificationStore.getState().notifications.some(notification => (
      notification.type === 'success'
      && notification.message.includes('Export Test')
      && /导出完成|completed/u.test(notification.message)
    ))).toBe(true)
  })
})

it('exports finalized content when finalized-only mode is selected', async () => {
  await renderDialog()

  await act(async () => page.getByRole('radio', { name: /仅导出已定稿章节|Finalized chapters only/i }).click())
  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await expect.element(page.getByText(/已导出到：Books|Exported to: Books/i)).toBeVisible()

  const selectedIds = invoke.mock.calls
    .filter(([channel]) => channel === 'db:draft-get-full')
    .map(([, id]) => id)
  expect(selectedIds).toEqual([81, 81])
  expect(writtenFiles.get('Export Test.md')).toContain('final prose')
  expect(writtenFiles.get('Export Test.md')).not.toContain('latest draft prose')
})

it('shows an actionable empty-content message when the project has no chapters or drafts', async () => {
  drafts = []
  authorityStatus = 'empty'

  await renderDialog()
  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await expect.element(page.getByText(/没有可导出的定稿章节或草稿|There are no finalized chapters or drafts to export/i)).toBeVisible()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  setActiveProjectSessionContext(null)
})
