import { describe, expect, it } from 'vitest'

import {
  parseExplicitTerminologyReplacements,
  replaceTerminologyText,
} from '../story-direction-terminology'

describe('story direction terminology replacements', () => {
  it('extracts each explicit Chinese “old name to new name” instruction', () => {
    expect(parseExplicitTerminologyReplacements('幽狼换成凤凰，黑虫系统换成智虫')).toEqual([
      { from: '幽狼', to: '凤凰' },
      { from: '黑虫系统', to: '智虫' },
    ])
  })

  it('replaces all terms simultaneously without cascading through newly assigned names', () => {
    const replacements = [
      { from: '幽狼', to: '凤凰' },
      { from: '凤凰', to: '智虫' },
    ]
    expect(replaceTerminologyText('幽狼与凤凰相遇', replacements)).toBe('凤凰与智虫相遇')
  })

  it('does not treat ordinary prose without explicit replacement syntax as a rename request', () => {
    expect(parseExplicitTerminologyReplacements('主角在幽狼谷遇到黑虫系统')).toEqual([])
  })
})
