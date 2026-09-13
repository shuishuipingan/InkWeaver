/* eslint-env node */

import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const API_BASE = 'https://api.github.com'
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u

function assertRepository(repository) {
  if (typeof repository !== 'string' || !REPOSITORY_NAME.test(repository)) {
    throw new Error('repository must be owner/name')
  }
  return repository
}

function endpointUrl(repository, route) {
  return `${API_BASE}/repos/${repository}${route}`
}

function searchUrl(repository) {
  const owner = repository.split('/')[0]
  return `${API_BASE}/search/repositories?q=${encodeURIComponent(`topic:dsh-plugin user:${owner}`)}&per_page=100`
}

async function requestJson(url, fetchImpl, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'InkWeaver-growth-snapshot',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const response = await fetchImpl(url, { headers })
  if (!response.ok) {
    const error = new Error(`GitHub endpoint unavailable (${response.status})`)
    error.status = response.status
    throw error
  }
  return response.json()
}

async function optionalRequest(url, fetchImpl, token) {
  try {
    return { available: true, value: await requestJson(url, fetchImpl, token) }
  } catch (error) {
    return {
      available: false,
      status: Number.isSafeInteger(error?.status) ? error.status : undefined,
    }
  }
}

function trafficSeries(value, key) {
  if (!value?.available || !value.value || !Array.isArray(value.value[key])) {
    return { available: false, ...(value?.status ? { status: value.status } : {}) }
  }
  const series = value.value[key].flatMap(item => (
    item && typeof item.timestamp === 'string'
      ? [{ timestamp: item.timestamp, count: Number(item.count) || 0, uniques: Number(item.uniques) || 0 }]
      : []
  ))
  return {
    available: true,
    count: Number(value.value.count) || 0,
    uniques: Number(value.value.uniques) || 0,
    series,
  }
}

function listEndpoint(value, mapper) {
  if (!value?.available || !Array.isArray(value.value)) {
    return { available: false, ...(value?.status ? { status: value.status } : {}) }
  }
  return { available: true, items: value.value.flatMap(mapper) }
}

function mapReferrer(item) {
  return item && typeof item.referrer === 'string'
    ? { referrer: item.referrer, count: Number(item.count) || 0, uniques: Number(item.uniques) || 0 }
    : []
}

function mapPath(item) {
  return item && typeof item.path === 'string'
    ? { path: item.path, title: typeof item.title === 'string' ? item.title : '', count: Number(item.count) || 0, uniques: Number(item.uniques) || 0 }
    : []
}

function mapRelease(item) {
  if (!item || typeof item.tag_name !== 'string') return []
  return [{
    tag: item.tag_name,
    publishedAt: typeof item.published_at === 'string' ? item.published_at : null,
    assets: Array.isArray(item.assets)
      ? item.assets.flatMap(asset => asset && typeof asset.name === 'string'
        ? [{ name: asset.name, downloads: Number(asset.download_count) || 0, size: Number(asset.size) || 0 }]
        : [])
      : [],
  }]
}

function topicSearchResult(value, repository) {
  if (!value?.available || !value.value || typeof value.value !== 'object') {
    return { available: false, ...(value?.status ? { status: value.status } : {}) }
  }
  const repositories = Array.isArray(value.value.items)
    ? value.value.items.flatMap(item => item && typeof item.full_name === 'string' && item.full_name.toLowerCase() === repository.toLowerCase() ? [item.full_name] : [])
    : []
  return {
    available: true,
    totalCount: Number(value.value.total_count) || 0,
    repositories,
  }
}

function latestTimestamp(series) {
  const values = series.flatMap(item => item?.timestamp ? [Date.parse(item.timestamp)] : [])
    .filter(value => Number.isFinite(value))
  return values.length > 0 ? Math.max(...values) : null
}

/**
 * Read-only GitHub metrics for maintainers. This function deliberately keeps
 * only public counts and never returns response headers, token values, paths
 * from the local machine, or repository contents.
 */
export async function captureGrowthSnapshot({ repository, token, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  assertRepository(repository)
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is unavailable')
  const capturedAt = now().toISOString()
  const base = endpointUrl(repository, '')
  const repositoryResponse = await optionalRequest(base, fetchImpl, token)
  const viewsResponse = await optionalRequest(endpointUrl(repository, '/traffic/views'), fetchImpl, token)
  const clonesResponse = await optionalRequest(endpointUrl(repository, '/traffic/clones'), fetchImpl, token)
  const referrersResponse = await optionalRequest(endpointUrl(repository, '/traffic/popular/referrers'), fetchImpl, token)
  const pathsResponse = await optionalRequest(endpointUrl(repository, '/traffic/popular/paths'), fetchImpl, token)
  const releasesResponse = await optionalRequest(endpointUrl(repository, '/releases?per_page=100'), fetchImpl, token)
  const topicResponse = await optionalRequest(searchUrl(repository), fetchImpl, token)

  const views = trafficSeries(viewsResponse, 'views')
  const clones = trafficSeries(clonesResponse, 'clones')
  const timestamps = [latestTimestamp(views.series ?? []), latestTimestamp(clones.series ?? [])].filter(value => value !== null)
  const lastTrafficAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null
  const nowMs = Date.parse(capturedAt)
  const trafficMayLag = lastTrafficAt === null || Date.parse(lastTrafficAt) <= nowMs - (6 * 60 * 60 * 1000)
  const repositoryData = repositoryResponse.available && repositoryResponse.value && typeof repositoryResponse.value === 'object'
    ? repositoryResponse.value
    : null

  return {
    schemaVersion: 1,
    capturedAt,
    repository,
    window: {
      lastTrafficAt,
      source: 'GitHub traffic API; GitHub may delay the latest day(s)',
    },
    repositoryStats: repositoryData
      ? {
          stars: Number(repositoryData.stargazers_count) || 0,
          forks: Number(repositoryData.forks_count) || 0,
          subscribers: Number(repositoryData.subscribers_count) || 0,
          watchers: Number(repositoryData.watchers_count) || 0,
          openIssues: Number(repositoryData.open_issues_count) || 0,
          discussions: repositoryData.has_discussions === true,
          defaultBranch: typeof repositoryData.default_branch === 'string' ? repositoryData.default_branch : null,
        }
      : { available: false, ...(repositoryResponse.status ? { status: repositoryResponse.status } : {}) },
    traffic: {
      views,
      clones,
      referrers: listEndpoint(referrersResponse, mapReferrer),
      paths: listEndpoint(pathsResponse, mapPath),
    },
    releases: listEndpoint(releasesResponse, mapRelease),
    topicSearch: topicSearchResult(topicResponse, repository),
    interpretation: {
      cloneIsUserCount: false,
      trafficMayLag,
      ciCloneWarning: 'Clone counts can include CI runners and automation; do not equate unique clones with human users.',
      privacy: 'GitHub public metrics only; no application telemetry or writing content is collected.',
    },
  }
}

function parseArguments(argv) {
  const read = (name) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const repository = read('--repository')
  const output = read('--output')
  if (!repository || !output) throw new Error('Usage: node scripts/github-growth-snapshot.mjs --repository owner/name --output path')
  const tokenEnv = read('--token-env') || 'GITHUB_TOKEN'
  return { repository, output: path.resolve(output), token: process.env[tokenEnv] || undefined }
}

async function writeAtomic(output, value) {
  await mkdir(path.dirname(output), { recursive: true })
  const temporary = `${output}.${process.pid}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporary, output)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArguments(process.argv.slice(2))
    const snapshot = await captureGrowthSnapshot(options)
    await writeAtomic(options.output, snapshot)
    process.stdout.write(`${JSON.stringify({ written: options.output, capturedAt: snapshot.capturedAt, repository: snapshot.repository })}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
