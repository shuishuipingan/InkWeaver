import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { LogsView } from '../BottomPanel'
import { useLocaleStore } from '../../../stores/locale-store'
import { useWorkflowStore } from '../../../stores/workflow-store'

describe('persisted runtime log view', () => {
  let container: HTMLDivElement
  let root: Root
  let invoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en-US', initialized: true })
    useWorkflowStore.setState({ globalLogs: [] })
    invoke = vi.fn(async (channel: string) => {
      if (channel === 'runtime:log-page') {
        return {
          events: [{
            schemaVersion: 1,
            eventId: 'same-event',
            occurredAt: '2026-09-13T00:00:00.000Z',
            sequence: 1,
            serverSequence: 1,
            sessionId: 'session-a',
            process: 'main',
            level: 'error',
            source: 'runtime-test',
            event: 'test.error',
            message: 'same event',
          }],
          complete: true,
          status: {
            persistenceState: 'healthy',
            pendingCount: 0,
            queueDepth: 0,
            retryCount: 0,
            totalPersisted: 1,
            totalFailed: 0,
          },
        }
      }
      if (channel === 'runtime:log-export') return { success: true, files: ['app.jsonl', 'bundle-manifest.json'] }
      return { success: true }
    })
    Object.defineProperty(window, 'velaAPI', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => undefined),
        once: vi.fn(),
        send: vi.fn(),
        setZoomLevel: vi.fn(),
        setZoomFactor: vi.fn(),
        getZoomLevel: vi.fn(() => 0),
      },
    })
    useWorkflowStore.setState({
      globalLogs: [{ eventId: 'same-event', time: '00:00:00', level: 'error', message: 'same event' }],
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, 'velaAPI')
    useWorkflowStore.setState({ globalLogs: [] })
  })

  it('reads persisted events, de-duplicates the memory mirror, filters, and exports a complete bundle', async () => {
    await act(async () => root.render(<div style={{ height: 360 }}><LogsView /></div>))

    await vi.waitFor(() => expect(container.querySelectorAll('[data-runtime-log-event]').length).toBe(1))
    await expect.element(page.getByText('Logs are persisted')).toBeVisible()

    await page.getByTitle('Filter Error logs').click()
    expect(container.querySelectorAll('[data-runtime-log-event]').length).toBe(1)
    await page.getByTitle('Export complete log bundle').click()
    expect(invoke).toHaveBeenCalledWith('runtime:log-export')
  })
})
