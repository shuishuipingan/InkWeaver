import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertContractBindings,
  assertQualificationRun,
  extractReleaseNotes,
  parseQualificationRuns,
  validatePromotionProfile,
} from '../../.release/scripts/github-desktop-promotion.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const profile = JSON.parse(readFileSync(path.join(repositoryRoot, '.release', 'release-profile.json'), 'utf8'))

describe('desktop promotion qualification entities', () => {
  it('extracts only the changelog section for the qualified release version', () => {
    const changelog = [
      '# 更新日志',
      '',
      '## 1.3.5 — 2026-09-29',
      '',
      '- 新增 AI 批量生成章节名。',
      '- 改名覆盖小说配置中的文本字段。',
      '',
      '## What changed',
      '',
      '- Added batch AI chapter titles.',
      '',
      '## 1.3.2 — 2026-09-27',
      '',
      '- 旧版本说明不应混入本次 Release。',
    ].join('\n')

    expect(extractReleaseNotes(changelog, '1.3.5')).toBe(
      '- 新增 AI 批量生成章节名。\n- 改名覆盖小说配置中的文本字段。\n\n## What changed\n\n- Added batch AI chapter titles.',
    )
    expect(() => extractReleaseNotes(changelog, '1.3.4')).toThrow(/CHANGELOG.md/u)
  })

  it('requires independent Windows, Apple Silicon, Intel, and Linux x64 qualification run identities', () => {
    const validated = validatePromotionProfile(profile)
    const entities = Object.keys(validated.platforms).sort()
    expect(entities).toEqual(['linux-x64', 'macos-arm64', 'macos-x64', 'windows'])

    const runs = parseQualificationRuns(JSON.stringify({
      windows: { runId: 101, attempt: 1, artifactId: 201 },
      'macos-arm64': { runId: 102, attempt: 1, artifactId: 202 },
      'macos-x64': { runId: 103, attempt: 1, artifactId: 203 },
      'linux-x64': { runId: 104, attempt: 2, artifactId: 204 },
    }), entities)

    expect(runs).toEqual({
      'macos-arm64': { runId: 102, attempt: 1, artifactId: 202 },
      'macos-x64': { runId: 103, attempt: 1, artifactId: 203 },
      'linux-x64': { runId: 104, attempt: 2, artifactId: 204 },
      windows: { runId: 101, attempt: 1, artifactId: 201 },
    })
    expect(validated.releaseAssets.filter(asset => asset.platform === 'linux-x64').map(asset => asset.name)).toEqual([
      'inkweaver-linux-x64-{version}.AppImage',
      'inkweaver-linux-x64-{version}.AppImage.sha256',
      'inkweaver-linux-x64-{version}.deb',
      'inkweaver-linux-x64-{version}.deb.sha256',
      'inkweaver-linux-x64-{version}.rpm',
      'inkweaver-linux-x64-{version}.rpm.sha256',
    ])
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
    }), ['windows', 'macos-arm64', 'macos-x64', 'linux-x64'])).toThrow('qualification run mapping keys must be exactly')

    const profileWithoutLinux = structuredClone(profile)
    delete profileWithoutLinux.platforms['linux-x64']
    profileWithoutLinux.releaseAssets = profileWithoutLinux.releaseAssets.filter((asset: { platform: string }) => asset.platform !== 'linux-x64')
    expect(() => validatePromotionProfile(profileWithoutLinux)).toThrow('release profile must require exactly Windows, macOS ARM64, macOS x64, and Linux x64 qualifications')
  })

  it('rejects a Linux qualification whose commit or raw contract/profile bindings drift', () => {
    const expectedSha = 'a'.repeat(40)
    expect(() => assertQualificationRun({
      run: { head_sha: 'b'.repeat(40), run_attempt: 1, status: 'completed', conclusion: 'success', path: profile.platforms['linux-x64'].qualificationWorkflow },
      expectedSha,
      expectedAttempt: 1,
      expectedWorkflow: profile.platforms['linux-x64'].qualificationWorkflow,
    })).toThrow('qualification head SHA mismatch')

    const contractHash = 'c'.repeat(64)
    const profileHash = 'd'.repeat(64)
    const binding = {
      manifest: { contractRawBytesSha256: contractHash, profileRawBytesSha256: profileHash },
      manifestRecords: new Map([['release-contract.json', { digest: contractHash }]]),
      ledger: { contractRawBytesSha256: contractHash, profileRawBytesSha256: profileHash },
      profileRawBytesSha256: profileHash,
    }
    expect(() => assertContractBindings(binding)).not.toThrow()
    expect(() => assertContractBindings({ ...binding, profileRawBytesSha256: 'e'.repeat(64) }))
      .toThrow('current release profile raw-byte hash mismatch')
  })
})
