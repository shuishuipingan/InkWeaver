import { describe, expect, it } from 'vitest'
import type { CharacterRosterEntry } from '../character-roster'
import { diffCharacterRoster, diffCharacterRosterEntries } from '../character-roster-diff'

function entry(overrides: Partial<CharacterRosterEntry> = {}): CharacterRosterEntry {
  return {
    name: '林舟',
    role: 'protagonist',
    gender: '', age: '', appearance: '', personality: '', background: '',
    abilities: '', motivation: '', arc: '', notes: '',
    relationships: [],
    ...overrides,
  }
}

describe('character roster diff', () => {
  it('reports added, removed, and changed text fields plus role changes', () => {
    const before = entry({ role: 'supporting', age: '17' })
    const after = entry({ role: 'protagonist', age: '18', personality: '谨慎' })
    const diff = diffCharacterRosterEntries(before, after)
    expect(diff.changes).toEqual(expect.arrayContaining([
      { kind: 'changed', field: 'age', previousValue: '17', nextValue: '18' },
      { kind: 'added', field: 'personality', value: '谨慎' },
      { kind: 'changed', field: 'role', previousValue: 'supporting', nextValue: 'protagonist' },
    ]))
  })

  it('counts relationship additions and removals and ignores untouched fields', () => {
    const before = entry({
      relationships: [
        { target: '沈月', relation: '盟友' },
        { target: '旧友', relation: '挚友' },
      ],
    })
    const after = entry({
      relationships: [
        { target: '沈月', relation: '盟友' },
        { target: '林澈', relation: '挚友' },
      ],
    })
    const diff = diffCharacterRosterEntries(before, after)
    expect(diff.relationshipAdded).toBe(1)
    expect(diff.relationshipRemoved).toBe(1)
    expect(diff.changes).toEqual([])
  })

  it('filters unchanged entries in a whole-roster diff', () => {
    const before = [entry({ name: '林舟', personality: '旧' }), entry({ name: '沈月' })]
    const after = [entry({ name: '林舟', personality: '新' }), entry({ name: '沈月' })]
    const diffs = diffCharacterRoster(before, after)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]?.name).toBe('林舟')
  })
})