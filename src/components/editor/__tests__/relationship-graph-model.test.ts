import { describe, expect, it } from 'vitest'
import {
  expandRelationshipFocus,
  filterRelationshipGraph,
  matchingRelationshipCharacters,
  relationshipListRows,
} from '../relationship-graph-model'

const characters = [
  { name: '林岚', aliases: ['夜行者'] },
  { name: '周砚', aliases: ['小周'] },
  { name: '苏晚', aliases: [] },
  { name: '陈锋', aliases: [] },
]
const edges = [
  { a: '林岚', b: '周砚', kind: 'ally' as const },
  { a: '周砚', b: '苏晚', kind: 'hostile' as const },
  { a: '苏晚', b: '陈锋', kind: 'family' as const },
]

describe('relationship graph model', () => {
  it('matches aliases and expands a focused seed by one or two hops', () => {
    expect(matchingRelationshipCharacters(characters, '夜行者')).toEqual(new Set(['林岚']))
    expect(expandRelationshipFocus(new Set(['林岚']), edges, 1)).toEqual(new Set(['林岚', '周砚']))
    expect(expandRelationshipFocus(new Set(['林岚']), edges, 2)).toEqual(new Set(['林岚', '周砚', '苏晚']))
  })

  it('filters relation kinds without hiding the edge endpoints and exposes accessible list rows', () => {
    const result = filterRelationshipGraph(characters, edges, { relationKind: 'hostile' })
    expect(result.characters.map(character => character.name)).toEqual(['周砚', '苏晚'])
    expect(result.edges).toEqual([{ a: '周砚', b: '苏晚', kind: 'hostile' }])
    expect(relationshipListRows(result.characters, result.edges)).toEqual([
      { name: '周砚', degree: 1 },
      { name: '苏晚', degree: 1 },
    ])
  })

  it('stays bounded when filtering and searching a 5,000-node dense graph', () => {
    const bigCharacters = Array.from({ length: 5000 }, (_, index) => ({
      name: `角色${index}`,
      aliases: index % 100 === 0 ? [`别名${index}`] : [],
    }))
    const bigEdges = Array.from({ length: 5000 }, (_, index) => ({
      a: `角色${index}`,
      b: `角色${(index + 1) % 5000}`,
      kind: (index % 3 === 0 ? 'hostile' : index % 3 === 1 ? 'ally' : 'family') as 'hostile' | 'ally' | 'family',
    }))
    const matches = matchingRelationshipCharacters(bigCharacters, '别名4000')
    expect(matches).toEqual(new Set(['角色4000']))
    const filtered = filterRelationshipGraph(bigCharacters, bigEdges, { relationKind: 'hostile' })
    expect(filtered.edges.length).toBeGreaterThan(0)
    expect(filtered.edges.every(edge => edge.kind === 'hostile')).toBe(true)
    const focused = filterRelationshipGraph(bigCharacters, bigEdges, { query: '角色4000', focusDepth: 1 })
    expect(focused.characters.length).toBeLessThanOrEqual(5000)
    expect(focused.characters.some(character => character.name === '角色4000')).toBe(true)
    expect(relationshipListRows(focused.characters, focused.edges).length).toBeGreaterThan(0)
  })
})