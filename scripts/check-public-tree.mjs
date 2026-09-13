/* eslint-env node */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPOSITORY_RELATIVE = /^(?:[A-Za-z]:[\\/]|[\\/]|(?:\.\.?)(?:[\\/]|$))/u

const RULES = [
  { prefix: '.dsh-upgrade-inspect/', reason: 'local-inspection-output' },
  { prefix: '.playwright-cli/', reason: 'local-browser-output' },
  { prefix: '.snapshot-test-', reason: 'snapshot-test-output' },
  { prefix: '.vitest-attachments/', reason: 'vitest-attachment' },
]

function normalizeRepositoryPath(value) {
  if (typeof value !== 'string') throw new TypeError('repository path must be a string')
  const normalized = value.replaceAll('\\', '/')
  if (normalized.length === 0 || normalized.includes('\0') || REPOSITORY_RELATIVE.test(normalized)) {
    throw new Error(`unsafe repository-relative path: ${value}`)
  }
  const parts = normalized.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`unsafe repository-relative path: ${value}`)
  }
  return normalized
}

function violationFor(repositoryPath) {
  if (repositoryPath.startsWith('_tmp_') && !repositoryPath.includes('/')) {
    return { path: repositoryPath, reason: 'temporary-root-file' }
  }
  for (const rule of RULES) {
    if (repositoryPath.startsWith(rule.prefix)) return { path: repositoryPath, reason: rule.reason }
  }
  if (/(?:^|\/)__tests__\/__screenshots__\//u.test(repositoryPath)) {
    return { path: repositoryPath, reason: 'browser-screenshot-output' }
  }
  return undefined
}

/**
 * Return only generated files that must not be part of the public repository.
 * The function accepts repository-relative paths so it can be tested without
 * reading the user's filesystem or following links.
 */
export function collectPublicTreeViolations(paths) {
  if (!Array.isArray(paths)) throw new TypeError('paths must be an array')
  const violations = []
  const seen = new Set()
  for (const value of paths) {
    const repositoryPath = normalizeRepositoryPath(value)
    const violation = violationFor(repositoryPath)
    if (!violation || seen.has(repositoryPath)) continue
    seen.add(repositoryPath)
    violations.push(violation)
  }
  return violations.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}

function trackedPaths(repositoryRoot) {
  const output = execFileSync('git', ['-C', repositoryRoot, 'ls-files', '-z'], { encoding: 'utf8' })
  return output.split('\0').filter(Boolean)
}

function parseArguments(argv) {
  const json = argv.includes('--json')
  const repositoryRoot = path.resolve(argv.find(value => value.startsWith('--root='))?.slice('--root='.length) || process.cwd())
  return { json, repositoryRoot }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const { json, repositoryRoot } = parseArguments(process.argv.slice(2))
    const violations = collectPublicTreeViolations(trackedPaths(repositoryRoot))
    const report = {
      schemaVersion: 1,
      repositoryRoot,
      trackedPathCount: trackedPaths(repositoryRoot).length,
      violations,
    }
    process.stdout.write(`${JSON.stringify(report, null, json ? 2 : 0)}\n`)
    if (violations.length > 0) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
