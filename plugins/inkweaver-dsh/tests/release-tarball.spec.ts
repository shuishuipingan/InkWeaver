import { gzipSync, gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const packageRoot = resolve(import.meta.dirname, '..')
const tarballName = 'shuishuipingan-inkweaver-dsh-1.0.0.tgz'
const receiptName = 'shuishuipingan-inkweaver-dsh-1.0.0.receipt.json'
const verifierPath = join(packageRoot, 'scripts', 'verify-release-tarball.mjs')
const pnpmEntry = process.env.npm_execpath
  ?? join(dirname(process.execPath), 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')

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
] as const

const retiredIdentities = [
  new RegExp(['Ethan', 'YoQ'].join(''), 'i'),
  new RegExp(['AI', '-Novel-Writer'].join(''), 'i'),
  new RegExp(['@ethan', 'yoq'].join(''), 'i'),
  new RegExp(['dsh-', 'ai-novel', '-writer'].join(''), 'i'),
  new RegExp(['github\\.com\\/Ethan', 'YoQ\\/AI', '-Novel-Writer'].join(''), 'i'),
] as const

type TarEntry = { name: string; data: Buffer; type: string }

type PackedFixture = {
  root: string
  firstTarball: string
  secondTarball: string
  firstReceipt: string
  secondReceipt: string
}

function makeTar(entries: Array<{ name: string; data?: Buffer; type?: string }>): Buffer {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const data = entry.data ?? Buffer.alloc(0)
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100, 'utf8')
    header.write('00000000000\0', 100, 12, 'ascii')
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii')
    header.write('00000000000\0', 136, 12, 'ascii')
    header.write('00000000000\0', 148, 12, 'ascii')
    header.write(entry.type ?? '0', 156, 1, 'ascii')
    header.write('ustar\0', 257, 6, 'ascii')
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks))
}

async function runVerifier(tarballPath: string, receiptPath: string) {
  return execFileAsync(process.execPath, [verifierPath, tarballPath, receiptPath], {
    cwd: packageRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
}

async function makePackedFixture(): Promise<PackedFixture> {
  const root = await mkdtemp(join(tmpdir(), 'inkweaver-dsh-release-contract-'))
  const firstDirectory = join(root, 'first')
  const secondDirectory = join(root, 'second')
  await mkdir(firstDirectory)
  await mkdir(secondDirectory)
  await execFileAsync(process.execPath, [pnpmEntry, 'run', 'build'], {
    cwd: packageRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  await execFileAsync(process.execPath, [pnpmEntry, 'pack', '--pack-destination', firstDirectory], {
    cwd: packageRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  await execFileAsync(process.execPath, [pnpmEntry, 'pack', '--pack-destination', secondDirectory], {
    cwd: packageRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  const firstTarball = join(firstDirectory, tarballName)
  const secondTarball = join(secondDirectory, tarballName)
  const firstReceipt = join(firstDirectory, receiptName)
  const secondReceipt = join(secondDirectory, receiptName)
  await runVerifier(firstTarball, firstReceipt)
  await runVerifier(secondTarball, secondReceipt)
  return { root, firstTarball, secondTarball, firstReceipt, secondReceipt }
}

function parseTar(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    offset += 512
    if (header.every(byte => byte === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '')
    const fullName = prefix ? `${prefix}/${name}` : name
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim()
    const size = sizeText === '' ? 0 : Number.parseInt(sizeText, 8)
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > buffer.length) {
      throw new Error(`Invalid tar entry size for ${fullName}`)
    }
    const data = Buffer.from(buffer.subarray(offset, offset + size))
    entries.push({ name: fullName, data, type: header.subarray(156, 157).toString('ascii') || '0' })
    offset += Math.ceil(size / 512) * 512
  }
  return entries
}

function textMember(entry: TarEntry): boolean {
  return /\.(?:c?js|d\.ts|json|md|patch\.yml|ya?ml|txt)$/iu.test(entry.name)
    || entry.name.endsWith('/LICENSE')
}

describe('InkWeaver DSH release tarball', () => {
  let fixture: PackedFixture | undefined

  beforeAll(async () => {
    fixture = await makePackedFixture()
  }, 120_000)

  afterAll(async () => {
    if (fixture !== undefined) await rm(fixture.root, { recursive: true, force: true })
  })

  it('builds and verifies complete installable bundles from a clean checkout', async () => {
    if (fixture === undefined) throw new Error('Packed fixture was not prepared')
    const tarballPath = fixture.firstTarball
    const receiptPath = fixture.firstReceipt
    await expect(access(verifierPath)).resolves.toBeUndefined()
    await expect(runVerifier(tarballPath, receiptPath)).resolves.toMatchObject({
      stdout: expect.stringContaining(tarballName),
    })

    const tarball = await readFile(tarballPath)
    expect(basename(tarballPath)).toBe(tarballName)
    expect(createHash('sha256').update(tarball).digest('hex')).toMatch(/^[a-f0-9]{64}$/u)

    const entries = parseTar(gunzipSync(tarball))
    const names = entries.map(entry => entry.name)
    for (const required of requiredEntries) expect(names).toContain(required)
    expect(names.every(name => name.startsWith('package/'))).toBe(true)
    expect(names.some(name => name.startsWith('package/src/'))).toBe(false)
    expect(names.some(name => name.startsWith('package/tests/'))).toBe(false)

    for (const entry of entries.filter(textMember)) {
      const content = `${entry.name}\n${entry.data.toString('utf8')}`
      for (const retiredIdentity of retiredIdentities) {
        expect(content, entry.name).not.toMatch(retiredIdentity)
      }
    }

    const manifest = JSON.parse(entries.find(entry => entry.name === 'package/package.json')!.data.toString('utf8'))
    expect(manifest).toMatchObject({
      name: '@shuishuipingan/inkweaver-dsh',
      version: '1.0.0',
      main: 'lib/index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })

    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      status: 'passed',
      packageName: '@shuishuipingan/inkweaver-dsh',
      version: '1.0.0',
      tarball: { fileName: tarballName },
      bundlePatch: 'cordis.patch.yml',
      presetIds: ['inkweaver', 'inkweaver-v2'],
    })
    expect(receipt.sha256).toBe(createHash('sha256').update(tarball).digest('hex'))
    expect(receipt.entries).toEqual(expect.arrayContaining([...requiredEntries]))
  })

  it('produces reproducible bytes and normalized receipts across isolated destinations', async () => {
    if (fixture === undefined) throw new Error('Packed fixture was not prepared')
    const firstTarball = await readFile(fixture.firstTarball)
    const secondTarball = await readFile(fixture.secondTarball)
    const firstReceipt = JSON.parse(await readFile(fixture.firstReceipt, 'utf8'))
    const secondReceipt = JSON.parse(await readFile(fixture.secondReceipt, 'utf8'))

    expect(firstTarball.equals(secondTarball)).toBe(true)
    expect(firstReceipt.sha256).toBe(secondReceipt.sha256)
    expect(firstReceipt.bytes).toBe(secondReceipt.bytes)
    expect(firstReceipt.bundlePatchSha256).toBe(secondReceipt.bundlePatchSha256)
    expect(firstReceipt.presetIds).toEqual(secondReceipt.presetIds)
    expect(firstReceipt.entries).toEqual(secondReceipt.entries)
    expect({ ...firstReceipt, tarball: { ...firstReceipt.tarball, relativePath: null } })
      .toEqual({ ...secondReceipt, tarball: { ...secondReceipt.tarball, relativePath: null } })
  })

  it('rejects unsafe archive paths and every non-regular tar member type', async () => {
    const root = await mkdtemp(join(tmpdir(), 'inkweaver-dsh-malformed-tar-'))
    try {
      const pathCases = [
        { label: 'unsafe path', entry: { name: '../escape', type: '0' }, message: 'unsafe entry path' },
        { label: 'symlink', entry: { name: 'package/link', type: '2' }, message: 'regular file' },
        { label: 'hardlink', entry: { name: 'package/link', type: '1' }, message: 'regular file' },
        { label: 'directory', entry: { name: 'package/folder', type: '5' }, message: 'regular file' },
        { label: 'device', entry: { name: 'package/device', type: '3' }, message: 'regular file' },
        { label: 'unknown', entry: { name: 'package/unknown', type: 'x' }, message: 'regular file' },
      ] as const

      for (const pathCase of pathCases) {
        const tarballPath = join(root, tarballName)
        const receiptPath = join(root, receiptName)
        await writeFile(tarballPath, makeTar([pathCase.entry]))
        await expect(runVerifier(tarballPath, receiptPath), pathCase.label).rejects.toMatchObject({
          stderr: expect.stringContaining(pathCase.message),
        })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a release path whose release directory is a symlink', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'inkweaver-dsh-release-path-'))
    const externalRoot = await mkdtemp(join(tmpdir(), 'inkweaver-dsh-release-external-'))
    try {
      await mkdir(join(fixtureRoot, 'release'))
      await symlink(externalRoot, join(fixtureRoot, 'release', '1.0.0'), 'junction')
      const target = join(fixtureRoot, 'release', '1.0.0', tarballName)
      const probe = [
        `import { assertReleasePath } from ${JSON.stringify(pathToFileURL(verifierPath).href)}`,
        `await assertReleasePath(${JSON.stringify(target)}, ${JSON.stringify(fixtureRoot)})`,
      ].join(';')
      await expect(execFileAsync(process.execPath, ['--input-type=module', '--eval', probe], {
        cwd: packageRoot,
        encoding: 'utf8',
      })).rejects.toMatchObject({ stderr: expect.stringContaining('symlink') })
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true })
      await rm(externalRoot, { recursive: true, force: true })
    }
  })

  it('removes its generated fixture after the contract completes', async () => {
    if (fixture === undefined) throw new Error('Packed fixture was not prepared')
    const fixtureRoot = fixture.root
    await rm(fixtureRoot, { recursive: true, force: true })
    await expect(access(fixtureRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    fixture = undefined
  })
})
