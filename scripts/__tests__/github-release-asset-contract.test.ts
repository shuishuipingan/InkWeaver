import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  expectedReleaseAssetNames,
  verifyGithubReleaseAssetContract,
} from '../verify-github-release-assets.mjs'

const VERSION = '1.2.0'

function assets() {
  return expectedReleaseAssetNames(VERSION).map((name, index) => {
    const bytes = Buffer.from(`asset-${index}`)
    return { name, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
  })
}

describe('GitHub 1.2.0 release asset contract', () => {
  it('accepts all seven final assets from a non-draft non-prerelease release', () => {
    const result = verifyGithubReleaseAssetContract({
      expectedVersion: VERSION,
      release: { tag_name: `v${VERSION}`, draft: false, prerelease: false, assets: assets() },
    })
    expect(result).toEqual({
      ok: true,
      tag: 'v1.2.0',
      missing: [],
      invalid: [],
      assets: expectedReleaseAssetNames(VERSION),
    })
  })

  it('rejects draft/prerelease releases and reports missing assets', () => {
    const releaseAssets = assets().slice(0, 3)
    const result = verifyGithubReleaseAssetContract({
      expectedVersion: VERSION,
      release: { tag_name: 'v1.2.0', draft: true, prerelease: true, assets: releaseAssets },
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
    expect(result.invalid).toEqual(expect.arrayContaining(['tag v1.0.0 does not match v1.2.0']))
    expect(result.invalid.some(message => message.includes('inkweaver-setup-1.2.0.exe'))).toBe(true)
  })

  it('requires dsh-plugin topic metadata when topic data is available', () => {
    const result = verifyGithubReleaseAssetContract({
      expectedVersion: VERSION,
      topics: ['electron', 'writing-assistant'],
      release: { tag_name: `v${VERSION}`, draft: false, prerelease: false, assets: assets() },
    })
    expect(result.ok).toBe(false)
    expect(result.invalid).toContain('repository topics do not include dsh-plugin')
  })

  it('actually enters the CLI on Windows instead of silently exiting zero', () => {
    const scriptPath = fileURLToPath(new URL('../verify-github-release-assets.mjs', import.meta.url))
    const run = spawnSync(process.execPath, [path.resolve(scriptPath), '--version', VERSION, '--api-base', 'http://127.0.0.1:1'], { encoding: 'utf8' })
    expect(run.status).not.toBe(0)
    expect(`${run.stdout}${run.stderr}`).toMatch(/request failed|fetch failed/u)
  })
})

describe('GitHub 1.3.6 Linux desktop release asset contract', () => {
  it('requires all 13 Windows, macOS, and Linux release assets', () => {
    const version = '1.3.6'
    const names = expectedReleaseAssetNames(version)
    expect(names).toHaveLength(13)
    expect(names.slice(-6)).toEqual([
      'inkweaver-linux-x64-1.3.6.AppImage',
      'inkweaver-linux-x64-1.3.6.AppImage.sha256',
      'inkweaver-linux-x64-1.3.6.deb',
      'inkweaver-linux-x64-1.3.6.deb.sha256',
      'inkweaver-linux-x64-1.3.6.rpm',
      'inkweaver-linux-x64-1.3.6.rpm.sha256',
    ])
    const assets = names.map((name, index) => {
      const bytes = Buffer.from(`linux-release-asset-${index}`)
      return { name, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
    })
    expect(verifyGithubReleaseAssetContract({
      expectedVersion: version,
      release: { tag_name: 'v1.3.6', draft: false, prerelease: false, assets },
    })).toMatchObject({ ok: true, missing: [], invalid: [], assets: names })
  })
})
