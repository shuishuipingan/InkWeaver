import { describe, expect, it } from 'vitest'
import { planDraftCharacterContext } from '../draft-character-context'
import type { CharacterData } from '../../../electron/repositories/character-repository'
const card = (name: string): CharacterData => ({ name, role: 'supporting', gender: '', age: '', appearance: '', personality: '谨慎',
  background: '村里种麦。凤凰守门。'.repeat(200), abilities: '御火', motivation: '守诺', relationships: '[]', arc: '成长', notes: '不得杀人' })
describe('chapter-relevant cast context', () => {
  it('prefers direct relations over shared-location extras and matches longer names first', () => {
    const cards = [card('林舟'), ...Array.from({ length: 13 }, (_, i) => ({ ...card(`路人${i}`),
      currentState: { location: '北境', powerLevel: '', physicalState: '', mentalState: '', keyItems: '', recentEvents: '', updatedAtChapter: 1, provenance: { source: 'author' as const } } })), card('沈月')]
    cards.at(-1)!.relationships = '[{"target":"林舟","relation":"师徒"}]'
    const options = { chapterNumber: 2, characters: ['林舟'], keyEvents: '林舟前往北境', writingLanguage: 'zh-CN' as const }
    expect(planDraftCharacterContext(cards, options).secondary).toContain('沈月')
    const names = planDraftCharacterContext([card('人物1'), card('人物10')], { ...options, characters: [], keyEvents: '人物10出场' })
    expect(names.selectedCoreNames).toEqual(['人物10'])
  })
  it('retains background constraints and appearance and selects verified shared locations', () => {
    const cards = [card('林舟'), { ...card('沈月'), currentState: { location: '北境', powerLevel: '', physicalState: '', mentalState: '', keyItems: '', recentEvents: '', updatedAtChapter: 1, provenance: { source: 'author' as const } } }]
    cards[0]!.appearance = '左眼有伤'
    cards[0]!.background = '不得向陌生人透露第二人格。'
    const result = planDraftCharacterContext(cards, { chapterNumber: 2, characters: ['林舟'], keyEvents: '林舟前往北境', writingLanguage: 'zh-CN' })
    expect(result.core).toContain('左眼有伤')
    expect(result.core).toContain('不得向陌生人透露第二人格')
    expect(result.secondary).toContain('沈月')
  })
  it('protects core profiles and selects relations instead of sending all 229 cards', () => {
    const cards = Array.from({ length: 229 }, (_, i) => card(`人物${i}`))
    cards[1]!.relationships = JSON.stringify([{ target: '人物0', relation: '师徒' }])
    const result = planDraftCharacterContext(cards, { chapterNumber: 2, characters: ['人物0'], keyEvents: '山门失火', writingLanguage: 'zh-CN' })
    expect(result.core).toContain('不得杀人')
    expect(result.core).toContain('御火')
    expect(result.secondary).toContain('人物1')
    expect(result.secondary).not.toContain('人物228')
    expect(result.entries.filter(entry => entry.included)).toHaveLength(2)
    expect(result.entries.filter(entry => !entry.included)).toHaveLength(227)
    expect(result.entries.find(entry => entry.id === 'cast:0')).toMatchObject({ required: true, included: true })
  })
  it('does not promote future or unverified dynamic state to current novel facts', () => {
    const character = { ...card('林舟'), currentState: { location: '未来皇城', powerLevel: '', physicalState: '', mentalState: '', keyItems: '', recentEvents: '', updatedAtChapter: 100, provenance: { source: 'author' as const } } }
    const options = { chapterNumber: 2, characters: ['林舟'], keyEvents: '', writingLanguage: 'zh-CN' as const }
    expect(planDraftCharacterContext([character], options).core).not.toContain('未来皇城')
    character.currentState.updatedAtChapter = 1
    expect(planDraftCharacterContext([character], options).core).toContain('未来皇城')
    expect(planDraftCharacterContext([{ ...character, currentState: { ...character.currentState, provenance: { source: 'legacy-unknown' } } }], options).core).not.toContain('未来皇城')
    expect(planDraftCharacterContext([], options).entries[0]).toMatchObject({ included: false, reason: 'missing-source' })
  })
})
