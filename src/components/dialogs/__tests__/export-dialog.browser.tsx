import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import ExportDialog from '../ExportDialog'
import { useProjectStore } from '../../../stores/project-store'
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
    if (channel === 'db:draft-get-full') return { content: args[0] === 81 ? 'final prose' : 'latest draft prose' }
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
  expect(selectedIds).toEqual([82])
  expect(writtenFiles.get('Export Test.md')).toContain('latest draft prose')
  expect(writtenFiles.get('Export Test.md')).not.toContain('final prose')
})

it('exports finalized content when finalized-only mode is selected', async () => {
  await renderDialog()

  await act(async () => page.getByRole('radio', { name: /仅导出已定稿章节|Finalized chapters only/i }).click())
  await act(async () => page.getByRole('button', { name: /选择目录并导出|Choose folder and export/i }).click())
  await expect.element(page.getByText(/已导出到：Books|Exported to: Books/i)).toBeVisible()

  const selectedIds = invoke.mock.calls
    .filter(([channel]) => channel === 'db:draft-get-full')
    .map(([, id]) => id)
  expect(selectedIds).toEqual([81])
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
