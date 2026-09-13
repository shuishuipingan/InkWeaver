import { describe, expect, it } from 'vitest'

import { buildBlueprintEventCoverage } from '../review-event-coverage'

describe('blueprint event review coverage', () => {
  it('labels each blueprint event with an explicit status and evidence', () => {
    const coverage = buildBlueprintEventCoverage(
      '- 林岚打开暗门\n- 顾舟留下警告\n- 两人暂缓交手',
      '林岚打开暗门。',
      [{ description: '顾舟留下警告，但本章暂缓处理。', quote: '顾舟说完警告后离开。' }],
    )

    expect(coverage).toEqual([
      expect.objectContaining({ event: '林岚打开暗门', status: 'completed', evidence: '林岚打开暗门。' }),
      expect.objectContaining({ event: '顾舟留下警告', status: 'prepared', evidence: '顾舟说完警告后离开。' }),
      expect.objectContaining({ event: '两人暂缓交手', status: 'not-found' }),
    ])
  })

  it('marks a vague mention as needs-verification instead of completed', () => {
    expect(buildBlueprintEventCoverage('- 打开暗门', '门还在前方。', [{ description: '可能会打开暗门' }]))
      .toEqual([expect.objectContaining({ status: 'needs-verification', evidence: undefined })])
  })
})
