import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.ps1', '.sh'])
const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules', '.git', '.runtime', '.dsh-upgrade-inspect', '.playwright-cli',
  '.vitest-attachments', 'dist', 'dist-electron', 'build', 'release', '__tests__',
])

function relativeName(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/')
}

async function walk(directory) {
  const result = []
  let entries = []
  try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { return result }
  for (const entry of entries) {
    if (entry.isDirectory() && !IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      result.push(...await walk(path.join(directory, entry.name)))
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      && !/(?:\.test|\.spec|\.browser)\.[^.]+$/u.test(entry.name)) {
      result.push(path.join(directory, entry.name))
    }
  }
  return result
}

function allowlistedProtocol(file, line) {
  const normalized = file.replaceAll('\\', '/')
  if (/^(?:scripts\/|electron\/release-vector-smoke-runner\.ts$|electron\/services\/release-vector-smoke\.ts$)/u.test(normalized)) {
    return 'CLI/qualification protocol output must remain machine-readable; it is not an application event stream.'
  }
  if (normalized === 'electron/main.ts' && /release smoke|JSON\.stringify\(evidence\)|reportReleaseSmokeStage/u.test(line)) {
    return 'Packaged smoke stage and JSON evidence are the documented stdout/stderr protocol.'
  }
  return undefined
}

/**
 * Scan runtime boundaries and return a machine-readable coverage receipt.
 * Console calls in src/electron are covered by the global bridges; CLI
 * protocol writes are explicit allowlist entries with a reason.
 */
export async function collectRuntimeLogCoverage(rootDir = process.cwd()) {
  const absoluteRoot = path.resolve(rootDir)
  const files = (await walk(absoluteRoot)).sort()
  const allowlist = []
  const uncovered = []
  for (const filePath of files) {
    const name = relativeName(absoluteRoot, filePath)
    if (!/^(?:src|electron|scripts)\//u.test(name)) continue
    let source
    try { source = await fs.readFile(filePath, 'utf8') } catch { continue }
    const lines = source.split(/\r?\n/u)
    lines.forEach((line, index) => {
      const lineNumber = index + 1
      if (/process\.(?:stdout|stderr)\.write\s*\(/u.test(line)) {
        const reason = allowlistedProtocol(name, line)
        const item = { file: name, line: lineNumber, expression: 'process.stdout/stderr.write', reason: reason ?? '' }
        if (reason) allowlist.push(item)
        else uncovered.push(item)
      }
      if (/console\.(?:log|info|warn|error|debug)\s*\(/u.test(line) && name.startsWith('scripts/')) {
        allowlist.push({
          file: name,
          line: lineNumber,
          expression: 'console.*',
          reason: 'Standalone CLI output is intentionally outside the Electron application event stream.',
        })
      }
    })
  }
  const capturedBoundaries = [
    'electron/services/runtime-logger.ts',
    'electron/services/runtime-log-capture.ts',
    'src/services/runtime-log.ts',
    'src/main.tsx',
  ].filter(name => files.some(filePath => relativeName(absoluteRoot, filePath) === name))
  return {
    schemaVersion: 1,
    capturedBoundaries,
    allowlist,
    uncovered,
    scannedFiles: files.map(filePath => relativeName(absoluteRoot, filePath)).filter(name => /^(?:src|electron|scripts)\//u.test(name)),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  collectRuntimeLogCoverage().then(report => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (report.uncovered.length > 0) process.exitCode = 1
  }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
