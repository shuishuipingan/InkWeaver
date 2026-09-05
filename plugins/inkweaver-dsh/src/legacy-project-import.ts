/**
 * Explicit, restart-safe conversion from the V1 file assets to the V2 SQLite store.
 */

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { NovelProjectId } from './types.ts'
import { INKWEAVER_IMPORT_MARKER, INKWEAVER_PROJECT_DIRECTORY } from './identity.ts'
import { InkWeaverOperationGateError, withInkWeaverOperationGate } from './operation-gate.ts'
import {
  createMigratedNovelStoreFile,
  ensureProjectDirectory,
  NovelStoreError,
  openNovelStore,
} from './novel-store.ts'
import type {
  NovelArchitectureNextValue,
  NovelArtifactSeed,
  NovelChapterNextValue,
  NovelCharactersNextValue,
  NovelMigrationReceipt,
  NovelMigrationSeed,
  NovelProjectNextValue,
} from './novel-store.ts'

export type { NovelMigrationReceipt }

/** One read-only source file represented in a migration preview. */
export interface LegacyImportSourcePreview {
  readonly source: string
  readonly revision: string
  readonly bytes: number
}

/** Read-only migration preview shown before an explicit import is allowed. */
export interface LegacyImportPreview {
  readonly projectId: NovelProjectId
  readonly fingerprint: string
  readonly archivePath: string
  readonly sourceCount: number
  readonly characterCount: number
  readonly relationshipCount: number
  readonly chapterCount: number
  readonly draftCount: number
  readonly sources: readonly LegacyImportSourcePreview[]
}

/** Receipt persisted in the imported InkWeaver database. */
export interface LegacyImportReceipt extends NovelMigrationReceipt {
  readonly importedWorkspaceId: string
  readonly requiresWorkspaceReattach: true
}

interface SourceRecord {
  readonly source: string
  readonly bytes: Buffer
}

interface V1Project {
  readonly projectId: NovelProjectId
  readonly project: NovelProjectNextValue
}

interface V1Story {
  readonly premise: string
  readonly world: string
  readonly mainPlot: string
}

interface V1Character {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly summary: string
  readonly goal: string
  readonly relationships: readonly {
    readonly characterId: string
    readonly type: string
    readonly summary: string
  }[]
  readonly notes: string
}

interface V1Chapter {
  readonly chapter: number
  readonly title: string
  readonly purpose: string
  readonly beats: readonly string[]
  readonly characterIds: readonly string[]
  readonly status: 'planned' | 'drafting' | 'drafted' | 'revised' | 'final'
}

interface PreparedMigration {
  readonly root: string
  readonly fingerprint: string
  readonly records: readonly SourceRecord[]
  readonly project: V1Project
  readonly architecture: NovelArchitectureNextValue
  readonly characters: NovelCharactersNextValue
  readonly chapters: readonly NovelChapterNextValue[]
  readonly artifacts: readonly NovelArtifactSeed[]
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function exactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NovelStoreError('INVALID_CONTENT', `${label} must be an object`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join('\0') !== [...keys].sort().join('\0')) {
    throw new NovelStoreError('INVALID_CONTENT', `${label} contains missing or unknown fields`)
  }
  return record
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new NovelStoreError('INVALID_CONTENT', `${field} must be a non-empty string`)
  }
  return value
}

function anyString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new NovelStoreError('INVALID_CONTENT', `${field} must be a string`)
  return value
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new NovelStoreError('INVALID_CONTENT', `${field} must be an array of strings`)
  }
  return value as readonly string[]
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new NovelStoreError('INVALID_CONTENT', `${field} must be a positive integer`)
  }
  return value
}

function isoTimestamp(value: unknown, field: string): string {
  const text = nonEmptyString(value, field)
  const time = Date.parse(text)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    throw new NovelStoreError('INVALID_CONTENT', `${field} must be a canonical UTC timestamp`)
  }
  return text
}

function jsonRecord(bytes: Buffer, source: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch (cause) {
    throw new NovelStoreError('INVALID_CONTENT', `${source} is not valid JSON`, { cause })
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NovelStoreError('INVALID_CONTENT', `${source} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function parseProject(record: Record<string, unknown>): V1Project {
  const value = exactKeys(record, [
    'formatVersion', 'kind', 'projectId', 'title', 'language', 'genre', 'plannedChapters',
    'targetWordsPerChapter', 'creativeStrategy', 'createdAt', 'updatedAt',
  ], 'project.json')
  if (value.formatVersion !== 1 || value.kind !== 'harness-novel-project') {
    throw new NovelStoreError('UNSUPPORTED_FORMAT', 'project.json is not a Harness V1 project')
  }
  const projectId = nonEmptyString(value.projectId, 'project.json.projectId')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new NovelStoreError('INVALID_CONTENT', 'project.json.projectId must be a UUID')
  }
  const creativeStrategy = nonEmptyString(value.creativeStrategy, 'project.json.creativeStrategy')
  if (!['auto', 'fluent-drafting', 'consistency-first', 'deep-planning'].includes(creativeStrategy)) {
    throw new NovelStoreError('INVALID_CONTENT', 'project.json.creativeStrategy is not supported')
  }
  return {
    projectId: projectId as NovelProjectId,
    project: {
      title: nonEmptyString(value.title, 'project.json.title'),
      language: nonEmptyString(value.language, 'project.json.language'),
      genre: nonEmptyString(value.genre, 'project.json.genre'),
      plannedChapters: positiveInteger(value.plannedChapters, 'project.json.plannedChapters'),
      targetWordsPerChapter: positiveInteger(value.targetWordsPerChapter, 'project.json.targetWordsPerChapter'),
      creativeStrategy: creativeStrategy as NovelProjectNextValue['creativeStrategy'],
      structureMode: 'three-act',
      narrativePov: 'third-limited',
      globalGuidance: '',
      createdAt: isoTimestamp(value.createdAt, 'project.json.createdAt'),
      updatedAt: isoTimestamp(value.updatedAt, 'project.json.updatedAt'),
    },
  }
}

function parseCharacters(record: Record<string, unknown> | undefined): NovelCharactersNextValue {
  if (record === undefined) return { items: [], relationships: [] }
  const value = exactKeys(record, ['characters'], 'characters.json')
  if (!Array.isArray(value.characters)) throw new NovelStoreError('INVALID_CONTENT', 'characters must be an array')
  const characters = value.characters.map(item => {
    const character = exactKeys(item, [
      'id', 'name', 'role', 'summary', 'goal', 'relationships', 'notes',
    ], 'character')
    return {
      id: nonEmptyString(character.id, 'character.id'),
      name: nonEmptyString(character.name, 'character.name'),
      role: nonEmptyString(character.role, 'character.role'),
      summary: nonEmptyString(character.summary, 'character.summary'),
      goal: nonEmptyString(character.goal, 'character.goal'),
      relationships: Array.isArray(character.relationships) ? character.relationships.map(relation => {
        const fields = exactKeys(relation, ['characterId', 'type', 'summary'], 'relationship')
        return {
          characterId: nonEmptyString(fields.characterId, 'relationship.characterId'),
          type: nonEmptyString(fields.type, 'relationship.type'),
          summary: nonEmptyString(fields.summary, 'relationship.summary'),
        }
      }) : (() => {
        throw new NovelStoreError('INVALID_CONTENT', 'character.relationships must be an array')
      })(),
      notes: anyString(character.notes, 'character.notes'),
    } satisfies V1Character
  })
  const ids = new Set(characters.map(character => character.id))
  if (ids.size !== characters.length) throw new NovelStoreError('INVALID_CONTENT', 'character.id must be unique')
  const relationships = characters.flatMap(character => character.relationships.map(relationship => {
    if (!ids.has(relationship.characterId)) {
      throw new NovelStoreError('INVALID_CONTENT', 'relationship references an unknown character')
    }
    return {
      fromCharacterId: character.id,
      toCharacterId: relationship.characterId,
      relation: relationship.type,
      notes: relationship.summary,
    }
  }))
  const relationshipKeys = new Set(relationships.map(item => `${item.fromCharacterId}\0${item.toCharacterId}\0${item.relation}`))
  if (relationshipKeys.size !== relationships.length) {
    throw new NovelStoreError('INVALID_CONTENT', 'relationship must be unique after V1 conversion')
  }
  return {
    items: characters.map(character => ({
      characterId: character.id,
      name: character.name,
      role: character.role,
      summary: character.summary,
      goal: character.goal,
      currentState: '',
      notes: character.notes,
    })),
    relationships,
  }
}

function parseStory(record: Record<string, unknown> | undefined): NovelArchitectureNextValue {
  if (record === undefined) {
    return {
      premise: '', characterGraph: '', world: '', plotOutline: '', styleConstraints: '', referenceWorks: [],
    }
  }
  const value = exactKeys(record, ['premise', 'themes', 'world', 'mainPlot', 'endingGoal'], 'story.json')
  const story: V1Story = {
    premise: nonEmptyString(value.premise, 'story.premise'),
    world: nonEmptyString(value.world, 'story.world'),
    mainPlot: nonEmptyString(value.mainPlot, 'story.mainPlot'),
  }
  stringArray(value.themes, 'story.themes')
  nonEmptyString(value.endingGoal, 'story.endingGoal')
  return {
    premise: story.premise,
    characterGraph: '',
    world: story.world,
    plotOutline: story.mainPlot,
    styleConstraints: '',
    referenceWorks: [],
  }
}

function parseChapter(record: Record<string, unknown>, characters: ReadonlySet<string>): V1Chapter {
  const value = exactKeys(record, [
    'chapter', 'title', 'purpose', 'beats', 'characterIds', 'continuityNotes', 'status',
  ], 'chapter blueprint')
  const chapter = positiveInteger(value.chapter, 'chapter.chapter')
  if (chapter > 9_999) throw new NovelStoreError('INVALID_CONTENT', 'chapter must be between 1 and 9999')
  const characterIds = stringArray(value.characterIds, 'chapter.characterIds')
  if (new Set(characterIds).size !== characterIds.length) {
    throw new NovelStoreError('INVALID_CONTENT', 'chapter.characterIds must be unique')
  }
  if (characterIds.some(id => !characters.has(id))) {
    throw new NovelStoreError('INVALID_CONTENT', 'chapter references an unknown character')
  }
  const rawStatus = anyString(value.status, 'chapter.status')
  if (!['planned', 'drafting', 'drafted', 'revised', 'final'].includes(rawStatus)) {
    throw new NovelStoreError('INVALID_CONTENT', 'chapter.status is not supported')
  }
  stringArray(value.continuityNotes, 'chapter.continuityNotes')
  return {
    chapter,
    title: nonEmptyString(value.title, 'chapter.title'),
    purpose: nonEmptyString(value.purpose, 'chapter.purpose'),
    beats: stringArray(value.beats, 'chapter.beats'),
    characterIds,
    status: rawStatus as V1Chapter['status'],
  }
}

function statusMapping(status: V1Chapter['status']): NovelChapterNextValue['status'] {
  if (status === 'drafted') return 'reviewing'
  if (status === 'final') return 'finalized'
  return status === 'revised' ? 'revising' : status
}

async function canonicalRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new NovelStoreError('PATH_REJECTED', 'workspace root must be absolute')
  try {
    const configured = await lstat(root)
    if (!configured.isDirectory() || configured.isSymbolicLink()) {
      throw new NovelStoreError('PATH_REJECTED', 'workspace root must be a real directory')
    }
  } catch (cause) {
    if (cause instanceof NovelStoreError) throw cause
    throw new NovelStoreError('PATH_REJECTED', 'workspace root does not exist', { cause })
  }
  let canonical: string
  try {
    canonical = await realpath(root)
  } catch (cause) {
    throw new NovelStoreError('PATH_REJECTED', 'workspace root does not exist', { cause })
  }
  const rel = relative(root, canonical)
  if (rel !== '' && (rel === '..' || rel.startsWith(`..${sep}`))) {
    throw new NovelStoreError('PATH_REJECTED', 'workspace root resolves outside its configured path')
  }
  return canonical
}

async function realDirectory(path: string, label: string, missing: 'reject' | 'empty'): Promise<boolean> {
  try {
    const value = await lstat(path)
    if (!value.isDirectory() || value.isSymbolicLink()) {
      throw new NovelStoreError('PATH_REJECTED', `${label} must be a real directory`)
    }
    return true
  } catch (cause) {
    if (cause instanceof NovelStoreError) throw cause
    if (missing === 'empty' && isMissing(cause)) return false
    throw cause
  }
}

interface PathIdentity {
  readonly path: string
  readonly device: bigint
  readonly inode: bigint
}

async function captureAncestorIdentities(path: string, label: string): Promise<readonly PathIdentity[]> {
  const identities: PathIdentity[] = []
  let current = dirname(path)
  for (;;) {
    const identity = await lstat(current, { bigint: true })
    if (!identity.isDirectory() || identity.isSymbolicLink()) {
      throw new NovelStoreError('PATH_REJECTED', `${label} has a non-directory or linked ancestor`)
    }
    identities.push({ path: current, device: identity.dev, inode: identity.ino })
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return identities
}

async function requireAncestorIdentities(identities: readonly PathIdentity[], label: string): Promise<void> {
  for (const expected of identities) {
    const current = await lstat(expected.path, { bigint: true })
    if (!current.isDirectory() || current.isSymbolicLink()
      || current.dev !== expected.device || current.ino !== expected.inode) {
      throw new NovelStoreError('PATH_REJECTED', `${label} ancestor changed identity while being accessed`)
    }
  }
}

async function optionalRealFile(path: string, source: string): Promise<Buffer | undefined> {
  try {
    const ancestors = await captureAncestorIdentities(path, source)
    const before = await lstat(path, { bigint: true })
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new NovelStoreError('PATH_REJECTED', `${source} must be a real file`)
    }
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const opened = await handle.stat({ bigint: true })
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
        throw new NovelStoreError('PATH_REJECTED', `${source} changed identity while being opened`)
      }
      const bytes = await handle.readFile()
      const after = await handle.stat({ bigint: true })
      if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) {
        throw new NovelStoreError('STALE_REVISION', `${source} changed while being read`)
      }
      await requireAncestorIdentities(ancestors, source)
      return bytes
    } finally {
      await handle.close()
    }
  } catch (cause) {
    if (cause instanceof NovelStoreError) throw cause
    if (isMissing(cause)) return undefined
    throw cause
  }
}

function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT'
}

async function numberedFiles(
  directory: string,
  extension: '.json' | '.md',
  sourcePrefix: string,
): Promise<Map<number, SourceRecord>> {
  if (!await realDirectory(directory, sourcePrefix, 'empty')) return new Map()
  const ancestors = await captureAncestorIdentities(join(directory, '.enumeration'), sourcePrefix)
  const before = await lstat(directory, { bigint: true })
  const entries = await readdir(directory, { withFileTypes: true })
  const initialMembership = directoryMembership(entries)
  const after = await lstat(directory, { bigint: true })
  if (before.dev !== after.dev || before.ino !== after.ino || after.isSymbolicLink()) {
    throw new NovelStoreError('PATH_REJECTED', `${sourcePrefix} changed identity while being enumerated`)
  }
  await requireAncestorIdentities(ancestors, sourcePrefix)
  const result = new Map<number, SourceRecord>()
  for (const entry of entries) {
    const match = /^([0-9]{4})\.json$|^([0-9]{4})\.md$/.exec(entry.name)
    const matchedExtension = entry.name.endsWith(extension)
    if (!matchedExtension || match === null) continue
    const chapter = Number.parseInt(match[1] ?? match[2] ?? '', 10)
    const path = join(directory, entry.name)
    const bytes = await optionalRealFile(path, `${sourcePrefix}/${entry.name}`)
    if (bytes === undefined) continue
    if (result.has(chapter)) throw new NovelStoreError('INVALID_CONTENT', `duplicate numbered V1 asset: chapter ${chapter}`)
    result.set(chapter, { source: `${sourcePrefix}/${entry.name}`, bytes })
  }
  const finalIdentity = await lstat(directory, { bigint: true })
  const finalEntries = await readdir(directory, { withFileTypes: true })
  const afterFinalEntries = await lstat(directory, { bigint: true })
  if (!finalIdentity.isDirectory() || finalIdentity.isSymbolicLink()
    || finalIdentity.dev !== before.dev || finalIdentity.ino !== before.ino
    || !afterFinalEntries.isDirectory() || afterFinalEntries.isSymbolicLink()
    || afterFinalEntries.dev !== before.dev || afterFinalEntries.ino !== before.ino
    || directoryMembership(finalEntries) !== initialMembership) {
    throw new NovelStoreError('PATH_REJECTED', `${sourcePrefix} changed while its entries were being read`)
  }
  await requireAncestorIdentities(ancestors, sourcePrefix)
  return result
}

function fingerprintOf(records: readonly SourceRecord[]): string {
  const hash = createHash('sha256')
  for (const record of [...records].sort((left, right) => left.source.localeCompare(right.source))) {
    hash.update(Buffer.from(record.source, 'utf8'))
    hash.update('\0')
    hash.update(record.bytes)
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function prepare(root: string): Promise<PreparedMigration> {
  const canonical = await canonicalRoot(root)
  const projectDirectory = join(canonical, '.ai-novel')
  if (!await realDirectory(projectDirectory, '.ai-novel', 'empty')) {
    throw new NovelStoreError('NOT_INITIALIZED', 'Harness V1 project was not found')
  }
  const projectBytes = await optionalRealFile(join(projectDirectory, 'project.json'), '.ai-novel/project.json')
  if (projectBytes === undefined) throw new NovelStoreError('NOT_INITIALIZED', 'Harness V1 project was not found')
  const characterBytes = await optionalRealFile(join(projectDirectory, 'characters.json'), '.ai-novel/characters.json')
  await realDirectory(join(projectDirectory, 'blueprints'), '.ai-novel/blueprints', 'empty')
  const storyBytes = await optionalRealFile(
    join(projectDirectory, 'blueprints', 'story.json'),
    '.ai-novel/blueprints/story.json',
  )
  const chapterRecords = await numberedFiles(
    join(projectDirectory, 'blueprints', 'chapters'),
    '.json',
    '.ai-novel/blueprints/chapters',
  )
  const draftRecords = await numberedFiles(join(canonical, 'chapters'), '.md', 'chapters')

  const records: SourceRecord[] = [
    { source: '.ai-novel/project.json', bytes: projectBytes },
    ...characterBytes === undefined ? [] : [{ source: '.ai-novel/characters.json', bytes: characterBytes }],
    ...storyBytes === undefined ? [] : [{ source: '.ai-novel/blueprints/story.json', bytes: storyBytes }],
    ...[...chapterRecords.values()],
    ...[...draftRecords.values()],
  ].sort((left, right) => left.source.localeCompare(right.source))
  const fingerprint = fingerprintOf(records)

  const project = parseProject(jsonRecord(projectBytes, '.ai-novel/project.json'))
  const characters = parseCharacters(characterBytes === undefined ? undefined : jsonRecord(characterBytes, '.ai-novel/characters.json'))
  const architecture = parseStory(storyBytes === undefined ? undefined : jsonRecord(storyBytes, '.ai-novel/blueprints/story.json'))
  const characterIds = new Set(characters.items.map(item => item.characterId))
  const parsedChapters = [...chapterRecords.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, record]) => parseChapter(jsonRecord(record.bytes, record.source), characterIds))
  const chapterNumbers = new Set(parsedChapters.map(chapter => chapter.chapter))
  const chapters: NovelChapterNextValue[] = parsedChapters.map(chapter => ({
    chapter: chapter.chapter,
    title: chapter.title,
    purpose: chapter.purpose,
    plotBeats: chapter.beats,
    characters: chapter.characterIds,
    keyEvents: [],
    suspense: '',
    status: statusMapping(chapter.status),
  }))
  for (const chapter of draftRecords.keys()) {
    if (chapterNumbers.has(chapter)) continue
    chapters.push({
      chapter,
      title: `第 ${chapter} 章`,
      purpose: `保留 V1 第 ${chapter} 章正文。`,
      plotBeats: [],
      characters: [],
      keyEvents: [],
      suspense: '',
      status: 'drafting',
    })
  }
  chapters.sort((left, right) => left.chapter - right.chapter)
  const artifacts = [...draftRecords.entries()]
    .sort(([left], [right]) => left - right)
    .map(([chapter, record]) => ({
      artifactId: `v1-draft-${fingerprint}-chapter-${chapter}`,
      chapter,
      kind: 'draft' as const,
      content: record.bytes.toString('utf8').replace(/\r\n?/g, '\n'),
      createdAt: project.project.updatedAt,
    }))
  return {
    root: canonical,
    fingerprint,
    records,
    project,
    architecture,
    characters,
    chapters,
    artifacts,
  }
}

function previewOf(prepared: PreparedMigration): LegacyImportPreview {
  return {
    projectId: prepared.project.projectId,
    fingerprint: prepared.fingerprint,
    archivePath: `${INKWEAVER_PROJECT_DIRECTORY}/imports/${prepared.fingerprint}`,
    sourceCount: prepared.records.length,
    characterCount: prepared.characters.items.length,
    relationshipCount: prepared.characters.relationships.length,
    chapterCount: prepared.chapters.length,
    draftCount: prepared.artifacts.length,
    sources: prepared.records.map(record => ({
      source: record.source,
      revision: sha256(record.bytes),
      bytes: record.bytes.length,
    })),
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (cause) {
    if (isMissing(cause)) return false
    throw cause
  }
}

async function ensureInsideArchive(root: string, path: string): Promise<void> {
  const real = await realpath(path)
  const rel = relative(root, real)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new NovelStoreError('PATH_REJECTED', 'archive destination escapes the fingerprinted archive')
  }
}

interface StagedImport {
  readonly workspace: string
  readonly projectDirectory: string
  readonly ownerToken: string
}

const STAGING_RECOVERY_NOTICE = '.import-recovery.json'

async function archiveSources(prepared: PreparedMigration): Promise<StagedImport> {
  const ownerToken = randomUUID()
  const workspace = await mkdtemp(join(prepared.root, `${INKWEAVER_PROJECT_DIRECTORY}.import-${ownerToken}-`))
  try {
    await writeFile(join(workspace, STAGING_RECOVERY_NOTICE), `${JSON.stringify({
      state: 'fail-closed-staging',
      fingerprint: prepared.fingerprint,
      action: 'Inspect this high-entropy staging directory and remove it manually only after confirming it is not an active import.',
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await writeFile(join(workspace, '.owner'), ownerToken, { flag: 'wx', mode: 0o600 })
    const projectDirectory = await ensureProjectDirectory(workspace, true)
    const archivePath = join(projectDirectory, 'imports', prepared.fingerprint)
    await mkdir(archivePath, { recursive: true, mode: 0o700 })
    for (const record of prepared.records) {
      const destination = join(archivePath, record.source)
      await mkdir(join(destination, '..'), { recursive: true, mode: 0o700 })
      await ensureInsideArchive(archivePath, join(destination, '..'))
      try {
        await writeFile(destination, record.bytes, { flag: 'wx', mode: 0o600 })
        const handle = await open(destination, 'r+')
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
        const archived = await optionalRealFile(destination, `archived ${record.source}`)
        if (archived === undefined || !archived.equals(record.bytes)) {
          throw new NovelStoreError('WRITE_FAILED', `archived legacy source failed readback: ${record.source}`)
        }
      } catch (cause) {
        throw new NovelStoreError('WRITE_FAILED', `failed to stage legacy source: ${record.source}`, { cause })
      }
    }
    return {
      workspace,
      projectDirectory,
      ownerToken,
    }
  } catch (cause) {
    // Never recursively clean a pathname after a separable ownership check. The high-entropy
    // workspace and recovery notice deliberately remain fail-closed for manual inspection.
    throw cause
  }
}

async function cleanupPublishedStaging(staging: StagedImport): Promise<void> {
  try {
    await rmdir(staging.projectDirectory)
    await rm(join(staging.workspace, '.owner'))
    await rm(join(staging.workspace, STAGING_RECOVERY_NOTICE))
    await rmdir(staging.workspace)
  } catch {
    // Non-empty, replaced, or otherwise unexpected paths remain for manual inspection.
  }
}

async function requireNoSidecars(path: string): Promise<void> {
  for (const suffix of ['-journal', '-wal', '-shm']) {
    try {
      await access(`${path}${suffix}`)
    } catch (cause) {
      if (isMissing(cause)) continue
      throw cause
    }
    throw new NovelStoreError('WRITE_FAILED', `migration staging database still has a ${suffix} sidecar`)
  }
}

async function exactDirectoryEntries(path: string, expected: readonly string[], label: string): Promise<void> {
  const before = await lstat(path, { bigint: true })
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new NovelStoreError('PATH_REJECTED', `${label} must be a real directory`)
  }
  const entries = (await readdir(path)).sort()
  const after = await lstat(path, { bigint: true })
  if (!after.isDirectory() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino) {
    throw new NovelStoreError('PATH_REJECTED', `${label} changed identity while being enumerated`)
  }
  if (entries.join('\0') !== [...expected].sort().join('\0')) {
    throw new NovelStoreError('WRITE_FAILED', `${label} contains missing or unexpected members`)
  }
}

interface ArchiveTree {
  readonly files: Map<string, Buffer>
  readonly directories: Set<string>
}

function directoryMembership(entries: readonly { readonly name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }[]): string {
  return entries
    .map(entry => `${entry.name}\0${entry.isDirectory() ? 'd' : entry.isFile() ? 'f' : entry.isSymbolicLink() ? 'l' : 'o'}`)
    .sort()
    .join('\0')
}

async function collectArchiveTree(root: string, current = root, prefix = ''): Promise<ArchiveTree> {
  const before = await lstat(current, { bigint: true })
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new NovelStoreError('PATH_REJECTED', 'published migration archive contains a linked or non-directory member')
  }
  const entries = await readdir(current, { withFileTypes: true })
  const initialMembership = directoryMembership(entries)
  const after = await lstat(current, { bigint: true })
  if (before.dev !== after.dev || before.ino !== after.ino || after.isSymbolicLink()) {
    throw new NovelStoreError('PATH_REJECTED', 'published migration archive changed while being enumerated')
  }
  const files = new Map<string, Buffer>()
  const directories = new Set<string>()
  for (const entry of entries) {
    const relativeName = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      directories.add(relativeName)
      const nested = await collectArchiveTree(root, path, relativeName)
      for (const [name, bytes] of nested.files) files.set(name, bytes)
      for (const name of nested.directories) directories.add(name)
      continue
    }
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new NovelStoreError('PATH_REJECTED', 'published migration archive contains an unsupported member')
    }
    const bytes = await optionalRealFile(path, `archived ${relativeName}`)
    if (bytes === undefined) throw new NovelStoreError('WRITE_FAILED', `published archive member disappeared: ${relativeName}`)
    files.set(relativeName.replaceAll('\\', '/'), bytes)
  }
  const finalIdentity = await lstat(current, { bigint: true })
  const finalEntries = await readdir(current, { withFileTypes: true })
  const afterFinalEntries = await lstat(current, { bigint: true })
  if (!finalIdentity.isDirectory() || finalIdentity.isSymbolicLink()
    || finalIdentity.dev !== before.dev || finalIdentity.ino !== before.ino
    || !afterFinalEntries.isDirectory() || afterFinalEntries.isSymbolicLink()
    || afterFinalEntries.dev !== before.dev || afterFinalEntries.ino !== before.ino
    || directoryMembership(finalEntries) !== initialMembership) {
    throw new NovelStoreError('PATH_REJECTED', 'migration archive changed while descendant entries were being read')
  }
  return { files, directories }
}

function expectedArchiveDirectories(records: readonly SourceRecord[]): Set<string> {
  const directories = new Set<string>()
  for (const record of records) {
    const parts = record.source.split('/')
    for (let depth = 1; depth < parts.length; depth += 1) {
      directories.add(parts.slice(0, depth).join('/'))
    }
  }
  return directories
}

async function requireExactArchiveTree(importsRoot: string, prepared: PreparedMigration): Promise<void> {
  await exactDirectoryEntries(importsRoot, [prepared.fingerprint], 'migration imports directory')
  const archive = await collectArchiveTree(join(importsRoot, prepared.fingerprint))
  // Repeat the parent enumeration because an unexpected sibling may appear during recursion.
  await exactDirectoryEntries(importsRoot, [prepared.fingerprint], 'migration imports directory')
  const expectedDirectories = [...expectedArchiveDirectories(prepared.records)].sort()
  if ([...archive.directories].sort().join('\0') !== expectedDirectories.join('\0')) {
    throw new NovelStoreError('WRITE_FAILED', 'migration archive contains missing or unexpected directories')
  }
  if (archive.files.size !== prepared.records.length) {
    throw new NovelStoreError('WRITE_FAILED', 'migration archive contains missing or unexpected files')
  }
  for (const record of prepared.records) {
    if (!archive.files.get(record.source)?.equals(record.bytes)) {
      throw new NovelStoreError('WRITE_FAILED', `migration archive is incomplete: ${record.source}`)
    }
  }
}

async function requirePublishedTree(
  target: string,
  prepared: PreparedMigration,
  validatedDatabase: Buffer,
  validatedGitignore: Buffer,
  importing: boolean,
): Promise<void> {
  await exactDirectoryEntries(
    target,
    importing ? ['.gitignore', INKWEAVER_IMPORT_MARKER, 'imports', 'novel.db'] : ['.gitignore', 'imports', 'novel.db'],
    'published InkWeaver project',
  )
  const publishedDatabase = await optionalRealFile(join(target, 'novel.db'), 'published novel.db')
  if (publishedDatabase === undefined || !publishedDatabase.equals(validatedDatabase)) {
    throw new NovelStoreError('WRITE_FAILED', 'published migration database differs from the validated staging database')
  }
  const publishedGitignore = await optionalRealFile(join(target, '.gitignore'), 'published .gitignore')
  if (publishedGitignore === undefined || !publishedGitignore.equals(validatedGitignore)) {
    throw new NovelStoreError('WRITE_FAILED', 'published .gitignore differs from the validated staging file')
  }
  await requireExactArchiveTree(join(target, 'imports'), prepared)
}

async function requireSourceSnapshotUnchanged(prepared: PreparedMigration): Promise<void> {
  let current: PreparedMigration
  try {
    current = await prepare(prepared.root)
  } catch (cause) {
    if (cause instanceof NovelStoreError && (
      cause.code === 'NOT_INITIALIZED' || cause.code === 'INVALID_CONTENT' || cause.code === 'UNSUPPORTED_FORMAT'
    )) {
      throw new NovelStoreError('STALE_REVISION', 'V1 sources changed during explicit migration', { cause })
    }
    throw cause
  }
  if (current.fingerprint !== prepared.fingerprint) {
    throw new NovelStoreError('STALE_REVISION', 'V1 sources changed during explicit migration')
  }
}

async function publishStaging(staging: StagedImport, target: string, prepared: PreparedMigration): Promise<void> {
  const databasePath = join(staging.projectDirectory, 'novel.db')
  await requireNoSidecars(databasePath)
  const validatedDatabase = await optionalRealFile(databasePath, 'validated staging novel.db')
  if (validatedDatabase === undefined) throw new NovelStoreError('WRITE_FAILED', 'validated staging novel.db disappeared')
  const validatedGitignore = await optionalRealFile(join(staging.projectDirectory, '.gitignore'), 'validated staging .gitignore')
  if (validatedGitignore === undefined) throw new NovelStoreError('WRITE_FAILED', 'validated staging .gitignore disappeared')
  await exactDirectoryEntries(staging.projectDirectory, ['.gitignore', 'imports', 'novel.db'], 'migration staging project')
  await requireExactArchiveTree(join(staging.projectDirectory, 'imports'), prepared)
  try {
    await mkdir(target, { mode: 0o700 })
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'EEXIST') {
      throw new NovelStoreError('ALREADY_INITIALIZED', 'InkWeaver project appeared before legacy import publication')
    }
    throw new NovelStoreError('WRITE_FAILED', 'failed to reserve the InkWeaver project directory', { cause })
  }
  const marker = join(target, INKWEAVER_IMPORT_MARKER)
  await writeFile(marker, staging.ownerToken, { flag: 'wx', mode: 0o600 })
  try {
    for (const name of await readdir(staging.projectDirectory)) {
      await rename(join(staging.projectDirectory, name), join(target, name))
    }
    await requireSourceSnapshotUnchanged(prepared)
    await requirePublishedTree(target, prepared, validatedDatabase, validatedGitignore, true)
    await rm(marker)
    try {
      await requireSourceSnapshotUnchanged(prepared)
      await requirePublishedTree(target, prepared, validatedDatabase, validatedGitignore, false)
    } catch (cause) {
      await writeFile(marker, staging.ownerToken, { flag: 'wx', mode: 0o600 })
      throw cause
    }
  } catch (cause) {
    if (cause instanceof NovelStoreError) throw cause
    throw new NovelStoreError('WRITE_FAILED', 'failed to publish the staged InkWeaver project', { cause })
  }
  await cleanupPublishedStaging(staging)
}

/**
 * Read and validate one V1 project without changing its source files.
 *
 * @param root Absolute workspace root that may contain `.ai-novel/project.json`.
 * @returns Fingerprint, source revisions, and converted source counts for explicit user review.
 * @throws {@link NovelStoreError} when no V1 project exists, content is invalid, or published sources drifted.
 */
export async function previewLegacyProjectImport(root: string): Promise<LegacyImportPreview> {
  const canonical = await canonicalRoot(root)
  const target = join(canonical, INKWEAVER_PROJECT_DIRECTORY)
  if (await pathExists(target)) {
    throw new NovelStoreError('ALREADY_INITIALIZED', 'InkWeaver project already exists')
  }
  const prepared = await prepare(canonical)
  return previewOf(prepared)
}

/**
 * Explicitly import a previewed V1 project through an archived staging database.
 *
 * @param root Absolute workspace root containing the V1 project.
 * @param previewFingerprint SHA-256 fingerprint returned by the preview shown to the user.
 * @returns Receipt persisted in the published V2 database.
 * @throws {@link NovelStoreError} for invalid content, preview mismatch, archive drift, or publication failure.
 */
export async function importLegacyProject(
  root: string,
  previewFingerprint: string,
): Promise<LegacyImportReceipt> {
  if (!/^[a-f0-9]{64}$/.test(previewFingerprint)) {
    throw new NovelStoreError('INVALID_CONTENT', 'preview fingerprint must be a SHA-256 digest')
  }
  const preview = await previewLegacyProjectImport(root)
  if (preview.fingerprint !== previewFingerprint) {
    throw new NovelStoreError('STALE_REVISION', 'legacy sources changed since the preview shown to the user')
  }

  const prepared = await prepare(await canonicalRoot(root))
  if (prepared.fingerprint !== previewFingerprint) {
    throw new NovelStoreError('STALE_REVISION', 'legacy sources changed since the preview shown to the user')
  }
  const staged = await archiveSources(prepared)
  let published = false
  const target = join(prepared.root, INKWEAVER_PROJECT_DIRECTORY)
  const workspaceId = WorkspaceId(prepared.project.projectId)
  try {
    const receipt = await createMigratedNovelStoreFile(join(staged.projectDirectory, 'novel.db'), prepared.root, {
      projectId: prepared.project.projectId,
      workspaceId,
      project: prepared.project.project,
      architecture: prepared.architecture,
      characters: prepared.characters,
      chapters: prepared.chapters,
      artifacts: prepared.artifacts,
      fingerprint: prepared.fingerprint,
      archivePath: `${INKWEAVER_PROJECT_DIRECTORY}/imports/${prepared.fingerprint}`,
      sourceCount: prepared.records.length,
      migratedAt: new Date().toISOString(),
    } satisfies NovelMigrationSeed)
    await requireSourceSnapshotUnchanged(prepared)
    let stagedStore: Awaited<ReturnType<typeof openNovelStore>> | undefined
    try {
      stagedStore = await openNovelStore(staged.workspace, workspaceId)
      const stagedState = await stagedStore.read(new AbortController().signal)
      if (stagedState.migration?.fingerprint !== receipt.fingerprint) {
        throw new NovelStoreError('WRITE_FAILED', 'staged migration database failed validation')
      }
    } finally {
      await stagedStore?.dispose()
    }
    await requireSourceSnapshotUnchanged(prepared)
    try {
      await withInkWeaverOperationGate(prepared.root, () => publishStaging(staged, target, prepared))
      published = true
      return {
        ...receipt,
        importedWorkspaceId: workspaceId,
        requiresWorkspaceReattach: true,
      }
    } catch (cause) {
      if (cause instanceof InkWeaverOperationGateError) {
        throw new NovelStoreError('WRITE_LOCKED', cause.message, { cause })
      }
      throw cause
    }
  } catch (cause) {
    if (published) {
      if (cause instanceof NovelStoreError) throw cause
      throw new NovelStoreError('WRITE_FAILED', 'published migration database failed verification and remains published', {
        cause,
      })
    }
    if (cause instanceof NovelStoreError) throw cause
    throw new NovelStoreError('WRITE_FAILED', 'explicit V1 migration failed', { cause })
  }
}
