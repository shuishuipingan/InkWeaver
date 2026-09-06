import type { RelationKind } from '../../shared/relationship-presentation'

export interface RelationshipGraphCharacter {
  name: string
  aliases?: readonly string[]
}

export interface RelationshipGraphEdge {
  a: string
  b: string
  kind: RelationKind
}

export interface RelationshipGraphFilter {
  query?: string
  relationKind?: RelationKind | 'all'
  focusDepth?: 0 | 1 | 2
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function neighborsByName(edges: readonly RelationshipGraphEdge[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!result.has(edge.a)) result.set(edge.a, new Set())
    if (!result.has(edge.b)) result.set(edge.b, new Set())
    result.get(edge.a)?.add(edge.b)
    result.get(edge.b)?.add(edge.a)
  }
  return result
}

export function matchingRelationshipCharacters(
  characters: readonly RelationshipGraphCharacter[],
  query: string,
): Set<string> {
  const needle = normalized(query)
  if (!needle) return new Set(characters.map(character => character.name))
  return new Set(
    characters
      .filter(character => [character.name, ...(character.aliases ?? [])]
        .some(value => normalized(value).includes(needle)))
      .map(character => character.name),
  )
}

export function expandRelationshipFocus(
  seedNames: ReadonlySet<string>,
  edges: readonly RelationshipGraphEdge[],
  depth: 0 | 1 | 2,
): Set<string> {
  const names = new Set(seedNames)
  if (depth === 0) return names
  const neighbors = neighborsByName(edges)
  let frontier = new Set(seedNames)
  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>()
    for (const name of frontier) {
      for (const neighbor of neighbors.get(name) ?? []) {
        names.add(neighbor)
        next.add(neighbor)
      }
    }
    frontier = next
    if (frontier.size === 0) break
  }
  return names
}

export function filterRelationshipGraph<
  T extends RelationshipGraphCharacter,
  E extends RelationshipGraphEdge,
>(
  characters: readonly T[],
  edges: readonly E[],
  filter: RelationshipGraphFilter = {},
): { characters: T[]; edges: E[]; matchingNames: Set<string> } {
  const query = filter.query?.trim() ?? ''
  const depth = filter.focusDepth ?? (query ? 1 : 0)
  const matchingNames = matchingRelationshipCharacters(characters, query)
  const visibleEdges = edges.filter(edge => (
    !filter.relationKind || filter.relationKind === 'all' || edge.kind === filter.relationKind
  ))
  const seeds = query
    ? matchingNames
    : filter.relationKind && filter.relationKind !== 'all'
      ? new Set<string>()
      : new Set(characters.map(character => character.name))
  const displayNames = expandRelationshipFocus(seeds, visibleEdges, depth)
  // A relation-kind filter is itself a focus request: include both endpoints
  // even when there is no text query.
  if (filter.relationKind && filter.relationKind !== 'all') {
    for (const edge of visibleEdges) {
      displayNames.add(edge.a)
      displayNames.add(edge.b)
    }
  }
  return {
    characters: characters.filter(character => displayNames.has(character.name)),
    edges: visibleEdges.filter(edge => displayNames.has(edge.a) && displayNames.has(edge.b)),
    matchingNames,
  }
}

export function relationshipListRows(
  characters: readonly RelationshipGraphCharacter[],
  edges: readonly RelationshipGraphEdge[],
): Array<{ name: string; degree: number }> {
  const degrees = new Map<string, number>()
  for (const edge of edges) {
    degrees.set(edge.a, (degrees.get(edge.a) ?? 0) + 1)
    degrees.set(edge.b, (degrees.get(edge.b) ?? 0) + 1)
  }
  return characters
    .map(character => ({ name: character.name, degree: degrees.get(character.name) ?? 0 }))
    .sort((left, right) => right.degree - left.degree)
}
