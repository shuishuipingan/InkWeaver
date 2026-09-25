export interface RelationshipGraphPoint {
  x: number
  y: number
}

export interface RelationshipGraphForce {
  x: number
  y: number
}

interface QuadCell {
  minX: number
  minY: number
  size: number
  mass: number
  centerX: number
  centerY: number
  points?: number[]
  children?: QuadCell[]
}

export interface RepulsionOptions {
  repulsion: number
  alpha: number
  /** Barnes-Hut cell-size / distance threshold. Zero calculates every pair exactly. */
  theta?: number
}

const LEAF_CAPACITY = 4
const MAX_TREE_DEPTH = 24

function buildQuadTree(
  points: readonly RelationshipGraphPoint[],
  indexes: number[],
  minX: number,
  minY: number,
  size: number,
  depth: number,
): QuadCell {
  let centerX = 0
  let centerY = 0
  let smallestX = Number.POSITIVE_INFINITY
  let smallestY = Number.POSITIVE_INFINITY
  let largestX = Number.NEGATIVE_INFINITY
  let largestY = Number.NEGATIVE_INFINITY
  for (const index of indexes) {
    const point = points[index]
    centerX += point.x
    centerY += point.y
    smallestX = Math.min(smallestX, point.x)
    smallestY = Math.min(smallestY, point.y)
    largestX = Math.max(largestX, point.x)
    largestY = Math.max(largestY, point.y)
  }

  const cell: QuadCell = {
    minX,
    minY,
    size,
    mass: indexes.length,
    centerX: centerX / indexes.length,
    centerY: centerY / indexes.length,
  }
  if (
    indexes.length <= LEAF_CAPACITY
    || depth >= MAX_TREE_DEPTH
    || (largestX - smallestX < 1e-9 && largestY - smallestY < 1e-9)
  ) {
    cell.points = indexes
    return cell
  }

  const half = size / 2
  const middleX = minX + half
  const middleY = minY + half
  const quadrants: number[][] = [[], [], [], []]
  for (const index of indexes) {
    const point = points[index]
    const east = point.x >= middleX ? 1 : 0
    const south = point.y >= middleY ? 1 : 0
    quadrants[south * 2 + east].push(index)
  }

  // A zero-size coordinate span can otherwise recurse through the same
  // quadrant to the depth limit without narrowing the represented area.
  if (quadrants.some(quadrant => quadrant.length === indexes.length)) {
    const occupied = quadrants.find(quadrant => quadrant.length > 0)!
    const sameX = occupied.every(index => points[index].x === points[occupied[0]].x)
    const sameY = occupied.every(index => points[index].y === points[occupied[0]].y)
    if (sameX && sameY) {
      cell.points = indexes
      return cell
    }
  }

  cell.children = []
  for (let quadrant = 0; quadrant < quadrants.length; quadrant++) {
    const childIndexes = quadrants[quadrant]
    if (childIndexes.length === 0) continue
    const east = quadrant % 2 === 1
    const south = quadrant >= 2
    cell.children.push(buildQuadTree(
      points,
      childIndexes,
      minX + (east ? half : 0),
      minY + (south ? half : 0),
      half,
      depth + 1,
    ))
  }
  return cell
}

function contains(cell: QuadCell, point: RelationshipGraphPoint): boolean {
  return point.x >= cell.minX
    && point.x < cell.minX + cell.size
    && point.y >= cell.minY
    && point.y < cell.minY + cell.size
}

function addExactForce(
  point: RelationshipGraphPoint,
  other: RelationshipGraphPoint,
  magnitude: number,
  result: RelationshipGraphForce,
): void {
  const dx = other.x - point.x
  const dy = other.y - point.y
  const distanceSquared = dx * dx + dy * dy
  const distance = Math.max(Math.sqrt(distanceSquared), 1)
  const force = magnitude / (distance * distance)
  result.x -= (dx / distance) * force
  result.y -= (dy / distance) * force
}

/**
 * Calculates node repulsion with a Barnes-Hut quadtree. Small rosters can set
 * theta to zero for the exact pairwise result; larger rosters use a bounded
 * approximation so force layout doesn't perform every pair calculation per
 * animation frame.
 */
export function calculateRepulsionForces(
  points: readonly RelationshipGraphPoint[],
  options: RepulsionOptions,
): RelationshipGraphForce[] {
  const forces = points.map(() => ({ x: 0, y: 0 }))
  if (points.length < 2 || options.alpha === 0 || options.repulsion === 0) return forces

  let smallestX = Number.POSITIVE_INFINITY
  let smallestY = Number.POSITIVE_INFINITY
  let largestX = Number.NEGATIVE_INFINITY
  let largestY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    smallestX = Math.min(smallestX, point.x)
    smallestY = Math.min(smallestY, point.y)
    largestX = Math.max(largestX, point.x)
    largestY = Math.max(largestY, point.y)
  }
  const span = Math.max(largestX - smallestX, largestY - smallestY, 1)
  const padding = span * 1e-6 + 1e-6
  const size = span + padding * 2
  const originX = (smallestX + largestX - size) / 2
  const originY = (smallestY + largestY - size) / 2
  const tree = buildQuadTree(
    points,
    points.map((_, index) => index),
    originX,
    originY,
    size,
    0,
  )
  const magnitude = options.repulsion * options.alpha
  const theta = Math.max(0, options.theta ?? 0.65)

  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    const force = forces[index]
    const visit = (cell: QuadCell) => {
      if (cell.points) {
        for (const otherIndex of cell.points) {
          if (otherIndex !== index) addExactForce(point, points[otherIndex], magnitude, force)
        }
        return
      }

      const dx = cell.centerX - point.x
      const dy = cell.centerY - point.y
      const distance = Math.max(Math.hypot(dx, dy), 1)
      if (theta > 0 && !contains(cell, point) && cell.size / distance < theta) {
        const cellForce = magnitude * cell.mass / (distance * distance)
        force.x -= (dx / distance) * cellForce
        force.y -= (dy / distance) * cellForce
        return
      }
      for (const child of cell.children ?? []) visit(child)
    }
    visit(tree)
  }

  return forces
}
