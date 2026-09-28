import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { closeProjectDatabase, getProjectDb, initProjectDatabase } from '../database'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
const projectRoots: string[] = []

afterEach(() => {
  closeProjectDatabase()
  for (const root of projectRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('project database lock wait policy', () => {
  it('sets a five-second busy timeout every time a project connection is opened', () => {
    const firstProject = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-busy-timeout-a-'))
    const secondProject = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-busy-timeout-b-'))
    projectRoots.push(firstProject, secondProject)
    const pragmaSpy = vi.spyOn(Database.prototype, 'pragma')

    initProjectDatabase(firstProject)
    expect(getProjectDb()!.pragma('busy_timeout', { simple: true })).toBe(5_000)

    initProjectDatabase(secondProject)
    expect(getProjectDb()!.pragma('busy_timeout', { simple: true })).toBe(5_000)
    expect(pragmaSpy.mock.calls.filter(([sql]) => sql === 'busy_timeout = 5000')).toHaveLength(2)
  })
})
