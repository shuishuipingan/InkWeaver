import { describe, expect, it, vi } from 'vitest'

import { captureGrowthSnapshot } from '../github-growth-snapshot.mjs'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('GitHub growth snapshot', () => {
  it('captures public metrics with an explicit window and no credentials', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        stargazers_count: 2,
        forks_count: 1,
        subscribers_count: 3,
        watchers_count: 2,
        open_issues_count: 4,
        has_discussions: true,
        default_branch: 'main',
      }))
      .mockResolvedValueOnce(response({ count: 12, uniques: 4, views: [{ timestamp: '2026-09-13T00:00:00Z', count: 12, uniques: 4 }] }))
      .mockResolvedValueOnce(response({ count: 30, uniques: 10, clones: [{ timestamp: '2026-09-13T00:00:00Z', count: 30, uniques: 10 }] }))
      .mockResolvedValueOnce(response([{ referrer: 'github.com', count: 8, uniques: 3 }]))
      .mockResolvedValueOnce(response([{ path: '/owner/repo', title: 'Overview', count: 12, uniques: 4 }]))
      .mockResolvedValueOnce(response([{ tag_name: 'v1.2.0', published_at: '2026-09-13T12:00:00Z', assets: [{ name: 'app.exe', download_count: 5 }] }]))
      .mockResolvedValueOnce(response({ total_count: 1, items: [{ full_name: 'owner/repo' }] }))

    const snapshot = await captureGrowthSnapshot({
      repository: 'owner/repo',
      token: 'gho-test-secret',
      fetchImpl,
      now: () => new Date('2026-09-14T00:00:00Z'),
    })

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      repository: 'owner/repo',
      repositoryStats: { stars: 2, forks: 1, subscribers: 3, discussions: true },
      traffic: { views: { count: 12, uniques: 4 }, clones: { count: 30, uniques: 10 } },
      topicSearch: { totalCount: 1, repositories: ['owner/repo'] },
      interpretation: { cloneIsUserCount: false, trafficMayLag: true },
    })
    expect(JSON.stringify(snapshot)).not.toContain('gho-test-secret')
    expect(JSON.stringify(snapshot)).not.toContain('Authorization')
    expect(fetchImpl).toHaveBeenCalledTimes(7)
  })

  it('keeps optional traffic data explicit when GitHub denies an endpoint', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ stargazers_count: 0, forks_count: 0, subscribers_count: 0, watchers_count: 0, open_issues_count: 0, has_discussions: false, default_branch: 'main' }))
      .mockResolvedValueOnce(response({ message: 'forbidden' }, 403))
      .mockResolvedValueOnce(response({ message: 'forbidden' }, 403))
      .mockResolvedValueOnce(response([], 403))
      .mockResolvedValueOnce(response([], 403))
      .mockResolvedValueOnce(response([], 403))
      .mockResolvedValueOnce(response({ message: 'forbidden' }, 403))

    const snapshot = await captureGrowthSnapshot({ repository: 'owner/repo', fetchImpl, now: () => new Date('2026-09-14T00:00:00Z') })
    expect(snapshot.traffic.views.available).toBe(false)
    expect(snapshot.traffic.clones.available).toBe(false)
    expect(snapshot.interpretation.cloneIsUserCount).toBe(false)
    expect(JSON.stringify(snapshot)).not.toContain('forbidden')
  })
})
