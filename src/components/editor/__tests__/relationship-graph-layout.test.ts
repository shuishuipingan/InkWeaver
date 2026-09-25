import { describe, expect, it } from 'vitest'

import { calculateRepulsionForces } from '../relationship-graph-layout'

describe('relationship graph repulsion', () => {
  it('matches exact pairwise repulsion when Barnes-Hut approximation is disabled', () => {
    const forces = calculateRepulsionForces([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ], { repulsion: 100, alpha: 1, theta: 0 })

    expect(forces[0].x).toBeCloseTo(-1)
    expect(forces[0].y).toBe(0)
    expect(forces[1].x).toBeCloseTo(1)
    expect(forces[1].y).toBe(0)
  })

  it('keeps the center of mass stationary for a symmetric layout', () => {
    const forces = calculateRepulsionForces([
      { x: -100, y: -3 },
      { x: -100, y: 3 },
      { x: -98, y: -3 },
      { x: -98, y: 3 },
      { x: 98, y: -3 },
      { x: 98, y: 3 },
      { x: 100, y: -3 },
      { x: 100, y: 3 },
    ], { repulsion: 800, alpha: 0.5, theta: 0.7 })

    const totalX = forces.reduce((sum, force) => sum + force.x, 0)
    const totalY = forces.reduce((sum, force) => sum + force.y, 0)
    expect(totalX).toBeCloseTo(0, 8)
    expect(totalY).toBeCloseTo(0, 8)

    const exact = calculateRepulsionForces([
      { x: -100, y: -3 },
      { x: -100, y: 3 },
      { x: -98, y: -3 },
      { x: -98, y: 3 },
      { x: 98, y: -3 },
      { x: 98, y: 3 },
      { x: 100, y: -3 },
      { x: 100, y: 3 },
    ], { repulsion: 800, alpha: 0.5, theta: 0 })
    expect(Math.hypot(forces[0].x - exact[0].x, forces[0].y - exact[0].y)).toBeLessThan(0.01)
  })

  it('returns finite, deterministic forces for dense rosters', () => {
    const points = Array.from({ length: 202 }, (_, index) => {
      const angle = index * 2.39996323
      const radius = 8 * Math.sqrt(index + 1)
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
    })

    const first = calculateRepulsionForces(points, { repulsion: 3200, alpha: 0.75 })
    const second = calculateRepulsionForces(points, { repulsion: 3200, alpha: 0.75 })

    expect(first).toHaveLength(points.length)
    expect(first.every(force => Number.isFinite(force.x) && Number.isFinite(force.y))).toBe(true)
    expect(second).toEqual(first)
  })
})
