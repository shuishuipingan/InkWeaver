export interface RelationshipLabelAnchor {
  /** Preferred text baseline in content coordinates. */
  x: number
  y: number
  /** Unit normal of the owning edge, pointing away from the edge. */
  normalX: number
  normalY: number
  width: number
  height: number
  priority?: number
}

export interface RelationshipLabelPlacement {
  x: number
  y: number
  hidden: boolean
  /** True when the label is intentionally offset and may need a leader line. */
  leader: boolean
}

export interface RelationshipLabelLayoutOptions {
  /** Maximum displacement in CSS pixels. */
  maxOffset?: number
  /** Minimum gap between label rectangles in CSS pixels. */
  gap?: number
  /** Current Canvas scale. Screen-space bounds are converted to content space. */
  scale?: number
}

interface Rectangle {
  left: number
  top: number
  right: number
  bottom: number
}

const DEFAULT_MAX_OFFSET = 24
const DEFAULT_GAP = 4

function normalizeVector(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y)
  if (!Number.isFinite(length) || length < 0.001) return { x: 0, y: -1 }
  return { x: x / length, y: y / length }
}

function overlaps(left: Rectangle, right: Rectangle, gap: number): boolean {
  return left.left < right.right + gap
    && right.left < left.right + gap
    && left.top < right.bottom + gap
    && right.top < left.bottom + gap
}

function rectangleFor(
  anchor: RelationshipLabelAnchor,
  x: number,
  y: number,
): Rectangle {
  return {
    left: x - anchor.width / 2,
    top: y - anchor.height,
    right: x + anchor.width / 2,
    bottom: y,
  }
}

function candidateOffsets(
  anchor: RelationshipLabelAnchor,
  maxOffset: number,
  gap: number,
): Array<{ x: number; y: number }> {
  const normal = normalizeVector(anchor.normalX, anchor.normalY)
  const tangent = { x: -normal.y, y: normal.x }
  const normalDistance = Math.min(maxOffset, anchor.height + gap)
  const tangentDistance = Math.min(maxOffset, anchor.width / 2 + gap)
  const candidates = [
    { x: 0, y: 0 },
    { x: normal.x * normalDistance, y: normal.y * normalDistance },
    { x: -normal.x * normalDistance, y: -normal.y * normalDistance },
    { x: tangent.x * tangentDistance, y: tangent.y * tangentDistance },
    { x: -tangent.x * tangentDistance, y: -tangent.y * tangentDistance },
  ]
  return candidates.filter(candidate => Math.hypot(candidate.x, candidate.y) <= maxOffset + 0.001)
}

/**
 * Places labels near their own edge. The algorithm works in content
 * coordinates but accepts a screen-space bound, so zoom cannot make a local
 * collision workaround drift across the graph.
 */
export function layoutRelationshipLabels(
  anchors: readonly RelationshipLabelAnchor[],
  options: RelationshipLabelLayoutOptions = {},
): RelationshipLabelPlacement[] {
  const scale = Math.max(0.1, options.scale ?? 1)
  const maxOffset = Math.max(0, options.maxOffset ?? DEFAULT_MAX_OFFSET) / scale
  const gap = Math.max(0, options.gap ?? DEFAULT_GAP) / scale
  const placed: Rectangle[] = []
  const result: RelationshipLabelPlacement[] = Array.from({ length: anchors.length })
  const order = anchors
    .map((anchor, index) => ({ anchor, index }))
    .sort((left, right) => (right.anchor.priority ?? 0) - (left.anchor.priority ?? 0) || left.index - right.index)

  for (const { anchor, index } of order) {
    let placement: RelationshipLabelPlacement | undefined
    for (const offset of candidateOffsets(anchor, maxOffset, gap)) {
      const x = anchor.x + offset.x
      const y = anchor.y + offset.y
      const rectangle = rectangleFor(anchor, x, y)
      if (placed.some(existing => overlaps(existing, rectangle, gap))) continue
      placement = {
        x,
        y,
        hidden: false,
        leader: Math.hypot(offset.x, offset.y) > 0.001,
      }
      placed.push(rectangle)
      break
    }
    result[index] = placement ?? {
      x: anchor.x,
      y: anchor.y,
      hidden: true,
      leader: false,
    }
  }

  return result
}
