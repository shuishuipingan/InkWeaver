import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  expectedReleaseAssetNames,
  verifyGithubReleaseAssetContract,
} from '../verify-github-release-assets.mjs'

const VERSION = '1.1.0'

function assets() {
  return expectedReleaseAssetNames(VERSION).map((name, index) => {
    const bytes = Buffer.from(`asset-${index}`)
    return { name, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
  })
}

describe('GitHub 1.1.0 release asset contract', () => {
  it('accepts all seven final assets from a non-draft non-prerelease release', () => {
    const result = verifyGithubReleaseAssetContract({
      expectedVersion: VERSION,
      release: { tag_name: `v${VERSION}`, draft: false, prerelease: false, assets: assets() },
    })
    expect(result).toEqual({
      ok: true,
      tag: 'v1.1.0',
      missing: [],
      invalid: [],
      assets: expectedReleaseAssetNames(VERSION),
    })
  })

  it('rejects draft/prerelease releases and reports missing assets', () => {
    const releaseAssets = assets().slice(0, 3)
    const result = verifyGithubReleaseAssetContract({
      expectedVersion: VERSION,
      release: { tag_name: 'v1.1.0', draft: true, prerelease: true, assets: releaseAssets },
    })
    expect(result.ok).toBe(false)
    expect(result.invalid).toEqual(expect.arrayContaining(['release is still a draft', 'release is a prerelease']))
    expect(result.missing).toHaveLength(4)
  })

  it('rejects a wrong tag and malformed asset digest', () => {
    const releaseAssets = assets()
    releaseAssets[0] = { ...releaseAssets[0]!, digest: 'sha256:not-a-digest' }
    const result = verifyGithubReleaseAssetContract({
      expectedVersion: VERSION,
      release: { tag_name: 'v1.0.0', draft: false, prerelease: false, assets: releaseAssets },
    })
    expect(result.ok).toBe(false)
    expect(result.invalid).toEqual(expect.arrayContaining(['tag v1.0.0 does not match v1.1.0']))
    expect(result.invalid.some(message => message.includes('inkweaver-setup-1.1.0.exe'))).toBe(true)
  })
})
