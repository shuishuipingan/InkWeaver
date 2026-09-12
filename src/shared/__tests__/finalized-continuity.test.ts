import { describe, expect, it } from 'vitest'

import { factAppliesAtChapter } from '../finalized-continuity'

describe('factAppliesAtChapter', () => {
  it('defaults a fact validity start to its source chapter', () => {
    expect(factAppliesAtChapter({ sourceChapter: 3 }, 2)).toBe(false)
    expect(factAppliesAtChapter({ sourceChapter: 3 }, 3)).toBe(true)
  })

  it('honors an explicit validity end chapter', () => {
    const fact = { sourceChapter: 3, validFromChapter: 3, validUntilChapter: 5 }
    expect(factAppliesAtChapter(fact, 5)).toBe(true)
    expect(factAppliesAtChapter(fact, 6)).toBe(false)
  })
})
