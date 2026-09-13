import { describe, expect, it } from 'vitest'

import { collectRuntimeLogCoverage } from '../runtime-log-coverage.mjs'

describe('runtime log coverage contract', () => {
  it('covers application console boundaries and records protocol write allowlists', async () => {
    const report = await collectRuntimeLogCoverage(process.cwd())
    expect(report.capturedBoundaries).toEqual(expect.arrayContaining([
      'electron/services/runtime-logger.ts',
      'src/main.tsx',
      'src/services/runtime-log.ts',
    ]))
    expect(report.uncovered).toEqual([])
    expect(report.allowlist.every(item => item.reason.length > 0)).toBe(true)
  })
})
