import { describe, expect, it } from 'vitest'
import {
  canApplyLocalRevision,
  createLocalRevisionProposal,
  adjacentFindingsAsReviewItems,
  inspectAdjacentContinuity,
  localRevisionContentHash,
} from '../adjacent-continuity'

const handoff = {
  chapterNumber: 1,
  sceneLocation: '旧码头仓库',
  viewpoint: '林岚视角',
  unfinishedActions: ['打开暗锁', '回答门后的声音'],
  emotionalState: '紧张且不敢回头',
  evidence: ['她把钥匙插进暗锁，门后却先叫出了她的名字。'],
  transition: 'continue-scene' as const,
}

describe('adjacent chapter continuity inspection', () => {
  it('reports concrete opening evidence for a scene jump and forgotten hooks', () => {
    const findings = inspectAdjacentContinuity({
      chapterNumber: 2,
      previousHandoff: handoff,
      previousEnding: '她把钥匙插进暗锁，门后却先叫出了她的名字。',
      currentDraft: '与此同时，林岚已经在一间明亮的咖啡馆里平静下来，仿佛什么也没有发生。',
    })

    expect(findings.map(finding => finding.category)).toEqual(expect.arrayContaining([
      'scene-jump',
      'forgotten-hook',
      'emotion-reset',
    ]))
    expect(findings[0]).toMatchObject({
      previousEvidence: expect.any(String),
      currentEvidence: expect.stringContaining('与此同时'),
      suggestedScope: 'opening',
    })
    expect(adjacentFindingsAsReviewItems(findings, 'zh-CN')[0]).toMatchObject({
      previousEvidence: expect.any(String),
      currentEvidence: expect.any(String),
      stableFactKey: expect.stringContaining('adjacent:'),
    })
  })

  it('does not invent a violation when a handoff is absent or the opening carries it forward', () => {
    expect(inspectAdjacentContinuity({ chapterNumber: 2, currentDraft: '林岚握住暗锁，回答了门后的声音。' })).toEqual([])
    expect(inspectAdjacentContinuity({
      chapterNumber: 2,
      previousHandoff: handoff,
      currentDraft: '旧码头仓库里，林岚握住暗锁，回答了门后的声音。',
    })).toEqual([])
  })
})

describe('local revision proposal source binding', () => {
  it('accepts only the frozen base content and rejects later edits', () => {
    const base = '旧码头仓库里，林岚握住暗锁。'
    const proposal = createLocalRevisionProposal({
      proposalId: 'proposal-1',
      baseDraftId: 7,
      baseContent: base,
      scope: 'opening',
      replacementText: '旧码头仓库里，林岚没有松开暗锁。',
      findingIds: ['adjacent:forgotten-hook:1'],
      createdAt: '2026-09-06T00:00:00.000Z',
    })

    expect(proposal.baseContentHash).toBe(localRevisionContentHash(base))
    expect(canApplyLocalRevision(proposal, base)).toBe(true)
    expect(canApplyLocalRevision(proposal, `${base} 作者后来补了一句。`)).toBe(false)
  })
})
