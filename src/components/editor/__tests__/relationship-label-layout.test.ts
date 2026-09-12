import { describe, expect, it } from 'vitest'

import {
  layoutRelationshipLabels,
  type RelationshipLabelAnchor,
} from '../relationship-label-layout'

function anchor(overrides: Partial<RelationshipLabelAnchor> = {}): RelationshipLabelAnchor {
  return {
    x: 100,
    y: 100,
    normalX: 0,
    normalY: -1,
    width: 72,
    height: 18,
    ...overrides,
  }
}

describe('layoutRelationshipLabels', () => {
  it('keeps labels on separate edges at the same height instead of globally stacking them', () => {
    const placements = layoutRelationshipLabels([
      anchor({ x: 100 }),
      anchor({ x: 500 }),
    ])

    expect(placements).toHaveLength(2)
    expect(placements[0]?.hidden).toBe(false)
    expect(placements[1]?.hidden).toBe(false)
    expect(placements[1]?.y).toBe(placements[0]?.y)
  })

  it('uses a bounded local offset or hides a label when every local position collides', () => {
    const placements = layoutRelationshipLabels(
      Array.from({ length: 8 }, () => anchor()),
      { maxOffset: 24 },
    )

    expect(placements.some((placement) => placement.hidden)).toBe(true)
    for (const placement of placements.filter((candidate) => !candidate.hidden)) {
      const distance = Math.hypot(placement.x - 100, placement.y - 100)
      expect(distance).toBeLessThanOrEqual(24)
    }
  })

  it('does not allow scale to turn a local offset into an unbounded screen displacement', () => {
    const placements = layoutRelationshipLabels(
      [anchor({ x: 240 })],
      { maxOffset: 24, scale: 2 },
    )

    const placement = placements[0]
    expect(placement?.hidden).toBe(false)
    expect(Math.hypot((placement?.x ?? 240) - 240, (placement?.y ?? 100) - 100)).toBeLessThanOrEqual(12)
  })

  it('keeps every non-hidden label within the bounded distance on a dense 200-edge sample', () => {
    const anchors: RelationshipLabelAnchor[] = Array.from({ length: 200 }, (_, index) => {
      const row = Math.floor(index / 20)
      const column = index % 20
      const x = 40 + column * 48
      const y = 40 + row * 42
      const angle = (index % 7) * 0.8
      return {
        x,
        y,
        normalX: Math.cos(angle),
        normalY: Math.sin(angle),
        width: 58 + (index % 3) * 10,
        height: 16 + (index % 2) * 4,
        priority: index % 5,
      }
    })
    const placements = layoutRelationshipLabels(anchors, { maxOffset: 26, gap: 4 })

    expect(placements).toHaveLength(anchors.length)
    const visible = placements.filter(placement => !placement.hidden)
    expect(visible.length).toBeGreaterThan(0)
    for (let index = 0; index < anchors.length; index += 1) {
      const placement = placements[index]
      if (!placement || placement.hidden) continue
      const source = anchors[index]
      const distance = Math.hypot(placement.x - source.x, placement.y - source.y)
      expect(distance).toBeLessThanOrEqual(26.001)
    }
  })
})