import { describe, expect, it } from 'vitest'

import { verifyReleaseVersionSync } from '../release-version-sync.mjs'

describe('1.2.0 release version sync gate', () => {
  it('accepts one final version shared by desktop and the InkWeaver DSH package', () => {
    expect(verifyReleaseVersionSync({
      expectedVersion: '1.2.0',
      desktopVersion: '1.2.0',
      pluginVersion: '1.2.0',
      pluginName: '@shuishuipingan/inkweaver-dsh',
    })).toEqual({ ok: true, errors: [] })
  })

  it('rejects a desktop/plugin mismatch without treating the development package as released', () => {
    const result = verifyReleaseVersionSync({
      expectedVersion: '1.2.0',
      desktopVersion: '0.9.2',
      pluginVersion: '0.1.0',
      pluginName: '@shuishuipingan/inkweaver-dsh',
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      'desktop package version 0.9.2 does not match expected 1.2.0',
      'DSH plugin package version 0.1.0 does not match expected 1.2.0',
    ])
  })

  it('rejects prerelease expectations and historical plugin identity', () => {
    const result = verifyReleaseVersionSync({
      expectedVersion: '1.2.0-rc.1',
      desktopVersion: '1.2.0-rc.1',
      pluginVersion: '1.2.0-rc.1',
      pluginName: '@ethanyoq/dsh-ai-novel-writer',
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('expected release version must be a final semantic version')
    expect(result.errors).toContain('DSH plugin package name must be @shuishuipingan/inkweaver-dsh')
  })
})
