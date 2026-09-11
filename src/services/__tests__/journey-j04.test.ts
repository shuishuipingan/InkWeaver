import { describe, expect, it } from 'vitest'

import { mergeAcceptedCharacterCandidates } from '../character-extraction-merge'
import { buildCharacterExtractionContext } from '../workflows/character-extraction-context'
import type { CharacterExtractionCandidate } from '../../shared/character-extraction'
import type { CharacterRosterSnapshot } from '../../shared/character-roster'

function candidate(overrides: Partial<CharacterExtractionCandidate>): CharacterExtractionCandidate {
  return {
    candidateId: 'j04-candidate',
    source: {
      sourceId: 'long-manuscript',
      sourceHash: 'a'.repeat(64),
      kind: 'chapter',
      chapterNumbers: [1, 50, 100],
    },
    name: '月儿',
    aliases: ['沈月'],
    disposition: 'update',
    status: 'accepted',
    fields: { appearance: '后半段仍穿着灰色斗篷' },
    fieldEvidence: [{ field: 'appearance', value: '后半段仍穿着灰色斗篷', excerpt: '第九十七章，月儿披上灰色斗篷。' }],
    ...overrides,
  }
}

const roster: CharacterRosterSnapshot = {
  schemaVersion: 1,
  revision: 3,
  migrationState: 'ready',
  status: 'ready',
  projectionHash: 'projection',
  factHash: 'fact',
  renderedMarkdown: '',
  entries: [{
    name: '沈月',
    role: 'supporting',
    gender: '女',
    age: '',
    appearance: '',
    personality: '作者已写的谨慎',
    background: '作者背景资料',
    abilities: '',
    motivation: '',
    relationships: [],
    arc: '',
    notes: '',
  }],
}

describe('J04 long-manuscript character extraction journey', () => {
  it('keeps late evidence, requires disambiguation, and applies only accepted fields', () => {
    const longManuscript = [
      '第一章，月儿在港口等候。',
      '中间正文。'.repeat(500),
      '第九十七章，月儿披上灰色斗篷，林舟从北境归来。',
    ].join('\n')
    const boundedContext = buildCharacterExtractionContext(longManuscript, 420)
    expect(boundedContext).toContain('第九十七章')
    expect(boundedContext).toContain('[中间正文已省略')

    const ambiguous = candidate({
      candidateId: 'j04-ambiguous',
      name: '林舟',
      aliases: [],
      disposition: 'ambiguous',
      fields: { background: '后半段出现的另一位林舟' },
    })
    const lateNew = candidate({
      candidateId: 'j04-late-new',
      name: '林舟（北境）',
      aliases: ['北境客'],
      disposition: 'new',
      fields: { background: '第九十七章从北境归来' },
    })

    const withoutTarget = mergeAcceptedCharacterCandidates(roster, [candidate({}), ambiguous, lateNew])
    expect(withoutTarget).toHaveLength(2)
    expect(withoutTarget.find(entry => entry.name === '沈月')).toMatchObject({
      appearance: '后半段仍穿着灰色斗篷',
      background: '作者背景资料',
    })
    expect(withoutTarget.find(entry => entry.name === '林舟')).toBeUndefined()
    expect(withoutTarget.find(entry => entry.name === '林舟（北境）')).toMatchObject({
      aliases: ['北境客'],
      background: '第九十七章从北境归来',
    })

    const withExplicitTarget = mergeAcceptedCharacterCandidates(
      roster,
      [ambiguous],
      { 'j04-ambiguous': ['background'] },
      { 'j04-ambiguous': '沈月' },
    )
    expect(withExplicitTarget.find(entry => entry.name === '沈月')).toMatchObject({
      background: '后半段出现的另一位林舟',
    })
  })
})

