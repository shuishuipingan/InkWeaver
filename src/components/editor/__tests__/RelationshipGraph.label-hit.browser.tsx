import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import '../../../index.css'
import RelationshipGraph from '../RelationshipGraph'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Segment {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

interface Frame {
  segments: Segment[]
  labels: Array<{ text: string; x: number; y: number }>
  pendingStart: { x: number; y: number } | null
  pendingSegment: Segment | null
}

function distanceToSegment(point: { x: number; y: number }, segment: Segment): number {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared))
  const nearest = { x: segment.start.x + t * dx, y: segment.start.y + t * dy }
  return Math.hypot(point.x - nearest.x, point.y - nearest.y)
}

function waitForFrames(count: number): Promise<void> {
  return new Promise(resolve => {
    let remaining = count
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

describe('RelationshipGraph canvas label hit evidence', () => {
  it('keeps a relationship label within the local edge bound after zoom and drag events', async () => {
    const frames: Frame[] = []
    let currentFrame: Frame | undefined
    const contextPrototype = CanvasRenderingContext2D.prototype
    const originalClearRect = contextPrototype.clearRect
    const originalMoveTo = contextPrototype.moveTo
    const originalLineTo = contextPrototype.lineTo
    const originalStroke = contextPrototype.stroke
    const originalFillText = contextPrototype.fillText
    const callOriginalStroke = originalStroke as unknown as (this: CanvasRenderingContext2D, path?: Path2D) => void
    contextPrototype.clearRect = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof originalClearRect>) {
      currentFrame = { segments: [], labels: [], pendingStart: null, pendingSegment: null }
      frames.push(currentFrame)
      return originalClearRect.apply(this, args)
    }
    contextPrototype.moveTo = function (this: CanvasRenderingContext2D, x: number, y: number) {
      if (currentFrame) currentFrame.pendingStart = { x, y }
      return originalMoveTo.call(this, x, y)
    }
    contextPrototype.lineTo = function (this: CanvasRenderingContext2D, x: number, y: number) {
      if (currentFrame?.pendingStart) {
        currentFrame.pendingSegment = { start: currentFrame.pendingStart, end: { x, y } }
      }
      return originalLineTo.call(this, x, y)
    }
    contextPrototype.stroke = function (this: CanvasRenderingContext2D, path?: Path2D) {
      if (currentFrame?.pendingSegment) currentFrame.segments.push(currentFrame.pendingSegment)
      if (currentFrame) currentFrame.pendingStart = null
      if (currentFrame) currentFrame.pendingSegment = null
      return callOriginalStroke.call(this, path)
    }
    contextPrototype.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, ...args: [maxWidth?: number]) {
      currentFrame?.labels.push({ text, x, y })
      return originalFillText.call(this, text, x, y, ...args)
    }

    const host = document.createElement('div')
    host.style.width = '794px'
    host.style.height = '588px'
    host.style.position = 'relative'
    document.body.appendChild(host)
    const root = createRoot(host)
    try {
      await act(async () => root.render(
        <div style={{ position: 'relative', width: '794px', height: '588px' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <RelationshipGraph characters={[
              { name: '林墨', role: 'protagonist', relationships: JSON.stringify([{ target: '周砧', relation: '搭档' }]) },
              { name: '周砧', role: 'supporting', relationships: '' },
            ]} />
          </div>
        </div>,
      ))
      const canvas = host.querySelector('canvas')
      expect(canvas).not.toBeNull()
      await new Promise(resolve => setTimeout(resolve, 500))
      frames.length = 0

      Object.defineProperty(canvas!, 'setPointerCapture', { configurable: true, value: () => {} })
      Object.defineProperty(canvas!, 'releasePointerCapture', { configurable: true, value: () => {} })
      const rect = canvas!.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      canvas!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, clientX: centerX, clientY: centerY, deltaY: -120 }))
      canvas!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: centerX, clientY: centerY, pointerId: 17, buttons: 1 }))
      canvas!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: centerX + 35, clientY: centerY + 20, pointerId: 17, buttons: 1 }))
      canvas!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: centerX + 35, clientY: centerY + 20, pointerId: 17, buttons: 0 }))
      await waitForFrames(3)

      const frame = [...frames].reverse().find(candidate => candidate.labels.some(label => label.text === '搭档'))
      expect(frame).toBeDefined()
      const relationLabel = frame!.labels.find(label => label.text === '搭档')!
      const edge = [...frame!.segments]
        .filter(segment => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) > 80)
        .sort((left, right) => (
          Math.hypot(right.end.x - right.start.x, right.end.y - right.start.y)
          - Math.hypot(left.end.x - left.start.x, left.end.y - left.start.y)
        ))[0]
      expect(edge).toBeDefined()
      // The label baseline is four content pixels below the layout anchor.
      expect(distanceToSegment({ x: relationLabel.x, y: relationLabel.y - 4 }, edge!)).toBeLessThanOrEqual(25)
    } finally {
      await act(async () => root.unmount())
      host.remove()
      contextPrototype.clearRect = originalClearRect
      contextPrototype.moveTo = originalMoveTo
      contextPrototype.lineTo = originalLineTo
      contextPrototype.stroke = originalStroke
      contextPrototype.fillText = originalFillText
    }
  }, 15_000)
})
