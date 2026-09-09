/* eslint-env node */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FINAL_SEMVER = /^\d+\.\d+\.\d+$/
const EXPECTED_PLUGIN_NAME = '@shuishuipingan/inkweaver-dsh'

/**
 * Validate the version identity used by the final desktop/plugin freeze.
 * This is intentionally pure so release tests can exercise it without
 * mutating package.json or pretending the development line is released.
 */
export function verifyReleaseVersionSync({
  expectedVersion,
  desktopVersion,
  pluginVersion,
  pluginName,
}) {
  const errors = []
  if (typeof expectedVersion !== 'string' || !FINAL_SEMVER.test(expectedVersion)) {
    errors.push('expected release version must be a final semantic version')
  }
  if (typeof desktopVersion !== 'string' || desktopVersion !== expectedVersion) {
    errors.push(`desktop package version ${String(desktopVersion)} does not match expected ${String(expectedVersion)}`)
  }
  if (typeof pluginVersion !== 'string' || pluginVersion !== expectedVersion) {
    errors.push(`DSH plugin package version ${String(pluginVersion)} does not match expected ${String(expectedVersion)}`)
  }
  if (pluginName !== EXPECTED_PLUGIN_NAME) {
    errors.push(`DSH plugin package name must be ${EXPECTED_PLUGIN_NAME}`)
  }
  return { ok: errors.length === 0, errors }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function expectedVersionFromArg(argv) {
  const index = argv.indexOf('--expected-version')
  if (index < 0 || !argv[index + 1]) throw new Error('Usage: node scripts/release-version-sync.mjs --expected-version <x.y.z>')
  return argv[index + 1]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const expectedVersion = expectedVersionFromArg(process.argv.slice(2))
    const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
    const desktop = readJson(resolve(repositoryRoot, 'package.json'))
    const plugin = readJson(resolve(repositoryRoot, 'plugins/inkweaver-dsh/package.json'))
    const result = verifyReleaseVersionSync({
      expectedVersion,
      desktopVersion: desktop.version,
      pluginVersion: plugin.version,
      pluginName: plugin.name,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
