import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, getProjectDb, initProjectDatabase } from '../../database'
import { countDraftUnits } from '../../../src/shared/draft-units'
import type { SaveChapterHandoffRequest } from '../../../src/shared/chapter-handoff'
import { FinalizedDraftImportRepository } from '../finalized-draft-import-repository'
import { ChapterHandoffRepository } from '../chapter-handoff-repository'

let projectRoot = ''

function request(draftId: number, chapterNumber: number, contentHash: string): SaveChapterHandoffRequest {
  return {
    handoffId: `handoff-${chapterNumber}`,
    draftId,
    chapterNumber,
    sourceContentHash: contentHash,
    sceneLocation: '旧码头的仓库',
    viewpoint: '林舟',
    presentCharacters: ['林舟', '沈月'],
    unfinishedActions: ['林舟尚未打开门后的暗锁'],
    immediateGoal: '确认门后是否有人',
    emotionalState: '林舟因为听见自己的名字而警惕',
    constraints: ['钥匙已经染血，不能遗失'],
    openQuestions: ['门后的人为何知道林舟的名字？'],
    transition: 'continue-scene',
    evidence: ['林舟握着染血的钥匙，听见门后有人叫出了他的名字。'],
  }
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-handoff-'))
  initProjectDatabase(projectRoot)
})

afterEach(() => {
  closeProjectDatabase()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('ChapterHandoffRepository', () => {
  it('saves a source-bound candidate and confirms it as the latest handoff', () => {
    const content = '林舟握着染血的钥匙，听见门后有人叫出了他的名字。'
    const receipt = FinalizedDraftImportRepository.commit(projectRoot, {
      operationId: 'handoff-finalized',
      chapters: [{ chapterNumber: 1, title: '暗锁', content, wordCount: countDraftUnits(content) }],
    })
    const draftId = receipt.drafts[0]!.draftId
    const contentHash = receipt.drafts[0]!.contentHash
    const payload = request(draftId, 1, contentHash)

    ChapterHandoffRepository.saveCandidate(payload)
    expect(ChapterHandoffRepository.get(payload.handoffId)).toMatchObject({
      handoffId: payload.handoffId,
      draftId,
      chapterNumber: 1,
      status: 'candidate',
      sourceContentHash: contentHash,
      immediateGoal: payload.immediateGoal,
    })

    ChapterHandoffRepository.confirm(payload.handoffId)
    expect(ChapterHandoffRepository.getLatestConfirmedBefore(2)).toMatchObject({
      handoffId: payload.handoffId,
      status: 'confirmed',
      sceneLocation: payload.sceneLocation,
    })
    expect(ChapterHandoffRepository.listForChapter(1)).toHaveLength(1)
  })

  it('rejects a candidate whose frozen source hash no longer matches the draft', () => {
    const content = '定稿内容'
    const receipt = FinalizedDraftImportRepository.commit(projectRoot, {
      operationId: 'handoff-stale-source',
      chapters: [{ chapterNumber: 1, title: '第一章', content, wordCount: countDraftUnits(content) }],
    })
    const draftId = receipt.drafts[0]!.draftId
    expect(() => ChapterHandoffRepository.saveCandidate(request(draftId, 1, '0'.repeat(64))))
      .toThrow(/来源正文已变化/u)
  })

  it('does not return a handoff from a future chapter', () => {
    const content = '未来章节定稿'
    const receipt = FinalizedDraftImportRepository.commit(projectRoot, {
      operationId: 'handoff-future',
      chapters: [{ chapterNumber: 3, title: '未来', content, wordCount: countDraftUnits(content) }],
    })
    const draftId = receipt.drafts[0]!.draftId
    const payload = request(draftId, 3, receipt.drafts[0]!.contentHash)
    ChapterHandoffRepository.saveCandidate(payload)
    ChapterHandoffRepository.confirm(payload.handoffId)

    expect(ChapterHandoffRepository.getLatestConfirmedBefore(3)).toBeNull()
    expect(getProjectDb()!.prepare('SELECT COUNT(*) AS count FROM chapter_handoffs').get())
      .toEqual({ count: 1 })
  })
})
