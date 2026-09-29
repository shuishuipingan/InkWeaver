import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalPnpmLockfileSha256 } from '../canonical-pnpm-lockfile-hash.mjs'
import { createLinuxSmokeCases, validateLinuxSmokeResults } from '../smoke-linux-packages.mjs'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(testDirectory, '..', '..')
const evidenceScript = path.join(repositoryRoot, 'scripts', 'release-evidence-v2.mjs')
const releaseVersion = (JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { version: string }).version
const fixtures: string[] = []
const WINDOWS_COMMAND_STEPS = [
  'install-locked-dependencies',
  'install-playwright-chromium',
  'renderer-browser-tests',
  'complete-windows-release-gate',
]

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-novel-release-evidence-v2-'))
  fixtures.push(root)
  return root
}

function sha256(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function validWindowsReceipt(name: string, releaseRoot: string) {
  const base = { schemaVersion: 2, accepted: true, observations: [`direct ${name} observation`] }
  const reference = (kind: string, file: string) => ({
    kind,
    evidencePath: `qualification/${file}`,
    sha256: sha256(path.join(releaseRoot, 'qualification', file)),
  })
  const receipts: Record<string, unknown> = {
    install: { ...base, kind: 'windows-install', direct: { installerExitCode: 0, installedExecutable: 'C:/AI/InkWeaver.exe', installedExecutableExists: true } },
    launch: { ...base, kind: 'windows-launch', expectedVersion: releaseVersion, direct: { executablePath: 'C:/AI/InkWeaver.exe', productVersion: `${releaseVersion}.0`, processId: 101, processStartTimeTicks: '12345', visibleMainWindowCount: 1 } },
    'quiet-window': { ...base, kind: 'windows-final-quiet-window', direct: { monitorState: 'step-completed', monitorStep: 'final:quiet', quietWindowSeconds: 5, completedAt: '2026-08-10T14:57:30.3051843Z' } },
    'error-dialogs': { ...base, kind: 'windows-error-dialogs', direct: { monitorState: 'step-completed', monitorStep: 'final:quiet', newProductErrorDialogCount: 0, observedThrough: '2026-08-10T14:57:30.3051843Z' } },
    uninstall: { ...base, kind: 'windows-uninstall', direct: { installedExecutableExists: false, installDirectoryState: 'absent', allowedSystemResiduals: [] } },
    'upgrade-data': { ...base, kind: 'windows-upgrade-data', direct: { previousVersion: '0.2.5', legacyTableCount: 11, preservedAssetCount: 1, vectorDimension: 768, queryResultCount: 1 } },
    'native-abi': { ...base, kind: 'windows-native-abi', direct: { restoreMode: 'monitored', nodeModuleAbi: '127', verificationTest: 'electron/repositories/__tests__/character-repository.test.ts' } },
    'packaged-smoke': { ...base, kind: 'windows-packaged-smoke-summary', direct: { evidenceCount: 3, evidenceKinds: ['packaged-vector-smoke', 'packaged-official-homepage-smoke', 'packaged-skin-smoke'] }, evidence: [
      reference('packaged-vector-smoke', 'packaged-vector-smoke.json'),
      reference('packaged-official-homepage-smoke', 'packaged-official-homepage-smoke.json'),
      reference('packaged-skin-smoke', 'packaged-skin-smoke.json'),
    ] },
    signing: { ...base, kind: 'windows-signing', direct: { authenticodeStatus: 'NotSigned', installerSha256: sha256(path.join(releaseRoot, `inkweaver-setup-${releaseVersion}.exe`)) }, status: 'unsigned', validationResult: 'NotSigned', unsignedDistributionImpact: 'Windows may display an unknown-publisher warning.' },
  }
  return receipts[name]
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('release evidence v2 CLI', () => {
  it('freezes Linux x64 qualification with all three package formats and receipt paths', () => {
    const evidenceRoot = fixture()
    const commit = 'f'.repeat(40)
    const dispatchInputs = {
      expected_sha: commit,
      release_tag: `v${releaseVersion}`,
      release_version: releaseVersion,
      profile_path: '.release/release-profile.json',
    }

    const result = spawnSync(process.execPath, [
      evidenceScript,
      'init',
      '--platform', 'linux-x64',
      '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver',
      '--commit', commit,
      '--run-id', '105',
      '--run-attempt', '1',
      '--runner-label', 'ubuntu-24.04',
      '--image-os', 'ubuntu24',
      '--image-version', '20260901.1',
      '--expected-node-version', process.versions.node,
      '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/linux-cloud-build.yml',
      '--workflow-name', 'Linux x64 cloud package qualification',
      '--actor', 'release-operator',
      '--event', 'workflow_dispatch',
      '--dispatch-inputs-json', JSON.stringify(dispatchInputs),
    ], { cwd: repositoryRoot, encoding: 'utf8' })

    expect(result.status, result.stderr).toBe(0)
    const contract = JSON.parse(readFileSync(path.join(evidenceRoot, 'release-contract.json'), 'utf8'))
    expect(contract.frozen).toMatchObject({
      platform: 'linux-x64',
      workflow: {
        path: '.github/workflows/linux-cloud-build.yml',
        name: 'Linux x64 cloud package qualification',
        dispatchInputs,
      },
      artifactSet: [
        { path: `release/${releaseVersion}/inkweaver-linux-x64-${releaseVersion}.AppImage`, role: 'appimage' },
        { path: `release/${releaseVersion}/inkweaver-linux-x64-${releaseVersion}.AppImage.sha256`, role: 'appimage-checksum' },
        { path: `release/${releaseVersion}/inkweaver-linux-x64-${releaseVersion}.deb`, role: 'deb' },
        { path: `release/${releaseVersion}/inkweaver-linux-x64-${releaseVersion}.deb.sha256`, role: 'deb-checksum' },
        { path: `release/${releaseVersion}/inkweaver-linux-x64-${releaseVersion}.rpm`, role: 'rpm' },
        { path: `release/${releaseVersion}/inkweaver-linux-x64-${releaseVersion}.rpm.sha256`, role: 'rpm-checksum' },
      ],
      acceptance: {
        evidenceFiles: [
          'qualification/acceptance/install.json',
          'qualification/acceptance/launch.json',
          'qualification/acceptance/native-abi.json',
          'qualification/acceptance/packaged-smoke.json',
          'qualification/acceptance/signing.json',
        ],
      },
    })
  })

  it('finalizes Linux package, checksum, smoke, and unsigned disclosure evidence as one exact bundle', () => {
    const evidenceRoot = fixture()
    const releaseRoot = fixture()
    const commit = '9'.repeat(40)
    const version = releaseVersion
    const dispatchInputs = {
      expected_sha: commit,
      release_tag: `v${releaseVersion}`,
      release_version: releaseVersion,
      profile_path: '.release/release-profile.json',
    }
    const init = spawnSync(process.execPath, [
      evidenceScript, 'init', '--platform', 'linux-x64', '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver', '--commit', commit, '--run-id', '106', '--run-attempt', '1',
      '--runner-label', 'ubuntu-24.04', '--image-os', 'ubuntu24', '--image-version', '20260901.1',
      '--expected-node-version', process.versions.node, '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/linux-cloud-build.yml', '--workflow-name', 'Linux x64 cloud package qualification',
      '--actor', 'release-operator', '--event', 'workflow_dispatch', '--dispatch-inputs-json', JSON.stringify(dispatchInputs),
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(init.status, init.stderr).toBe(0)

    const expectedCases = createLinuxSmokeCases(version)
    const smokeCases = expectedCases.map(testCase => ({
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
    const smokeEvidence = validateLinuxSmokeResults(smokeCases)
    const vectorEvidence = {
      schemaVersion: 1,
      kind: 'packaged-vector-smoke',
      nativeBindings: { betterSqlite3: { binding: 'better-sqlite3', operation: 'SELECT 1', value: 1 } },
      projectA: { semanticResultCount: 1 },
      projectB: { sameFingerprintRebuilt: true },
    }
    mkdirSync(path.join(releaseRoot, 'qualification'), { recursive: true })
    writeJson(path.join(releaseRoot, 'qualification', 'linux-package-smoke.json'), smokeEvidence)
    writeJson(path.join(releaseRoot, 'qualification', 'packaged-vector-smoke.json'), vectorEvidence)
    for (const artifact of expectedCases.filter(testCase => testCase.format !== 'appimage' || testCase.distro === 'ubuntu').map(testCase => testCase.artifact)) {
      writeFileSync(path.join(releaseRoot, artifact), `package:${artifact}`, 'utf8')
    }
    for (const step of [
      'install-locked-dependencies', 'install-playwright-chromium', 'renderer-browser-tests',
      'test-suite', 'build-linux-x64-package', 'linux-package-smoke',
    ]) {
      const recorded = spawnSync(process.execPath, [evidenceScript, 'record', '--evidence-root', evidenceRoot, '--step', step, '--', process.execPath, '-e', ''], { cwd: repositoryRoot, encoding: 'utf8' })
      expect(recorded.status, recorded.stderr).toBe(0)
    }

    const receipt = (kind: string, direct: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
      schemaVersion: 2, kind: `linux-${kind}`, platform: 'linux', arch: 'x64', accepted: true,
      observations: [`Direct Linux ${kind} qualification observation`], direct, ...extra,
    })
    const architecture = { target: 'x64', runnerMachine: 'x86_64' }
    const acceptanceRoot = path.join(evidenceRoot, 'acceptance')
    writeJson(path.join(acceptanceRoot, 'install.json'), receipt('install', {
      architecture,
      cases: smokeEvidence.cases.map(({ id, format, distro, distroVersion, image, imageDigest, osRelease, artifact, installExitCode }) => ({ id, format, distro, distroVersion, image, imageDigest, osRelease, artifact, installExitCode })),
    }))
    writeJson(path.join(acceptanceRoot, 'launch.json'), receipt('launch', {
      architecture,
      cases: smokeEvidence.cases.map(({ id, image, imageDigest, osRelease, glibcVersion, glibcRequirements, launchExitCode, appImageMode, appImageFuseStatus, appImageExtractionExitCode, desktopLaunchMode, desktopLaunchExitCode, desktopWindowReady, desktopRendererLoaded, desktopPreloadApiReady, desktopAppRootReady, cleanupSucceeded }) => ({
        id, image, imageDigest, osRelease, glibcVersion, glibcRequirements, launchExitCode, appImageMode, appImageFuseStatus,
        appImageExtractionExitCode, desktopLaunchMode, desktopLaunchExitCode, desktopWindowReady, desktopRendererLoaded,
        desktopPreloadApiReady, desktopAppRootReady, cleanupSucceeded,
      })),
    }))
    writeJson(path.join(acceptanceRoot, 'native-abi.json'), receipt('native-abi', {
      architecture,
      betterSqlite3: vectorEvidence.nativeBindings.betterSqlite3,
      lanceDb: { binding: '@lancedb/lancedb-linux-x64-gnu', projectA: true, projectBBackfill: true },
    }))
    writeJson(path.join(acceptanceRoot, 'packaged-smoke.json'), receipt('packaged-smoke', {
      architecture, evidenceCount: 2, evidenceKinds: ['linux-package-smoke', 'packaged-vector-smoke'],
    }, { evidence: [
      { kind: 'linux-package-smoke', path: 'qualification/linux-package-smoke.json', sha256: sha256(path.join(releaseRoot, 'qualification', 'linux-package-smoke.json')) },
      { kind: 'packaged-vector-smoke', path: 'qualification/packaged-vector-smoke.json', sha256: sha256(path.join(releaseRoot, 'qualification', 'packaged-vector-smoke.json')) },
    ] }))
    writeJson(path.join(acceptanceRoot, 'signing.json'), receipt('signing', {
      architecture, status: 'unsigned', distributionImpact: 'Unsigned Linux packages; verify the SHA-256 checksum before installation.',
    }, {
      status: 'unsigned', validationResult: 'No Linux package signing identity is configured.',
      unsignedDistributionImpact: 'Unsigned Linux packages; verify the SHA-256 checksum before installation.',
    }))

    const finalized = spawnSync(process.execPath, [evidenceScript, 'finalize', '--platform', 'linux-x64', '--evidence-root', evidenceRoot, '--release-root', releaseRoot], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(finalized.status, finalized.stderr).toBe(0)
    for (const artifact of ['AppImage', 'deb', 'rpm']) {
      const packageName = `inkweaver-linux-x64-${version}.${artifact}`
      expect(existsSync(path.join(releaseRoot, `${packageName}.sha256`))).toBe(true)
      expect(readFileSync(path.join(releaseRoot, `${packageName}.sha256`), 'utf8')).toContain(packageName)
    }
    const manifest = JSON.parse(readFileSync(path.join(releaseRoot, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({ platform: 'linux-x64', architecture: 'x64', version })
    expect(manifest.artifacts).toHaveLength(6)

    const verifyArguments = [
      evidenceScript, 'verify-bundle', '--platform', 'linux-x64', '--bundle-root', releaseRoot,
      '--expected-commit', commit,
      '--expected-lockfile-sha256', canonicalPnpmLockfileSha256(path.join(repositoryRoot, 'pnpm-lock.yaml')),
      '--version', version, '--run-attempt', '1',
    ]
    const verified = spawnSync(process.execPath, verifyArguments, { cwd: repositoryRoot, encoding: 'utf8' })
    expect(verified.status, verified.stderr).toBe(0)
    expect(JSON.parse(verified.stdout)).toMatchObject({ platform: 'linux-x64', releaseFiles: expect.arrayContaining([`inkweaver-linux-x64-${version}.AppImage`, `inkweaver-linux-x64-${version}.deb`, `inkweaver-linux-x64-${version}.rpm`]) })

    const lockfileMismatch = spawnSync(process.execPath, [
      ...verifyArguments.filter((argument, index) => argument !== '--expected-lockfile-sha256' && verifyArguments[index - 1] !== '--expected-lockfile-sha256'),
      '--expected-lockfile-sha256', '0'.repeat(64),
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(lockfileMismatch.status).not.toBe(0)
    expect(lockfileMismatch.stderr).toContain('canonical lockfile hash does not match')

    rmSync(path.join(releaseRoot, `inkweaver-linux-x64-${version}.rpm`))
    const missingRpm = spawnSync(process.execPath, verifyArguments, { cwd: repositoryRoot, encoding: 'utf8' })
    expect(missingRpm.status).not.toBe(0)
    expect(missingRpm.stderr).toContain('Qualification bundle file set is not exact')
  }, 15_000)

  it('freezes a Windows qualification contract before build work and binds the ledger to its raw hash', () => {
    const evidenceRoot = fixture()
    const commit = 'a'.repeat(40)

    const result = spawnSync(process.execPath, [
      evidenceScript,
      'init',
      '--platform', 'windows',
      '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver',
      '--commit', commit,
      '--run-id', '101',
      '--run-attempt', '2',
      '--runner-label', 'windows-2022',
      '--image-os', 'win22',
      '--image-version', '20260726.1',
      '--expected-node-version', process.versions.node,
      '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/windows-cloud-build-test.yml',
      '--workflow-name', 'Windows cloud package qualification',
      '--actor', 'release-operator',
      '--event', 'workflow_dispatch',
      '--dispatch-inputs-json', '{}',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })

    expect(result.status, result.stderr).toBe(0)

    const contractPath = path.join(evidenceRoot, 'release-contract.json')
    const ledgerPath = path.join(evidenceRoot, 'run-ledger.json')
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))

    expect(contract).toMatchObject({
      schemaVersion: 2,
      stage: 'qualification',
      repository: 'shuishuipingan/InkWeaver',
      frozen: {
        commit,
        tag: `v${releaseVersion}`,
        version: releaseVersion,
        platform: 'windows',
        workflow: {
          path: '.github/workflows/windows-cloud-build-test.yml',
          name: 'Windows cloud package qualification',
          actor: 'release-operator',
          event: 'workflow_dispatch',
          dispatchInputs: {},
        },
        run: {
          id: '101',
          attempt: '2',
        },
        runner: {
          expectedLabel: 'windows-2022',
          actualImageOS: 'win22',
          actualImageVersion: '20260726.1',
        },
      },
    })
    expect(contract.frozen.acceptance.evidenceFiles).toEqual([
      'qualification/acceptance/install.json',
      'qualification/acceptance/launch.json',
      'qualification/acceptance/quiet-window.json',
      'qualification/acceptance/error-dialogs.json',
      'qualification/acceptance/uninstall.json',
      'qualification/acceptance/upgrade-data.json',
      'qualification/acceptance/native-abi.json',
      'qualification/acceptance/packaged-smoke.json',
      'qualification/acceptance/signing.json',
    ])
    expect(contract.frozen.appToolchain).toMatchObject({
      expectedNodeVersion: process.versions.node,
      actualNodeVersion: process.versions.node,
      expectedPackageManagerVersion: '11.11.0',
      actualPackageManagerVersion: '11.11.0',
      source: {
        expectedNodeVersion: 'qualification workflow init --expected-node-version',
        actualPackageManagerVersion: 'pnpm --version',
      },
    })
    expect(ledger).toMatchObject({
      schemaVersion: 2,
      contractSha256: sha256(contractPath),
      run: {
        id: '101',
        attempt: '2',
        commit,
        workflow: {
          path: '.github/workflows/windows-cloud-build-test.yml',
          name: 'Windows cloud package qualification',
          actor: 'release-operator',
          event: 'workflow_dispatch',
          dispatchInputs: {},
        },
      },
      commands: [],
    })
  })

  it('records a bounded command result without persisting its arguments', () => {
    const evidenceRoot = fixture()
    const init = spawnSync(process.execPath, [
      evidenceScript,
      'init',
      '--platform', 'macos-arm64',
      '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver',
      '--commit', 'b'.repeat(40),
      '--run-id', '202',
      '--run-attempt', '1',
      '--runner-label', 'macos-14',
      '--image-os', 'macos14',
      '--image-version', '20260726.1',
      '--expected-node-version', process.versions.node,
      '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/macos-arm64-cloud-build.yml',
      '--workflow-name', 'macOS ARM64 cloud package qualification',
      '--actor', 'release-operator',
      '--event', 'workflow_dispatch',
      '--dispatch-inputs-json', '{}',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    expect(init.status, init.stderr).toBe(0)

    const result = spawnSync(process.execPath, [
      evidenceScript,
      'record',
      '--evidence-root', evidenceRoot,
      '--step', 'locked-dependencies',
      '--',
      process.execPath,
      '-e',
      'process.stdout.write("not-for-ledger")',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })

    expect(result.status, result.stderr).toBe(0)
    const ledgerText = readFileSync(path.join(evidenceRoot, 'run-ledger.json'), 'utf8')
    expect(ledgerText).not.toContain('not-for-ledger')
    expect(JSON.parse(ledgerText).commands).toEqual([
      expect.objectContaining({
        step: 'locked-dependencies',
        command: { executable: path.basename(process.execPath), argumentCount: 2 },
        exitCode: 0,
        timedOut: false,
      }),
    ])
  })

  it('keeps command evidence ordered when the runner wall clock moves backward', () => {
    const evidenceRoot = fixture()
    const init = spawnSync(process.execPath, [
      evidenceScript,
      'init',
      '--platform', 'macos-arm64',
      '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver',
      '--commit', 'c'.repeat(40),
      '--run-id', '204',
      '--run-attempt', '1',
      '--runner-label', 'macos-14',
      '--image-os', 'macos14',
      '--image-version', '20260726.1',
      '--expected-node-version', process.versions.node,
      '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/macos-arm64-cloud-build.yml',
      '--workflow-name', 'macOS ARM64 cloud package qualification',
      '--actor', 'release-operator',
      '--event', 'workflow_dispatch',
      '--dispatch-inputs-json', '{}',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(init.status, init.stderr).toBe(0)

    const ledgerPath = path.join(evidenceRoot, 'run-ledger.json')
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
    const futureStart = new Date(Date.now() + 60_000).toISOString()
    ledger.run.startedAt = futureStart
    writeJson(ledgerPath, ledger)

    const recorded = spawnSync(process.execPath, [
      evidenceScript,
      'record',
      '--evidence-root', evidenceRoot,
      '--step', 'clock-rollback-probe',
      '--', process.execPath, '-e', '',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(recorded.status, recorded.stderr).toBe(0)

    const [command] = JSON.parse(readFileSync(ledgerPath, 'utf8')).commands
    expect(Date.parse(command.startedAt)).toBeGreaterThanOrEqual(Date.parse(futureStart))
    expect(Date.parse(command.endedAt)).toBeGreaterThanOrEqual(Date.parse(command.startedAt))
  })

  it('freezes Intel macOS evidence with an x64-only artifact and workflow identity', () => {
    const evidenceRoot = fixture()
    const init = spawnSync(process.execPath, [
      evidenceScript,
      'init',
      '--platform', 'macos-x64',
      '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver',
      '--commit', 'e'.repeat(40),
      '--run-id', '203',
      '--run-attempt', '1',
      '--runner-label', 'macos-13',
      '--image-os', 'macos13',
      '--image-version', '20260726.1',
      '--expected-node-version', process.versions.node,
      '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/macos-x64-cloud-build.yml',
      '--workflow-name', 'macOS Intel x64 cloud package qualification',
      '--actor', 'release-operator',
      '--event', 'workflow_dispatch',
      '--dispatch-inputs-json', '{}',
    ], { cwd: repositoryRoot, encoding: 'utf8' })

    expect(init.status, init.stderr).toBe(0)
    const contract = JSON.parse(readFileSync(path.join(evidenceRoot, 'release-contract.json'), 'utf8'))
    expect(contract.frozen).toMatchObject({
      platform: 'macos-x64',
      workflow: {
        path: '.github/workflows/macos-x64-cloud-build.yml',
        name: 'macOS Intel x64 cloud package qualification',
      },
      artifactSet: [
        { path: `release/${releaseVersion}/inkweaver-mac-x64-${releaseVersion}-installer.dmg`, role: 'dmg' },
        { path: `release/${releaseVersion}/inkweaver-mac-x64-${releaseVersion}-installer.dmg.sha256`, role: 'dmg-checksum' },
      ],
    })
  })

  it('rejects empty command evidence and placeholder receipts before finalizing a semantic Windows bundle', () => {
    const evidenceRoot = fixture()
    const releaseRoot = fixture()
    const version = releaseVersion
    const init = spawnSync(process.execPath, [
      evidenceScript,
      'init',
      '--platform', 'windows',
      '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver',
      '--commit', 'c'.repeat(40),
      '--run-id', '303',
      '--run-attempt', '1',
      '--runner-label', 'windows-2022',
      '--image-os', 'win22',
      '--image-version', '20260726.1',
      '--expected-node-version', process.versions.node,
      '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/windows-cloud-build-test.yml',
      '--workflow-name', 'Windows cloud package qualification',
      '--actor', 'release-operator',
      '--event', 'workflow_dispatch',
      '--dispatch-inputs-json', '{}',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(init.status, init.stderr).toBe(0)

    const installer = `inkweaver-setup-${version}.exe`
    writeFileSync(path.join(releaseRoot, installer), 'installer', 'utf8')
    writeFileSync(path.join(releaseRoot, `${installer}.blockmap`), 'blockmap', 'utf8')
    writeFileSync(path.join(releaseRoot, 'latest.yml'), `version: ${version}\n`, 'utf8')
    writeJson(path.join(releaseRoot, 'qualification', 'packaged-vector-smoke.json'), {
      schemaVersion: 1, kind: 'packaged-vector-smoke', direct: { packaged: true },
    })
    writeJson(path.join(releaseRoot, 'qualification', 'packaged-official-homepage-smoke.json'), {
      schemaVersion: 1, kind: 'packaged-official-homepage-smoke', direct: { packaged: true },
    })
    writeJson(path.join(releaseRoot, 'qualification', 'packaged-skin-smoke.json'), {
      schemaVersion: 1, kind: 'packaged-skin-smoke', direct: { packaged: true },
    })
    for (const receipt of [
      'install', 'launch', 'quiet-window', 'error-dialogs', 'uninstall', 'upgrade-data', 'native-abi', 'packaged-smoke',
    ]) {
      writeJson(path.join(evidenceRoot, 'acceptance', `${receipt}.json`), {
        schemaVersion: 2,
        kind: `windows-${receipt}`,
        accepted: true,
        observations: ['direct qualification observation'],
        direct: { receipt },
      })
    }
    writeJson(path.join(evidenceRoot, 'acceptance', 'signing.json'), {
      schemaVersion: 2,
      kind: 'windows-signing',
      accepted: true,
      observations: ['actual Authenticode inspection completed'],
      direct: { authenticodeStatus: 'NotSigned' },
      status: 'unsigned',
      validationResult: { tool: 'Get-AuthenticodeSignature', status: 'NotSigned' },
      unsignedDistributionImpact: 'Windows may show SmartScreen or enterprise-policy warnings.',
    })

    const rejected = spawnSync(process.execPath, [
      evidenceScript,
      'finalize',
      '--platform', 'windows',
      '--evidence-root', evidenceRoot,
      '--release-root', releaseRoot,
    ], { cwd: repositoryRoot, encoding: 'utf8' })

    expect(rejected.status).not.toBe(0)
    expect(rejected.stderr).toContain('Release evidence command set is not exact')

    for (const step of WINDOWS_COMMAND_STEPS) {
      const recorded = spawnSync(process.execPath, [
        evidenceScript,
        'record',
        '--evidence-root', evidenceRoot,
        '--step', step,
        '--', process.execPath, '-e', '',
      ], { cwd: repositoryRoot, encoding: 'utf8' })
      expect(recorded.status, recorded.stderr).toBe(0)
    }
    type LaunchReceipt = { expectedVersion?: unknown, direct: Record<string, unknown> }
    const writeSemanticReceipts = (timestamp?: string, mutateLaunch?: (receipt: LaunchReceipt) => void) => {
      for (const receipt of [
        'install', 'launch', 'quiet-window', 'error-dialogs', 'uninstall', 'upgrade-data', 'native-abi', 'packaged-smoke', 'signing',
      ]) {
        const value = validWindowsReceipt(receipt, releaseRoot) as LaunchReceipt
        if (timestamp !== undefined && receipt === 'quiet-window') value.direct.completedAt = timestamp
        if (timestamp !== undefined && receipt === 'error-dialogs') value.direct.observedThrough = timestamp
        if (receipt === 'launch') mutateLaunch?.(value)
        writeJson(path.join(evidenceRoot, 'acceptance', `${receipt}.json`), value)
      }
    }
    for (const invalidTimestamp of [
      '2026-08-10T14:57:30.3051843+00:00',
      'not-a-timestamp',
      '2026-02-30T14:57:30Z',
      '2026-08-10T24:00:00Z',
      '2026-08-10T14:57:30.1234567890Z',
    ]) {
      writeSemanticReceipts(invalidTimestamp)
      const invalidTimestampResult = spawnSync(process.execPath, [
        evidenceScript,
        'finalize',
        '--platform', 'windows',
        '--evidence-root', evidenceRoot,
        '--release-root', releaseRoot,
      ], { cwd: repositoryRoot, encoding: 'utf8' })
      expect(invalidTimestampResult.status).not.toBe(0)
      expect(invalidTimestampResult.stderr).toContain('Windows error-dialog receipt facts are invalid')
    }
    for (const mutateLaunch of [
      (receipt: LaunchReceipt) => { receipt.direct.productVersion = `${releaseVersion}.1` },
      (receipt: LaunchReceipt) => { receipt.direct.productVersion = `${releaseVersion}-beta.1` },
      (receipt: LaunchReceipt) => { receipt.direct.productVersion = 'garbage' },
      (receipt: LaunchReceipt) => { delete receipt.direct.productVersion },
      (receipt: LaunchReceipt) => { receipt.expectedVersion = '0.8.0' },
      (receipt: LaunchReceipt) => { delete receipt.expectedVersion },
    ]) {
      writeSemanticReceipts(undefined, mutateLaunch)
      const invalidLaunchResult = spawnSync(process.execPath, [
        evidenceScript,
        'finalize',
        '--platform', 'windows',
        '--evidence-root', evidenceRoot,
        '--release-root', releaseRoot,
      ], { cwd: repositoryRoot, encoding: 'utf8' })
      expect(invalidLaunchResult.status).not.toBe(0)
      expect(invalidLaunchResult.stderr).toContain('Windows launch receipt facts are invalid')
    }
    writeSemanticReceipts()

    const alternatePreviousVersion = validWindowsReceipt('upgrade-data', releaseRoot) as LaunchReceipt
    alternatePreviousVersion.direct.previousVersion = '1.0.0'
    writeJson(path.join(evidenceRoot, 'acceptance', 'upgrade-data.json'), alternatePreviousVersion)
    const alternatePreviousVersionResult = spawnSync(process.execPath, [
      evidenceScript,
      'finalize',
      '--platform', 'windows',
      '--evidence-root', evidenceRoot,
      '--release-root', releaseRoot,
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(alternatePreviousVersionResult.status, alternatePreviousVersionResult.stderr).toBe(0)

    const result = spawnSync(process.execPath, [
      evidenceScript,
      'finalize',
      '--platform', 'windows',
      '--evidence-root', evidenceRoot,
      '--release-root', releaseRoot,
    ], { cwd: repositoryRoot, encoding: 'utf8' })

    expect(result.status, result.stderr).toBe(0)
    expect(existsSync(path.join(releaseRoot, 'qualification', 'release-contract.json'))).toBe(true)
    expect(existsSync(path.join(releaseRoot, 'qualification', 'acceptance', 'signing.json'))).toBe(true)
    const manifest = JSON.parse(readFileSync(path.join(releaseRoot, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      platform: 'windows',
      version,
      contractSha256: sha256(path.join(releaseRoot, 'qualification', 'release-contract.json')),
      artifacts: [
        expect.objectContaining({ file: installer }),
        expect.objectContaining({ file: `${installer}.blockmap` }),
        expect.objectContaining({ file: 'latest.yml' }),
      ],
    })
    expect(manifest.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'qualification/release-contract.json' }),
      expect.objectContaining({ file: 'qualification/run-ledger.json' }),
      expect.objectContaining({ file: 'qualification/acceptance/install.json' }),
      expect.objectContaining({ file: 'qualification/acceptance/signing.json' }),
      expect.objectContaining({ file: 'qualification/packaged-vector-smoke.json' }),
    ]))
    const sums = readFileSync(path.join(releaseRoot, 'SHA256SUMS.txt'), 'utf8')
    expect(sums).toContain(`${sha256(path.join(releaseRoot, 'qualification', 'acceptance', 'signing.json'))} *qualification/acceptance/signing.json`)
    expect(sums).toContain(`${sha256(path.join(releaseRoot, 'manifest.json'))} *manifest.json`)

    const verifyArguments = [
      evidenceScript,
      'verify-bundle',
      '--platform', 'windows',
      '--bundle-root', releaseRoot,
      '--expected-commit', 'c'.repeat(40),
      '--expected-lockfile-sha256', canonicalPnpmLockfileSha256(path.join(repositoryRoot, 'pnpm-lock.yaml')),
      '--version', version,
    ]
    const missingRunAttempt = spawnSync(process.execPath, verifyArguments, { cwd: repositoryRoot, encoding: 'utf8' })
    expect(missingRunAttempt.status).not.toBe(0)
    expect(missingRunAttempt.stderr).toContain('Missing required option: --run-attempt')

    const verified = spawnSync(process.execPath, [
      ...verifyArguments,
      '--run-attempt', '1',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(verified.status, verified.stderr).toBe(0)
    expect(JSON.parse(verified.stdout)).toMatchObject({
      platform: 'windows',
      releaseFiles: [installer, `${installer}.blockmap`, 'latest.yml'],
    })
  }, 15_000)

  it('requires externally frozen expected toolchain versions and rejects a runtime mismatch', () => {
    const evidenceRoot = fixture()
    const baseArguments = [
      evidenceScript,
      'init',
      '--platform', 'windows',
      '--evidence-root', evidenceRoot,
      '--repository', 'shuishuipingan/InkWeaver',
      '--commit', 'd'.repeat(40),
      '--run-id', '404',
      '--run-attempt', '1',
      '--runner-label', 'windows-2022',
      '--image-os', 'win22',
      '--image-version', '20260726.1',
    ]

    const missingExpected = spawnSync(process.execPath, baseArguments, { cwd: repositoryRoot, encoding: 'utf8' })
    expect(missingExpected.status).not.toBe(0)
    expect(missingExpected.stderr).toContain('Missing required option: --expected-node-version')

    const mismatch = spawnSync(process.execPath, [
      ...baseArguments,
      '--expected-node-version', '0.0.0',
      '--expected-pnpm-version', '11.11.0',
      '--workflow-path', '.github/workflows/windows-cloud-build-test.yml',
      '--workflow-name', 'Windows cloud package qualification',
      '--actor', 'release-operator',
      '--event', 'workflow_dispatch',
      '--dispatch-inputs-json', '{}',
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(mismatch.status).not.toBe(0)
    expect(mismatch.stderr).toContain('Installed Node version')
    expect(existsSync(path.join(evidenceRoot, 'release-contract.json'))).toBe(false)
  })
})
