/* eslint-env node */

import { readFileSync } from 'node:fs'
import path from 'node:path'

export function expectedReleaseAssetNames(version) {
  return [
    `inkweaver-setup-${version}.exe`,
    `inkweaver-setup-${version}.exe.blockmap`,
    'latest.yml',
    `inkweaver-mac-arm64-${version}-installer.dmg`,
    `inkweaver-mac-arm64-${version}-installer.dmg.sha256`,
    `inkweaver-mac-x64-${version}-installer.dmg`,
    `inkweaver-mac-x64-${version}-installer.dmg.sha256`,
  ]
}

export function verifyGithubReleaseAssetContract({ expectedVersion, release, topics }) {
  const expected = expectedReleaseAssetNames(expectedVersion)
  const invalid = []
  if (!release || typeof release !== 'object') invalid.push('release metadata is not an object')
  const tag = release?.tag_name
  if (tag !== `v${expectedVersion}`) invalid.push(`tag ${String(tag)} does not match v${expectedVersion}`)
  if (release?.draft === true) invalid.push('release is still a draft')
  if (release?.prerelease === true) invalid.push('release is a prerelease')
  if (Array.isArray(topics) && !topics.includes('dsh-plugin')) invalid.push('repository topics do not include dsh-plugin')

  const remoteAssets = new Map()
  for (const asset of Array.isArray(release?.assets) ? release.assets : []) {
    if (asset && typeof asset.name === 'string') remoteAssets.set(asset.name, asset)
  }
  const missing = expected.filter(name => !remoteAssets.has(name))
  for (const name of expected) {
    const asset = remoteAssets.get(name)
    if (!asset) continue
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0) invalid.push(`${name} must have a positive byte size`)
    if (typeof asset.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/iu.test(asset.digest)) {
      invalid.push(`${name} must expose a SHA-256 digest`)
    }
  }
  return { ok: missing.length === 0 && invalid.length === 0, tag, missing, invalid, assets: expected }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'InkWeaver-release-backread' } })
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`)
  return response.json()
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

async function main() {
  const version = argument('--version', JSON.parse(readFileSync(path.resolve('package.json'), 'utf8')).version)
  const owner = argument('--owner', 'shuishuipingan')
  const repo = argument('--repo', 'InkWeaver')
  const api = argument('--api-base', 'https://api.github.com').replace(/\/$/u, '')
  const tag = `v${version}`
  const [release, topicResponse] = await Promise.all([
    fetchJson(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tag)}`),
    fetchJson(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/topics`),
  ])
  const result = verifyGithubReleaseAssetContract({ expectedVersion: version, release, topics: topicResponse.names })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
