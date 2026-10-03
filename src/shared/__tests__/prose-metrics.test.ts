import { describe, expect, it } from 'vitest'

import {
  analyzeProseMetrics,
  formatProseMetricsReport,
  splitProseParagraphs,
  splitProseSentences,
} from '../prose-metrics'

describe('prose-metrics', () => {
  it('splits Chinese paragraphs and sentences on terminal punctuation', () => {
    expect(splitProseParagraphs('第一段。\n\n第二段。\n\n')).toEqual(['第一段。', '第二段。'])
    expect(splitProseSentences('他走进房间。他放下背包！他打开窗户？')).toEqual([
      '他走进房间',
      '他放下背包',
      '他打开窗户',
    ])
  })

  it('measures characters, sentences, paragraphs, and dialogue share', () => {
    const report = analyzeProseMetrics([
      '“你终于来了。”他说道。',
      '',
      '窗外的雨停了。',
    ].join('\n'))

    expect(report.paragraphs).toBe(2)
    expect(report.sentences).toBe(3)
    expect(report.characters).toBe(19)
    // 6 characters inside the quotes out of 19 non-whitespace characters.
    expect(report.dialogueRatio).toBe(0.32)
    expect(report.sentenceLength.longRatio).toBe(0)
  })

  it('flags repeated sentence openings, paragraph openings, and phrases', () => {
    const report = analyzeProseMetrics([
      '他缓缓抬起头。他缓缓转过身。他缓缓开口。他缓缓闭上眼。',
      '',
      '夜色深沉，风声穿过长廊。',
      '',
      '夜色深沉，灯火次第熄灭。',
      '',
      '夜色深沉，远处传来犬吠。',
    ].join('\n'))

    expect(report.repetitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'sentence-opening', sample: '他缓', occurrences: 4 }),
      expect.objectContaining({ kind: 'paragraph-opening', sample: '夜色深', occurrences: 3 }),
      expect.objectContaining({ kind: 'phrase', sample: '夜色深沉', occurrences: 3 }),
    ]))
  })

  it('measures rhythm and adverb density deterministically', () => {
    const text = '他猛地站起来。然后他慢慢地走到门口，停下来。'
    const first = analyzeProseMetrics(text)
    const second = analyzeProseMetrics(text)

    expect(first).toEqual(second)
    expect(first.adverbSamples).toEqual([
      { word: '猛地', count: 1 },
      { word: '缓缓', count: 0 },
      { word: '突然', count: 0 },
    ].filter(entry => entry.count > 0))
    expect(first.adverbDensity).toBeGreaterThan(0)
    expect(first.sentenceLength.standardDeviation).toBeGreaterThan(0)
  })

  it('treats a long unbroken sentence run as low-variance, long-sentence prose', () => {
    const longSentence = `他${'继续向前'.repeat(20)}。`
    const report = analyzeProseMetrics(longSentence)

    expect(report.sentenceLength.longRatio).toBe(1)
    expect(report.sentenceLength.standardDeviation).toBe(0)
  })

  it('uses word openings and hyphen-free adverbs for English prose', () => {
    const report = analyzeProseMetrics([
      'He walked into the quiet room and closed the door.',
      'He walked across the wooden floor and opened the window.',
      'He walked toward the desk and picked up the letter.',
      'She said nothing at all.',
    ].join(' '))

    expect(report.sentences).toBe(4)
    expect(report.repetitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'sentence-opening', sample: 'he walked', occurrences: 3 }),
    ]))
  })

  it('renders a human-readable report without model judgment', () => {
    const report = analyzeProseMetrics('他缓缓抬起头。他缓缓转过身。他缓缓开口。')
    const rendered = formatProseMetricsReport(report)

    expect(rendered).toContain('句首重复 3 次：他缓')
    expect(rendered).toContain('副词/模糊词密度')
  })
})
