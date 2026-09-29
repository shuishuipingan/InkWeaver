import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { TextDecoder } from 'node:util'
import { canonicalPnpmLockfileSha256 } from './canonical-pnpm-lockfile-hash.mjs'
import { createLinuxSmokeCases, validateLinuxSmokeResults } from './smoke-linux-packages.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..')

const MACOS_QUALIFICATION_ENTITIES = Object.freeze({
  'macos-arm64': {
    architecture: 'arm64',
    runnerMachineArchitecture: 'arm64',
    workflowPath: '.github/workflows/macos-arm64-cloud-build.yml',
    workflowName: 'macOS ARM64 cloud package qualification',
    commandProfileBuildStep: 'build-macos-arm64-package',
  },
  'macos-x64': {
    architecture: 'x64',
    runnerMachineArchitecture: 'x86_64',
    workflowPath: '.github/workflows/macos-x64-cloud-build.yml',
    workflowName: 'macOS Intel x64 cloud package qualification',
    commandProfileBuildStep: 'build-macos-x64-package',
  },
})

const LINUX_QUALIFICATION_ENTITY = Object.freeze({
  architecture: 'x64',
  runnerMachineArchitecture: 'x86_64',
  workflowPath: '.github/workflows/linux-cloud-build.yml',
  workflowName: 'Linux x64 cloud package qualification',
})

function isMacosQualificationEntity(platform) {
  return Object.hasOwn(MACOS_QUALIFICATION_ENTITIES, platform)
}

function macosQualificationEntity(platform) {
  assert(isMacosQualificationEntity(platform), 'platform must name a specific macOS qualification entity')
  return MACOS_QUALIFICATION_ENTITIES[platform]
}

const MACOS_ACCEPTANCE_PROFILE = Object.freeze([
  'qualification/acceptance/dmg-mount.json',
  'qualification/acceptance/packaged-smoke.json',
  'qualification/acceptance/signing.json',
])

export const ACCEPTANCE_PROFILES = {
  windows: [
    'qualification/acceptance/install.json',
    'qualification/acceptance/launch.json',
    'qualification/acceptance/quiet-window.json',
    'qualification/acceptance/error-dialogs.json',
    'qualification/acceptance/uninstall.json',
    'qualification/acceptance/upgrade-data.json',
    'qualification/acceptance/native-abi.json',
    'qualification/acceptance/packaged-smoke.json',
    'qualification/acceptance/signing.json',
  ],
  'macos-arm64': MACOS_ACCEPTANCE_PROFILE,
  'macos-x64': MACOS_ACCEPTANCE_PROFILE,
  'linux-x64': [
    'qualification/acceptance/install.json',
    'qualification/acceptance/launch.json',
    'qualification/acceptance/native-abi.json',
    'qualification/acceptance/packaged-smoke.json',
    'qualification/acceptance/signing.json',
  ],
}

export const QUALIFICATION_WORKFLOWS = {
  windows: {
    path: '.github/workflows/windows-cloud-build-test.yml',
    name: 'Windows cloud package qualification',
  },
  'macos-arm64': {
    path: MACOS_QUALIFICATION_ENTITIES['macos-arm64'].workflowPath,
    name: MACOS_QUALIFICATION_ENTITIES['macos-arm64'].workflowName,
  },
  'macos-x64': {
    path: MACOS_QUALIFICATION_ENTITIES['macos-x64'].workflowPath,
    name: MACOS_QUALIFICATION_ENTITIES['macos-x64'].workflowName,
  },
  'linux-x64': {
    path: LINUX_QUALIFICATION_ENTITY.workflowPath,
    name: LINUX_QUALIFICATION_ENTITY.workflowName,
  },
}

export const COMMAND_PROFILES = {
  windows: [
    'install-locked-dependencies',
    'install-playwright-chromium',
    'renderer-browser-tests',
    'complete-windows-release-gate',
  ],
  'macos-arm64': [
    'install-locked-dependencies',
    'install-playwright-chromium',
    'renderer-browser-tests',
    'build-native-secure-helper',
    'test-suite',
    'build-macos-arm64-package',
    'mounted-dmg-smoke',
  ],
  'macos-x64': [
    'install-locked-dependencies',
    'verify-lancedb-darwin-x64-binding',
    'install-playwright-chromium',
    'renderer-browser-tests',
    'build-native-secure-helper',
    'test-suite',
    'build-macos-x64-package',
    'mounted-dmg-smoke',
  ],
  'linux-x64': [
    'install-locked-dependencies',
    'install-playwright-chromium',
    'renderer-browser-tests',
    'test-suite',
    'build-linux-x64-package',
    'linux-package-smoke',
  ],
}

export const MACOS_FORMAL_DISTRIBUTION_POLICY = Object.freeze({
  codeSigning: 'ad_hoc_or_unsigned',
  notarization: 'not_notarized',
})

function codesignField(output, name) {
  const match = String(output).match(new RegExp(`^${name}=(.*)$`, 'm'))
  return match?.[1]?.trim() || null
}

export function classifyMacosCodeSigning({ detailsExitCode, verificationExitCode, detailsOutput }) {
  const output = String(detailsOutput)
  const signature = codesignField(output, 'Signature')
  const teamIdentifier = codesignField(output, 'TeamIdentifier')
  const authorities = [...output.matchAll(/^Authority=(.*)$/gm)]
    .map(match => match[1].trim())
    .filter(Boolean)
  const hasDeveloperIdIdentity = authorities.some(authority => authority.startsWith('Developer ID Application:'))
    && teamIdentifier !== null
    && teamIdentifier !== 'not set'
  let observed = 'unrecognized_signature'
  if (detailsExitCode === 0 && verificationExitCode === 0 && hasDeveloperIdIdentity) {
    observed = 'developer_id_signed'
  } else if (
    detailsExitCode === 0
    && verificationExitCode === 0
    && signature?.toLowerCase() === 'adhoc'
    && !hasDeveloperIdIdentity
  ) {
    observed = 'ad_hoc'
  } else if (
    detailsExitCode !== 0
    && verificationExitCode !== 0
    && signature === null
    && teamIdentifier === null
    && authorities.length === 0
  ) {
    observed = 'unsigned'
  }

  return { observed, signature, teamIdentifier, authorities, hasDeveloperIdIdentity }
}

const MACOS_PACKAGED_SMOKE_EVIDENCE = Object.freeze([
  { file: 'qualification/packaged-vector-smoke.json', kind: 'packaged-vector-smoke' },
  { file: 'qualification/packaged-official-homepage-smoke.json', kind: 'packaged-official-homepage-smoke' },
  { file: 'qualification/packaged-skin-smoke.json', kind: 'packaged-skin-smoke' },
  { file: 'qualification/macos-dmg-smoke.json', kind: 'macos-dmg-smoke' },
])

const PACKAGED_SMOKE_EVIDENCE = {
  windows: [
    { file: 'qualification/packaged-vector-smoke.json', kind: 'packaged-vector-smoke' },
    { file: 'qualification/packaged-official-homepage-smoke.json', kind: 'packaged-official-homepage-smoke' },
    { file: 'qualification/packaged-skin-smoke.json', kind: 'packaged-skin-smoke' },
  ],
  'macos-arm64': MACOS_PACKAGED_SMOKE_EVIDENCE,
  'macos-x64': MACOS_PACKAGED_SMOKE_EVIDENCE,
  'linux-x64': [
    { file: 'qualification/linux-package-smoke.json', kind: 'linux-package-smoke' },
    { file: 'qualification/packaged-vector-smoke.json', kind: 'packaged-vector-smoke' },
  ],
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function sha256File(file) {
  return sha256Bytes(readFileSync(file))
}

function requiredOption(options, name) {
  const value = options[name]
  assert(typeof value === 'string' && value.trim().length > 0, `Missing required option: --${name}`)
  return value.trim()
}

function validatePlatform(platform) {
  assert(platform === 'windows' || platform === 'linux-x64' || isMacosQualificationEntity(platform), '--platform must be windows, macos-arm64, macos-x64, or linux-x64')
  return platform
}

function safeVersion(value) {
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value), `Unsafe package version: ${JSON.stringify(value)}`)
  return value
}

function relativeArtifactPath(version, file) {
  const result = path.posix.join('release', version, file)
  assert(!result.includes('..') && !result.includes(':'), `Unsafe artifact path: ${result}`)
  return result
}

function platformArtifactSet(platform, version) {
  if (platform === 'windows') {
    const installer = `inkweaver-setup-${version}.exe`
    return [
      { path: relativeArtifactPath(version, installer), role: 'installer' },
      { path: relativeArtifactPath(version, `${installer}.blockmap`), role: 'installer-blockmap' },
      { path: relativeArtifactPath(version, 'latest.yml'), role: 'updater-metadata' },
    ]
  }

  if (platform === 'linux-x64') {
    const artifacts = createLinuxSmokeCases(version)
    const appimage = artifacts.find(artifact => artifact.format === 'appimage').artifact
    const deb = artifacts.find(artifact => artifact.format === 'deb').artifact
    const rpm = artifacts.find(artifact => artifact.format === 'rpm').artifact
    return [
      { path: relativeArtifactPath(version, appimage), role: 'appimage' },
      { path: relativeArtifactPath(version, `${appimage}.sha256`), role: 'appimage-checksum' },
      { path: relativeArtifactPath(version, deb), role: 'deb' },
      { path: relativeArtifactPath(version, `${deb}.sha256`), role: 'deb-checksum' },
      { path: relativeArtifactPath(version, rpm), role: 'rpm' },
      { path: relativeArtifactPath(version, `${rpm}.sha256`), role: 'rpm-checksum' },
    ]
  }

  const { architecture } = macosQualificationEntity(platform)
  const dmg = `inkweaver-mac-${architecture}-${version}-installer.dmg`
  return [
    { path: relativeArtifactPath(version, dmg), role: 'dmg' },
    { path: relativeArtifactPath(version, `${dmg}.sha256`), role: 'dmg-checksum' },
  ]
}

function readPackageMetadata(root = repositoryRoot) {
  const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert(typeof metadata?.version === 'string', 'package.json must declare a version')
  assert(typeof metadata?.packageManager === 'string', 'package.json must declare packageManager')
  const packageManager = /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(metadata.packageManager)
  assert(packageManager, 'package.json packageManager must pin pnpm')
  return { version: safeVersion(metadata.version), pnpmVersion: packageManager[1] }
}

function now() {
  return new Date().toISOString()
}

function nowAtOrAfter(minimumTimestamp) {
  const minimum = Date.parse(minimumTimestamp)
  assert(Number.isFinite(minimum), 'Release evidence prior timestamp is invalid')
  return new Date(Math.max(Date.now(), minimum)).toISOString()
}

function pinnedVersion(value, label) {
  assert(typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value), `${label} must be a pinned version`)
  return value
}

function installedPnpmVersion(cwd) {
  const isWindows = process.platform === 'win32'
  const executable = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm'
  const argumentsList = isWindows ? ['/d', '/s', '/c', 'pnpm --version'] : ['--version']
  const result = spawnSync(executable, argumentsList, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  assert(!result.error && result.status === 0, `Unable to read installed pnpm version: ${result.error?.message ?? `exit ${result.status}`}`)
  const version = String(result.stdout ?? '').trim()
  return pinnedVersion(version, 'Installed pnpm version')
}

function parseDispatchInputsJson(value, platform) {
  assert(typeof value === 'string', '--dispatch-inputs-json is required')
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('--dispatch-inputs-json must be valid JSON')
  }
  assert(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), '--dispatch-inputs-json must contain an object')
  const requiredKeys = platform === 'linux-x64'
    ? ['expected_sha', 'profile_path', 'release_tag', 'release_version']
    : []
  assert(JSON.stringify(Object.keys(parsed).sort()) === JSON.stringify(requiredKeys), 'Qualification workflow dispatch input keys are invalid')
  if (platform === 'linux-x64') {
    assert(/^[a-f0-9]{40}$/.test(parsed.expected_sha ?? ''), 'Linux dispatch expected_sha is invalid')
    safeVersion(parsed.release_version)
    assert(parsed.release_tag === `v${parsed.release_version}`, 'Linux dispatch release_tag must match release_version')
    assert(parsed.profile_path === '.release/release-profile.json', 'Linux dispatch profile_path is invalid')
  }
  return parsed
}

function qualificationWorkflowIdentity({ platform, workflowPath, workflowName, actor, event, dispatchInputs }) {
  const expected = QUALIFICATION_WORKFLOWS[platform]
  assert(workflowPath === expected.path, `Qualification workflow path must be ${expected.path}`)
  assert(workflowName === expected.name, `Qualification workflow name must be ${expected.name}`)
  assert(typeof actor === 'string' && actor.trim().length > 0 && actor.length <= 100 && !/[\r\n\0]/.test(actor), '--actor must be a non-empty GitHub actor')
  assert(event === 'workflow_dispatch', '--event must be workflow_dispatch')
  const expectedInputKeys = platform === 'linux-x64'
    ? ['expected_sha', 'profile_path', 'release_tag', 'release_version']
    : []
  assert(dispatchInputs !== null && typeof dispatchInputs === 'object' && !Array.isArray(dispatchInputs) && JSON.stringify(Object.keys(dispatchInputs).sort()) === JSON.stringify(expectedInputKeys), 'Qualification workflow dispatch input keys are invalid')
  return {
    path: workflowPath,
    name: workflowName,
    actor,
    event,
    dispatchInputs,
  }
}

export function initializeReleaseEvidence({
  platform,
  evidenceRoot,
  repository,
  commit,
  runId,
  runAttempt,
  runnerLabel,
  imageOS,
  imageVersion,
  workflowPath,
  workflowName,
  actor,
  event,
  dispatchInputs,
  root = repositoryRoot,
  expectedNodeVersion,
  expectedPnpmVersion,
}) {
  const selectedPlatform = validatePlatform(platform)
  const resolvedEvidenceRoot = path.resolve(evidenceRoot)
  const normalizedCommit = commit.toLowerCase()
  assert(/^[0-9a-f]{40}$/.test(normalizedCommit), '--commit must be a full lowercase SHA-1')
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository), '--repository must be owner/repo')
  assert(/^\d+$/.test(runId), '--run-id must be numeric')
  assert(/^[1-9]\d*$/.test(runAttempt), '--run-attempt must be a positive integer')
  assert(typeof runnerLabel === 'string' && runnerLabel.length > 0, '--runner-label must be non-empty')
  assert(typeof imageOS === 'string' && imageOS.length > 0, '--image-os must be non-empty')
  assert(typeof imageVersion === 'string' && imageVersion.length > 0, '--image-version must be non-empty')
  const workflow = qualificationWorkflowIdentity({
    platform: selectedPlatform,
    workflowPath,
    workflowName,
    actor,
    event,
    dispatchInputs,
  })

  const packageMetadata = readPackageMetadata(root)
  if (selectedPlatform === 'linux-x64') {
    assert(workflow.dispatchInputs.expected_sha === normalizedCommit, 'Linux dispatch expected_sha does not match the checked-out commit')
    assert(workflow.dispatchInputs.release_tag === `v${packageMetadata.version}` && workflow.dispatchInputs.release_version === packageMetadata.version, 'Linux dispatch release identity does not match package.json')
    assert(workflow.dispatchInputs.profile_path === '.release/release-profile.json', 'Linux dispatch profile_path is invalid')
  }
  const resolvedExpectedNodeVersion = pinnedVersion(expectedNodeVersion, 'Expected Node version')
  const resolvedExpectedPnpmVersion = pinnedVersion(expectedPnpmVersion, 'Expected pnpm version')
  const actualNodeVersion = pinnedVersion(process.versions.node, 'Installed Node version')
  const actualPnpmVersion = installedPnpmVersion(root)
  assert(resolvedExpectedPnpmVersion === packageMetadata.pnpmVersion, 'Expected pnpm version must match package.json')
  assert(actualNodeVersion === resolvedExpectedNodeVersion, `Installed Node version ${actualNodeVersion} does not match expected ${resolvedExpectedNodeVersion}`)
  assert(actualPnpmVersion === resolvedExpectedPnpmVersion, `Installed pnpm version ${actualPnpmVersion} does not match expected ${resolvedExpectedPnpmVersion}`)

  const contractPath = path.join(resolvedEvidenceRoot, 'release-contract.json')
  const ledgerPath = path.join(resolvedEvidenceRoot, 'run-ledger.json')
  assert(!existsSync(contractPath) && !existsSync(ledgerPath), 'Release evidence has already been initialized')
  mkdirSync(resolvedEvidenceRoot, { recursive: true })

  const lockfile = path.join(root, 'pnpm-lock.yaml')
  const contract = {
    schemaVersion: 2,
    stage: 'qualification',
    repository,
    frozen: {
      commit: normalizedCommit,
      tag: `v${packageMetadata.version}`,
      version: packageMetadata.version,
      platform: selectedPlatform,
      workflow,
      run: {
        id: runId,
        attempt: runAttempt,
      },
      runner: {
        expectedLabel: runnerLabel,
        actualImageOS: imageOS,
        actualImageVersion: imageVersion,
      },
      appToolchain: {
        expectedNodeVersion: resolvedExpectedNodeVersion,
        actualNodeVersion,
        packageManagerCommand: 'pnpm',
        expectedPackageManagerVersion: resolvedExpectedPnpmVersion,
        actualPackageManagerVersion: actualPnpmVersion,
        source: {
          expectedNodeVersion: 'qualification workflow init --expected-node-version',
          expectedPackageManagerVersion: 'qualification workflow init --expected-pnpm-version and package.json packageManager',
          actualNodeVersion: 'Node process.versions.node',
          actualPackageManagerVersion: 'pnpm --version',
        },
      },
      lockfile: {
        path: 'pnpm-lock.yaml',
        rawByteSha256: sha256File(lockfile),
        textNewlinesLfSha256: canonicalPnpmLockfileSha256(lockfile),
      },
      artifactSet: platformArtifactSet(selectedPlatform, packageMetadata.version),
      acceptance: {
        evidenceFiles: ACCEPTANCE_PROFILES[selectedPlatform],
      },
      signingEvidence: {
        path: 'qualification/acceptance/signing.json',
        requiredFields: ['accepted', 'observations', 'status', 'validationResult', 'unsignedDistributionImpact'],
      },
    },
  }
  writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8')
  const contractSha256 = sha256File(contractPath)
  const ledger = {
    schemaVersion: 2,
    stage: 'qualification',
    contractSha256,
    repository,
    run: {
      id: runId,
      attempt: runAttempt,
      commit: normalizedCommit,
      runnerLabel,
      imageOS,
      imageVersion,
      workflow,
      startedAt: now(),
    },
    commands: [],
  }
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  return { contractPath, ledgerPath, contractSha256, contract, ledger }
}

function readInitializedEvidence(evidenceRoot) {
  const resolvedEvidenceRoot = path.resolve(evidenceRoot)
  const contractPath = path.join(resolvedEvidenceRoot, 'release-contract.json')
  const ledgerPath = path.join(resolvedEvidenceRoot, 'run-ledger.json')
  assert(existsSync(contractPath), 'Release evidence contract is missing')
  assert(existsSync(ledgerPath), 'Release evidence ledger is missing')
  const contract = jsonEvidenceFile(contractPath, 'Release evidence contract')
  const ledger = jsonEvidenceFile(ledgerPath, 'Release evidence ledger')
  assert(contract?.schemaVersion === 2 && contract?.stage === 'qualification', 'Release evidence contract is invalid')
  assert(ledger?.schemaVersion === 2 && ledger?.stage === 'qualification', 'Release evidence ledger is invalid')
  assert(ledger.contractSha256 === sha256File(contractPath), 'Release evidence contract hash has changed')
  assert(Array.isArray(ledger.commands), 'Release evidence ledger commands are invalid')
  return { resolvedEvidenceRoot, contractPath, ledgerPath, contract, ledger }
}

function commandTimeoutMilliseconds() {
  const configured = process.env.AI_NOVEL_RELEASE_EVIDENCE_COMMAND_TIMEOUT_MS
  if (configured === undefined) return 15 * 60 * 1000
  assert(/^\d+$/.test(configured), 'Release evidence command timeout must be numeric')
  const timeout = Number(configured)
  assert(timeout > 0 && timeout <= 60 * 60 * 1000, 'Release evidence command timeout must be between 1ms and 1 hour')
  return timeout
}

function commandExecutableName(command) {
  const name = path.basename(command)
  assert(name.length > 0 && !/[\r\n\0]/.test(name), 'Release evidence command executable is unsafe')
  return name
}

export function recordReleaseCommand({ evidenceRoot, step, command, cwd = repositoryRoot }) {
  assert(/^[a-z0-9][a-z0-9-]{0,63}$/.test(step), '--step must be a safe lowercase name')
  assert(Array.isArray(command) && command.length > 0 && command.every(value => typeof value === 'string' && !/[\0]/.test(value)), 'Release evidence command is invalid')
  const evidence = readInitializedEvidence(evidenceRoot)
  assert(!evidence.ledger.commands.some(record => record?.step === step), `Release evidence already records step: ${step}`)

  const previousTimestamp = evidence.ledger.commands.at(-1)?.endedAt ?? evidence.ledger.run?.startedAt
  const startedAt = nowAtOrAfter(previousTimestamp)
  const timeoutMs = commandTimeoutMilliseconds()
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    shell: false,
    stdio: 'inherit',
    timeout: timeoutMs,
    windowsHide: true,
  })
  const endedAt = nowAtOrAfter(startedAt)
  const commandRecord = {
    step,
    command: {
      executable: commandExecutableName(command[0]),
      argumentCount: command.length - 1,
    },
    startedAt,
    endedAt,
    timeoutMs,
    exitCode: typeof result.status === 'number' ? result.status : null,
    timedOut: result.error?.code === 'ETIMEDOUT',
  }
  evidence.ledger.commands.push(commandRecord)
  writeFileSync(evidence.ledgerPath, `${JSON.stringify(evidence.ledger, null, 2)}\n`, 'utf8')

  if (result.error) throw new Error(`Release evidence command failed to start: ${result.error.code ?? 'unknown'}`)
  if (result.status !== 0) throw new Error(`Release evidence command failed: ${step}`)
  return commandRecord
}

function validateCommandLedger(ledger, platform, requireEndedAt) {
  assert(Array.isArray(ledger.commands), 'Release evidence ledger commands are invalid')
  const expectedSteps = COMMAND_PROFILES[platform]
  assert(JSON.stringify(ledger.commands.map(record => record?.step)) === JSON.stringify(expectedSteps), `Release evidence command set is not exact for ${platform}`)
  assert(validIsoTimestamp(ledger.run?.startedAt), 'Release evidence ledger start time is invalid')
  let previousTime = Date.parse(ledger.run.startedAt)
  for (const record of ledger.commands) {
    assert(validIsoTimestamp(record.startedAt) && validIsoTimestamp(record.endedAt), `Release evidence command time is invalid: ${record.step}`)
    const startedAt = Date.parse(record.startedAt)
    const endedAt = Date.parse(record.endedAt)
    assert(startedAt >= previousTime && endedAt >= startedAt, `Release evidence command order is invalid: ${record.step}`)
    assert(record.exitCode === 0 && record.timedOut === false, `Release evidence command did not succeed: ${record.step}`)
    assert(nonEmptyString(record.command?.executable) && Number.isInteger(record.command?.argumentCount) && record.command.argumentCount >= 0, `Release evidence command identity is invalid: ${record.step}`)
    assert(Number.isInteger(record.timeoutMs) && record.timeoutMs > 0 && record.timeoutMs <= 60 * 60 * 1000, `Release evidence command timeout is invalid: ${record.step}`)
    previousTime = endedAt
  }
  if (requireEndedAt) {
    assert(validIsoTimestamp(ledger.run?.endedAt) && Date.parse(ledger.run.endedAt) >= previousTime, 'Release evidence ledger end time is invalid')
  }
}

function assertSafeRelativePath(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty relative path`)
  assert(!value.includes('\\') && !value.startsWith('/') && !value.includes('\0'), `${label} is unsafe`)
  const parts = value.split('/')
  assert(parts.every(part => (
    part.length > 0 && part !== '.' && part !== '..' && !part.includes(':') && !/[. ]$/.test(part)
  )), `${label} is unsafe`)
  return value
}

function fileWithin(root, relativePath, label) {
  const safeRelativePath = assertSafeRelativePath(relativePath, label)
  const resolvedRoot = path.resolve(root)
  const candidate = path.resolve(resolvedRoot, ...safeRelativePath.split('/'))
  assert(candidate.startsWith(`${resolvedRoot}${path.sep}`), `${label} escapes its root`)
  return candidate
}

function nonEmptyRegularFile(file, label) {
  assert(existsSync(file), `Missing ${label}: ${file}`)
  const stat = lstatSync(file)
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, `${label} must be a non-empty regular file`)
  return stat
}

function fileRecord(root, relativePath, kind) {
  const file = fileWithin(root, relativePath, kind)
  const stat = nonEmptyRegularFile(file, kind)
  return { file: relativePath, sizeBytes: stat.size, sha256: sha256File(file), kind }
}

function listRegularRelativeFiles(root, relativePath = '') {
  const directory = relativePath ? fileWithin(root, relativePath, 'Evidence directory') : path.resolve(root)
  assert(existsSync(directory), `Missing evidence directory: ${relativePath || '.'}`)
  const result = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name
    assertSafeRelativePath(childRelativePath, 'Evidence path')
    const child = fileWithin(root, childRelativePath, 'Evidence path')
    const stat = lstatSync(child)
    assert(!stat.isSymbolicLink(), `Evidence path must not be a symlink: ${childRelativePath}`)
    if (stat.isDirectory()) {
      result.push(...listRegularRelativeFiles(root, childRelativePath))
      continue
    }
    assert(stat.isFile(), `Evidence path must be a regular file: ${childRelativePath}`)
    result.push(childRelativePath)
  }
  return result.sort()
}

function nonEmptyObservations(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0)
}

function nonEmptyDirectObservation(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
}

function nonEmptyImpact(value) {
  return (typeof value === 'string' && value.trim().length > 0) ||
    (Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0))
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function validSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value)
  if (!match) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]
}

function validSemanticVersion(value) {
  return typeof value === 'string' && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(value)
}

function validateReferenceSet(receipt, expected, bundleRoot, label) {
  assert(Array.isArray(receipt.evidence ?? Object.values(receipt.references ?? {})), `${label} references are invalid`)
  const references = receipt.evidence ?? Object.values(receipt.references)
  assert(references.length === expected.length, `${label} reference count is invalid`)
  for (const expectedReference of expected) {
    const reference = references.find(record => record?.kind === expectedReference.kind)
    assert(reference?.path === expectedReference.path || reference?.evidencePath === expectedReference.path, `${label} reference path is invalid: ${expectedReference.kind}`)
    assert(validSha256(reference?.sha256), `${label} reference SHA-256 is invalid: ${expectedReference.kind}`)
    assert(reference.sha256.toLowerCase() === sha256File(fileWithin(bundleRoot, expectedReference.path, `${label} reference`)), `${label} reference SHA-256 does not match: ${expectedReference.kind}`)
  }
}

function validateWindowsReceipt(receipt, name, bundleRoot, version) {
  const direct = receipt.direct
  const expectedKinds = {
    install: 'windows-install',
    launch: 'windows-launch',
    'quiet-window': 'windows-final-quiet-window',
    'error-dialogs': 'windows-error-dialogs',
    uninstall: 'windows-uninstall',
    'upgrade-data': 'windows-upgrade-data',
    'native-abi': 'windows-native-abi',
    'packaged-smoke': 'windows-packaged-smoke-summary',
    signing: 'windows-signing',
  }
  assert(receipt.kind === expectedKinds[name], `Windows acceptance receipt kind is invalid: ${name}`)
  if (name === 'install') {
    assert(direct.installerExitCode === 0 && nonEmptyString(direct.installedExecutable) && direct.installedExecutableExists === true, 'Windows install receipt facts are invalid')
  } else if (name === 'launch') {
    const strictReleaseVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)
    const productVersionMatches = direct.productVersion === version || direct.productVersion === `${version}.0`
    assert(strictReleaseVersion && receipt.expectedVersion === version && productVersionMatches && nonEmptyString(direct.executablePath) && positiveInteger(direct.processId) && nonEmptyString(direct.processStartTimeTicks) && positiveInteger(direct.visibleMainWindowCount), 'Windows launch receipt facts are invalid')
  } else if (name === 'quiet-window') {
    assert(direct.monitorState === 'step-completed' && direct.monitorStep === 'final:quiet' && Number(direct.quietWindowSeconds) >= 5 && validIsoTimestamp(direct.completedAt), 'Windows quiet-window receipt facts are invalid')
  } else if (name === 'error-dialogs') {
    assert(direct.monitorState === 'step-completed' && direct.monitorStep === 'final:quiet' && direct.newProductErrorDialogCount === 0 && validIsoTimestamp(direct.observedThrough), 'Windows error-dialog receipt facts are invalid')
  } else if (name === 'uninstall') {
    assert(direct.installedExecutableExists === false && ['absent', 'empty', 'system-residue-only'].includes(direct.installDirectoryState) && Array.isArray(direct.allowedSystemResiduals), 'Windows uninstall receipt facts are invalid')
  } else if (name === 'upgrade-data') {
    assert(validSemanticVersion(direct.previousVersion) && direct.legacyTableCount === 11 && positiveInteger(direct.preservedAssetCount) && positiveInteger(direct.vectorDimension) && positiveInteger(direct.queryResultCount), 'Windows upgrade-data receipt facts are invalid')
  } else if (name === 'native-abi') {
    assert(direct.restoreMode === 'monitored' && /^\d+$/.test(direct.nodeModuleAbi ?? '') && direct.verificationTest === 'electron/repositories/__tests__/character-repository.test.ts', 'Windows native-ABI receipt facts are invalid')
  } else if (name === 'packaged-smoke') {
    const expected = [
      { kind: 'packaged-vector-smoke', path: 'qualification/packaged-vector-smoke.json' },
      { kind: 'packaged-official-homepage-smoke', path: 'qualification/packaged-official-homepage-smoke.json' },
      { kind: 'packaged-skin-smoke', path: 'qualification/packaged-skin-smoke.json' },
    ]
    assert(direct.evidenceCount === 3 && JSON.stringify(direct.evidenceKinds) === JSON.stringify(expected.map(record => record.kind)), 'Windows packaged-smoke receipt summary is invalid')
    validateReferenceSet(receipt, expected, bundleRoot, 'Windows packaged-smoke receipt')
  } else if (name === 'signing') {
    const expectedStatus = receipt.status === 'signed' ? 'Valid' : 'NotSigned'
    const installer = fileWithin(bundleRoot, `inkweaver-setup-${version}.exe`, 'Windows installer')
    assert(direct.authenticodeStatus === expectedStatus && receipt.validationResult === expectedStatus, 'Windows signing receipt status is inconsistent')
    assert(validSha256(direct.installerSha256) && direct.installerSha256.toLowerCase() === sha256File(installer), 'Windows signing receipt installer SHA-256 is invalid')
  }
}

function validateMacosReceipt(receipt, name, bundleRoot, version, platform) {
  const { architecture, runnerMachineArchitecture } = macosQualificationEntity(platform)
  const direct = receipt.direct
  const dmg = `inkweaver-mac-${architecture}-${version}-installer.dmg`
  const dmgSha256 = sha256File(fileWithin(bundleRoot, dmg, 'macOS DMG'))
  const expectedKinds = { 'dmg-mount': 'dmg-mount', 'packaged-smoke': 'packaged-smoke', signing: 'signing' }
  assert(receipt.kind === expectedKinds[name] && receipt.platform === 'darwin' && receipt.arch === architecture, `macOS acceptance receipt identity is invalid: ${name}`)
  assert(
    direct?.architecture?.target === architecture && direct.architecture?.runnerMachine === runnerMachineArchitecture,
    `macOS acceptance receipt architecture evidence is invalid: ${name}`,
  )
  if (name === 'dmg-mount') {
    assert(direct.executable?.present === true && direct.helper?.present === true && direct.mount?.attached === true && direct.unmount?.attempted === true && direct.unmount?.succeeded === true, 'macOS DMG mount receipt facts are invalid')
    assert(direct.hash?.algorithm === 'sha256' && direct.hash?.value?.toLowerCase() === dmgSha256, 'macOS DMG mount receipt hash is invalid')
  } else if (name === 'packaged-smoke') {
    assert(direct.secureFileSystemSmoke === true && direct.vectorSmoke === true && direct.officialHomepageSmoke === true && direct.skinSmoke === true && direct.dmgSha256?.toLowerCase() === dmgSha256, 'macOS packaged-smoke receipt facts are invalid')
    validateReferenceSet(receipt, [
      { kind: 'packaged-vector-smoke', path: 'qualification/packaged-vector-smoke.json' },
      { kind: 'packaged-official-homepage-smoke', path: 'qualification/packaged-official-homepage-smoke.json' },
      { kind: 'packaged-skin-smoke', path: 'qualification/packaged-skin-smoke.json' },
      { kind: 'macos-dmg-smoke', path: 'qualification/macos-dmg-smoke.json' },
    ], bundleRoot, 'macOS packaged-smoke receipt')
  } else if (name === 'signing') {
    const codeSigning = direct.codeSigning
    const notarization = direct.notarization
    const gatekeeper = direct.gatekeeper
    assert(
      receipt.status === MACOS_FORMAL_DISTRIBUTION_POLICY.codeSigning
        && codeSigning?.expected === MACOS_FORMAL_DISTRIBUTION_POLICY.codeSigning
        && (codeSigning?.observed === 'ad_hoc' || codeSigning?.observed === 'unsigned')
        && codeSigning?.hasDeveloperIdIdentity === false,
      'macOS formal distribution requires ad-hoc or unsigned code signing without a Developer ID identity',
    )
    assert(nonEmptyString(receipt.validationResult) && nonEmptyString(receipt.gatekeeperImpact), 'macOS signing receipt validation and Gatekeeper impact are invalid')
    assert(
      notarization?.expected === MACOS_FORMAL_DISTRIBUTION_POLICY.notarization
        && notarization?.observed === MACOS_FORMAL_DISTRIBUTION_POLICY.notarization
        && nonEmptyString(notarization?.basis),
      'macOS formal distribution requires an unnotarized state',
    )
    const commands = [
      [codeSigning?.details, 'codesign -dv --verbose=4'],
      [codeSigning?.verification, 'codesign --verify --deep --strict --verbose=2'],
      [gatekeeper?.assessment, 'spctl --assess --type execute --verbose=4'],
    ]
    for (const [record, command] of commands) {
      assert(record?.command === command && Number.isInteger(record?.exitCode) && validSha256(record?.outputSha256), `macOS signing receipt command is invalid: ${command}`)
    }
    assert(Array.isArray(codeSigning.authorities), 'macOS code-signing authority facts are invalid')
    if (codeSigning.observed === 'ad_hoc') {
      assert(
        codeSigning.details.exitCode === 0
          && codeSigning.verification.exitCode === 0
          && codeSigning.signature?.toLowerCase() === 'adhoc'
          && (codeSigning.teamIdentifier === 'not set' || codeSigning.teamIdentifier === null)
          && codeSigning.authorities.length === 0,
        'macOS ad-hoc code-signing receipt facts are invalid',
      )
    } else {
      assert(
        codeSigning.details.exitCode !== 0
          && codeSigning.verification.exitCode !== 0
          && codeSigning.signature === null
          && codeSigning.teamIdentifier === null
          && codeSigning.authorities.length === 0,
        'macOS unsigned code-signing receipt facts are invalid',
      )
    }
    const expectedGatekeeperState = gatekeeper.assessment.exitCode === 0
      ? 'accepted-on-runner'
      : 'manual-confirmation-may-be-required'
    assert(gatekeeper?.observed === expectedGatekeeperState, 'macOS Gatekeeper receipt state is inconsistent with its assessment')
  }
}

function validateLinuxReceipt(receipt, name, bundleRoot, version) {
  const direct = receipt.direct
  const expectedKinds = {
    install: 'linux-install',
    launch: 'linux-launch',
    'native-abi': 'linux-native-abi',
    'packaged-smoke': 'linux-packaged-smoke',
    signing: 'linux-signing',
  }
  assert(receipt.kind === expectedKinds[name] && receipt.platform === 'linux' && receipt.arch === 'x64', `Linux acceptance receipt identity is invalid: ${name}`)
  if (name !== 'signing') {
    assert(direct?.architecture?.target === 'x64' && direct.architecture?.runnerMachine === 'x86_64', `Linux acceptance receipt architecture evidence is invalid: ${name}`)
  }

  if (name === 'install') {
    const expectedCases = createLinuxSmokeCases(version)
    assert(Array.isArray(direct.cases) && direct.cases.length === expectedCases.length, 'Linux installation receipt case set is invalid')
    for (const testCase of expectedCases) {
      const observed = direct.cases.find(item => item?.id === testCase.id)
      assert(observed?.format === testCase.format && observed?.distro === testCase.distro && observed?.distroVersion === testCase.distroVersion, `Linux installation receipt case identity is invalid: ${testCase.id}`)
      assert(observed?.image === testCase.image && validSha256(observed?.imageDigest?.replace(/^sha256:/i, '')) && typeof observed?.osRelease === 'string' && observed.osRelease.length > 0 && observed?.artifact === testCase.artifact && observed?.installExitCode === 0, `Linux installation receipt facts are invalid: ${testCase.id}`)
    }
  } else if (name === 'launch') {
    const expectedCases = createLinuxSmokeCases(version)
    assert(Array.isArray(direct.cases) && direct.cases.length === expectedCases.length, 'Linux launch receipt case set is invalid')
    for (const testCase of expectedCases) {
      const observed = direct.cases.find(item => item?.id === testCase.id)
      const expectedOsLabel = testCase.distro === 'ubuntu' ? 'Ubuntu 22.04' : testCase.distro === 'debian' ? 'Debian GNU/Linux 13' : 'Fedora Linux 44'
      assert(observed?.image === testCase.image && validSha256(observed?.imageDigest?.replace(/^sha256:/i, '')) && typeof observed?.osRelease === 'string' && observed.osRelease.includes(expectedOsLabel) && observed?.launchExitCode === 0 && observed?.cleanupSucceeded === true, `Linux launch receipt facts are invalid: ${testCase.id}`)
      const actualVersion = /^(\d+)\.(\d+)$/.exec(String(observed.glibcVersion ?? ''))
      assert(actualVersion && (Number(actualVersion[1]) > 2 || (Number(actualVersion[1]) === 2 && Number(actualVersion[2]) >= 35)), `Linux smoke image is older than the glibc 2.35 build baseline: ${testCase.id}`)
      const requirements = observed.glibcRequirements
      assert(requirements && ['electron', 'betterSqlite3', 'lanceDb'].every(name => {
        const required = /^(\d+)\.(\d+)$/.exec(String(requirements[name] ?? ''))
        return required && (Number(required[1]) < 2 || (Number(required[1]) === 2 && Number(required[2]) <= 35))
      }), `Linux packaged binary GLIBC requirement exceeds the Ubuntu 22.04 baseline: ${testCase.id}`)
      assert(observed.desktopLaunchMode === (testCase.format === 'appimage' ? 'extract-and-run' : 'installed-package'), `Linux desktop launch mode is invalid: ${testCase.id}`)
      assert(observed.desktopLaunchExitCode === 0 && observed.desktopWindowReady === true && observed.desktopRendererLoaded === true && observed.desktopPreloadApiReady === true && observed.desktopAppRootReady === true, `Linux packaged desktop startup receipt is invalid: ${testCase.id}`)
      if (testCase.format === 'appimage') {
        assert(['fuse', 'extract-and-run'].includes(observed.appImageMode), `Linux AppImage vector-smoke mode is invalid: ${testCase.id}`)
        assert(['passed', 'failed', 'unavailable'].includes(observed.appImageFuseStatus), `Linux AppImage FUSE observation is invalid: ${testCase.id}`)
        assert(observed.appImageExtractionExitCode === 0, `Linux AppImage extraction smoke failed: ${testCase.id}`)
        assert(observed.userNamespaceSandboxReady === true, `Linux AppImage user namespace sandbox is unavailable: ${testCase.id}`)
        if (observed.appImageFuseStatus === 'passed') assert(observed.appImageMode === 'fuse', `Linux AppImage FUSE evidence conflicts with its vector-smoke mode: ${testCase.id}`)
        else assert(observed.appImageMode === 'extract-and-run', `Linux AppImage fallback evidence conflicts with its vector-smoke mode: ${testCase.id}`)
      } else {
        assert(observed.appImageMode === null, `Linux non-AppImage launch has an AppImage mode: ${testCase.id}`)
        assert(observed.appImageFuseStatus === null && observed.appImageExtractionExitCode === null, `Linux non-AppImage launch has AppImage runtime evidence: ${testCase.id}`)
      }
    }
  } else if (name === 'native-abi') {
    assert(direct.betterSqlite3?.binding === 'better-sqlite3' && direct.betterSqlite3.operation === 'SELECT 1' && direct.betterSqlite3.value === 1, 'Linux better-sqlite3 ABI receipt facts are invalid')
    assert(direct.lanceDb?.binding === '@lancedb/lancedb-linux-x64-gnu' && direct.lanceDb.projectA === true && direct.lanceDb.projectBBackfill === true, 'Linux LanceDB ABI receipt facts are invalid')
  } else if (name === 'packaged-smoke') {
    const expected = [
      { kind: 'linux-package-smoke', path: 'qualification/linux-package-smoke.json' },
      { kind: 'packaged-vector-smoke', path: 'qualification/packaged-vector-smoke.json' },
    ]
    assert(direct.evidenceCount === expected.length && JSON.stringify(direct.evidenceKinds) === JSON.stringify(expected.map(record => record.kind)), 'Linux packaged-smoke receipt summary is invalid')
    validateReferenceSet(receipt, expected, bundleRoot, 'Linux packaged-smoke receipt')
  } else if (name === 'signing') {
    assert(direct.status === 'unsigned' && receipt.status === 'unsigned', 'Linux package signing receipt must disclose unsigned distribution')
    assert(nonEmptyString(receipt.validationResult) && nonEmptyImpact(receipt.unsignedDistributionImpact) && nonEmptyImpact(direct.distributionImpact), 'Linux unsigned package disclosure is invalid')
  }
}

function validateAcceptanceReceipt(file, relativePath, platform, bundleRoot, version) {
  const receipt = jsonEvidenceFile(file, `Acceptance receipt ${relativePath}`)
  assert(receipt?.schemaVersion === 2, `Acceptance receipt schema is invalid: ${relativePath}`)
  assert(receipt?.accepted === true, `Acceptance receipt is not accepted: ${relativePath}`)
  assert(nonEmptyObservations(receipt?.observations), `Acceptance receipt observations are invalid: ${relativePath}`)
  assert(nonEmptyDirectObservation(receipt?.direct), `Acceptance receipt direct observation is invalid: ${relativePath}`)
  if (relativePath.endsWith('/signing.json')) {
    if (platform === 'windows') {
      assert(receipt.status === 'signed' || receipt.status === 'unsigned', 'Windows signing receipt status must be signed or unsigned')
    } else if (platform === 'linux-x64') {
      assert(receipt.status === 'unsigned', 'Linux signing receipt must disclose unsigned distribution')
    } else {
      assert(nonEmptyString(receipt.status), 'macOS signing receipt status is required')
    }
    assert(receipt.validationResult !== null && receipt.validationResult !== undefined, 'Signing receipt validationResult is required')
    assert(nonEmptyImpact(receipt.unsignedDistributionImpact), 'Signing receipt unsignedDistributionImpact is required')
  }
  const name = path.posix.basename(relativePath, '.json')
  if (platform === 'windows') validateWindowsReceipt(receipt, name, bundleRoot, version)
  else if (platform === 'linux-x64') validateLinuxReceipt(receipt, name, bundleRoot, version)
  else validateMacosReceipt(receipt, name, bundleRoot, version, platform)
  return receipt
}

function expectedTemporaryReceiptFiles(contract) {
  return contract.frozen.acceptance.evidenceFiles.map(relativePath => {
    assertSafeRelativePath(relativePath, 'Contract acceptance path')
    assert(relativePath.startsWith('qualification/acceptance/'), 'Contract acceptance path must be under qualification/acceptance')
    return relativePath.slice('qualification/'.length)
  }).sort()
}

function validateExactTemporaryReceipts(evidenceRoot, contract, releaseRoot) {
  const expected = expectedTemporaryReceiptFiles(contract)
  const actual = listRegularRelativeFiles(evidenceRoot, 'acceptance')
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Acceptance evidence file set is not exact; got ${actual.join(', ')}`)
  for (const relativePath of actual) {
    validateAcceptanceReceipt(fileWithin(evidenceRoot, relativePath, 'Acceptance receipt'), `qualification/${relativePath}`, contract.frozen.platform, releaseRoot, contract.frozen.version)
  }
  return expected
}

function copyEvidenceFile(sourceRoot, sourceRelativePath, destinationRoot, destinationRelativePath) {
  const source = fileWithin(sourceRoot, sourceRelativePath, 'Evidence source')
  nonEmptyRegularFile(source, 'Evidence source')
  const destination = fileWithin(destinationRoot, destinationRelativePath, 'Evidence destination')
  mkdirSync(path.dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  assert(sha256File(source) === sha256File(destination), `Evidence copy hash mismatch: ${destinationRelativePath}`)
}

function contractArtifactFile(contract, contractPath) {
  const version = contract.frozen.version
  const prefix = `release/${version}/`
  assertSafeRelativePath(contractPath, 'Contract artifact path')
  assert(contractPath.startsWith(prefix), `Contract artifact path must be under ${prefix}`)
  return contractPath.slice(prefix.length)
}

function ensureMacChecksum(releaseRoot, contract) {
  if (!isMacosQualificationEntity(contract.frozen.platform)) return
  const dmgArtifact = contract.frozen.artifactSet.find(artifact => artifact.role === 'dmg')
  const checksumArtifact = contract.frozen.artifactSet.find(artifact => artifact.role === 'dmg-checksum')
  assert(dmgArtifact && checksumArtifact, 'macOS contract artifact set is incomplete')
  const dmgFile = contractArtifactFile(contract, dmgArtifact.path)
  const checksumFile = contractArtifactFile(contract, checksumArtifact.path)
  const dmgPath = fileWithin(releaseRoot, dmgFile, 'macOS DMG')
  nonEmptyRegularFile(dmgPath, 'macOS DMG')
  const checksumPath = fileWithin(releaseRoot, checksumFile, 'macOS DMG checksum')
  writeFileSync(checksumPath, `${sha256File(dmgPath)}  ${dmgFile}\n`, 'utf8')
}

function ensureLinuxChecksums(releaseRoot, contract) {
  if (contract.frozen.platform !== 'linux-x64') return
  for (const artifact of contract.frozen.artifactSet.filter(item => item.role === 'appimage' || item.role === 'deb' || item.role === 'rpm')) {
    const artifactPath = contractArtifactFile(contract, artifact.path)
    const checksumArtifact = contract.frozen.artifactSet.find(item => item.path === `${artifact.path}.sha256`)
    assert(checksumArtifact, `Linux checksum contract is missing for ${artifactPath}`)
    const packageFile = fileWithin(releaseRoot, artifactPath, 'Linux package')
    nonEmptyRegularFile(packageFile, 'Linux package')
    const checksumFile = fileWithin(releaseRoot, contractArtifactFile(contract, checksumArtifact.path), 'Linux package checksum')
    writeFileSync(checksumFile, `${sha256File(packageFile)}  ${artifactPath}\n`, 'utf8')
  }
}

function validatePackagedSmokeEvidence(releaseRoot, platform, version) {
  return PACKAGED_SMOKE_EVIDENCE[platform].map(({ file, kind }) => {
    const evidenceFile = fileWithin(releaseRoot, file, 'Packaged smoke evidence')
    nonEmptyRegularFile(evidenceFile, 'Packaged smoke evidence')
    const evidence = jsonEvidenceFile(evidenceFile, `Packaged smoke evidence ${file}`)
    assert(evidence?.schemaVersion === 1 && evidence?.kind === kind, `Packaged smoke evidence is invalid: ${file}`)
    if (platform === 'linux-x64' && kind === 'linux-package-smoke') {
      const validated = validateLinuxSmokeResults(evidence.cases, version)
      assert(validated.successfulCaseCount === 6 && evidence.platform === 'linux' && evidence.arch === 'x64', 'Linux package smoke evidence summary is invalid')
    }
    if (platform === 'linux-x64' && kind === 'packaged-vector-smoke') {
      assert(evidence.nativeBindings?.betterSqlite3?.binding === 'better-sqlite3' && evidence.nativeBindings.betterSqlite3.operation === 'SELECT 1' && evidence.nativeBindings.betterSqlite3.value === 1, 'Linux packaged SQLite smoke evidence is invalid')
      assert(evidence.projectA?.semanticResultCount === 1 && evidence.projectB?.sameFingerprintRebuilt === true, 'Linux packaged LanceDB smoke evidence is invalid')
    }
    return fileRecord(releaseRoot, file, kind)
  })
}

export function finalizeReleaseEvidence({ platform, evidenceRoot, releaseRoot }) {
  const selectedPlatform = validatePlatform(platform)
  const evidence = readInitializedEvidence(evidenceRoot)
  const contract = evidence.contract
  assert(contract.frozen.platform === selectedPlatform, 'Release evidence platform does not match its contract')
  const packageMetadata = readPackageMetadata()
  assert(contract.frozen.version === packageMetadata.version, 'Release evidence version does not match package.json')

  validateCommandLedger(evidence.ledger, selectedPlatform, false)
  const resolvedReleaseRoot = path.resolve(releaseRoot)
  const temporaryReceipts = validateExactTemporaryReceipts(evidence.resolvedEvidenceRoot, contract, resolvedReleaseRoot)
  mkdirSync(resolvedReleaseRoot, { recursive: true })
  ensureMacChecksum(resolvedReleaseRoot, contract)
  ensureLinuxChecksums(resolvedReleaseRoot, contract)

  const artifacts = contract.frozen.artifactSet.map(artifact => {
    const file = contractArtifactFile(contract, artifact.path)
    const record = fileRecord(resolvedReleaseRoot, file, artifact.role)
    return { ...record, role: artifact.role }
  })

  evidence.ledger.run.endedAt = now()
  validateCommandLedger(evidence.ledger, selectedPlatform, true)
  writeFileSync(evidence.ledgerPath, `${JSON.stringify(evidence.ledger, null, 2)}\n`, 'utf8')
  copyEvidenceFile(evidence.resolvedEvidenceRoot, 'release-contract.json', resolvedReleaseRoot, 'qualification/release-contract.json')
  copyEvidenceFile(evidence.resolvedEvidenceRoot, 'run-ledger.json', resolvedReleaseRoot, 'qualification/run-ledger.json')
  for (const temporaryPath of temporaryReceipts) {
    copyEvidenceFile(evidence.resolvedEvidenceRoot, temporaryPath, resolvedReleaseRoot, `qualification/${temporaryPath}`)
  }

  const acceptanceEvidence = contract.frozen.acceptance.evidenceFiles.map(relativePath =>
    fileRecord(resolvedReleaseRoot, relativePath, 'acceptance-receipt'),
  )
  const provenanceEvidence = [
    fileRecord(resolvedReleaseRoot, 'qualification/release-contract.json', 'release-contract'),
    fileRecord(resolvedReleaseRoot, 'qualification/run-ledger.json', 'run-ledger'),
  ]
  const packagedEvidence = validatePackagedSmokeEvidence(resolvedReleaseRoot, selectedPlatform, contract.frozen.version)
  const contractRecord = provenanceEvidence.find(record => record.kind === 'release-contract')
  const ledgerRecord = provenanceEvidence.find(record => record.kind === 'run-ledger')
  const manifest = {
    schemaVersion: 2,
    platform: selectedPlatform,
    architecture: selectedPlatform === 'windows' || selectedPlatform === 'linux-x64' ? 'x64' : macosQualificationEntity(selectedPlatform).architecture,
    commit: contract.frozen.commit,
    tag: contract.frozen.tag,
    version: contract.frozen.version,
    lockfileSha256: contract.frozen.lockfile.textNewlinesLfSha256,
    lockfile: contract.frozen.lockfile,
    nodeVersion: contract.frozen.appToolchain.actualNodeVersion,
    pnpmVersion: contract.frozen.appToolchain.actualPackageManagerVersion,
    runnerImage: {
      os: contract.frozen.runner.actualImageOS,
      version: contract.frozen.runner.actualImageVersion,
    },
    gateLevel: 'RUNTIME_VERIFIED',
    releaseCreated: false,
    contractSha256: contractRecord.sha256,
    ledgerSha256: ledgerRecord.sha256,
    acceptanceProfile: contract.frozen.acceptance.evidenceFiles,
    artifacts,
    evidence: [...provenanceEvidence, ...acceptanceEvidence, ...packagedEvidence],
    ...(isMacosQualificationEntity(selectedPlatform)
      ? { dmgChecksum: `inkweaver-mac-${macosQualificationEntity(selectedPlatform).architecture}-${contract.frozen.version}-installer.dmg.sha256` }
      : {}),
  }
  const manifestPath = path.join(resolvedReleaseRoot, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const checksums = [
    ...artifacts,
    ...provenanceEvidence,
    ...acceptanceEvidence,
    ...packagedEvidence,
    fileRecord(resolvedReleaseRoot, 'manifest.json', 'runtime-verification-manifest'),
  ]
  writeFileSync(
    path.join(resolvedReleaseRoot, 'SHA256SUMS.txt'),
    `${checksums.map(record => `${record.sha256} *${record.file}`).join('\n')}\n`,
    'utf8',
  )
  return { manifestPath, contractPath: path.join(resolvedReleaseRoot, 'qualification', 'release-contract.json') }
}

function jsonEvidenceFile(file, label) {
  try {
    const bytes = readFileSync(file)
    const hasLeadingUtf8Bom = bytes.length >= 3
      && bytes[0] === 0xef
      && bytes[1] === 0xbb
      && bytes[2] === 0xbf
    const jsonBytes = hasLeadingUtf8Bom ? bytes.subarray(3) : bytes
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(jsonBytes)
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseChecksums(text) {
  const records = new Map()
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64}) \*([^\\]+)$/i.exec(line)
    assert(match, `Invalid SHA256SUMS.txt line: ${line}`)
    const file = assertSafeRelativePath(match[2], 'Checksum path')
    assert(!records.has(file), `Duplicate checksum entry: ${file}`)
    records.set(file, match[1].toLowerCase())
  }
  return records
}

function exactFileSet(actual, expected, label) {
  assert(JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()), `${label} file set is not exact; got ${[...actual].join(', ')}`)
}

function assertNoCaseInsensitivePathCollision(files, label) {
  const seen = new Set()
  for (const file of files) {
    const normalized = file.toLowerCase()
    assert(!seen.has(normalized), `${label} has a case-insensitive path collision: ${file}`)
    seen.add(normalized)
  }
}

function artifactFilesFromContract(contract) {
  assert(Array.isArray(contract?.frozen?.artifactSet), 'Release evidence contract artifact set is invalid')
  const expectedArtifacts = platformArtifactSet(contract.frozen.platform, contract.frozen.version)
  assert(JSON.stringify(contract.frozen.artifactSet) === JSON.stringify(expectedArtifacts), 'Release evidence contract artifact set is not the exact platform contract')
  return contract.frozen.artifactSet.map(artifact => contractArtifactFile(contract, artifact.path))
}

function verifyManifestRecord(root, record, label) {
  assert(typeof record?.file === 'string' && Number.isInteger(record?.sizeBytes) && /^[a-f0-9]{64}$/i.test(record?.sha256 ?? ''), `${label} manifest record is invalid`)
  const file = fileWithin(root, record.file, label)
  const metadata = nonEmptyRegularFile(file, label)
  assert(metadata.size === record.sizeBytes, `${label} manifest size mismatch: ${record.file}`)
  assert(sha256File(file) === record.sha256.toLowerCase(), `${label} manifest SHA-256 mismatch: ${record.file}`)
}

function validateFrozenContract(contract, { platform, expectedCommit, expectedLockfileSha256, expectedLockfileRawSha256, version, expectedRepository, expectedRunId, expectedRunAttempt, expectedWorkflowPath, expectedWorkflowName, expectedActor, expectedEvent }) {
  assert(contract?.schemaVersion === 2 && contract?.stage === 'qualification', 'Release evidence contract schema is invalid')
  assert(contract.frozen?.platform === platform, 'Release evidence contract platform is invalid')
  assert(contract.frozen?.version === version && contract.frozen?.tag === `v${version}`, 'Release evidence contract version/tag is invalid')
  const workflow = qualificationWorkflowIdentity({
    platform,
    workflowPath: contract.frozen?.workflow?.path,
    workflowName: contract.frozen?.workflow?.name,
    actor: contract.frozen?.workflow?.actor,
    event: contract.frozen?.workflow?.event,
    dispatchInputs: contract.frozen?.workflow?.dispatchInputs,
  })
  if (expectedWorkflowPath !== undefined) assert(workflow.path === expectedWorkflowPath, 'Release evidence contract workflow path does not match expected workflow')
  if (expectedWorkflowName !== undefined) assert(workflow.name === expectedWorkflowName, 'Release evidence contract workflow name does not match expected workflow')
  if (expectedActor !== undefined) assert(workflow.actor === expectedActor, 'Release evidence contract actor does not match the qualification run')
  if (expectedEvent !== undefined) assert(workflow.event === expectedEvent, 'Release evidence contract event does not match the qualification run')
  assert(String(contract.frozen?.commit ?? '').toLowerCase() === expectedCommit, 'Release evidence contract commit does not match expected_sha')
  if (platform === 'linux-x64') {
    assert(contract.frozen.workflow.dispatchInputs.expected_sha === expectedCommit, 'Linux frozen dispatch expected_sha does not match qualified commit')
    assert(contract.frozen.workflow.dispatchInputs.release_tag === `v${version}` && contract.frozen.workflow.dispatchInputs.release_version === version, 'Linux frozen dispatch release identity is invalid')
    assert(contract.frozen.workflow.dispatchInputs.profile_path === '.release/release-profile.json', 'Linux frozen dispatch profile_path is invalid')
  }
  assert(contract.frozen?.lockfile?.textNewlinesLfSha256 === expectedLockfileSha256, 'Release evidence contract canonical lockfile hash does not match qualified source')
  assert(/^[a-f0-9]{64}$/.test(contract.frozen?.lockfile?.rawByteSha256 ?? ''), 'Release evidence contract raw lockfile hash is invalid')
  if (expectedLockfileRawSha256 !== undefined) {
    assert(contract.frozen.lockfile.rawByteSha256 === expectedLockfileRawSha256, 'Release evidence contract raw lockfile hash does not match qualified source')
  }
  assert(contract.frozen?.runner?.expectedLabel && contract.frozen?.runner?.actualImageOS && contract.frozen?.runner?.actualImageVersion, 'Release evidence contract runner evidence is incomplete')
  assert(contract.frozen?.appToolchain?.expectedNodeVersion && contract.frozen?.appToolchain?.actualNodeVersion && contract.frozen?.appToolchain?.expectedPackageManagerVersion && contract.frozen?.appToolchain?.actualPackageManagerVersion, 'Release evidence contract toolchain evidence is incomplete')
  assert(contract.frozen.appToolchain.expectedNodeVersion === contract.frozen.appToolchain.actualNodeVersion, 'Release evidence contract Node version was not qualified against its frozen expectation')
  assert(contract.frozen.appToolchain.expectedPackageManagerVersion === contract.frozen.appToolchain.actualPackageManagerVersion, 'Release evidence contract pnpm version was not qualified against its frozen expectation')
  assert(contract.frozen.appToolchain.source?.expectedNodeVersion === 'qualification workflow init --expected-node-version', 'Release evidence contract Node expectation source is invalid')
  assert(contract.frozen.appToolchain.source?.expectedPackageManagerVersion === 'qualification workflow init --expected-pnpm-version and package.json packageManager', 'Release evidence contract pnpm expectation source is invalid')
  assert(contract.frozen.appToolchain.source?.actualNodeVersion === 'Node process.versions.node' && contract.frozen.appToolchain.source?.actualPackageManagerVersion === 'pnpm --version', 'Release evidence contract actual toolchain source is invalid')
  exactFileSet(contract.frozen?.acceptance?.evidenceFiles ?? [], ACCEPTANCE_PROFILES[platform], 'Release evidence contract acceptance')
  assert(contract.frozen?.signingEvidence?.path === 'qualification/acceptance/signing.json', 'Release evidence contract signing path is invalid')
  if (expectedRepository !== undefined) assert(contract.repository === expectedRepository, 'Release evidence contract repository does not match the promotion plan')
  if (expectedRunId !== undefined) assert(String(contract.frozen?.run?.id) === String(expectedRunId), 'Release evidence contract run ID is invalid')
  assert(String(contract.frozen?.run?.attempt) === String(expectedRunAttempt), 'Release evidence contract run attempt does not match the qualification run')
}

export function verifyQualificationBundle({
  platform,
  bundleRoot,
  expectedCommit,
  expectedLockfileSha256,
  expectedLockfileRawSha256,
  version,
  expectedRepository,
  expectedRunId,
  expectedRunAttempt,
  expectedWorkflowPath,
  expectedWorkflowName,
  expectedActor,
  expectedEvent,
}) {
  const selectedPlatform = validatePlatform(platform)
  const resolvedBundleRoot = path.resolve(bundleRoot)
  const normalizedCommit = String(expectedCommit ?? '').toLowerCase()
  assert(/^[a-f0-9]{40}$/.test(normalizedCommit), 'Expected qualification commit is invalid')
  assert(/^[a-f0-9]{64}$/.test(expectedLockfileSha256 ?? ''), 'Expected canonical lockfile hash is invalid')
  assert(Number.isInteger(expectedRunAttempt) && expectedRunAttempt > 0, 'Expected qualification run attempt is missing or invalid')
  if (expectedLockfileRawSha256 !== undefined) assert(/^[a-f0-9]{64}$/.test(expectedLockfileRawSha256), 'Expected raw lockfile hash is invalid')
  safeVersion(version)

  const contractPath = fileWithin(resolvedBundleRoot, 'qualification/release-contract.json', 'Release evidence contract')
  const ledgerPath = fileWithin(resolvedBundleRoot, 'qualification/run-ledger.json', 'Release evidence ledger')
  const manifestPath = fileWithin(resolvedBundleRoot, 'manifest.json', 'Qualification manifest')
  const checksumPath = fileWithin(resolvedBundleRoot, 'SHA256SUMS.txt', 'Qualification checksums')
  const contract = jsonEvidenceFile(contractPath, 'Release evidence contract')
  validateFrozenContract(contract, {
    platform: selectedPlatform,
    expectedCommit: normalizedCommit,
    expectedLockfileSha256,
    expectedLockfileRawSha256,
    version,
    expectedRepository,
    expectedRunId,
    expectedRunAttempt,
    expectedWorkflowPath,
    expectedWorkflowName,
    expectedActor,
    expectedEvent,
  })
  const ledger = jsonEvidenceFile(ledgerPath, 'Release evidence ledger')
  assert(ledger?.schemaVersion === 2 && ledger?.stage === 'qualification', 'Release evidence ledger schema is invalid')
  assert(ledger.contractSha256 === sha256File(contractPath), 'Release evidence ledger contract hash does not match')
  validateCommandLedger(ledger, selectedPlatform, true)
  assert(String(ledger.run?.commit ?? '').toLowerCase() === normalizedCommit, 'Release evidence ledger commit does not match expected_sha')
  assert(JSON.stringify(ledger.run?.workflow) === JSON.stringify(contract.frozen.workflow), 'Release evidence ledger workflow identity does not match its contract')
  if (expectedRepository !== undefined) assert(ledger.repository === expectedRepository, 'Release evidence ledger repository does not match the promotion plan')
  if (expectedRunId !== undefined) assert(String(ledger.run?.id) === String(expectedRunId), 'Release evidence ledger run ID does not match the promotion plan')
  assert(String(ledger.run?.attempt) === String(expectedRunAttempt), 'Release evidence ledger run attempt does not match the qualification run')

  const artifactFiles = artifactFilesFromContract(contract)
  const acceptanceFiles = contract.frozen.acceptance.evidenceFiles
  const packagedSmokeFiles = PACKAGED_SMOKE_EVIDENCE[selectedPlatform].map(record => record.file)
  const expectedEvidenceFiles = [
    'qualification/release-contract.json',
    'qualification/run-ledger.json',
    ...acceptanceFiles,
    ...packagedSmokeFiles,
  ]
  const expectedFiles = ['manifest.json', 'SHA256SUMS.txt', ...artifactFiles, ...expectedEvidenceFiles]
  const actualFiles = listRegularRelativeFiles(resolvedBundleRoot)
  assertNoCaseInsensitivePathCollision(actualFiles, 'Qualification bundle')
  exactFileSet(actualFiles, expectedFiles, 'Qualification bundle')

  for (const acceptanceFile of acceptanceFiles) {
    validateAcceptanceReceipt(fileWithin(resolvedBundleRoot, acceptanceFile, 'Acceptance receipt'), acceptanceFile, selectedPlatform, resolvedBundleRoot, version)
  }
  for (const { file, kind } of PACKAGED_SMOKE_EVIDENCE[selectedPlatform]) {
    const evidence = jsonEvidenceFile(fileWithin(resolvedBundleRoot, file, 'Packaged smoke evidence'), 'Packaged smoke evidence')
    assert(evidence?.schemaVersion === 1 && evidence?.kind === kind, `Packaged smoke evidence is invalid: ${file}`)
    if (selectedPlatform === 'linux-x64' && kind === 'linux-package-smoke') {
      const validated = validateLinuxSmokeResults(evidence.cases, version)
      assert(validated.successfulCaseCount === 6 && evidence.platform === 'linux' && evidence.arch === 'x64', 'Linux package smoke evidence summary is invalid')
    }
    if (selectedPlatform === 'linux-x64' && kind === 'packaged-vector-smoke') {
      assert(evidence.nativeBindings?.betterSqlite3?.binding === 'better-sqlite3' && evidence.nativeBindings.betterSqlite3.operation === 'SELECT 1' && evidence.nativeBindings.betterSqlite3.value === 1, 'Linux packaged SQLite smoke evidence is invalid')
      assert(evidence.projectA?.semanticResultCount === 1 && evidence.projectB?.sameFingerprintRebuilt === true, 'Linux packaged LanceDB smoke evidence is invalid')
    }
  }

  const manifest = jsonEvidenceFile(manifestPath, 'Qualification manifest')
  assert(manifest?.schemaVersion === 2, 'Qualification manifest schema is invalid')
  assert(manifest.platform === selectedPlatform, 'Qualification manifest platform is invalid')
  const expectedArchitecture = selectedPlatform === 'windows' || selectedPlatform === 'linux-x64' ? 'x64' : macosQualificationEntity(selectedPlatform).architecture
  assert(manifest.architecture === expectedArchitecture, 'Qualification manifest architecture is invalid')
  assert(!Object.hasOwn(manifest, 'arch'), 'Qualification manifest must use architecture instead of deprecated arch')
  assert(manifest.version === version && manifest.tag === `v${version}`, 'Qualification manifest version/tag is invalid')
  assert(String(manifest.commit ?? '').toLowerCase() === normalizedCommit, 'Qualification manifest commit does not match expected_sha')
  assert(manifest.gateLevel === 'RUNTIME_VERIFIED' && manifest.releaseCreated === false, 'Qualification manifest release state is invalid')
  assert(manifest.lockfileSha256 === expectedLockfileSha256 && manifest.lockfile?.rawByteSha256 === contract.frozen.lockfile.rawByteSha256, 'Qualification manifest lockfile evidence is invalid')
  assert(manifest.contractSha256 === sha256File(contractPath), 'Qualification manifest contract hash does not match')
  assert(manifest.ledgerSha256 === sha256File(ledgerPath), 'Qualification manifest ledger hash does not match')
  exactFileSet(manifest.acceptanceProfile ?? [], acceptanceFiles, 'Qualification manifest acceptance profile')
  assert(Array.isArray(manifest.artifacts), 'Qualification manifest artifact inventory is invalid')
  exactFileSet(manifest.artifacts.map(record => record?.file), artifactFiles, 'Qualification manifest artifact')
  for (const record of manifest.artifacts) verifyManifestRecord(resolvedBundleRoot, record, 'Qualification artifact')
  assert(Array.isArray(manifest.evidence), 'Qualification manifest evidence inventory is invalid')
  exactFileSet(manifest.evidence.map(record => record?.file), expectedEvidenceFiles, 'Qualification manifest evidence')
  for (const record of manifest.evidence) verifyManifestRecord(resolvedBundleRoot, record, 'Qualification evidence')

  const checksums = parseChecksums(readFileSync(checksumPath, 'utf8'))
  const checksumFiles = [...artifactFiles, ...expectedEvidenceFiles, 'manifest.json']
  exactFileSet(checksums.keys(), checksumFiles, 'Qualification SHA-256')
  for (const [file, digest] of checksums) {
    assert(sha256File(fileWithin(resolvedBundleRoot, file, 'Checksum file')) === digest, `Qualification SHA-256 mismatch: ${file}`)
  }
  if (isMacosQualificationEntity(selectedPlatform)) {
    const dmg = `inkweaver-mac-${macosQualificationEntity(selectedPlatform).architecture}-${version}-installer.dmg`
    const checksum = `${dmg}.sha256`
    assert(manifest.dmgChecksum === checksum, 'macOS qualification manifest checksum file is invalid')
    assert(readFileSync(fileWithin(resolvedBundleRoot, checksum, 'macOS DMG checksum'), 'utf8').trim() === `${sha256File(fileWithin(resolvedBundleRoot, dmg, 'macOS DMG'))}  ${dmg}`, 'macOS DMG checksum file does not match the DMG')
  }
  if (selectedPlatform === 'linux-x64') {
    for (const artifact of contract.frozen.artifactSet.filter(item => ['appimage', 'deb', 'rpm'].includes(item.role))) {
      const packageFile = contractArtifactFile(contract, artifact.path)
      const checksum = packageFile + '.sha256'
      const actual = readFileSync(fileWithin(resolvedBundleRoot, checksum, 'Linux package checksum'), 'utf8').trim()
      assert(actual === `${sha256File(fileWithin(resolvedBundleRoot, packageFile, 'Linux package'))}  ${packageFile}`, `Linux package checksum file does not match: ${packageFile}`)
    }
  }
  return {
    platform: selectedPlatform,
    bundleRoot: resolvedBundleRoot,
    releaseFiles: artifactFiles,
    contractSha256: sha256File(contractPath),
    ledgerSha256: sha256File(ledgerPath),
    manifestSha256: sha256File(manifestPath),
    manifest,
    contract,
    ledger,
  }
}

function parseOptions(argumentsList) {
  const options = {}
  for (let index = 0; index < argumentsList.length; index += 1) {
    const token = argumentsList[index]
    assert(token.startsWith('--'), `Unexpected argument: ${token}`)
    const key = token.slice(2)
    const value = argumentsList[index + 1]
    assert(typeof value === 'string' && !value.startsWith('--'), `--${key} requires a value`)
    options[key] = value
    index += 1
  }
  return options
}

function main() {
  const [command, ...argumentsList] = process.argv.slice(2)
  if (command === 'init') {
    const options = parseOptions(argumentsList)
    initializeReleaseEvidence({
      platform: validatePlatform(requiredOption(options, 'platform')),
      evidenceRoot: requiredOption(options, 'evidence-root'),
      repository: requiredOption(options, 'repository'),
      commit: requiredOption(options, 'commit'),
      runId: requiredOption(options, 'run-id'),
      runAttempt: requiredOption(options, 'run-attempt'),
      runnerLabel: requiredOption(options, 'runner-label'),
      imageOS: requiredOption(options, 'image-os'),
      imageVersion: requiredOption(options, 'image-version'),
      expectedNodeVersion: requiredOption(options, 'expected-node-version'),
      expectedPnpmVersion: requiredOption(options, 'expected-pnpm-version'),
      workflowPath: requiredOption(options, 'workflow-path'),
      workflowName: requiredOption(options, 'workflow-name'),
      actor: requiredOption(options, 'actor'),
      event: requiredOption(options, 'event'),
      dispatchInputs: parseDispatchInputsJson(requiredOption(options, 'dispatch-inputs-json'), options.platform),
    })
    return
  }
  if (command === 'record') {
    const divider = argumentsList.indexOf('--')
    assert(divider >= 0, 'release evidence record requires -- before the command')
    const options = parseOptions(argumentsList.slice(0, divider))
    recordReleaseCommand({
      evidenceRoot: requiredOption(options, 'evidence-root'),
      step: requiredOption(options, 'step'),
      command: argumentsList.slice(divider + 1),
    })
    return
  }
  if (command === 'finalize') {
    const options = parseOptions(argumentsList)
    finalizeReleaseEvidence({
      platform: validatePlatform(requiredOption(options, 'platform')),
      evidenceRoot: requiredOption(options, 'evidence-root'),
      releaseRoot: requiredOption(options, 'release-root'),
    })
    return
  }
  if (command === 'verify-bundle') {
    const options = parseOptions(argumentsList)
    const verified = verifyQualificationBundle({
      platform: validatePlatform(requiredOption(options, 'platform')),
      bundleRoot: requiredOption(options, 'bundle-root'),
      expectedCommit: requiredOption(options, 'expected-commit'),
      expectedLockfileSha256: requiredOption(options, 'expected-lockfile-sha256'),
      expectedLockfileRawSha256: options['expected-lockfile-raw-sha256'],
      version: requiredOption(options, 'version'),
      expectedRepository: options.repository,
      expectedRunId: options['run-id'],
      expectedRunAttempt: Number(requiredOption(options, 'run-attempt')),
      expectedWorkflowPath: options['expected-workflow-path'],
      expectedWorkflowName: options['expected-workflow-name'],
      expectedActor: options['expected-actor'],
      expectedEvent: options['expected-event'],
    })
    process.stdout.write(`${JSON.stringify({
      platform: verified.platform,
      releaseFiles: verified.releaseFiles,
      contractSha256: verified.contractSha256,
      ledgerSha256: verified.ledgerSha256,
    })}\n`)
    return
  }
  throw new Error('Usage: release-evidence-v2.mjs <init|record|finalize|verify-bundle> ...')
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
