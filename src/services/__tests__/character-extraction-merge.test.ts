import { describe, expect, it } from 'vitest'

import { mergeAcceptedCharacterCandidates } from '../character-extraction-merge'
import type { CharacterExtractionCandidate } from '../../shared/character-extraction'
import type { CharacterRosterSnapshot } from '../../shared/character-roster'

const snapshot: CharacterRosterSnapshot = {
  schemaVersion: 1,
  revision: 4,
  migrationState: 'ready',
  status: 'ready',
  projectionHash: 'projection',
  factHash: 'fact',
  renderedMarkdown: '',
  entries: [{
    name: '沈月', role: 'supporting', gender: '女', age: '', appearance: '',
    personality: '作者已写的谨慎', background: '', abilities: '', motivation: '',
    relationships: [], arc: '', notes: '',
  }],
}

function candidate(overrides: Partial<CharacterExtractionCandidate>): CharacterExtractionCandidate {
  return {
    candidateId: 'candidate',
    source: { sourceId: 'chapter-1', sourceHash: 'a'.repeat(64), kind: 'chapter', chapterNumbers: [1] },
    name: '月儿', aliases: ['沈月'], disposition: 'update', status: 'accepted',
    fields: { appearance: '总是穿着灰色斗篷' }, fieldEvidence: [], ...overrides,
  }
}

describe('mergeAcceptedCharacterCandidates', () => {
  it('applies only the fields the author selected before committing a candidate', () => {
    const result = mergeAcceptedCharacterCandidates(snapshot, [candidate({
      candidateId: 'candidate-field-selection',
      fields: { personality: '谨慎', background: '不应覆盖的旧背景' },
      status: 'accepted',
    })], {
      'candidate-field-selection': ['personality'],
    })
    expect(result.find(entry => entry.name === '沈月')).toMatchObject({
      personality: '谨慎',
      background: '',
    })
  })
  it('matches aliases, patches accepted evidence fields, and preserves author fields', () => {
    const merged = mergeAcceptedCharacterCandidates(snapshot, [candidate({})])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      name: '沈月',
      gender: '女',
      personality: '作者已写的谨慎',
      appearance: '总是穿着灰色斗篷',
    })
  })

  it('creates a minimal new roster entry only for an accepted candidate', () => {
    const merged = mergeAcceptedCharacterCandidates(snapshot, [candidate({
      candidateId: 'new', name: '林舟', aliases: [], disposition: 'new',
      role: 'protagonist', fields: { background: '来自北境' },
    })])
    expect(merged.find(entry => entry.name === '林舟')).toMatchObject({
      role: 'protagonist', background: '来自北境', relationships: [], arc: '', notes: '',
    })
  })

  it('does not apply pending or rejected candidates', () => {
    const merged = mergeAcceptedCharacterCandidates(snapshot, [candidate({
      status: 'pending', fields: { appearance: '不应写入' },
    })])
    expect(merged[0]?.appearance).toBe('')
  })
})
