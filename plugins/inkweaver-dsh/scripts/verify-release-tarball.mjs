#!/usr/bin/env node
/** Verify the exact release-built InkWeaver DSH package and write its receipt. */
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { access, lstat, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { TextDecoder } from 'node:util'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(packageRoot, '..', '..')
const manifestPath = join(packageRoot, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const expectedPackageName = '@shuishuipingan/inkweaver-dsh'
const expectedVersion = '1.0.0'
const expectedTarballName = 'shuishuipingan-inkweaver-dsh-1.0.0.tgz'
const expectedPresetIds = ['inkweaver', 'inkweaver-v2']
const expectedBundlePatch = 'cordis.patch.yml'
const expectedReceiptName = 'shuishuipingan-inkweaver-dsh-1.0.0.receipt.json'
const releaseRoot = join(repositoryRoot, 'release', expectedVersion)
const defaultTarballPath = join(releaseRoot, expectedTarballName)
const defaultReceiptPath = join(releaseRoot, expectedReceiptName)

const requiredEntries = [
  'package/package.json',
  'package/lib/index.js',
  'package/lib/agent.js',
  'package/lib/agent-v2.js',
  'package/lib/client.js',
  'package/lib/types/index.d.ts',
  'package/lib/types/agent.d.ts',
  'package/lib/types/agent-v2.d.ts',
  'package/lib/types/client/index.d.ts',
  'package/cordis.patch.yml',
  'package/presets/inkweaver/agent.cordis.yml',
  'package/presets/inkweaver/preset.yml',
  'package/presets/inkweaver-v2/agent.cordis.yml',
  'package/presets/inkweaver-v2/preset.yml',
  'package/README.md',
  'package/LICENSE',
  'package/THIRD_PARTY_NOTICES.md',
]

const retiredIdentityPatterns = [
  new RegExp(['Ethan', 'YoQ'].join(''), 'iu'),
  new RegExp(['AI', '-Novel-Writer'].join(''), 'iu'),
  new RegExp(['@ethan', 'yoq'].join(''), 'iu'),
  new RegExp(['dsh-', 'ai-novel', '-writer'].join(''), 'iu'),
  new RegExp(['github\\.com\\/Ethan', 'YoQ\\/AI', '-Novel-Writer'].join(''), 'iu'),
]

const textMemberPattern = /\.(?:c?js|d\.ts|json|md|patch\.yml|ya?ml|txt)$/iu
const textDecoder = new TextDecoder('utf-8', { fatal: true })

function fail(message) {
  throw new Error(message)
}

function readTarString(header, start, length) {
  return header.subarray(start, start + length).toString('utf8').replace(/\0.*$/su, '')
}

function readTarOctal(header, start, length, entryName) {
  const raw = header.subarray(start, start + length).toString('ascii').replace(/\0.*$/su, '').trim()
  if (raw === '') return 0
  const value = Number.parseInt(raw, 8)
  if (!Number.isSafeInteger(value) || value < 0) fail(`Invalid tar entry size for ${entryName}`)
  return value
}

/** Read the small ustar archive emitted by pnpm pack without relying on a host tar executable. */
export function readTarGzip(buffer) {
  const archive = gunzipSync(buffer)
  const entries = []
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    offset += 512
    if (header.every(byte => byte === 0)) break

    const name = readTarString(header, 0, 100)
    const prefix = readTarString(header, 345, 155)
    const fullName = prefix === '' ? name : `${prefix}/${name}`
    if (fullName === '' || fullName.startsWith('/') || fullName.includes('\\') || fullName.split('/').includes('..')) {
      fail(`Tarball contains an unsafe entry path: ${fullName || '<empty>'}`)
    }
    const size = readTarOctal(header, 124, 12, fullName)
    if (offset + size > archive.length) fail(`Tar entry exceeds archive bounds: ${fullName}`)
    const data = Buffer.from(archive.subarray(offset, offset + size))
    const type = readTarString(header, 156, 1) || '0'
    entries.push({ name: fullName, data, type })
    offset += Math.ceil(size / 512) * 512
  }
  if (entries.length === 0) fail('Tarball archive is empty')
  return entries
}

function textMember(entry) {
  if (textMemberPattern.test(entry.name) || entry.name.endsWith('/LICENSE')) return true
  if (entry.data.includes(0)) return false
  try {
    textDecoder.decode(entry.data)
    return true
  } catch {
    return false
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function assertManifest(packedManifest) {
  if (packedManifest.name !== expectedPackageName) fail(`Packed package name must be ${expectedPackageName}`)
  if (packedManifest.version !== expectedVersion) fail(`Packed package version must be ${expectedVersion}`)
  if (packedManifest.main !== 'lib/index.js') fail('Packed package main entry must be lib/index.js')
  if (packedManifest.dsh?.bundle?.patch !== `./${expectedBundlePatch}`) {
    fail(`Packed package must point dsh.bundle.patch at ./${expectedBundlePatch}`)
  }
  if (!Array.isArray(packedManifest.files) || !packedManifest.files.includes(expectedBundlePatch)) {
    fail('Packed package files must include the Cordis bundle patch')
  }
  if (packedManifest.files.includes('src/**') || packedManifest.files.includes('tests/**')) {
    fail('Packed package files must not publish source or test trees')
  }
}

export function assertNoRetiredIdentity(entry) {
  if (!textMember(entry)) return
  const content = `${entry.name}\n${entry.data.toString('utf8')}`
  for (const pattern of retiredIdentityPatterns) {
    if (pattern.test(content)) fail(`Packed text member ${entry.name} contains retired project identity ${pattern}`)
  }
}

function parseJsonEntry(entries, name) {
  const entry = entries.find(candidate => candidate.name === name)
  if (entry === undefined) fail(`Tarball is missing ${name}`)
  try {
    return JSON.parse(entry.data.toString('utf8'))
  } catch (error) {
    fail(`Tarball member ${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertBundlePatch(entries, packedManifest) {
  const entry = entries.find(candidate => candidate.name === `package/${expectedBundlePatch}`)
  if (entry === undefined) fail(`Tarball is missing package/${expectedBundlePatch}`)
  const patch = entry.data.toString('utf8')
  const packageNameInPatch = new RegExp(`name:\\s*['"]?${expectedPackageName.replaceAll('/', '\\/')}['"]?`, 'u')
  if (!/\bid:\s*inkweaver\b/u.test(patch) || !packageNameInPatch.test(patch)) {
    fail('Cordis bundle patch does not mount the declared InkWeaver Host package')
  }
  if (packedManifest.dsh?.bundle?.patch !== `./${expectedBundlePatch}`) {
    fail('Cordis bundle patch is not the manifest-declared patch')
  }
  return entry
}

function assertPresetEntries(entries) {
  const actualPresetIds = []
  for (const presetId of expectedPresetIds) {
    const presetPath = `package/presets/${presetId}/preset.yml`
    const agentPath = `package/presets/${presetId}/agent.cordis.yml`
    if (!entries.some(entry => entry.name === presetPath)) fail(`Tarball is missing ${presetPath}`)
    if (!entries.some(entry => entry.name === agentPath)) fail(`Tarball is missing ${agentPath}`)
    actualPresetIds.push(presetId)
  }
  return actualPresetIds
}

export function validateTarEntries(entries) {
  if (!Array.isArray(entries)) fail('Tarball entries must be an array')
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || !Buffer.isBuffer(entry.data)) {
      fail('Tarball member records must contain a name and Buffer data')
    }
    if (entry.type !== '0' && entry.type !== '\0') {
      fail(`Tarball member ${entry.name} must be a regular file (type ${entry.type || '<empty>'})`)
    }
    if (entry.name === '' || entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.split('/').includes('..')) {
      fail(`Tarball contains an unsafe entry path: ${entry.name || '<empty>'}`)
    }
    if (!entry.name.startsWith('package/')) fail(`Tarball entry is outside package/: ${entry.name}`)
    if (entry.name.startsWith('package/src/') || entry.name.startsWith('package/tests/')) {
      fail('Tarball contains an unpublished source or test tree')
    }
    assertNoRetiredIdentity(entry)
  }
  const names = entries.map(entry => entry.name)
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index)
  if (duplicates.length > 0) fail(`Tarball contains duplicate entries: ${[...new Set(duplicates)].join(', ')}`)
  for (const required of requiredEntries) {
    if (!names.includes(required)) fail(`Tarball is missing required entry: ${required}`)
  }
}

async function nearestRealPath(target) {
  let candidate = target
  while (true) {
    try {
      return await realpath(candidate)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      const parent = dirname(candidate)
      if (parent === candidate) throw error
      candidate = parent
    }
  }
}

/** Validate that a release artifact cannot traverse a symlinked path component. */
export async function assertReleasePath(filePath, repositoryPath = repositoryRoot) {
  const root = resolve(repositoryPath)
  const target = resolve(filePath)
  const relativePath = relative(root, target)
  if (relativePath === '' || relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
    fail('Release path must stay inside the repository')
  }

  const rootInfo = await lstat(root)
  if (rootInfo.isSymbolicLink()) fail(`Release path repository root must not be a symlink: ${root}`)
  let current = root
  for (const part of relativePath.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) fail(`Release path contains symlink component: ${current}`)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') break
      throw error
    }
  }
  const canonicalRoot = await realpath(root)
  const canonicalNearest = await nearestRealPath(target)
  const canonicalRelative = relative(canonicalRoot, canonicalNearest)
  if (canonicalRelative.startsWith(`..${sep}`) || canonicalRelative === '..' || isAbsolute(canonicalRelative)) {
    fail('Release path resolves outside the repository')
  }
  return target
}

function relativeReleasePath(filePath) {
  const normalized = relative(repositoryRoot, filePath).split(sep).join('/')
  if (normalized.startsWith('../') || isAbsolute(normalized)) fail('Release tarball path must stay inside the repository')
  return normalized
}

async function writeReceipt(receiptPath, receipt) {
  const temporaryPath = `${receiptPath}.tmp-${process.pid}`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, receiptPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function verifyReleaseTarball(tarballPath = defaultTarballPath, receiptPath = defaultReceiptPath) {
  const resolvedTarballPath = resolve(tarballPath)
  const resolvedReceiptPath = resolve(receiptPath)
  const canonicalRelease = resolvedTarballPath === defaultTarballPath && resolvedReceiptPath === defaultReceiptPath
  if (basename(resolvedTarballPath) !== expectedTarballName) fail(`Tarball filename must be ${expectedTarballName}`)
  if (basename(resolvedReceiptPath) !== expectedReceiptName) fail(`Receipt filename must be ${expectedReceiptName}`)
  if (dirname(resolvedTarballPath) !== dirname(resolvedReceiptPath)) fail('Release receipt must be written beside the tarball')
  if (canonicalRelease) {
    await assertReleasePath(resolvedTarballPath)
    await assertReleasePath(resolvedReceiptPath)
  }
  if (manifest.name !== expectedPackageName || manifest.version !== expectedVersion) {
    fail('Source package identity does not match the v1 DSH release contract')
  }

  await access(resolvedTarballPath)
  const tarball = await readFile(resolvedTarballPath)
  if (tarball.length === 0) fail('Release tarball is empty')
  const entries = readTarGzip(tarball)
  validateTarEntries(entries)
  const packedManifest = parseJsonEntry(entries, 'package/package.json')
  assertManifest(packedManifest)
  const bundlePatch = assertBundlePatch(entries, packedManifest)
  const presetIds = assertPresetEntries(entries)
  const bytes = (await stat(resolvedTarballPath)).size
  if (bytes !== tarball.length) fail('Release tarball changed while it was being read')

  const receipt = {
    schemaVersion: 1,
    status: 'passed',
    packageName: expectedPackageName,
    version: expectedVersion,
    sha256: sha256(tarball),
    bytes,
    tarball: {
      fileName: expectedTarballName,
      relativePath: canonicalRelease ? relativeReleasePath(resolvedTarballPath) : null,
    },
    bundlePatch: expectedBundlePatch,
    bundlePatchSha256: sha256(bundlePatch.data),
    presetIds,
    entries: entries.map(entry => entry.name).sort(),
    textMembersChecked: entries.filter(textMember).length,
  }
  await writeReceipt(resolvedReceiptPath, receipt)
  return receipt
}

function parseCliPath(value, label) {
  if (value === undefined || value === '') fail(`${label} must not be empty`)
  return resolve(value)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 2) fail('Usage: node scripts/verify-release-tarball.mjs [tarball] [receipt]')
  const receipt = await verifyReleaseTarball(
    args.length >= 1 ? parseCliPath(args[0], 'Tarball path') : defaultTarballPath,
    args.length >= 2 ? parseCliPath(args[1], 'Receipt path') : defaultReceiptPath,
  )
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
