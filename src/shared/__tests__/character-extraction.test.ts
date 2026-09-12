import { describe, expect, it } from 'vitest'

import {
  mergeCharacterExtractionCandidates,
  parseCharacterExtractionResponse,
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

  it('parses only fields backed by explicit evidence and merges aliases across chunks', () => {
    const source = {
      sourceId: 'chapter-4',
      sourceHash: 'a'.repeat(64),
      kind: 'chapter' as const,
      chapterNumbers: [4],
    }
    const first = parseCharacterExtractionResponse(JSON.stringify({
      characters: [{
        name: '沈月',
        aliases: ['月儿'],
        role: 'supporting',
        fields: { personality: '谨慎' },
        relationships: [{ target: '林舟', relation: '互相警惕' }],
        evidence: [
          { field: 'personality', value: '谨慎', excerpt: '沈月没有立刻回答，先观察了四周。' },
          { field: 'relationship', value: '林舟互相警惕', excerpt: '沈月和林舟彼此防备。' },
        ],
      }],
    }), source)
    const second = parseCharacterExtractionResponse(JSON.stringify({
      characters: [{
        name: '月儿',
        fields: { background: '来自北境' },
        evidence: [{ field: 'background', value: '来自北境', excerpt: '月儿来自北境的旧城。' }],
      }],
    }), source)

    const merged = mergeCharacterExtractionCandidates([...first, ...second])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ name: '沈月', aliases: ['月儿'] })
    expect(merged[0]?.fields).toMatchObject({ personality: '谨慎', background: '来自北境' })
    expect(merged[0]?.fieldEvidence).toHaveLength(3)
    expect(merged[0]?.relationships).toEqual([{ target: '林舟', relation: '互相警惕' }])
  })

  it('marks conflicting evidence as ambiguous instead of overwriting a field', () => {
    const source = {
      sourceId: 'chapter-5',
      sourceHash: 'b'.repeat(64),
      kind: 'chapter' as const,
      chapterNumbers: [5],
    }
    const candidates = parseCharacterExtractionResponse(JSON.stringify({
      characters: [
        { name: '林舟', fields: { age: '18' }, evidence: [{ field: 'age', value: '18', excerpt: '林舟十八岁。' }] },
        { name: '林舟', fields: { age: '19' }, evidence: [{ field: 'age', value: '19', excerpt: '林舟已经十九岁。' }] },
      ],
    }), source)

    const merged = mergeCharacterExtractionCandidates(candidates)
    expect(merged[0]?.disposition).toBe('ambiguous')
    expect(merged[0]?.fields.age).toBeUndefined()
    expect(merged[0]?.fieldEvidence).toHaveLength(2)
  })

  it('does not silently choose one existing character when the normalized name is duplicated', () => {
    const source = {
      sourceId: 'chapter-same-name', sourceHash: 'c'.repeat(64), kind: 'chapter' as const, chapterNumbers: [8],
    }
    const candidates = parseCharacterExtractionResponse(JSON.stringify({
      characters: [{
        name: '林舟', fields: { notes: '携带旧钥匙' },
        evidence: [{ field: 'notes', value: '携带旧钥匙', excerpt: '两个林舟都被提到，无法仅凭姓名判断。' }],
      }],
    }), source, ['林舟', '林舟'])

    expect(candidates[0]).toMatchObject({ disposition: 'ambiguous' })
    expect(candidates[0]?.matchedCharacterName).toBeUndefined()
  })
})
