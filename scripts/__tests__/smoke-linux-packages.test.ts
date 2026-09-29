import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  LINUX_SMOKE_TARGETS,
  createLinuxSmokeCases,
  validateLinuxSmokeResults,
} from '../smoke-linux-packages.mjs'

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
})
