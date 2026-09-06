import { describe, expect, it } from 'vitest'

import { buildCharacterExtractionPrompt } from '../character-extraction-workflow'

describe('buildCharacterExtractionPrompt', () => {
  it('keeps evidence and uncertainty rules in the structured extraction prompt', () => {
    const prompt = buildCharacterExtractionPrompt({
      chunkId: 'chapter-1:0',
      sourceId: 'chapter-1',
      sourceHash: 'a'.repeat(64),
      index: 0,
      start: 0,
      end: 30,
      text: '林舟握着钥匙，沈月没有回答。',
    }, {
      sourceId: 'chapter-1',
      sourceHash: 'a'.repeat(64),
      kind: 'chapter',
      chapterNumbers: [1],
    }, ['林舟'], 'zh-CN')

    expect(prompt).toContain('逐字证据')
    expect(prompt).toContain('未知字段留空')
    expect(prompt).toContain('林舟')
    expect(prompt).toContain('沈月没有回答')
  })
})
