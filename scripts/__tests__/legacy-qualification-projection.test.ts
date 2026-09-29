import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { projectLegacyQualificationBundle } from '../../.release/scripts/project-legacy-qualification.mjs'

const roots: string[] = []
const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const version = (JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { version: string }).version
const dmg = `inkweaver-mac-arm64-${version}-installer.dmg`
const checksum = `${dmg}.sha256`
const acceptance = [
  'qualification/acceptance/dmg-mount.json',
  'qualification/acceptance/packaged-smoke.json',
  'qualification/acceptance/signing.json',
]
const evidence = [
  'qualification/release-contract.json',
  'qualification/run-ledger.json',
  ...acceptance,
  'qualification/packaged-vector-smoke.json',
  'qualification/packaged-official-homepage-smoke.json',
  'qualification/packaged-skin-smoke.json',
  'qualification/macos-dmg-smoke.json',
]

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-qualification-projection-'))
  roots.push(root)
  const sourceRoot = path.join(root, 'electron-builder-output')
  const outputRoot = path.join(root, 'projected-legacy-release')
  const profilePath = path.join(root, 'release-profile.json')
  fs.mkdirSync(sourceRoot, { recursive: true })
  write(path.join(sourceRoot, dmg), 'electron-builder-dmg-bytes')
  write(path.join(sourceRoot, checksum), 'electron-builder-checksum-bytes')
  for (const relativePath of evidence) write(path.join(sourceRoot, ...relativePath.split('/')), JSON.stringify({ relativePath }))
  write(path.join(sourceRoot, 'latest-mac.yml'), 'not a release asset')
  write(path.join(sourceRoot, `${dmg}.blockmap`), 'not a release asset')
  write(path.join(sourceRoot, 'builder-debug.yml'), 'not release evidence')
  write(path.join(sourceRoot, 'mac-arm64', 'InkWeaver.app', 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework'), 'unpacked intermediary')
  write(profilePath, JSON.stringify({
    platforms: {
      'macos-arm64': {
        architectures: ['arm64'],
        acceptanceReceipts: acceptance.map(relativePath => relativePath.replace(/^qualification\//, '')),
      },
    },
    releaseAssets: [
      { name: 'inkweaver-mac-arm64-{version}-installer.dmg', platform: 'macos-arm64', role: 'installer' },
      { name: 'inkweaver-mac-arm64-{version}-installer.dmg.sha256', platform: 'macos-arm64', role: 'checksum' },
    ],
  }))
  const manifest = {
    schemaVersion: 2,
    platform: 'macos-arm64',
    architecture: 'arm64',
    version,
    acceptanceProfile: acceptance,
    artifacts: [dmg, checksum].map(file => ({ file })),
    evidence: evidence.map(file => ({ file })),
  }
  write(path.join(sourceRoot, 'manifest.json'), JSON.stringify(manifest))
  const records = [...manifest.artifacts, ...manifest.evidence, { file: 'manifest.json' }]
  write(path.join(sourceRoot, 'SHA256SUMS.txt'), `${records.map(record => `${sha256(path.join(sourceRoot, ...record.file.split('/')))} *${record.file}`).join('\n')}\n`)
  return { sourceRoot, outputRoot, profilePath }
}

function linuxFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-linux-qualification-projection-'))
  roots.push(root)
  const sourceRoot = path.join(root, 'electron-builder-output')
  const outputRoot = path.join(root, 'projected-legacy-release')
  const profilePath = path.join(root, 'release-profile.json')
  fs.mkdirSync(sourceRoot, { recursive: true })
  const assets = [
    `inkweaver-linux-x64-${version}.AppImage`,
    `inkweaver-linux-x64-${version}.AppImage.sha256`,
    `inkweaver-linux-x64-${version}.deb`,
    `inkweaver-linux-x64-${version}.deb.sha256`,
    `inkweaver-linux-x64-${version}.rpm`,
    `inkweaver-linux-x64-${version}.rpm.sha256`,
  ]
  const acceptance = [
    'qualification/acceptance/install.json',
    'qualification/acceptance/launch.json',
    'qualification/acceptance/native-abi.json',
    'qualification/acceptance/packaged-smoke.json',
    'qualification/acceptance/signing.json',
  ]
  const evidence = [
    'qualification/release-contract.json',
    'qualification/run-ledger.json',
    ...acceptance,
    'qualification/linux-package-smoke.json',
    'qualification/packaged-vector-smoke.json',
  ]
  for (const file of assets) write(path.join(sourceRoot, file), `linux-package:${file}`)
  for (const file of evidence) write(path.join(sourceRoot, ...file.split('/')), JSON.stringify({ file }))
  const releaseAssets = assets.map((name, index) => ({
    name: name.replace(version, '{version}'),
    platform: 'linux-x64',
    role: index % 2 === 1 ? 'checksum' : 'installer',
  }))
  write(profilePath, JSON.stringify({
    platforms: {
      'linux-x64': {
        architectures: ['x64'],
        acceptanceReceipts: acceptance.map(relativePath => relativePath.replace(/^qualification\//, '')),
      },
    },
    releaseAssets,
  }))
  const manifest = {
    schemaVersion: 2,
    platform: 'linux-x64',
    architecture: 'x64',
    version,
    acceptanceProfile: acceptance,
    artifacts: assets.map(file => ({ file })),
    evidence: evidence.map(file => ({ file })),
  }
  write(path.join(sourceRoot, 'manifest.json'), JSON.stringify(manifest))
  const records = [...manifest.artifacts, ...manifest.evidence, { file: 'manifest.json' }]
  write(path.join(sourceRoot, 'SHA256SUMS.txt'), `${records.map(record => `${sha256(path.join(sourceRoot, ...record.file.split('/')))} *${record.file}`).join('\n')}\n`)
  return { sourceRoot, outputRoot, profilePath, assets, evidence }
}

function relativeFiles(root: string): string[] {
  return fs.readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(relativePath => fs.statSync(path.join(root, relativePath)).isFile())
    .map(relativePath => relativePath.replaceAll('\\', '/'))
    .sort()
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('legacy qualification bundle projection', () => {
  it('copies only the profile assets and hash-bound legacy evidence without changing Electron Builder bytes', () => {
    const fixturePaths = fixture()
    projectLegacyQualificationBundle({ platform: 'macos-arm64', version, ...fixturePaths })

    expect(relativeFiles(fixturePaths.outputRoot)).toEqual([
      'SHA256SUMS.txt',
      dmg,
      checksum,
      ...evidence,
      'manifest.json',
    ].sort())
    expect(sha256(path.join(fixturePaths.outputRoot, dmg))).toBe(sha256(path.join(fixturePaths.sourceRoot, dmg)))
    expect(fs.existsSync(path.join(fixturePaths.outputRoot, 'latest-mac.yml'))).toBe(false)
    expect(fs.existsSync(path.join(fixturePaths.outputRoot, 'mac-arm64'))).toBe(false)
    expect(fs.existsSync(path.join(fixturePaths.sourceRoot, 'latest-mac.yml'))).toBe(true)
    expect(fs.existsSync(path.join(fixturePaths.sourceRoot, 'mac-arm64'))).toBe(true)
  })

  it('fails closed when a profile release asset is missing instead of projecting partial evidence', () => {
    const fixturePaths = fixture()
    fs.rmSync(path.join(fixturePaths.sourceRoot, dmg))

    expect(() => projectLegacyQualificationBundle({ platform: 'macos-arm64', version, ...fixturePaths }))
      .toThrow('Projection source must be a non-empty regular file')
    expect(fs.existsSync(fixturePaths.outputRoot)).toBe(false)
  })

  it('projects exactly the Linux package formats, checksums, acceptance receipts, and runtime smoke evidence', () => {
    const fixturePaths = linuxFixture()
    projectLegacyQualificationBundle({ platform: 'linux-x64', version, ...fixturePaths })

    expect(relativeFiles(fixturePaths.outputRoot)).toEqual([
      'SHA256SUMS.txt',
      ...fixturePaths.assets,
      ...fixturePaths.evidence,
      'manifest.json',
    ].sort())
    for (const asset of fixturePaths.assets) {
      expect(sha256(path.join(fixturePaths.outputRoot, asset))).toBe(sha256(path.join(fixturePaths.sourceRoot, asset)))
    }
  })

  it.each([
    ['Linux RPM package', 4],
    ['Linux AppImage checksum', 1],
    ['Linux package smoke evidence', 'qualification/linux-package-smoke.json'],
  ])('fails closed when %s is missing', (_case, missing) => {
    const fixturePaths = linuxFixture()
    const relative = typeof missing === 'number' ? fixturePaths.assets[missing] : missing
    fs.rmSync(path.join(fixturePaths.sourceRoot, ...relative.split('/')))

    expect(() => projectLegacyQualificationBundle({ platform: 'linux-x64', version, ...fixturePaths }))
      .toThrow('Projection source must be a non-empty regular file')
    expect(fs.existsSync(fixturePaths.outputRoot)).toBe(false)
  })
})
