import { describe, expect, it } from 'vitest'

import {
  planCharacterExtractionChunks,
  textFingerprint,
} from '../character-extraction'

describe('character extraction chunk planning', () => {
  it('creates stable source-bound chunk identities and covers the whole source', () => {
    const source = `${'开头设定。'.repeat(500)}${'后半人物出现。'.repeat(900)}`
    const chunks = planCharacterExtractionChunks(source, {
      sourceId: 'chapter-range-1-3',
      kind: 'chapter-range',
      chapterNumbers: [1, 2, 3],
      maxCharacters: 2_000,
      overlapCharacters: 200,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]?.start).toBe(0)
    expect(chunks.at(-1)?.end).toBe(source.length)
    expect(chunks.every(chunk => chunk.sourceHash === textFingerprint(source))).toBe(true)
    expect(chunks.at(-1)?.text).toContain('后半人物出现')
    expect(new Set(chunks.map(chunk => chunk.chunkId)).size).toBe(chunks.length)
  })

  it('rejects invalid chunk limits and returns no chunks for empty input', () => {
    expect(planCharacterExtractionChunks('  ', {
      sourceId: 'empty',
      kind: 'selection',
    })).toEqual([])
    expect(() => planCharacterExtractionChunks('正文', {
      sourceId: 'too-small',
      kind: 'selection',
      maxCharacters: 99,
    })).toThrow(/至少为 1000/u)
  })
})
