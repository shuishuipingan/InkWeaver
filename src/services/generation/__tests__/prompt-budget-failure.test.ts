import { describe, expect, it } from 'vitest'

import type { PromptBudgetReport } from '../../../shared/prompt-budget'
import { formatPromptBudgetCompactionNotice, formatPromptBudgetFailure } from '../prompt-budget-failure'

const compactedReport: PromptBudgetReport = {
  totalUtf8Bytes: 990,
  limitUtf8Bytes: 900,
  reservedOutputTokens: 512,
  sections: [
    { sectionName: 'core-outline', utf8Bytes: 80 },
    { sectionName: 'distant-blueprints', utf8Bytes: 10 },
  ],
  compaction: {
    originalTotalUtf8Bytes: 1_040,
    retainedTotalUtf8Bytes: 990,
    removedUtf8Bytes: 50,
    sections: [
      { sectionName: 'core-outline', originalUtf8Bytes: 100, retainedUtf8Bytes: 80, removedUtf8Bytes: 20 },
      { sectionName: 'distant-blueprints', originalUtf8Bytes: 40, retainedUtf8Bytes: 10, removedUtf8Bytes: 30 },
    ],
  },
  modelId: 'model-a',
  errorCode: 'PROMPT_BUDGET_EXHAUSTED',
}

describe('prompt budget compaction diagnostics', () => {
  it('shows safe retained and removed byte counts for each compacted section', () => {
    const notice = formatPromptBudgetCompactionNotice(compactedReport, 'en-US')

    expect(notice).toContain('before the model request')
    expect(notice).toContain('removed 50 UTF-8 bytes')
    expect(notice).toContain('retained 990 bytes')
    expect(notice).toContain('Core outline: removed 20, retained 80 bytes')
    expect(notice).toContain('Distant blueprints: removed 30, retained 10 bytes')
    expect(notice).not.toContain('private prompt text')
  })

  it('keeps the compaction notice with the structured failure diagnostic', () => {
    const failure = formatPromptBudgetFailure(compactedReport, 'zh-CN')

    expect(failure).toContain('移除 50 UTF-8 字节')
    expect(failure).toContain('核心大纲')
    expect(failure).toContain('远期章节蓝图')
  })

  it('aggregates retained bytes across all uniquely named planning materials', () => {
    const report: PromptBudgetReport = {
      ...compactedReport,
      sections: [
        { sectionName: 'confirmed-planning-material-1', utf8Bytes: 0 },
        { sectionName: 'confirmed-planning-material-2', utf8Bytes: 240 },
      ],
      compaction: {
        originalTotalUtf8Bytes: 400,
        retainedTotalUtf8Bytes: 240,
        removedUtf8Bytes: 160,
        sections: [{
          sectionName: 'confirmed-planning-material-1',
          originalUtf8Bytes: 160,
          retainedUtf8Bytes: 0,
          removedUtf8Bytes: 160,
        }],
      },
    }

    expect(formatPromptBudgetCompactionNotice(report, 'en-US'))
      .toContain('Confirmed planning materials: removed 160, retained 240 bytes')
  })
})
