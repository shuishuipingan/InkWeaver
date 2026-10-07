import { describe, expect, it } from 'vitest'

import {
  formatRelationshipsForEditor,
  parseRelationshipEdges,
  relationshipStorageFromEditor,
} from '../relationship-presentation'

const legacyStorage = JSON.stringify([
  { target: '鹿鸣', relation: '师妹' },
  { target: '谢无尘', relation: '宿敌', sourceChapter: 3 },
])

const facetedStorage = JSON.stringify([
  {
    target: '鹿鸣',
    relation: '师妹',
    facets: [
      { kind: 'stance', text: '名义同门，实为彼此钳制' },
      { kind: 'emotion', text: '上一世目睹其死亡，愧疚未消' },
    ],
  },
  { target: '仙盟', relation: '名义归属' },
])

describe('relationship facets presentation', () => {
  it('keeps legacy storage shape untouched', () => {
    expect(parseRelationshipEdges(legacyStorage)).toEqual([
      { target: '鹿鸣', relation: '师妹' },
      { target: '谢无尘', relation: '宿敌', sourceChapter: 3 },
    ])
    const formatted = formatRelationshipsForEditor(legacyStorage)
    expect(formatted).toBe('鹿鸣：师妹\n谢无尘：宿敌')
    // 旧数据往返仍然不产生 facet 行。
    expect(formatted).not.toContain('·')
  })

  it('exposes facets on parsed edges', () => {
    const edges = parseRelationshipEdges(facetedStorage)
    expect(edges[0]!.facets).toEqual([
      { kind: 'stance', text: '名义同门，实为彼此钳制' },
      { kind: 'emotion', text: '上一世目睹其死亡，愧疚未消' },
    ])
    expect(edges[1]!.facets).toBeUndefined()
  })

  it('renders one labelled line per facet in the editor', () => {
    const formatted = formatRelationshipsForEditor(facetedStorage, { locale: 'zh-CN' })
    expect(formatted).toContain('鹿鸣：师妹')
    expect(formatted).toContain('· [立场] 名义同门，实为彼此钳制')
    expect(formatted).toContain('· [情感] 上一世目睹其死亡，愧疚未消')
  })

  it('round-trips facets through the editor without losing them', () => {
    const formatted = formatRelationshipsForEditor(facetedStorage, { locale: 'zh-CN' })
    const stored = relationshipStorageFromEditor(formatted, { knownNames: ['鹿鸣', '仙盟'], selfName: '沈瑶光' })
    const edges = parseRelationshipEdges(stored)
    expect(edges[0]!.facets).toEqual([
      { kind: 'stance', text: '名义同门，实为彼此钳制' },
      { kind: 'emotion', text: '上一世目睹其死亡，愧疚未消' },
    ])
  })

  it('accepts English facet labels and ignores unknown ones instead of crashing', () => {
    const stored = relationshipStorageFromEditor(
      ['鹿鸣：师妹', '  · [Stance] nominally allied', '  · [什么] 未知维度'].join('\n'),
      { knownNames: ['鹿鸣'], selfName: '沈瑶光' },
    )
    const edges = parseRelationshipEdges(stored)
    expect(edges[0]!.facets).toEqual([{ kind: 'stance', text: 'nominally allied' }])
  })

  it('drops facets with an unknown kind when reading persisted JSON', () => {
    const storage = JSON.stringify([{ target: '鹿鸣', relation: '师妹', facets: [{ kind: 'vibes', text: 'x' }] }])
    const edges = parseRelationshipEdges(storage)
    expect(edges[0]!.facets).toBeUndefined()
  })
})
