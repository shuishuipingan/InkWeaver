import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile, cp } from 'node:fs/promises'
import path from 'node:path'
import { getCurrentProjectPath, getProjectDb } from '../database'
import type { ProjectSnapshotFile, ProjectSnapshotManifest } from '../../src/shared/project-snapshot'

const SNAPSHOT_DIR = path.join('.vela', 'snapshots')
const DATABASE_FILE = 'database.sqlite'

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function filesUnder(root: string, relative = ''): Promise<ProjectSnapshotFile[]> {
  const current = path.join(root, relative)
  const entries = await readdir(current, { withFileTypes: true })
  const result: ProjectSnapshotFile[] = []
  for (const entry of entries) {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(root, child))
    else if (entry.isFile()) {
      const bytes = await readFile(path.join(root, child))
      result.push({ relativePath: child.replace(/\\/gu, '/'), bytes: bytes.byteLength, sha256: sha256(bytes) })
    }
  }
  return result
}

export class ProjectSnapshotService {
  static async create(projectPath = getCurrentProjectPath()): Promise<ProjectSnapshotManifest> {
    if (!projectPath) throw new Error('项目数据库未打开')
    const database = getProjectDb()
    if (!database) throw new Error('项目数据库未打开')
    const snapshotId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`
    const root = path.join(projectPath, SNAPSHOT_DIR, snapshotId)
    await mkdir(root, { recursive: true })
    const databasePath = path.join(root, DATABASE_FILE)
    await database.backup(databasePath)

    // Prompt templates and published manuscript files are the project-owned
    // non-SQLite inputs. Copy them into the isolated snapshot; no live DB file
    // is copied while SQLite may still be writing its WAL.
    for (const relative of ['.vela/prompts', 'manuscript']) {
      const source = path.join(projectPath, relative)
      try {
        if ((await stat(source)).isDirectory()) await cp(source, path.join(root, relative), { recursive: true, force: true })
      } catch { /* optional project folders */ }
    }
    const files = await filesUnder(root)
    const databaseEntry = files.find(file => file.relativePath === DATABASE_FILE)
    if (!databaseEntry) throw new Error('快照数据库备份缺失')
    const manifest: ProjectSnapshotManifest = {
      schemaVersion: 1,
      snapshotId,
      createdAt: new Date().toISOString(),
      databaseFile: DATABASE_FILE,
      databaseSha256: databaseEntry.sha256,
      files,
    }
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    return manifest
  }

  static async list(projectPath = getCurrentProjectPath()): Promise<ProjectSnapshotManifest[]> {
    if (!projectPath) return []
    const root = path.join(projectPath, SNAPSHOT_DIR)
    let entries
    try { entries = await readdir(root, { withFileTypes: true }) } catch { return [] }
    const manifests: ProjectSnapshotManifest[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const parsed = JSON.parse(await readFile(path.join(root, entry.name, 'manifest.json'), 'utf8')) as ProjectSnapshotManifest
        if (parsed.schemaVersion === 1 && parsed.snapshotId === entry.name) manifests.push(parsed)
      } catch { /* ignore incomplete snapshots */ }
    }
    return manifests.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }
}
