import { describe, expect, it } from 'vitest'

import {
  TITLE_LENGTH_RANGE,
  bookTitleLengthHint,
  buildTitleRules,
  sanitizeBookTitle,
} from '../novel-copywriting'

describe('novel copywriting title helpers', () => {
  it('strips book-title marks, quotes, and line breaks from a generated title', () => {
    expect(sanitizeBookTitle('《高手下山》')).toBe('高手下山')
    expect(sanitizeBookTitle('“ 重生之 ”')).toBe('重生之')
    expect(sanitizeBookTitle('  《前半》\n后半  ')).toBe('前半》 后半')
    expect(sanitizeBookTitle('普通书名')).toBe('普通书名')
  })

  it('flags titles outside the platform length range and accepts in-range ones', () => {
    expect(bookTitleLengthHint('高手下山', 'fanqie')).toEqual({ length: 4, min: 8, max: 15 })
    expect(bookTitleLengthHint('《高手下山我有九个无敌师父》', 'fanqie')).toBeNull()
    expect(bookTitleLengthHint('斗破苍穹', 'qidian')).toBeNull()
    expect(bookTitleLengthHint('斗破苍穹之上古传说', 'qidian')).toEqual({ length: 9, min: 4, max: 8 })
    expect(TITLE_LENGTH_RANGE.jinjiang).toEqual({ min: 4, max: 10 })
  })

  it('states the plain-text title rule so the model stops returning 《》 wrappers', () => {
    expect(buildTitleRules('fanqie', 'male')).toContain('不要书名号')
  })
})
