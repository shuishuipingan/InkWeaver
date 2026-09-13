import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, initProjectDatabase } from '../../database'
import { PlanningMaterialRepository } from '../planning-material-repository'

let projectRoot = ''

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-planning-material-'))
  initProjectDatabase(projectRoot)
})
afterEach(() => {
  closeProjectDatabase()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('PlanningMaterialRepository', () => {
  it('keeps imported planning material as a candidate until explicit confirmation', () => {
    const candidate = PlanningMaterialRepository.upsertCandidate({
      name: '卷一蓝图', kind: 'outline', content: '第一卷：潮汐城。', sourceDisplayName: 'outline.md',
    })
    expect(candidate.status).toBe('candidate')
    expect(PlanningMaterialRepository.listConfirmed()).toEqual([])

    const confirmed = PlanningMaterialRepository.confirm(candidate.id, candidate.contentHash)
    expect(confirmed.status).toBe('confirmed')
    expect(PlanningMaterialRepository.listConfirmed().map(item => item.id)).toEqual([candidate.id])
  })

  it('deduplicates identical content and rejects stale confirmation hashes', () => {
    const first = PlanningMaterialRepository.upsertCandidate({ name: '时间线', kind: 'timeline', content: '第 1 章：潮汐。' })
    const second = PlanningMaterialRepository.upsertCandidate({ name: '时间线', kind: 'timeline', content: '第 1 章：潮汐。' })
    expect(second.id).toBe(first.id)
    expect(() => PlanningMaterialRepository.confirm(first.id, '0'.repeat(64))).toThrow('规划资料已变化')
  })

  it('does not expose rejected materials to the context projection', () => {
    const first = PlanningMaterialRepository.upsertCandidate({ name: '世界设定', kind: 'world', content: '潮汐城每七日涨潮。' })
    PlanningMaterialRepository.reject(first.id)
    expect(PlanningMaterialRepository.listConfirmed()).toEqual([])
  })
})
