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
let restoreTarget: string | undefined

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

afterEach(async () => {
  db.close()
  await rm(root, { recursive: true, force: true })
  if (restoreTarget) await rm(restoreTarget, { recursive: true, force: true })
  restoreTarget = undefined
})

describe('ProjectSnapshotService', () => {
  it('backs up SQLite through the backup API and records hashed project inputs', async () => {
    const manifest = await ProjectSnapshotService.create()
    expect(manifest.databaseFile).toBe('database.sqlite')
    expect(manifest.files.some(file => file.relativePath === 'database.sqlite')).toBe(true)
    expect(manifest.files.some(file => file.relativePath === '.vela/prompts/style.md')).toBe(true)
    const listed = await ProjectSnapshotService.list()
    expect(listed[0]?.snapshotId).toBe(manifest.snapshotId)
    await expect(ProjectSnapshotService.verify(manifest.snapshotId)).resolves.toMatchObject({ valid: true, missing: [], mismatched: [] })
    const snapshotDb = new Database(path.join(root, '.vela', 'snapshots', manifest.snapshotId, 'database.sqlite'), { readonly: true })
    expect(snapshotDb.prepare('SELECT value FROM state').get()).toEqual({ value: 'consistent' })
    snapshotDb.close()
    await expect(readFile(path.join(root, '.vela', 'snapshots', manifest.snapshotId, 'manifest.json'), 'utf8')).resolves.toContain(manifest.snapshotId)
  })

  it('reports a changed snapshot file without restoring it', async () => {
    const manifest = await ProjectSnapshotService.create()
    await require('node:fs').promises.writeFile(path.join(root, '.vela', 'snapshots', manifest.snapshotId, 'database.sqlite'), 'tampered')
    await expect(ProjectSnapshotService.verify(manifest.snapshotId)).resolves.toMatchObject({ valid: false, mismatched: ['database.sqlite'] })
  })

  it('rejects a manifest path that escapes the snapshot root', async () => {
    const manifest = await ProjectSnapshotService.create()
    const manifestPath = path.join(root, '.vela', 'snapshots', manifest.snapshotId, 'manifest.json')
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as { files: unknown[] }
    parsed.files.push({ relativePath: '../outside', bytes: 0, sha256: '0'.repeat(64) })
    await require('node:fs').promises.writeFile(manifestPath, JSON.stringify(parsed), 'utf8')
    await expect(ProjectSnapshotService.verify(manifest.snapshotId)).rejects.toThrow(/越界路径/)
  })

  it('previews and restores a verified snapshot into a new isolated directory', async () => {
    const manifest = await ProjectSnapshotService.create()
    restoreTarget = await mkdtemp(path.join(process.cwd(), '.snapshot-restore-'))
    await rm(restoreTarget, { recursive: true, force: true })

    const preview = await ProjectSnapshotService.previewRestore(manifest.snapshotId, restoreTarget)
    expect(preview).toMatchObject({
      snapshotId: manifest.snapshotId,
      valid: true,
      destinationExists: false,
      destinationEmpty: true,
      canRestore: true,
      conflicts: [],
    })

    const restored = await ProjectSnapshotService.restore(manifest.snapshotId, restoreTarget)
    expect(restored.files).toBe(manifest.files.length)
    await expect(readFile(path.join(restoreTarget, '.vela', 'prompts', 'style.md'), 'utf8')).resolves.toBe('保持克制。')
    const restoredDb = new Database(path.join(restoreTarget, 'database.sqlite'), { readonly: true })
    expect(restoredDb.prepare('SELECT value FROM state').get()).toEqual({ value: 'consistent' })
    restoredDb.close()
    await expect(readFile(path.join(restoreTarget, 'manifest.json'), 'utf8')).resolves.toContain(manifest.snapshotId)
  })

  it('refuses to restore into a non-empty directory or inside the source project', async () => {
    const manifest = await ProjectSnapshotService.create()
    restoreTarget = await mkdtemp(path.join(process.cwd(), '.snapshot-restore-'))
    await require('node:fs').promises.writeFile(path.join(restoreTarget, 'keep.txt'), 'do not overwrite', 'utf8')

    await expect(ProjectSnapshotService.previewRestore(manifest.snapshotId, restoreTarget)).resolves.toMatchObject({
      valid: true,
      destinationExists: true,
      destinationEmpty: false,
      canRestore: false,
    })
    await expect(ProjectSnapshotService.restore(manifest.snapshotId, restoreTarget)).rejects.toThrow(/空目录/)
    await expect(ProjectSnapshotService.previewRestore(manifest.snapshotId, path.join(root, 'restored'))).rejects.toThrow(/源项目/)
  })

  it('prunes only the oldest snapshot directories within an explicit retention budget', async () => {
    const first = await ProjectSnapshotService.create()
    const second = await ProjectSnapshotService.create()
    const result = await ProjectSnapshotService.prune(root, { maxSnapshots: 1 })

    expect(result.removed).toContain(first.snapshotId)
    expect(result.removed).not.toContain(second.snapshotId)
    expect(result.remaining).toEqual([second.snapshotId])
    await expect(ProjectSnapshotService.verify(second.snapshotId)).resolves.toMatchObject({ valid: true })
    await expect(ProjectSnapshotService.verify(first.snapshotId)).rejects.toThrow()
  })
})
