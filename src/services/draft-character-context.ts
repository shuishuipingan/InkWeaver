import type { CharacterData } from '../../electron/repositories/character-repository'
import type { ContextReceiptEntry } from '../shared/context-receipt'
import { summarizeContextText, CONSTRAINT_PATTERN } from '../shared/context-summary'

function relatedTargets(card: CharacterData, knownNames: readonly string[]): string[] {
  try {
    const rows: unknown = JSON.parse(card.relationships)
    if (Array.isArray(rows)) return rows.flatMap(row => row && typeof row === 'object'
      && typeof row.target === 'string' ? [row.target] : [])
  } catch { /* Author-written relationship notes remain useful planning data. */ }
  return knownNames.filter(name => name !== card.name && card.relationships.includes(name))
}

export function planDraftCharacterContext(cards: readonly CharacterData[], input: {
  chapterNumber: number; characters: readonly string[]; keyEvents: string; writingLanguage: 'zh-CN' | 'en-US'
}, detailSummaries: ReadonlyMap<string, string> = new Map()) {
  const coreNames = new Set(input.characters)
  let remainingEvents = input.keyEvents
  for (const card of [...cards].sort((a, b) => b.name.length - a.name.length)) {
    if (card.name && remainingEvents.includes(card.name)) {
      coreNames.add(card.name)
      remainingEvents = remainingEvents.replaceAll(card.name, '\0'.repeat(card.name.length))
    }
  }
  const names = cards.map(card => card.name)
  const coreCards = cards.filter(card => coreNames.has(card.name))
  const stateFor = (card: CharacterData) => card.currentState
    && card.currentState.updatedAtChapter < input.chapterNumber
    && (card.currentState.provenance?.source === 'author' || card.currentState.provenance?.source === 'model')
    ? card.currentState : undefined
  const linked = new Set(coreCards.flatMap(card => relatedTargets(card, names)))
  const related = cards.filter(card => !coreNames.has(card.name))
    .map((card, index) => ({ card, index, score: (linked.has(card.name) ? 400 : 0)
      + (relatedTargets(card, [...coreNames]).some(name => coreNames.has(name)) ? 300 : 0)
      + ((!!stateFor(card)?.location && stateFor(card)!.location.length > 1 && input.keyEvents.includes(stateFor(card)!.location)) ? 100 : 0)
      + ([...card.background.matchAll(/(?:所属|势力|驻地|faction|location)\s*[:：]\s*([^，。；;\n]+)/giu)]
        .some(match => match[1]!.trim().length > 1 && input.keyEvents.includes(match[1]!.trim())) ? 90 : 0) }))
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 12)
  const relatedNames = new Set(related.map(row => row.card.name))
  const coreLines = coreCards.map(card => JSON.stringify({ name: card.name, role: card.role, gender: card.gender, age: card.age,
    appearance: card.appearance,
    personality: card.personality, abilities: card.abilities, motivation: card.motivation, relationships: card.relationships,
    notes: card.notes, constraints: [card.background, card.arc].flatMap(text => text.split(/(?<=[。！？!?])|\r?\n+/u).filter(line => CONSTRAINT_PATTERN.test(line))),
    ...(stateFor(card) ? { currentState: stateFor(card) } : {}) }))
  const detailLines = coreCards.map(card => JSON.stringify({ name: card.name, appearance: card.appearance, background: card.background, arc: card.arc }))
  const summaryLines = coreCards.map(card => JSON.stringify({ name: card.name, details: detailSummaries.get(card.name)
    ?? summarizeContextText([card.appearance, card.background, card.arc].filter(Boolean).join('\n'), { maxChars: 800, terms: input.characters }).text }))
  const secondaryLines = related.map(({ card }) => JSON.stringify({ name: card.name, role: card.role,
    relationships: card.relationships, motivation: card.motivation, ...(stateFor(card) ? { currentState: stateFor(card) } : {}) }))
  const english = input.writingLanguage === 'en-US'
  const section = (label: string, rows: string[]) => rows.length ? `${label}\n${rows.join('\n')}` : ''
  const core = section(english ? '[Core cast: project profiles; only verified prior states establish occurred events]' : '【本章核心角色：项目人物设定；只有已核实前文状态代表已发生事实】', coreLines)
  const details = section(english ? '[Cast background and arc plans]' : '【角色背景与弧线规划】', detailLines)
  const detailSummary = section(english ? '[Cast background and arc plans]' : '【角色背景与弧线规划】', summaryLines)
  const secondary = section(english ? '[Related non-present cast]' : '【相关非出场角色】', secondaryLines)
  const entries: ContextReceiptEntry[] = cards.map((card, index) => ({ id: `cast:${index}`, layer: 'character-state',
    label: card.name, included: coreNames.has(card.name) || relatedNames.has(card.name), required: coreNames.has(card.name),
    representation: coreNames.has(card.name) ? 'full' : relatedNames.has(card.name) ? 'summary' : 'omitted',
    sourceKind: 'character-profile', originalCharCount: JSON.stringify(card).length,
    charCount: coreNames.has(card.name) ? coreLines[coreCards.indexOf(card)]!.length
      : relatedNames.has(card.name) ? secondaryLines[related.findIndex(row => row.card === card)]!.length : 0,
    ...(!coreNames.has(card.name) && !relatedNames.has(card.name) ? { reason: 'not-relevant' as const } : {}),
  }))
  for (const [index, card] of cards.entries()) {
    if (!card.currentState || (!coreNames.has(card.name) && !relatedNames.has(card.name))) continue
    const included = !!stateFor(card)
    entries.push({ id: `cast-state:${index}`, layer: 'character-state', label: `${card.name} ${english ? 'state' : '状态'}`,
      sourceChapter: card.currentState.updatedAtChapter, included, representation: included ? 'full' : 'omitted',
      sourceKind: card.currentState.provenance?.source === 'model' ? 'finalized-prose' : 'project-setting',
      charCount: included ? JSON.stringify(card.currentState).length : 0,
      ...(!included ? { reason: card.currentState.updatedAtChapter >= input.chapterNumber ? 'not-authorized' as const : 'needs-verification' as const } : {}),
    })
  }
  for (const name of input.characters) if (!names.includes(name)) entries.push({ id: `cast-missing:${entries.length}`,
    layer: 'character-state', label: name, included: false, reason: 'missing-source', representation: 'omitted',
    sourceKind: 'character-profile', charCount: 0 })
  return { core, details, detailSummary, secondary, entries, selectedCoreNames: coreCards.map(card => card.name) }
}
