#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const LINUX_SMOKE_TARGETS = Object.freeze([
  { format: 'deb', distro: 'ubuntu', distroVersion: '22.04', image: 'ubuntu:22.04' },
  { format: 'deb', distro: 'debian', distroVersion: '13', image: 'debian:13-slim' },
  { format: 'rpm', distro: 'fedora', distroVersion: '44', image: 'fedora:44' },
  { format: 'appimage', distro: 'ubuntu', distroVersion: '22.04', image: 'ubuntu:22.04' },
  { format: 'appimage', distro: 'debian', distroVersion: '13', image: 'debian:13-slim' },
  { format: 'appimage', distro: 'fedora', distroVersion: '44', image: 'fedora:44' },
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function safeVersion(value) {
  assert(typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value), 'version must be a safe semantic version')
  return value
}

export function createLinuxSmokeCases(version) {
  const selectedVersion = safeVersion(version)
  return LINUX_SMOKE_TARGETS.map((target, index) => ({
    ...target,
    id: target.format + '-' + target.distro + '-' + target.distroVersion,
    artifact: 'inkweaver-linux-x64-' + selectedVersion + '.' + (target.format === 'appimage' ? 'AppImage' : target.format),
    index,
  }))
}

function versionAtMost(actual, maximum) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)$/.exec(String(value || ''))
    return match ? [Number(match[1]), Number(match[2])] : undefined
  }
  const actualParts = parse(actual)
  const maximumParts = parse(maximum)
  if (!actualParts || !maximumParts) return false
  return actualParts[0] < maximumParts[0]
    || (actualParts[0] === maximumParts[0] && actualParts[1] <= maximumParts[1])
}

function versionAtLeast(actual, minimum) {
  return versionAtMost(minimum, actual)
}

export function validateLinuxSmokeResults(results, expectedVersion) {
  assert(Array.isArray(results), 'Linux smoke results must be an array')
  const cases = createLinuxSmokeCases('1.0.0')
  assert(results.length === cases.length, 'Linux smoke result set must contain the exact Linux smoke case set')
  const byId = new Map(results.map(result => [result && result.id, result]))
  assert(byId.size === cases.length && cases.every(testCase => byId.has(testCase.id)), 'Linux smoke result set must contain the exact Linux smoke case set')
  const checkedCases = cases.map(testCase => {
    const result = byId.get(testCase.id)
    assert(result.format === testCase.format && result.distro === testCase.distro && result.distroVersion === testCase.distroVersion, 'Linux smoke case identity is invalid: ' + testCase.id)
    assert(result.image === testCase.image, 'Linux smoke distro image identity is invalid: ' + testCase.id)
    assert(/^sha256:[a-f0-9]{64}$/i.test(result.imageDigest || ''), 'Linux smoke container image digest is invalid: ' + testCase.id)
    const expectedOsLabel = testCase.distro === 'ubuntu' ? 'Ubuntu 22.04' : testCase.distro === 'debian' ? 'Debian GNU/Linux 13' : 'Fedora Linux 44'
    assert(typeof result.osRelease === 'string' && result.osRelease.includes(expectedOsLabel), 'Linux smoke distribution release identity is invalid: ' + testCase.id)
    const versionMatch = /^inkweaver-linux-x64-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.(AppImage|deb|rpm)$/.exec(String(result.artifact || ''))
    assert(versionMatch && versionMatch[2] === (testCase.format === 'appimage' ? 'AppImage' : testCase.format), 'Linux smoke artifact identity is invalid: ' + testCase.id)
    if (expectedVersion !== undefined) assert(versionMatch[1] === safeVersion(expectedVersion), 'Linux smoke artifact version does not match its qualification contract')
    assert(Number.isInteger(result.installExitCode) && result.installExitCode === 0, 'Linux package install failed: ' + testCase.id)
    assert(Number.isInteger(result.launchExitCode) && result.launchExitCode === 0, 'Linux packaged launch failed: ' + testCase.id)
    assert(result.nativeSqliteValue === 1 && result.nativeLanceDbOperationSucceeded === true, 'Linux native database operation failed: ' + testCase.id)
    assert(Number.isInteger(result.desktopLaunchExitCode) && result.desktopLaunchExitCode === 0, 'Linux packaged desktop startup failed: ' + testCase.id)
    assert(result.desktopWindowReady === true && result.desktopRendererLoaded === true && result.desktopPreloadApiReady === true && result.desktopAppRootReady === true, 'Linux packaged desktop startup failed: ' + testCase.id)
    assert(result.desktopLaunchMode === (testCase.format === 'appimage' ? 'extract-and-run' : 'installed-package'), 'Linux packaged desktop launch mode is invalid: ' + testCase.id)
    assert(versionAtLeast(result.glibcVersion, '2.35'), 'Linux smoke image is older than the glibc 2.35 build baseline: ' + testCase.id)
    assert(result.glibcRequirements && ['electron', 'betterSqlite3', 'lanceDb'].every(name => versionAtMost(result.glibcRequirements[name], '2.35')), 'Packaged binary GLIBC requirement exceeds the Ubuntu 22.04 baseline: ' + testCase.id)
    assert(result.cleanupSucceeded === true, 'Linux smoke cleanup failed: ' + testCase.id)
    if (testCase.format === 'appimage') {
      assert(result.appImageMode === 'fuse' || result.appImageMode === 'extract-and-run', 'Linux AppImage launch mode is invalid: ' + testCase.id)
      assert(['passed', 'failed', 'unavailable'].includes(result.appImageFuseStatus), 'Linux AppImage FUSE observation is invalid: ' + testCase.id)
      assert(Number.isInteger(result.appImageExtractionExitCode) && result.appImageExtractionExitCode === 0, 'Linux AppImage extract-and-run smoke failed: ' + testCase.id)
      assert(result.userNamespaceSandboxReady === true, 'Linux AppImage user namespace sandbox unavailable: ' + testCase.id)
      if (result.appImageFuseStatus === 'passed') assert(result.appImageMode === 'fuse', 'Linux AppImage FUSE result does not match its vector-smoke mode: ' + testCase.id)
      if (result.appImageFuseStatus !== 'passed') assert(result.appImageMode === 'extract-and-run', 'Linux AppImage fallback mode does not match its FUSE result: ' + testCase.id)
    } else {
      assert(result.appImageMode === null, 'Non-AppImage case has an AppImage mode: ' + testCase.id)
      assert(result.appImageFuseStatus === null && result.appImageExtractionExitCode === null, 'Non-AppImage case has AppImage runtime evidence: ' + testCase.id)
    }
    return {
      id: testCase.id, format: testCase.format, distro: testCase.distro, distroVersion: testCase.distroVersion,
      image: testCase.image, imageDigest: result.imageDigest, osRelease: result.osRelease,
      artifact: result.artifact, glibcVersion: result.glibcVersion,
      glibcRequirements: result.glibcRequirements,
      installExitCode: result.installExitCode, launchExitCode: result.launchExitCode,
      nativeSqliteValue: result.nativeSqliteValue,
      nativeLanceDbOperationSucceeded: result.nativeLanceDbOperationSucceeded,
      appImageMode: result.appImageMode,
      appImageFuseStatus: result.appImageFuseStatus,
      appImageExtractionExitCode: result.appImageExtractionExitCode,
      desktopLaunchMode: result.desktopLaunchMode,
      desktopLaunchExitCode: result.desktopLaunchExitCode,
      desktopWindowReady: result.desktopWindowReady,
      desktopRendererLoaded: result.desktopRendererLoaded,
      desktopPreloadApiReady: result.desktopPreloadApiReady,
      desktopAppRootReady: result.desktopAppRootReady,
      userNamespaceSandboxReady: result.userNamespaceSandboxReady,
      cleanupSucceeded: result.cleanupSucceeded,
    }
  })
  return {
    schemaVersion: 1, kind: 'linux-package-smoke', platform: 'linux', arch: 'x64',
    glibcMaximum: '2.35', distroVersions: ['ubuntu-22.04', 'debian-13', 'fedora-44'],
    successfulCaseCount: checkedCases.length, cases: checkedCases,
  }
}

function readOptions(args) {
  const result = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (['--release-root', '--evidence-root', '--version', '--container-runtime'].includes(argument)) {
      const value = args[index + 1]
      assert(typeof value === 'string' && value.length > 0, 'Missing value for ' + argument)
      const key = argument.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())
      result[key] = value
      index += 1
    } else throw new Error('Unsupported argument: ' + argument)
  }
  for (const required of ['releaseRoot', 'evidenceRoot', 'version']) {
    assert(result[required], 'Missing required option: --' + required.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()))
  }
  result.containerRuntime = result.containerRuntime || 'docker'
  return result
}

export function createLinuxSmokeContainerScript(cases, tokens) {
  const rows = cases.map(testCase => [testCase.id, testCase.format, testCase.distro, testCase.distroVersion, testCase.artifact, testCase.image].join('|')).join('\n')
  const fedora = cases[0].distro === 'fedora'
  const debian = cases[0].distro === 'debian'
  const installRuntime = fedora
    ? 'dnf -q install -y binutils util-linux xorg-x11-server-Xvfb xorg-x11-xauth gtk3 nss alsa-lib libXScrnSaver mesa-libgbm at-spi2-atk libX11 libXcomposite libXdamage libXext libXfixes libXrandr libxkbcommon xdg-utils'
    : debian
      ? 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq binutils util-linux xvfb xauth ca-certificates libgtk-3-0t64 libnss3 libxss1 libasound2t64 libgbm1 libatspi2.0-0t64 libatk-bridge2.0-0t64 libdrm2 libxrandr2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3'
      : 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq binutils util-linux xvfb xauth ca-certificates libgtk-3-0 libnss3 libxss1 libasound2 libgbm1 libatspi2.0-0 libatk-bridge2.0-0 libdrm2 libxrandr2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3'
  const installPackage = fedora
    ? 'dnf -q install -y "$package_path"'
    : 'dpkg -i "$package_path" >&2 || { apt-get -f install -y -qq >&2; dpkg -i "$package_path" >&2; }'
  return [
    'set -euo pipefail',
    installRuntime + ' >&2',
    'smoke_root=/tmp/ai-novel-linux-smoke',
    'mkdir -p "$smoke_root/home" "$smoke_root/config" "$smoke_root/cache" "$smoke_root/data" "$smoke_root/desktop-home" "$smoke_root/desktop-config" "$smoke_root/desktop-cache" "$smoke_root/desktop-data"',
    'desktop_uid="$(id -u nobody)" && desktop_gid="$(id -g nobody)"',
    'chown -R "$desktop_uid:$desktop_gid" "$smoke_root/desktop-home" "$smoke_root/desktop-config" "$smoke_root/desktop-cache" "$smoke_root/desktop-data"',
    'getent passwd nobody >/dev/null && command -v runuser >/dev/null',
    'export HOME="$smoke_root/home" XDG_CONFIG_HOME="$smoke_root/config" XDG_CACHE_HOME="$smoke_root/cache" XDG_DATA_HOME="$smoke_root/data"',
    'Xvfb :99 -screen 0 1280x720x24 -ac > "$smoke_root/xvfb.log" 2>&1 &',
    'xvfb_pid=$!',
    'sleep 1',
    'kill -0 "$xvfb_pid"',
    'export DISPLAY=:99',
    'user_namespace_sandbox_ready=false',
    'if runuser -u nobody -- unshare --user --map-root-user true >/dev/null 2>&1; then user_namespace_sandbox_ready=true; fi',
    'export AI_NOVEL_RELEASE_SMOKE=1 AI_NOVEL_RELEASE_SMOKE_TOKEN=' + tokens.vector,
    'export AI_NOVEL_RELEASE_DESKTOP_SMOKE=1 AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN=' + tokens.desktop,
    'glibc_version="$(getconf GNU_LIBC_VERSION | awk \'{print $2}\')"',
    'os_release="$(. /etc/os-release; printf "%s" "$PRETTY_NAME" | tr "|" " ")"',
    'required_glibc() { readelf --dyn-syms --wide "$1" | grep -oE "GLIBC_[0-9]+(\\.[0-9]+)+" | sed "s/GLIBC_//" | sort -V | tail -n 1 || true; }',
    'while IFS="|" read -r case_id case_format case_distro case_distro_version case_artifact case_image; do',
    '  [ -n "$case_id" ] || continue',
    '  if [ "$case_format" = "appimage" ] && [ "$user_namespace_sandbox_ready" != true ]; then echo "AppImage sandbox qualification requires unprivileged user namespaces." >&2; exit 1; fi',
    '  package_path="/artifacts/$case_artifact"',
    '  appimage_mode=""',
    '  appimage_fuse_status=""',
    '  if [ "$case_format" = "deb" ] || [ "$case_format" = "rpm" ]; then',
    '    ' + installPackage,
    '    app_path="$(command -v inkweaver || command -v InkWeaver || find /opt -maxdepth 4 -type f -perm -111 -iname "inkweaver" -print -quit)"',
    '    [ -x "$app_path" ]',
    '  else',
    '    app_path="$smoke_root/$case_artifact"',
    '    cp "$package_path" "$app_path" && chmod 755 "$app_path"',
    '    appimage_mode=extract-and-run',
    '    if [ -c /dev/fuse ]; then',
    '      appimage_fuse_status=failed',
    '      set +e',
    '      "$app_path" --no-sandbox --disable-gpu --ai-novel-release-smoke="$AI_NOVEL_RELEASE_SMOKE_TOKEN" > "$smoke_root/fuse.log" 2>&1',
    '      fuse_exit=$?',
    '      set -e',
    '      if [ "$fuse_exit" -eq 0 ] && grep -q \'"kind":"packaged-vector-smoke"\' "$smoke_root/fuse.log"; then appimage_mode=fuse; appimage_fuse_status=passed; fi',
    '    else appimage_fuse_status=unavailable',
    '    fi',
    '  fi',
    '  set +e',
    '  if [ "$case_format" = "appimage" ] && [ "$appimage_mode" = "extract-and-run" ]; then',
    '    "$app_path" --appimage-extract-and-run --no-sandbox --disable-gpu --ai-novel-release-smoke="$AI_NOVEL_RELEASE_SMOKE_TOKEN" > "$smoke_root/launch.log" 2>&1',
    '  elif [ "$case_format" = "appimage" ]; then cp "$smoke_root/fuse.log" "$smoke_root/launch.log"',
    '  else "$app_path" --no-sandbox --disable-gpu --ai-novel-release-smoke="$AI_NOVEL_RELEASE_SMOKE_TOKEN" > "$smoke_root/launch.log" 2>&1',
    '  fi',
    '  launch_exit=$?',
    '  set -e',
    '  vector_line="$(grep \'"kind":"packaged-vector-smoke"\' "$smoke_root/launch.log" | tail -n 1 || true)"',
    '  if [ "$launch_exit" -ne 0 ] || [ -z "$vector_line" ]; then cat "$smoke_root/launch.log" >&2; exit 1; fi',
    '  desktop_launch_mode=installed-package',
    '  appimage_extraction_exit=""',
    '  if [ "$case_format" = "appimage" ]; then',
    '    desktop_launch_mode=extract-and-run',
    '    set +e',
    '    runuser -u nobody -- env HOME="$smoke_root/desktop-home" XDG_CONFIG_HOME="$smoke_root/desktop-config" XDG_CACHE_HOME="$smoke_root/desktop-cache" XDG_DATA_HOME="$smoke_root/desktop-data" DISPLAY="$DISPLAY" AI_NOVEL_RELEASE_DESKTOP_SMOKE=1 AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN="$AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN" "$app_path" --appimage-extract-and-run --ai-novel-release-desktop-smoke="$AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN" > "$smoke_root/desktop.log" 2>&1',
    '    desktop_exit=$?',
    '    set -e',
    '    appimage_extraction_exit="$desktop_exit"',
    '  else',
    '    set +e',
    '    runuser -u nobody -- env HOME="$smoke_root/desktop-home" XDG_CONFIG_HOME="$smoke_root/desktop-config" XDG_CACHE_HOME="$smoke_root/desktop-cache" XDG_DATA_HOME="$smoke_root/desktop-data" DISPLAY="$DISPLAY" AI_NOVEL_RELEASE_DESKTOP_SMOKE=1 AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN="$AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN" "$app_path" --ai-novel-release-desktop-smoke="$AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN" > "$smoke_root/desktop.log" 2>&1',
    '    desktop_exit=$?',
    '    set -e',
    '  fi',
    '  desktop_line="$(grep \'"kind":"packaged-desktop-smoke"\' "$smoke_root/desktop.log" | tail -n 1 || true)"',
    '  if [ "$desktop_exit" -ne 0 ] || [ -z "$desktop_line" ]; then cat "$smoke_root/desktop.log" >&2; exit 1; fi',
    '  inspect_root="$(readlink -f "$app_path")"',
    '  if [ "$case_format" = "appimage" ]; then (cd "$smoke_root" && "$app_path" --appimage-extract >/dev/null); inspect_root="$smoke_root/squashfs-root"; fi',
    '  inspect_binary="$(find "$inspect_root" -type f -perm -111 -name inkweaver -print -quit)"',
    '  native_root="$(dirname "$inspect_binary")/resources/app.asar.unpacked/node_modules"',
    '  sqlite_binary="$(find "$native_root/better-sqlite3" -type f -name "*.node" -print -quit)"',
    '  lance_binary="$(find "$native_root/@lancedb/lancedb-linux-x64-gnu" -type f -name "*.node" -print -quit)"',
    '  test -n "$inspect_binary" && test -n "$sqlite_binary" && test -n "$lance_binary"',
    '  electron_glibc="$(required_glibc "$inspect_binary")"',
    '  sqlite_glibc="$(required_glibc "$sqlite_binary")"',
    '  lance_glibc="$(required_glibc "$lance_binary")"',
    '  test -n "$electron_glibc" && test -n "$sqlite_glibc" && test -n "$lance_glibc"',
    '  printf "CASE_RESULT|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\\n" "$case_id" "$case_format" "$case_distro" "$case_distro_version" "$case_artifact" "$appimage_mode" "${appimage_fuse_status:-}" "$launch_exit" "${appimage_extraction_exit:--}" "$desktop_launch_mode" "$desktop_exit" "$electron_glibc" "$sqlite_glibc" "$lance_glibc"',
    '  printf "VECTOR_EVIDENCE|%s\\n" "$vector_line"',
    '  printf "DESKTOP_EVIDENCE|%s|%s\\n" "$case_id" "$desktop_line"',
    'done <<\'AI_NOVEL_CASES\'',
    rows,
    'AI_NOVEL_CASES',
    'kill "$xvfb_pid" 2>/dev/null || true',
    'rm -rf "$smoke_root"',
    '[ ! -e "$smoke_root" ]',
    'printf "GROUP_RESULT|%s|%s|true|%s|%s\\n" "' + cases[0].image + '" "$glibc_version" "$os_release" "$user_namespace_sandbox_ready"',
  ].join('\n')
}

function runContainerGroup(runtime, releaseRoot, cases, tokens) {
  const args = [
    'run', '--rm', '--interactive', '--platform', 'linux/amd64',
    '--security-opt', 'seccomp=unconfined', '--security-opt', 'apparmor=unconfined',
    '--sysctl', 'user.max_user_namespaces=15000',
    '--mount', 'type=bind,src=' + releaseRoot + ',dst=/artifacts,readonly',
  ]
  if (existsSync('/dev/fuse')) args.push('--device', '/dev/fuse', '--cap-add', 'SYS_ADMIN')
  args.push(cases[0].image, 'bash', '-s')
  const result = spawnSync(runtime, args, {
    input: createLinuxSmokeContainerScript(cases, tokens), encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) throw result.error
  assert(result.status === 0, 'Linux package smoke container failed for ' + cases[0].image + ': ' + String(result.stderr || result.stdout || '').slice(-6000))
  const lines = String(result.stdout).split(/\r?\n/)
  const imageInspection = spawnSync(runtime, ['image', 'inspect', '--format={{.Id}}', cases[0].image], { encoding: 'utf8', timeout: 30_000 })
  assert(imageInspection.status === 0 && /^sha256:[a-f0-9]{64}$/i.test(String(imageInspection.stdout).trim()), 'Unable to record immutable Linux smoke image digest: ' + cases[0].image)
  const groupLine = lines.find(line => line.startsWith('GROUP_RESULT|'))
  assert(groupLine, 'Linux package smoke container produced no final receipt for ' + cases[0].image)
  const [, image, glibcVersion, cleanup, osRelease, userNamespaceSandbox] = groupLine.split('|')
  const desktopEvidenceById = new Map(lines.filter(line => line.startsWith('DESKTOP_EVIDENCE|')).map(line => {
    const separator = line.indexOf('|', 'DESKTOP_EVIDENCE|'.length)
    assert(separator > 0, 'Linux desktop smoke evidence line is invalid: ' + cases[0].image)
    const id = line.slice('DESKTOP_EVIDENCE|'.length, separator)
    const evidence = JSON.parse(line.slice(separator + 1))
    assert(evidence?.kind === 'packaged-desktop-smoke', 'Linux packaged desktop smoke evidence is invalid: ' + id)
    return [id, evidence]
  }))
  const caseResults = lines.filter(line => line.startsWith('CASE_RESULT|')).map(line => {
    const [, id, format, distro, distroVersion, artifact, appImageMode, appImageFuseStatus, vectorLaunchExitCode, appImageExtractionExitCode, desktopLaunchMode, desktopLaunchExitCode, electronGlibc, sqliteGlibc, lanceGlibc] = line.split('|')
    const desktopEvidence = desktopEvidenceById.get(id)
    assert(desktopEvidence, 'Linux packaged desktop smoke result is missing: ' + id)
    return {
      id, format, distro, distroVersion, image, imageDigest: String(imageInspection.stdout).trim(), osRelease, artifact,
      glibcVersion, glibcRequirements: { electron: electronGlibc, betterSqlite3: sqliteGlibc, lanceDb: lanceGlibc },
      installExitCode: 0, launchExitCode: Number(vectorLaunchExitCode),
      appImageMode: appImageMode || null,
      appImageFuseStatus: appImageFuseStatus || null,
      appImageExtractionExitCode: appImageExtractionExitCode === '-' ? null : Number(appImageExtractionExitCode),
      desktopLaunchMode,
      desktopLaunchExitCode: Number(desktopLaunchExitCode),
      desktopWindowReady: desktopEvidence.windowReady === true,
      desktopRendererLoaded: desktopEvidence.rendererLoaded === true,
      desktopPreloadApiReady: desktopEvidence.preloadApiReady === true,
      desktopAppRootReady: desktopEvidence.appRootReady === true,
      userNamespaceSandboxReady: userNamespaceSandbox === 'true',
      cleanupSucceeded: cleanup === 'true',
    }
  })
  const vectorLines = lines.filter(line => line.startsWith('VECTOR_EVIDENCE|'))
  assert(caseResults.length === cases.length && vectorLines.length === cases.length && desktopEvidenceById.size === cases.length, 'Linux package smoke container returned an incomplete case set: ' + image)
  const vectorEvidence = JSON.parse(vectorLines[0].slice('VECTOR_EVIDENCE|'.length))
  for (const line of vectorLines) {
    const evidence = JSON.parse(line.slice('VECTOR_EVIDENCE|'.length))
    assert(evidence.nativeBindings?.betterSqlite3?.value === 1 && evidence.projectB?.sameFingerprintRebuilt === true, 'Linux packaged native database smoke failed in ' + image)
  }
  return { caseResults, vectorEvidence }
}

function writeReceipt(file, kind, direct, observations, extras = {}) {
  const value = { schemaVersion: 2, kind: 'linux-' + kind, platform: 'linux', arch: 'x64', accepted: true, observations, direct, ...extras }
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function sha256File(file) {
  const bytes = readFileSync(file)
  return createHash('sha256').update(bytes).digest('hex')
}

function writeAcceptanceReceipts(evidenceRoot, releaseRoot, smokeEvidence, vectorEvidence) {
  const directory = path.join(evidenceRoot, 'acceptance')
  mkdirSync(directory, { recursive: true })
  const architecture = { target: 'x64', runnerMachine: 'x86_64' }
  const save = (name, kind, direct, observations, extras) => writeReceipt(path.join(directory, name + '.json'), kind, direct, observations, extras)
  save('install', 'install', {
    architecture,
    cases: smokeEvidence.cases.map(({ id, format, distro, distroVersion, image, imageDigest, osRelease, artifact, installExitCode }) => ({ id, format, distro, distroVersion, image, imageDigest, osRelease, artifact, installExitCode })),
  }, ['Installed the .deb package on Ubuntu 22.04 and Debian 13.', 'Installed the .rpm package on Fedora 44.', 'Staged the AppImage for launch on all three tested distributions.'])
  save('launch', 'launch', {
    architecture,
    cases: smokeEvidence.cases.map(({
      id, format, distro, distroVersion, image, imageDigest, osRelease, glibcVersion, glibcRequirements,
      launchExitCode, appImageMode, appImageFuseStatus, appImageExtractionExitCode, desktopLaunchMode,
      desktopLaunchExitCode, desktopWindowReady, desktopRendererLoaded, desktopPreloadApiReady,
      desktopAppRootReady, userNamespaceSandboxReady, cleanupSucceeded,
    }) => ({
      id, format, distro, distroVersion, image, imageDigest, osRelease, glibcVersion, glibcRequirements,
      launchExitCode, appImageMode, appImageFuseStatus, appImageExtractionExitCode, desktopLaunchMode,
      desktopLaunchExitCode, desktopWindowReady, desktopRendererLoaded, desktopPreloadApiReady,
      desktopAppRootReady, userNamespaceSandboxReady, cleanupSucceeded,
    })),
  }, [
    'Every packaged launch completed the token-gated database smoke.',
    'Every package opened its packaged renderer window and loaded the isolated preload bridge as an unprivileged user under Xvfb.',
    'AppImage extraction startup is tested independently of the optional FUSE vector-smoke attempt.',
    'Temporary HOME, XDG, and application data were isolated and removed.',
  ])
  save('native-abi', 'native-abi', {
    architecture,
    betterSqlite3: vectorEvidence.nativeBindings.betterSqlite3,
    lanceDb: { binding: '@lancedb/lancedb-linux-x64-gnu', projectA: vectorEvidence.projectA.semanticResultCount > 0, projectBBackfill: vectorEvidence.projectB.sameFingerprintRebuilt },
  }, ['Executed better-sqlite3 SELECT 1 and LanceDB import, search, and dimension-backfill operations from the packaged runtime.'])
  save('packaged-smoke', 'packaged-smoke', {
    architecture, evidenceCount: 2, evidenceKinds: ['linux-package-smoke', 'packaged-vector-smoke'],
  }, ['All six Linux package and distribution smoke cases passed.'], {
    evidence: [
      { kind: 'linux-package-smoke', path: 'qualification/linux-package-smoke.json', sha256: sha256File(path.join(releaseRoot, 'qualification', 'linux-package-smoke.json')) },
      { kind: 'packaged-vector-smoke', path: 'qualification/packaged-vector-smoke.json', sha256: sha256File(path.join(releaseRoot, 'qualification', 'packaged-vector-smoke.json')) },
    ],
  })
  save('signing', 'signing', { architecture, status: 'unsigned', distributionImpact: 'Linux packages are unsigned; verify the published SHA-256 checksum before installation.' }, ['Observed the Linux package release as unsigned; SHA-256 sidecars are generated for every package.'], {
    status: 'unsigned', validationResult: 'No Linux package signing identity is configured for this release.',
    unsignedDistributionImpact: 'Linux packages are unsigned; verify the published SHA-256 checksum before installation.',
  })
}

async function main(args = process.argv.slice(2)) {
  const options = readOptions(args)
  assert(process.platform === 'linux' && process.arch === 'x64', 'Linux package qualification must run on an x64 Linux host')
  const releaseRoot = path.resolve(options.releaseRoot)
  const evidenceRoot = path.resolve(options.evidenceRoot)
  const version = safeVersion(options.version)
  const cases = createLinuxSmokeCases(version)
  for (const artifact of new Set(cases.map(testCase => testCase.artifact))) {
    const file = path.resolve(releaseRoot, artifact)
    assert(file.startsWith(releaseRoot + path.sep) && existsSync(file) && statSync(file).isFile(), 'Missing Linux package artifact: ' + artifact)
  }
  const tokens = { vector: randomBytes(32).toString('hex'), desktop: randomBytes(32).toString('hex') }
  const groups = new Map()
  for (const testCase of cases) groups.set(testCase.image, [...(groups.get(testCase.image) || []), testCase])
  const results = []
  for (const group of groups.values()) results.push(runContainerGroup(options.containerRuntime, releaseRoot, group, tokens))
  const rawCases = results.flatMap(group => group.caseResults.map(result => ({
    ...result,
    nativeSqliteValue: group.vectorEvidence.nativeBindings?.betterSqlite3?.value,
    nativeLanceDbOperationSucceeded: group.vectorEvidence.projectB?.sameFingerprintRebuilt === true,
  })))
  const smokeEvidence = validateLinuxSmokeResults(rawCases, version)
  const vectorEvidence = results[0].vectorEvidence
  assert(vectorEvidence.schemaVersion === 1 && vectorEvidence.kind === 'packaged-vector-smoke', 'Linux packaged vector smoke evidence is invalid')
  assert(vectorEvidence.nativeBindings?.betterSqlite3?.binding === 'better-sqlite3' && vectorEvidence.nativeBindings.betterSqlite3.operation === 'SELECT 1' && vectorEvidence.nativeBindings.betterSqlite3.value === 1, 'Linux packaged better-sqlite3 operation evidence is missing')
  assert(vectorEvidence.projectA?.semanticResultCount === 1 && vectorEvidence.projectB?.sameFingerprintRebuilt === true, 'Linux packaged LanceDB operations did not complete')
  const qualification = path.join(releaseRoot, 'qualification')
  mkdirSync(qualification, { recursive: true })
  writeFileSync(path.join(qualification, 'linux-package-smoke.json'), JSON.stringify(smokeEvidence, null, 2) + '\n', 'utf8')
  writeFileSync(path.join(qualification, 'packaged-vector-smoke.json'), JSON.stringify(vectorEvidence, null, 2) + '\n', 'utf8')
  writeAcceptanceReceipts(evidenceRoot, releaseRoot, smokeEvidence, vectorEvidence)
  process.stdout.write(JSON.stringify({ kind: smokeEvidence.kind, successfulCaseCount: smokeEvidence.successfulCaseCount, distroVersions: smokeEvidence.distroVersions }) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main()
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n')
    process.exitCode = 1
  }
}
