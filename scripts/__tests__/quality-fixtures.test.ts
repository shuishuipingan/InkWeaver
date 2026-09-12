import { describe, expect, it } from 'vitest'

import {
  FIXED_CHAPTER_PAIR_CASES,
  QUALITY_FIXTURE_VERSION,
  buildLongFormQualityFixture,
  hashQualityFixture,
} from '../quality-fixtures'

describe('InkWeaver 1.1.0 quality fixtures', () => {
  it('contains four deterministic cases for each required chapter-transition category', () => {
    expect(QUALITY_FIXTURE_VERSION).toBe('1')
    expect(FIXED_CHAPTER_PAIR_CASES).toHaveLength(24)
    expect(new Set(FIXED_CHAPTER_PAIR_CASES.map(item => item.kind))).toEqual(new Set([
      'immediate', 'time-jump', 'location-change', 'viewpoint-change', 'flashback', 'deferred-payoff',
    ]))
    expect(new Set(FIXED_CHAPTER_PAIR_CASES.map(item => item.id)).size).toBe(24)
    for (const kind of new Set(FIXED_CHAPTER_PAIR_CASES.map(item => item.kind))) {
      expect(FIXED_CHAPTER_PAIR_CASES.filter(item => item.kind === kind)).toHaveLength(4)
    }
  })

  it('builds a deterministic 100-chapter sample with known historical transitions', () => {
    const first = buildLongFormQualityFixture()
    const second = buildLongFormQualityFixture()
    expect(first).toEqual(second)
    expect(first).toHaveLength(100)
    expect(first[11]?.facts).toContain('林夏在第12章取得旧钥匙')
    expect(first[17]?.facts).toContain('旧钥匙在第18章转交给顾舟')
    expect(first[29]?.facts).toContain('顾舟在第30章受伤')
    expect(first[39]?.facts).toContain('顾舟在第40章恢复行动')
    expect(first[54]?.facts).toContain('林夏在第55章得知灯塔的秘密')
    expect(first[69]?.readerKnowledge).toContain('读者在第70章确认信件来自未来')
  })

  it('produces a stable SHA-256 digest for the public fixture', () => {
    const digest = hashQualityFixture(buildLongFormQualityFixture())
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(digest).toBe(hashQualityFixture(buildLongFormQualityFixture()))
  })
})
