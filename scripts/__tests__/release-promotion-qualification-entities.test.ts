import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertAuthoritativeReadback,
  collectVerifiedPackageAssets,
  parseQualificationRuns,
  validatePromotionProfile,
  verifyDshQualificationReceipt,
} from '../../.release/scripts/github-desktop-promotion.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const profile = JSON.parse(readFileSync(path.join(repositoryRoot, '.release', 'release-profile.json'), 'utf8'))

describe('desktop promotion qualification entities', () => {
  it('accepts the configured DSH extension alongside exactly three desktop qualification entities', () => {
    expect(validatePromotionProfile(profile)).toEqual(profile)
    expect(Object.keys(profile.platforms).sort()).toEqual(['macos-arm64', 'macos-x64', 'windows'])
    expect(profile.releaseAssets.filter((asset: { platform: string }) => asset.platform === 'dsh')).toEqual([
      { name: 'shuishuipingan-inkweaver-dsh-{version}.tgz', platform: 'dsh', role: 'extension' },
    ])
  })

  it.each([
    ['missing qualified file', 'missing', 'verified package asset is missing'],
    ['wrong bundle filename set', 'wrong-set', 'verified package asset set/profile mismatch'],
    ['bytes tampered after verification', 'tampered', 'verified package bytes changed'],
  ])('fails closed for %s', async (_label, mutation, expectedMessage) => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-promotion-package-'))
    try {
      const version = '1.0.0'
      const expectedNames = profile.releaseAssets.map((asset: { name: string }) => asset.name.replaceAll('{version}', version))
      const assets = expectedNames.map((name: string) => {
        const bytes = Buffer.from(`qualified:${name}`)
        writeFileSync(path.join(root, name), bytes)
        return { name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
      })
      if (mutation === 'missing') rmSync(path.join(root, 'shuishuipingan-inkweaver-dsh-1.0.0.tgz'))
      if (mutation === 'wrong-set') {
        const dsh = assets.find((asset: { name: string }) => asset.name.endsWith('.tgz'))!
        dsh.name = 'inkweaver-dsh-1.0.0.tgz'
        writeFileSync(path.join(root, dsh.name), 'wrong-name')
      }
      if (mutation === 'tampered') writeFileSync(path.join(root, 'shuishuipingan-inkweaver-dsh-1.0.0.tgz'), 'tampered')

      await expect(collectVerifiedPackageAssets({ packageRoot: root, planAssets: assets, profile, version }))
        .rejects.toThrow(expectedMessage)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an authoritative GitHub digest mismatch for the DSH tarball', () => {
    const name = 'shuishuipingan-inkweaver-dsh-1.0.0.tgz'
    const localAssets = new Map([[name, { name, size: 12, sha256: 'a'.repeat(64) }]])
    expect(() => assertAuthoritativeReadback({
      release: { id: 17, name: 'v1.0.0', body: 'body', draft: false, prerelease: false, assets: [
        { name, state: 'uploaded', size: 12, digest: `sha256:${'b'.repeat(64)}` },
      ] },
      tagSha: '1'.repeat(40), expectedSha: '1'.repeat(40), expectedTitle: 'v1.0.0', expectedBody: 'body',
      localAssets, channel: { draft: false, prerelease: false, expectedLatest: true }, latestReleaseId: 17,
    })).toThrow(`authoritative asset mismatch: ${name}`)
  })

  it('rejects any DSH promotion asset that is not the exact extension contract', () => {
    const wrongName = structuredClone(profile)
    const dshByName = wrongName.releaseAssets.find((asset: { platform: string }) => asset.platform === 'dsh')
    dshByName.name = 'inkweaver-dsh-{version}.tgz'
    expect(() => validatePromotionProfile(wrongName)).toThrow('must declare the exact qualified DSH extension tarball')

    const wrongRole = structuredClone(profile)
    const dshByRole = wrongRole.releaseAssets.find((asset: { platform: string }) => asset.platform === 'dsh')
    dshByRole.role = 'archive'
    expect(() => validatePromotionProfile(wrongRole)).toThrow('must declare the exact qualified DSH extension tarball')
  })

  it('reads only the explicit DSH qualification receipt and binds it to the release-bundle tarball', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-dsh-promotion-receipt-'))
    try {
      const version = '1.0.0'
      const tarballName = `shuishuipingan-inkweaver-dsh-${version}.tgz`
      const tarballPath = path.join(root, 'release-bundle', tarballName)
      const receiptPath = path.join(root, 'qualification', 'dsh-release-receipt.json')
      const tarballBytes = Buffer.from('qualified DSH bytes')
      mkdirSync(path.dirname(tarballPath), { recursive: true })
      mkdirSync(path.dirname(receiptPath), { recursive: true })
      writeFileSync(tarballPath, tarballBytes)
      writeFileSync(receiptPath, `${JSON.stringify({
        schemaVersion: 1,
        status: 'passed',
        packageName: '@shuishuipingan/inkweaver-dsh',
        version,
        sha256: createHash('sha256').update(tarballBytes).digest('hex'),
        bytes: tarballBytes.length,
        tarball: { fileName: tarballName, relativePath: `release/${version}/${tarballName}` },
        bundlePatch: 'cordis.patch.yml',
        presetIds: ['inkweaver', 'inkweaver-v2'],
      })}\n`, 'utf8')

      expect(verifyDshQualificationReceipt({ root, version })).toMatchObject({
        receipt: { packageName: '@shuishuipingan/inkweaver-dsh', version, sha256: expect.any(String) },
        tarballName,
      })

      writeFileSync(receiptPath, JSON.stringify({
        schemaVersion: 1,
        status: 'passed',
        packageName: '@shuishuipingan/inkweaver-dsh',
        version,
        sha256: '0'.repeat(64),
        bytes: tarballBytes.length,
        tarball: { fileName: tarballName, relativePath: `release/${version}/${tarballName}` },
        bundlePatch: 'cordis.patch.yml',
        presetIds: ['inkweaver', 'inkweaver-v2'],
      }), 'utf8')
      expect(() => verifyDshQualificationReceipt({ root, version })).toThrow('SHA-256 does not match')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires independent Windows, Apple Silicon, and Intel qualification run identities', () => {
    const validated = validatePromotionProfile(profile)
    const entities = Object.keys(validated.platforms).sort()
    expect(entities).toEqual(['macos-arm64', 'macos-x64', 'windows'])

    const runs = parseQualificationRuns(JSON.stringify({
      windows: { runId: 101, attempt: 1, artifactId: 201 },
      'macos-arm64': { runId: 102, attempt: 1, artifactId: 202 },
      'macos-x64': { runId: 103, attempt: 1, artifactId: 203 },
    }), entities)

    expect(runs).toEqual({
      'macos-arm64': { runId: 102, attempt: 1, artifactId: 202 },
      'macos-x64': { runId: 103, attempt: 1, artifactId: 203 },
      windows: { runId: 101, attempt: 1, artifactId: 201 },
    })
    expect(validated.releaseAssets.filter(asset => asset.platform === 'macos-arm64').map(asset => asset.name))
      .toEqual([
        'inkweaver-mac-arm64-{version}-installer.dmg',
        'inkweaver-mac-arm64-{version}-installer.dmg.sha256',
      ])
    expect(validated.releaseAssets.filter(asset => asset.platform === 'macos-x64').map(asset => asset.name))
      .toEqual([
        'inkweaver-mac-x64-{version}-installer.dmg',
        'inkweaver-mac-x64-{version}-installer.dmg.sha256',
      ])
  })

  it('rejects a generic macOS alias or a run mapping that merges the two architectures', () => {
    const genericMacos = structuredClone(profile)
    genericMacos.platforms.macos = genericMacos.platforms['macos-arm64']
    delete genericMacos.platforms['macos-arm64']
    genericMacos.releaseAssets = genericMacos.releaseAssets.map((asset: { platform: string }) => (
      asset.platform === 'macos-arm64' ? { ...asset, platform: 'macos' } : asset
    ))
    expect(() => validatePromotionProfile(genericMacos)).toThrow('Unsupported platform: macos')

    expect(() => parseQualificationRuns(JSON.stringify({
      windows: { runId: 101, attempt: 1, artifactId: 201 },
      macos: { runId: 102, attempt: 1, artifactId: 202 },
    }), ['windows', 'macos-arm64', 'macos-x64'])).toThrow('qualification run mapping keys must be exactly')
  })
})
