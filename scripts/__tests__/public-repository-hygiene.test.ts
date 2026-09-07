import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const prohibitedPaths = [
  'AGENTS.md',
  'CONTEXT.md',
  'design-qa.md',
  'rule.md',
  'rule.lite.md',
  'docs/superpowers',
  'public/screenshot',
  'public/logos',
  'tsconfig.node.tsbuildinfo',
]

describe('public repository hygiene', () => {
  it('does not track internal process material or generated output', () => {
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/)
    for (const target of prohibitedPaths) {
      expect(tracked, target).not.toContain(target)
    }
  })

  it('ignores prohibited local material before it can be staged', () => {
    const rootGitignore = readFileSync('.gitignore', 'utf8')

    for (const entry of [
      '/AGENTS.md',
      '/CONTEXT.md',
      '/docs/superpowers/',
      '/output/',
      '/public/screenshot/',
      '/public/logos/',
      '*.tsbuildinfo',
    ]) {
      expect(rootGitignore).toContain(entry)
    }
  })
})