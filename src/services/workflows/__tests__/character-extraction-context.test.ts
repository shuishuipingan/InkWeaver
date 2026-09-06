import { describe, expect, it } from 'vitest'

import { buildCharacterExtractionContext } from '../character-extraction-context'

describe('buildCharacterExtractionContext', () => {
  it('keeps the whole chapter when it fits the extraction budget', () => {
    expect(buildCharacterExtractionContext('前半\n\n后半', 100)).toBe('前半\n\n后半')
  })

  it('keeps both early setup and late-character evidence when the chapter is long', () => {
    const content = `${'开头设定。'.repeat(500)}${'后半人物出现。'.repeat(1500)}`
    const result = buildCharacterExtractionContext(content, 1_200)

    expect(result.length).toBeLessThanOrEqual(1_200)
    expect(result).toContain('开头设定。')
    expect(result).toContain('后半人物出现。')
    expect(result).toContain('中间正文已省略')
  })
})
