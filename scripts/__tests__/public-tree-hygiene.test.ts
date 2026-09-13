import { describe, expect, it } from 'vitest'

import { collectPublicTreeViolations } from '../check-public-tree.mjs'

describe('public tree hygiene', () => {
  it('rejects generated paths while retaining product assets and declared visual baselines', () => {
    const result = collectPublicTreeViolations([
      '_tmp_123',
      '.vitest-attachments/failure.png',
      '.snapshot-test-a/trace.json',
      '.playwright-cli/session.json',
      '.dsh-upgrade-inspect/report.json',
      'src/components/editor/__tests__/__screenshots__/generated.png',
      'test/visual-baselines/relationship-graph.png',
      'build/icon.png',
      'src/App.tsx',
      'docs/quickstart/README.md',
    ])

    expect(result).toEqual([
      { path: '.dsh-upgrade-inspect/report.json', reason: 'local-inspection-output' },
      { path: '.playwright-cli/session.json', reason: 'local-browser-output' },
      { path: '.snapshot-test-a/trace.json', reason: 'snapshot-test-output' },
      { path: '.vitest-attachments/failure.png', reason: 'vitest-attachment' },
      { path: '_tmp_123', reason: 'temporary-root-file' },
      { path: 'src/components/editor/__tests__/__screenshots__/generated.png', reason: 'browser-screenshot-output' },
    ])
  })

  it('rejects unsafe absolute and parent paths instead of normalizing them into the report', () => {
    expect(() => collectPublicTreeViolations(['../outside.txt'])).toThrow(/unsafe repository-relative path/u)
    expect(() => collectPublicTreeViolations(['C:/outside.txt'])).toThrow(/unsafe repository-relative path/u)
  })
})
