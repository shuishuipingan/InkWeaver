import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'

import '../../../index.css'
import RelationshipGraph from '../RelationshipGraph'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95))]
}

function collectAnimationFrameIntervals(
  durationMs: number,
  onFrame?: (timestamp: number, index: number) => void,
): Promise<number[]> {
  return new Promise(resolve => {
    const intervals: number[] = []
    const startedAt = performance.now()
    let previous: number | undefined
    let index = 0
    const sample = (timestamp: number) => {
      if (previous !== undefined) intervals.push(timestamp - previous)
      previous = timestamp
      onFrame?.(timestamp, index)
      index += 1
      if (timestamp - startedAt >= durationMs) resolve(intervals)
      else requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

function waitForCanvasReady(canvas: HTMLCanvasElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now()
    const check = () => {
      if (canvas.width > 300 && canvas.height >= 300) {
        resolve()
        return
      }
      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error(`relationship graph canvas was not ready within ${timeoutMs}ms`))
        return
      }
      requestAnimationFrame(check)
    }
    check()
  })
}

function createLargeRoster(size: number) {
  return Array.from({ length: size }, (_, index) => ({
    name: `角色${index + 1}`,
    role: (index % 4 === 0
      ? 'protagonist'
      : index % 4 === 1
        ? 'antagonist'
        : index % 4 === 2
          ? 'supporting'
          : 'minor') as string,
    relationships: index % 5 === 0
      ? `角色${((index + 7) % size) + 1}——相关`
      : '',
  }))
}

describe('RelationshipGraph performance evidence', () => {
  it('records first-interactive, animation-frame p95, drag p95 and long tasks for 202 nodes', async () => {
    const host = document.createElement('div')
    host.style.width = '794px'
    host.style.height = '588px'
    host.style.position = 'relative'
    document.body.appendChild(host)
    const root = createRoot(host)
    const longTaskObserver = typeof PerformanceObserver === 'undefined'
      ? null
      : new PerformanceObserver(list => {
        longTaskObserverEntryCount += list.getEntries().length
      })
    let longTaskObserverEntryCount = 0
    try {
      try { longTaskObserver?.observe({ entryTypes: ['longtask'] }) } catch { /* unsupported in this browser */ }
      // Headless CI runners can expose a throttled requestAnimationFrame clock
      // (for example, ~100 ms on an Intel macOS runner). Measure that clock
      // before rendering the graph so the test distinguishes environment timer
      // granularity from graph-induced frame loss. On a normal 60 Hz browser
      // the effective budget remains 33 ms; a throttled runner gets a bounded
      // proportional budget rather than a false product failure.
      const environmentIntervals = await collectAnimationFrameIntervals(1_000)
      const environmentFrameP95Ms = percentile95(environmentIntervals)
      const frameBudgetMs = Math.max(
        33,
        Number.isFinite(environmentFrameP95Ms)
          ? Math.ceil(environmentFrameP95Ms * 1.25)
          : 33,
      )
      const startedAt = performance.now()
      await act(async () => {
        root.render(
          <div style={{ position: 'relative', width: '794px', height: '588px' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <RelationshipGraph characters={createLargeRoster(202)} />
            </div>
          </div>,
        )
      })
      const canvas = host.querySelector('canvas')
      expect(canvas).not.toBeNull()
      await waitForCanvasReady(canvas!, 8_000)
      const firstInteractiveMs = performance.now() - startedAt
      const layoutIntervals = await collectAnimationFrameIntervals(4_500)

      const rect = canvas!.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const pointerId = 11
      // Synthetic PointerEvents are not registered in Chromium's pointer
      // capture table; keep the benchmark focused on draw cost rather than
      // failing on the browser's native capture bookkeeping.
      Object.defineProperty(canvas!, 'setPointerCapture', { configurable: true, value: () => {} })
      Object.defineProperty(canvas!, 'releasePointerCapture', { configurable: true, value: () => {} })
      canvas!.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
        pointerId,
        buttons: 1,
      }))
      const dragIntervals = await collectAnimationFrameIntervals(1_000, (_timestamp, index) => {
        canvas!.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          clientX: centerX + (index % 40),
          clientY: centerY + ((index * 3) % 40),
          pointerId,
          buttons: 1,
        }))
      })
      canvas!.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        clientX: centerX + 20,
        clientY: centerY + 20,
        pointerId,
        buttons: 0,
      }))

      const metrics = {
        nodeCount: 202,
        firstInteractiveMs: Math.round(firstInteractiveMs * 100) / 100,
        layoutFrameP95Ms: Math.round(percentile95(layoutIntervals) * 100) / 100,
        dragFrameP95Ms: Math.round(percentile95(dragIntervals) * 100) / 100,
        environmentFrameP95Ms: Math.round(environmentFrameP95Ms * 100) / 100,
        frameBudgetMs,
        longTaskCount: longTaskObserverEntryCount,
        layoutFrameSamples: layoutIntervals.length,
        dragFrameSamples: dragIntervals.length,
      }
      console.log('RELATIONSHIP_GRAPH_PERFORMANCE', JSON.stringify(metrics))
      expect(metrics.firstInteractiveMs).toBeLessThan(2_000)
      expect(metrics.layoutFrameP95Ms).toBeLessThan(metrics.frameBudgetMs)
      expect(metrics.dragFrameP95Ms).toBeLessThan(metrics.frameBudgetMs)
      expect(Number.isFinite(metrics.layoutFrameP95Ms)).toBe(true)
      expect(Number.isFinite(metrics.dragFrameP95Ms)).toBe(true)
    } finally {
      longTaskObserver?.disconnect()
      await act(async () => root.unmount())
      host.remove()
    }
  }, 30_000)
})
