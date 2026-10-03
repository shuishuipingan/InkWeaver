/**
 * Deterministic prose diagnostics shared by the editor and the writing agent.
 *
 * These are measurements, never model judgments: the same text always yields
 * the same report, so a revision can prove it removed a specific finding
 * instead of asking a model whether the prose "feels better".
 */

export type ProseRepetitionKind = 'sentence-opening' | 'paragraph-opening' | 'phrase'

export interface ProseRepetitionFinding {
  kind: ProseRepetitionKind
  /** Short human-readable excerpt that repeats. */
  sample: string
  occurrences: number
}

export interface ProseMetricsReport {
  /** Non-whitespace characters. */
  characters: number
  sentences: number
  paragraphs: number
  /** Share (0..1) of characters inside quotation marks. */
  dialogueRatio: number
  sentenceLength: {
    mean: number
    standardDeviation: number
    /** Share of sentences longer than 60 characters. */
    longRatio: number
  }
  /** Adverb and hedge occurrences per 1,000 characters. */
  adverbDensity: number
  adverbSamples: Array<{ word: string; count: number }>
  repetitions: ProseRepetitionFinding[]
}

export interface ProseMetricsOptions {
  /** Upper bound on returned repetition findings; the most frequent win. */
  maxRepetitions?: number
}

const HAN_PATTERN = /\p{Script=Han}/gu
const LATIN_LETTER_PATTERN = /[A-Za-z]/g
const NON_WHITESPACE_PATTERN = /\s/gu
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['“', '”'],
  ['‘', '’'],
  ['「', '」'],
  ['『', '』'],
  ['"', '"'],
]
const SENTENCE_BREAK_PATTERN = /[。！？!?…]+|\.(?=\s|$)/gu
const PUNCTUATION_PATTERN = /[\s\p{P}\p{S}]/gu

const HAN_ADVERBS: readonly string[] = [
  '突然', '忽然', '仿佛', '似乎', '竟然', '居然', '顿时', '瞬间', '猛地', '陡然',
  '缓缓', '微微', '轻轻', '深深', '默默', '悄悄', '渐渐', '终于', '依然', '仍然',
  '依旧', '其实', '甚至', '几乎', '大概', '也许', '或许', '显然', '不禁', '忍不住',
]

const LATIN_ADVERBS: readonly string[] = [
  'suddenly', 'quickly', 'slowly', 'quietly', 'gently', 'softly', 'finally', 'simply',
  'slightly', 'barely', 'almost', 'perhaps', 'maybe', 'clearly', 'actually', 'really',
]

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

function isCjkDominant(text: string): boolean {
  const han = countMatches(text, HAN_PATTERN)
  return han * 2 >= countMatches(text, LATIN_LETTER_PATTERN)
}

export function splitProseParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
}

export function splitProseSentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK_PATTERN)
    .map(sentence => sentence.trim())
    .filter(Boolean)
}

function dialogueCharacters(text: string): number {
  let total = 0
  for (const [open, close] of QUOTE_PAIRS) {
    let from = 0
    for (;;) {
      const start = text.indexOf(open, from)
      if (start < 0) break
      const end = text.indexOf(close, start + open.length)
      if (end < 0) {
        total += text.length - start - open.length
        break
      }
      total += end - start - open.length
      from = end + close.length
    }
  }
  return total
}

/** CJK openings are short character prefixes; Latin openings are leading words. */
function openingOf(unit: string, cjk: boolean, characterWidth: number, wordWidth: number): string {
  if (cjk) {
    const content = unit.replace(PUNCTUATION_PATTERN, '')
    return content.length > characterWidth ? content.slice(0, characterWidth) : ''
  }
  const words = unit.split(/\s+/u).filter(Boolean)
  return words.length >= 5 ? words.slice(0, wordWidth).join(' ').toLocaleLowerCase('en-US') : ''
}

function countOpenings(
  units: readonly string[],
  cjk: boolean,
  characterWidth: number,
  wordWidth: number,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const unit of units) {
    const opening = openingOf(unit, cjk, characterWidth, wordWidth)
    if (!opening) continue
    counts.set(opening, (counts.get(opening) ?? 0) + 1)
  }
  return counts
}

function repeatedPhrases(text: string, cjk: boolean): Map<string, number> {
  const counts = new Map<string, number>()
  if (cjk) {
    const content = text.replace(PUNCTUATION_PATTERN, '')
    for (let index = 0; index + 4 <= content.length; index += 1) {
      const gram = content.slice(index, index + 4)
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
    return counts
  }
  const words = text.toLocaleLowerCase('en-US').split(/[^\p{L}']+/u).filter(word => word.length > 1)
  for (let index = 0; index + 3 <= words.length; index += 1) {
    const gram = words.slice(index, index + 3).join(' ')
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

function toRepetitionFindings(
  counts: Map<string, number>,
  kind: ProseRepetitionKind,
  minimum: number,
  limit: number,
): ProseRepetitionFinding[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, limit)
    .map(([sample, occurrences]) => ({ kind, sample, occurrences }))
}

export function analyzeProseMetrics(
  text: string,
  options: ProseMetricsOptions = {},
): ProseMetricsReport {
  const maxRepetitions = options.maxRepetitions ?? 8
  const characters = text.replace(NON_WHITESPACE_PATTERN, '').length
  const sentences = splitProseSentences(text)
  const paragraphs = splitProseParagraphs(text)
  const cjk = isCjkDominant(text)

  const lengths = sentences.map(sentence => sentence.replace(NON_WHITESPACE_PATTERN, '').length)
  const mean = lengths.length > 0 ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0
  const variance = lengths.length > 0
    ? lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length
    : 0
  const longSentences = lengths.filter(length => length > 60).length

  const adverbs = cjk ? HAN_ADVERBS : LATIN_ADVERBS
  const adverbCounts = adverbs
    .map(word => ({ word, count: text.split(word).length - 1 }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word))
  const totalAdverbs = adverbCounts.reduce((sum, entry) => sum + entry.count, 0)

  const sentenceOpenings = countOpenings(sentences, cjk, 2, 2)
  const paragraphOpenings = countOpenings(paragraphs, cjk, 3, 3)

  return {
    characters,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    dialogueRatio: characters > 0 ? round2(dialogueCharacters(text) / characters) : 0,
    sentenceLength: {
      mean: round2(mean),
      standardDeviation: round2(Math.sqrt(variance)),
      longRatio: lengths.length > 0 ? round2(longSentences / lengths.length) : 0,
    },
    adverbDensity: characters > 0 ? round2((totalAdverbs * 1000) / characters) : 0,
    adverbSamples: adverbCounts.slice(0, 5),
    repetitions: [
      ...toRepetitionFindings(sentenceOpenings, 'sentence-opening', 3, maxRepetitions),
      ...toRepetitionFindings(paragraphOpenings, 'paragraph-opening', 3, maxRepetitions),
      ...toRepetitionFindings(repeatedPhrases(text, cjk), 'phrase', 3, maxRepetitions),
    ].sort((left, right) => right.occurrences - left.occurrences).slice(0, maxRepetitions),
  }
}

const REPETITION_LABELS: Record<ProseRepetitionKind, string> = {
  'sentence-opening': '句首重复',
  'paragraph-opening': '段首重复',
  phrase: '短语重复',
}

export function formatProseMetricsReport(report: ProseMetricsReport): string {
  const repetitionLines = report.repetitions.length > 0
    ? report.repetitions
      .map(finding => `- ${REPETITION_LABELS[finding.kind]} ${finding.occurrences} 次：${finding.sample}`)
      .join('\n')
    : '- 未检测到明显重复'
  const adverbLines = report.adverbSamples.length > 0
    ? report.adverbSamples.map(entry => `${entry.word}(${entry.count})`).join('、')
    : '无'
  return [
    `字数（不含空白）：${report.characters}`,
    `段落：${report.paragraphs} · 句子：${report.sentences}`,
    `对话占比：${(report.dialogueRatio * 100).toFixed(1)}%`,
    `句长：平均 ${report.sentenceLength.mean} · 标准差 ${report.sentenceLength.standardDeviation} · 长句(>60字)占比 ${(report.sentenceLength.longRatio * 100).toFixed(1)}%`,
    `副词/模糊词密度：${report.adverbDensity}/千字 · 高频：${adverbLines}`,
    '重复检测：',
    repetitionLines,
  ].join('\n')
}
