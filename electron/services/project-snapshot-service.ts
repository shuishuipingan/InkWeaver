import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, stat, writeFile, cp } from 'node:fs/promises'
import path from 'node:path'
import { getCurrentProjectPath, getProjectDb } from '../database'
import type {
  ProjectSnapshotFile,
  ProjectSnapshotManifest,
  ProjectSnapshotRestorePreview,
  ProjectSnapshotRestoreResult,
  ProjectSnapshotVerification,
} from '../../src/shared/project-snapshot'

const SNAPSHOT_DIR = path.join('.vela', 'snapshots')
const DATABASE_FILE = 'database.sqlite'

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertSnapshotId(snapshotId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(snapshotId)) throw new Error('快照 ID 无效')
}

function assertSafeRelativePath(relativePath: string): void {
  if (
    !relativePath
    || path.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || relativePath.split(/[\\/]+/u).some(segment => segment === '..')
  ) {
    throw new Error('快照 manifest 包含越界路径')
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const normalizedParent = path.resolve(parent)
  const normalizedCandidate = path.resolve(candidate)
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`)
}

function assertRestoreDestination(projectPath: string, destinationPath: string): string {
  if (!destinationPath || !path.isAbsolute(destinationPath)) throw new Error('恢复目录必须是绝对路径')
  const destination = path.resolve(destinationPath)
  // Restoring into the live project (including .vela/snapshots) could make a
  // valid backup overwrite its own source or the currently open database.
  if (isWithin(projectPath, destination)) throw new Error('恢复目录不能位于源项目内')
  return destination
}

async function destinationState(destinationPath: string): Promise<{
  exists: boolean
  empty: boolean
  entries: string[]
}> {
  try {
    const info = await lstat(destinationPath)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('恢复目录必须是普通目录')
    const entries = await readdir(destinationPath)
    return { exists: true, empty: entries.length === 0, entries }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, empty: true, entries: [] }
    throw error
  }
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

  static async verify(snapshotId: string, projectPath = getCurrentProjectPath()): Promise<ProjectSnapshotVerification> {
    if (!projectPath) throw new Error('项目数据库未打开')
    assertSnapshotId(snapshotId)
    const root = path.join(projectPath, SNAPSHOT_DIR, snapshotId)
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')) as ProjectSnapshotManifest
    const missing: string[] = []
    const mismatched: string[] = []
    for (const file of manifest.files) {
      assertSafeRelativePath(file.relativePath)
      const target = path.join(root, file.relativePath)
      try {
        const bytes = await readFile(target)
        if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) mismatched.push(file.relativePath)
      } catch { missing.push(file.relativePath) }
    }
    return { snapshotId, valid: missing.length === 0 && mismatched.length === 0, missing, mismatched }
  }

  static async previewRestore(
    snapshotId: string,
    destinationPath: string,
    projectPath = getCurrentProjectPath(),
  ): Promise<ProjectSnapshotRestorePreview> {
    if (!projectPath) throw new Error('项目数据库未打开')
    const destination = assertRestoreDestination(projectPath, destinationPath)
    const verification = await this.verify(snapshotId, projectPath)
    const manifest = JSON.parse(await readFile(
      path.join(projectPath, SNAPSHOT_DIR, snapshotId, 'manifest.json'),
      'utf8',
    )) as ProjectSnapshotManifest
    const state = await destinationState(destination)
    const conflicts = state.entries.length === 0
      ? []
      : state.entries.filter(entry => !manifest.files.some(file => file.relativePath === entry.replace(/\\/gu, '/')))
    return {
      snapshotId,
      destinationPath: destination,
      valid: verification.valid,
      destinationExists: state.exists,
      destinationEmpty: state.empty,
      canRestore: verification.valid && state.empty,
      fileCount: manifest.files.length,
      conflicts: conflicts.length > 0 ? conflicts : state.empty ? [] : state.entries,
      missing: verification.missing,
      mismatched: verification.mismatched,
    }
  }

  static async restore(
    snapshotId: string,
    destinationPath: string,
    projectPath = getCurrentProjectPath(),
  ): Promise<ProjectSnapshotRestoreResult> {
    if (!projectPath) throw new Error('项目数据库未打开')
    const destination = assertRestoreDestination(projectPath, destinationPath)
    const preview = await this.previewRestore(snapshotId, destination, projectPath)
    if (!preview.valid) throw new Error('快照校验失败，不能恢复')
    if (!preview.destinationEmpty) throw new Error('恢复只允许写入空目录')

    const snapshotRoot = path.join(projectPath, SNAPSHOT_DIR, snapshotId)
    const manifest = JSON.parse(await readFile(path.join(snapshotRoot, 'manifest.json'), 'utf8')) as ProjectSnapshotManifest
    await mkdir(destination, { recursive: true })
    for (const file of manifest.files) {
      assertSafeRelativePath(file.relativePath)
      const source = path.join(snapshotRoot, file.relativePath)
      const target = path.join(destination, file.relativePath)
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(source, target)
    }
    await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    return { snapshotId, destinationPath: destination, files: manifest.files.length, manifest }
  }
}
