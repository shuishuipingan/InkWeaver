import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import '../../../index.css'
import RelationshipGraph from '../RelationshipGraph'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mountGraph(): { root: Root; host: HTMLElement; canvas: () => HTMLCanvasElement | null } {
  const host = document.createElement('div')
  host.style.width = '800px'
  host.style.height = '600px'
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <div style={{ position: 'relative', width: '800px', height: '600px' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
        <RelationshipGraph
          characters={[
            { name: '林岚', role: 'protagonist', relationships: '周砚——共同追查真相\n苏晚——旧识' },
            { name: '周砚', role: 'supporting', relationships: '林岚——共同追查真相' },
            { name: '苏晚', role: 'antagonist', relationships: '林岚——旧识' },
          ]}
        />
        </div>
      </div>,
    )
  })
  return { root, host, canvas: () => host.querySelector('canvas') }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('RelationshipGraph regression', () => {
  it('renders a non-empty canvas in a sized container and keeps it painted after simulation', async () => {
    const g = mountGraph()
    await wait(400)
    const canvas = g.canvas()
    expect(canvas).not.toBeNull()
    expect(canvas!.width).toBeGreaterThan(0)
    expect(canvas!.height).toBeGreaterThan(0)
    // 力导向 120 帧结束后画布仍有内容（只采样中央区域避免 OOM）
    await wait(2600)
    const ctx = canvas!.getContext('2d')!
    const sample = ctx.getImageData(
      Math.floor(canvas!.width / 2) - 100,
      Math.floor(canvas!.height / 2) - 100,
      200,
      200,
    ).data
    let painted = false
    for (let i = 3; i < sample.length; i += 4) {
      if (sample[i] > 0) { painted = true; break }
    }
    expect(painted).toBe(true)
    act(() => g.root.unmount())
    g.host.remove()
  })
})

describe('RelationshipGraph large roster', () => {
  it('renders and keeps painted with 200+ characters', async () => {
    const host = document.createElement('div')
    host.style.width = '794px'
    host.style.height = '588px'
    host.style.position = 'relative'
    document.body.appendChild(host)
    const root = createRoot(host)
    const chars = Array.from({ length: 202 }, (_, i) => ({
      name: `角色${i + 1}`,
      role: (i % 4 === 0 ? 'protagonist' : i % 4 === 1 ? 'antagonist' : i % 4 === 2 ? 'supporting' : 'minor') as string,
      relationships: i % 5 === 0 ? `角色${((i + 7) % 202) + 1}——相关` : '',
    }))
    act(() => {
      root.render(
        <div style={{ position: 'relative', width: '794px', height: '588px' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <RelationshipGraph characters={chars} />
          </div>
        </div>,
      )
    })
    await wait(500)
    const canvas = host.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas!.width).toBeGreaterThan(0)
    // 等力导向完成（202 节点可能需要更多帧，等 4s）
    await wait(4000)
    // 等 canvas backing store 尺寸稳定（挂载时序可能先拿到小尺寸）
    for (let i = 0; i < 10 && canvas!.width < 300; i++) {
      await wait(300)
    }
    expect(canvas!.width).toBeGreaterThan(300)
    const ctx = canvas!.getContext('2d')!
    // 网格抽样全画布
    let painted = 0
    let total = 0
    const quadrants = [0, 0, 0, 0]
    const cw = canvas!.width
    const ch = canvas!.height
    for (let y = 0; y < ch; y += 80) {
      for (let x = 0; x < cw; x += 80) {
        const d = ctx.getImageData(x, y, 1, 1).data
        total++
        if (d[3] > 0) {
          painted++
          const qx = x < cw / 2 ? 0 : 1
          const qy = y < ch / 2 ? 0 : 2
          quadrants[qx + qy]++
        }
      }
    }
    expect(painted).toBeGreaterThan(0)
    expect(painted / total).toBeGreaterThan(0.01)
    // 分布均匀性：四个象限都应有点（防止节点全挤一角/一边）
    console.log('QUADRANTS:', JSON.stringify(quadrants), 'painted:', painted, 'total:', total)
    expect(quadrants.every((q) => q > 0)).toBe(true)
    act(() => root.unmount())
    host.remove()
  }, 15000)

  it('completes the J05 journey: labels, zoom/drag, focus, and layout survive reopen', async () => {
    const projectKey = 'C:\\novels\\journey-j05'
    const layoutKey = `inkweaver.relationship-layout:${projectKey}`
    localStorage.removeItem(layoutKey)
    const host = document.createElement('div')
    host.style.width = '794px'
    host.style.height = '588px'
    host.style.position = 'relative'
    document.body.appendChild(host)
    const chars = Array.from({ length: 202 }, (_, i) => ({
      name: `角色${i + 1}`,
      role: (i % 4 === 0 ? 'protagonist' : i % 4 === 1 ? 'antagonist' : i % 4 === 2 ? 'supporting' : 'minor') as string,
      relationships: i % 5 === 0 ? `角色${((i + 7) % 202) + 1}——相关` : '',
    }))
    const render = (root: Root) => root.render(
      <div style={{ position: 'relative', width: '794px', height: '588px' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <RelationshipGraph projectKey={projectKey} characters={chars} />
        </div>
      </div>,
    )
    let root = createRoot(host)
    try {
      await act(async () => render(root))
      await wait(4_000)
      const canvas = host.querySelector('canvas')
      expect(canvas).not.toBeNull()
      expect(canvas!.width).toBeGreaterThan(300)

      const firstRow = host.querySelector('[data-relationship-list="true"] button')
      expect(firstRow).not.toBeNull()
      await act(async () => firstRow?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
      expect(localStorage.getItem(layoutKey)).toContain('pinned')

      const zoomIn = host.querySelector('button[aria-label="放大关系图谱"]')
      const fitView = host.querySelector('button[aria-label="适合视图"]')
      expect(zoomIn).not.toBeNull()
      expect(fitView).not.toBeNull()
      await act(async () => zoomIn?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      await act(async () => canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })))
      await act(async () => fitView?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

      const search = host.querySelector('input[aria-label="搜索角色"]') as HTMLInputElement | null
      expect(search).not.toBeNull()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      await act(async () => {
        setter?.call(search, '角色1')
        search?.dispatchEvent(new Event('input', { bubbles: true }))
      })
      const depth = host.querySelector('select[aria-label="聚焦范围"]') as HTMLSelectElement | null
      expect(depth).not.toBeNull()
      await act(async () => {
        if (depth) depth.value = '1'
        depth?.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(host.querySelector('[data-relationship-list="true"]')?.textContent).toContain('角色1')

      Object.defineProperty(canvas!, 'setPointerCapture', { configurable: true, value: () => {} })
      Object.defineProperty(canvas!, 'releasePointerCapture', { configurable: true, value: () => {} })
      const rect = canvas!.getBoundingClientRect()
      await act(async () => {
        canvas!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + 20, clientY: rect.top + 20, pointerId: 7, buttons: 1 }))
        canvas!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 35, clientY: rect.top + 30, pointerId: 7, buttons: 1 }))
        canvas!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: rect.left + 35, clientY: rect.top + 30, pointerId: 7, buttons: 0 }))
      })

      await act(async () => root.unmount())
      root = createRoot(host)
      await act(async () => render(root))
      await wait(500)
      expect(host.textContent).toContain('📌')
      expect(host.querySelector('canvas')?.width).toBeGreaterThan(300)
    } finally {
      await act(async () => root.unmount())
      host.remove()
      localStorage.removeItem(layoutKey)
    }
  }, 20_000)
})
