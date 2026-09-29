import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  LINUX_SMOKE_TARGETS,
  createLinuxSmokeCases,
  validateLinuxSmokeResults,
} from '../smoke-linux-packages.mjs'
import * as linuxSmokeModule from '../smoke-linux-packages.mjs'

function createValidLinuxSmokeResults() {
  return createLinuxSmokeCases('1.3.6').map(testCase => ({
    ...testCase,
    imageDigest: `sha256:${'a'.repeat(64)}`,
    osRelease: testCase.distro === 'ubuntu' ? 'Ubuntu 22.04.5 LTS' : testCase.distro === 'debian' ? 'Debian GNU/Linux 13 (trixie)' : 'Fedora Linux 44',
    glibcVersion: testCase.distro === 'ubuntu' ? '2.35' : testCase.distro === 'debian' ? '2.41' : '2.42',
    glibcRequirements: { electron: '2.35', betterSqlite3: '2.31', lanceDb: '2.34' },
    installExitCode: 0,
    launchExitCode: 0,
    nativeSqliteValue: 1,
    nativeLanceDbOperationSucceeded: true,
    appImageMode: testCase.format === 'appimage' ? 'extract-and-run' : null,
    appImageFuseStatus: testCase.format === 'appimage' ? 'unavailable' : null,
    appImageExtractionExitCode: testCase.format === 'appimage' ? 0 : null,
    desktopLaunchMode: testCase.format === 'appimage' ? 'extract-and-run' : 'installed-package',
    desktopLaunchExitCode: 0,
    desktopWindowReady: true,
    desktopRendererLoaded: true,
    desktopPreloadApiReady: true,
    desktopAppRootReady: true,
    cleanupSucceeded: true,
  }))
}

describe('Linux package smoke contract', () => {
  it('covers deb on Ubuntu and Debian, rpm on Fedora, and AppImage on all three', () => {
    const cases = createLinuxSmokeCases('1.3.6')

    expect(cases.map(({ format, distro, distroVersion }) => `${format}:${distro}-${distroVersion}`)).toEqual([
      'deb:ubuntu-22.04',
      'deb:debian-13',
      'rpm:fedora-44',
      'appimage:ubuntu-22.04',
      'appimage:debian-13',
      'appimage:fedora-44',
    ])
    expect(cases.map(({ artifact }) => artifact)).toEqual([
      'inkweaver-linux-x64-1.3.6.deb',
      'inkweaver-linux-x64-1.3.6.deb',
      'inkweaver-linux-x64-1.3.6.rpm',
      'inkweaver-linux-x64-1.3.6.AppImage',
      'inkweaver-linux-x64-1.3.6.AppImage',
      'inkweaver-linux-x64-1.3.6.AppImage',
    ])
    expect(LINUX_SMOKE_TARGETS).toHaveLength(6)
  })

  it('launches in a private Xvfb session without relying on distro-specific xvfb-run packaging', () => {
    const source = readFileSync(new URL('../smoke-linux-packages.mjs', import.meta.url), 'utf8')
    expect(source).toContain('Xvfb :99')
    expect(source).toContain('export DISPLAY=:99')
    expect(source).not.toContain('xvfb-run')
    expect(source).toContain("['run', '--rm', '--interactive', '--platform'")
  })

  it('probes AppImage extraction independently and launches the packaged desktop as an unprivileged user', () => {
    const source = readFileSync(new URL('../smoke-linux-packages.mjs', import.meta.url), 'utf8')

    expect(source).toContain("appimage_fuse_status=failed")
    expect(source).toContain("appimage_fuse_status=unavailable")
    expect(source).toContain('AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN')
    expect(source).toContain('runuser -u nobody -- env')
    expect(source).toContain('--appimage-extract-and-run --ai-novel-release-desktop-smoke=')
    expect(source).toContain('desktopEvidenceById')
  })

  it('emits syntax-valid Bash for each distro-specific package smoke group', () => {
    const createContainerScript = (linuxSmokeModule as unknown as {
      createLinuxSmokeContainerScript: (cases: ReturnType<typeof createLinuxSmokeCases>, tokens: { vector: string; desktop: string }) => string
    }).createLinuxSmokeContainerScript
    const groups = new Map<string, ReturnType<typeof createLinuxSmokeCases>>()
    for (const testCase of createLinuxSmokeCases('1.3.6')) {
      groups.set(testCase.image, [...(groups.get(testCase.image) ?? []), testCase])
    }

    expect(typeof createContainerScript).toBe('function')
    for (const cases of groups.values()) {
      const result = spawnSync('bash', ['-n'], {
        input: createContainerScript(cases, { vector: 'a'.repeat(32), desktop: 'b'.repeat(32) }),
        encoding: 'utf8',
      })
      expect(result.error?.message).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
    }
  })

  it('rejects incomplete, failed, or unsupported-distro observations', () => {
    const cases = createLinuxSmokeCases('1.3.6')
    const valid = cases.map(testCase => ({
      ...testCase,
      imageDigest: `sha256:${'a'.repeat(64)}`,
      osRelease: testCase.distro === 'ubuntu' ? 'Ubuntu 22.04.5 LTS' : testCase.distro === 'debian' ? 'Debian GNU/Linux 13 (trixie)' : 'Fedora Linux 44',
      image: testCase.image,
      glibcVersion: testCase.distro === 'ubuntu' ? '2.35' : testCase.distro === 'debian' ? '2.41' : '2.42',
      glibcRequirements: { electron: '2.35', betterSqlite3: '2.31', lanceDb: '2.34' },
      installExitCode: 0,
      launchExitCode: 0,
      nativeSqliteValue: 1,
      nativeLanceDbOperationSucceeded: true,
      appImageMode: testCase.format === 'appimage' ? 'extract-and-run' : null,
      appImageFuseStatus: testCase.format === 'appimage' ? 'unavailable' : null,
      appImageExtractionExitCode: testCase.format === 'appimage' ? 0 : null,
      desktopLaunchMode: testCase.format === 'appimage' ? 'extract-and-run' : 'installed-package',
      desktopLaunchExitCode: 0,
      desktopWindowReady: true,
      desktopRendererLoaded: true,
      desktopPreloadApiReady: true,
      desktopAppRootReady: true,
      cleanupSucceeded: true,
    }))

    expect(validateLinuxSmokeResults(valid)).toMatchObject({
      schemaVersion: 1,
      kind: 'linux-package-smoke',
      distroVersions: ['ubuntu-22.04', 'debian-13', 'fedora-44'],
      successfulCaseCount: 6,
      cases: expect.arrayContaining([
        expect.objectContaining({ distro: 'debian', glibcVersion: '2.41' }),
        expect.objectContaining({ distro: 'fedora', glibcVersion: '2.42' }),
      ]),
    })
    expect(() => validateLinuxSmokeResults(valid.slice(1))).toThrow(/exact Linux smoke case set/)
    expect(() => validateLinuxSmokeResults(valid.map((result, index) => index === 0
      ? { ...result, launchExitCode: 1 }
      : result))).toThrow(/launch failed/)
    expect(() => validateLinuxSmokeResults(valid.map((result, index) => index === 0
      ? { ...result, image: 'ubuntu:latest' }
      : result))).toThrow(/distro image identity/)
    expect(() => validateLinuxSmokeResults(valid.map((result, index) => index === 0
      ? { ...result, glibcRequirements: { ...result.glibcRequirements, lanceDb: '2.36' } }
      : result))).toThrow(/GLIBC requirement exceeds/)
  })

  it('rejects a package launch that never loads its packaged desktop renderer and preload', () => {
    const results = createValidLinuxSmokeResults()
    results[0]!.desktopRendererLoaded = false

    expect(() => validateLinuxSmokeResults(results)).toThrow(/desktop startup failed/)
  })

  it('requires AppImage extraction smoke even when the FUSE vector smoke succeeds', () => {
    const results = createValidLinuxSmokeResults()
    for (const result of results.filter(candidate => candidate.format === 'appimage')) {
      result.appImageFuseStatus = 'passed'
      result.appImageExtractionExitCode = null
    }

    expect(() => validateLinuxSmokeResults(results)).toThrow(/extract-and-run smoke failed/)
  })

  it('records an unsuccessful FUSE attempt explicitly when extraction startup succeeds', () => {
    const results = createValidLinuxSmokeResults()
    for (const result of results.filter(candidate => candidate.format === 'appimage')) {
      result.appImageFuseStatus = 'failed'
      result.appImageMode = 'extract-and-run'
      result.appImageExtractionExitCode = 0
    }

    expect(validateLinuxSmokeResults(results).cases.filter(result => result.format === 'appimage'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ appImageFuseStatus: 'failed', appImageMode: 'extract-and-run', appImageExtractionExitCode: 0 }),
      ]))
  })
})
