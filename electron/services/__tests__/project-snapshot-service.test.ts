import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { getCurrentProjectPath, getProjectDb } from '../../database'
import { ProjectSnapshotService } from '../project-snapshot-service'

vi.mock('../../database', () => ({ getCurrentProjectPath: vi.fn(), getProjectDb: vi.fn() }))
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database
let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(process.cwd(), '.snapshot-test-'))
  await mkdir(path.join(root, '.vela', 'prompts'), { recursive: true })
  await mkdir(path.join(root, 'manuscript'), { recursive: true })
  await require('node:fs').promises.writeFile(path.join(root, '.vela', 'prompts', 'style.md'), '保持克制。', 'utf8')
  db = new Database(':memory:')
  db.exec('CREATE TABLE state (value TEXT); INSERT INTO state VALUES (\'consistent\')')
  vi.mocked(getCurrentProjectPath).mockReturnValue(root)
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(async () => { db.close(); await rm(root, { recursive: true, force: true }) })

describe('ProjectSnapshotService', () => {
  it('backs up SQLite through the backup API and records hashed project inputs', async () => {
    const manifest = await ProjectSnapshotService.create()
    expect(manifest.databaseFile).toBe('database.sqlite')
    expect(manifest.files.some(file => file.relativePath === 'database.sqlite')).toBe(true)
    expect(manifest.files.some(file => file.relativePath === '.vela/prompts/style.md')).toBe(true)
    const listed = await ProjectSnapshotService.list()
    expect(listed[0]?.snapshotId).toBe(manifest.snapshotId)
    const snapshotDb = new Database(path.join(root, '.vela', 'snapshots', manifest.snapshotId, 'database.sqlite'), { readonly: true })
    expect(snapshotDb.prepare('SELECT value FROM state').get()).toEqual({ value: 'consistent' })
    snapshotDb.close()
    await expect(readFile(path.join(root, '.vela', 'snapshots', manifest.snapshotId, 'manifest.json'), 'utf8')).resolves.toContain(manifest.snapshotId)
  })
})
