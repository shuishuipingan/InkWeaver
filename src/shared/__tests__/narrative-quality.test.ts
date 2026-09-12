import { describe, expect, it } from 'vitest'
import { detectNarrativeQualityFindings } from '../narrative-quality'

describe('narrative quality findings', () => {
  it('finds repeated openings/endings and weather openings without rewriting prose', () => {
    const findings = detectNarrativeQualityFindings([
      { chapterNumber: 2, content: '雨落在旧码头的铁皮屋檐上，灯塔沉默着。\n\n林夏握住门把手。\n\n他知道今晚无论如何都不能回头，否则弟弟会永远消失。' },
      { chapterNumber: 3, content: '雨落在旧码头的铁皮屋檐上，灯塔沉默着。\n\n周砚站在门外。\n\n他知道今晚无论如何都不能回头，否则弟弟会永远消失。' },
    ])
    expect(findings.map(finding => finding.kind)).toEqual(expect.arrayContaining([
      'repeated-opening', 'repeated-ending', 'repeated-weather-opening',
    ]))
    expect(findings[0]?.evidence).toContain('雨落')
  })
})
