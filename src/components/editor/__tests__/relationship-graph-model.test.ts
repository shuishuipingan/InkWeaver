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
})
