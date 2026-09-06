import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, initProjectDatabase } from '../../database'
import type { CharacterExtractionCandidate } from '../../../src/shared/character-extraction'
import { CharacterExtractionCandidateRepository } from '../character-extraction-candidate-repository'

let projectRoot = ''

function candidate(overrides: Partial<CharacterExtractionCandidate> = {}): CharacterExtractionCandidate {
  return {
    candidateId: 'candidate-1',
    source: {
      sourceId: 'chapter-range-1-3',
      sourceHash: 'f'.repeat(64),
      kind: 'chapter-range',
      chapterNumbers: [1, 2, 3],
    },
    name: '沈月',
    aliases: ['月儿'],
    disposition: 'new',
    status: 'pending',
    role: 'supporting',
    fields: { personality: '谨慎' },
    fieldEvidence: [{ field: 'personality', value: '谨慎', excerpt: '沈月没有立刻回答。' }],
    ...overrides,
  }
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-character-candidates-'))
  initProjectDatabase(projectRoot)
})

afterEach(() => {
  closeProjectDatabase()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('CharacterExtractionCandidateRepository', () => {
  it('persists a batch idempotently and isolates source listings', () => {
    const first = candidate()
    const second = candidate({
      candidateId: 'candidate-2',
      name: '林舟',
      source: { ...first.source, sourceId: 'chapter-4' },
    })

    expect(CharacterExtractionCandidateRepository.saveBatch([first, second])).toHaveLength(2)
    expect(CharacterExtractionCandidateRepository.saveBatch([first])).toHaveLength(1)
    expect(CharacterExtractionCandidateRepository.list('chapter-range-1-3', first.source.sourceHash)).toHaveLength(1)
    expect(CharacterExtractionCandidateRepository.list('chapter-4', first.source.sourceHash)).toHaveLength(1)
  })

  it('changes only the requested candidate status and marks a source stale as a batch', () => {
    const first = candidate()
    const second = candidate({ candidateId: 'candidate-2', name: '林舟' })
    CharacterExtractionCandidateRepository.saveBatch([first, second])

    CharacterExtractionCandidateRepository.setStatus(first.candidateId, 'accepted')
    expect(CharacterExtractionCandidateRepository.get(first.candidateId)?.status).toBe('accepted')
    expect(CharacterExtractionCandidateRepository.get(second.candidateId)?.status).toBe('pending')

    CharacterExtractionCandidateRepository.markSourceStale(first.source.sourceId, first.source.sourceHash)
    expect(CharacterExtractionCandidateRepository.get(first.candidateId)?.status).toBe('stale')
    expect(CharacterExtractionCandidateRepository.get(second.candidateId)?.status).toBe('stale')
  })
})
