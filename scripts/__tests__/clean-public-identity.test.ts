import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const retiredMaintainer = ['Ethan', 'YoQ'].join('')
const retiredRepository = ['AI', '-Novel-Writer'].join('')
const retiredPackage = ['@ethan', 'yoq'].join('')
const retiredPlugin = ['dsh-', 'ai-novel', '-writer'].join('')
const forbidden = [
  new RegExp(retiredMaintainer, 'i'),
  new RegExp(retiredRepository, 'i'),
  new RegExp(retiredPackage, 'i'),
]
const oldGitHubUrl = new RegExp(
  'https?:\\/\\/github\\.com\\/' + retiredMaintainer + '\\/' + retiredRepository + '(?:[/?#]|$)',
  'i',
)
const legacyPathAllowlist = new Set([
  'plugins/inkweaver-dsh/src/legacy-project-import.ts',
  'plugins/inkweaver-dsh/tests/legacy-project-import.spec.ts',
  'plugins/inkweaver-dsh/tests/legacy-project-import-races.spec.ts',
])
const identityContractPaths = new Set([
  'scripts/__tests__/clean-public-identity.test.ts',
  'scripts/__tests__/public-repository-hygiene.test.ts',
])
const rootReadmePaths = ['README.md', 'README_en.md'] as const
const extensionReadmePath = 'plugins/inkweaver-dsh/README.md'
const releaseTarballUrl = 'https://github.com/shuishuipingan/InkWeaver/releases/download/v1.0.0/shuishuipingan-inkweaver-dsh-1.0.0.tgz'

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
}

function isBinaryOrGeneratedFixture(relativePath: string, content: Buffer) {
  return content.includes(0)
    || relativePath.startsWith('.vitest-attachments/')
    || relativePath.includes('/__screenshots__/')
    || relativePath.includes('/fixtures/')
}

describe('clean public identity', () => {
  it('keeps the root README files focused on the InkWeaver desktop application', () => {
    for (const relativePath of rootReadmePaths) {
      const content = readFileSync(resolve(process.cwd(), relativePath), 'utf8')

      expect(content, relativePath).toContain('v1.0.0')
      expect(content, relativePath).not.toMatch(/DeepSeek Harness (?:plugin|插件)/i)
      expect(content, relativePath).not.toMatch(new RegExp(retiredPackage + '|' + retiredPlugin, 'i'))
      expect(content, relativePath).not.toMatch(/\[[^\]]*(?:plugin|插件)[^\]]*\]\([^)]*\)/i)
    }
  })

  it('documents the release-built InkWeaver DSH Extension and active project format', () => {
    const content = readFileSync(resolve(process.cwd(), extensionReadmePath), 'utf8')

    expect(content).toContain('InkWeaver DSH Extension')
    expect(content).toContain('.inkweaver')
    expect(content).toContain(releaseTarballUrl)
  })

  it('keeps tracked public files free of legacy names and the old repository URL', () => {
    const violations: string[] = []

    for (const relativePath of trackedFiles()) {
      if (identityContractPaths.has(relativePath)) continue

      const content = readFileSync(resolve(process.cwd(), relativePath))
      if (isBinaryOrGeneratedFixture(relativePath, content)) continue

      const searchable = `${relativePath}\n${content.toString('utf8')}`
      for (const identity of [...forbidden, oldGitHubUrl]) {
        if (identity.test(searchable)) violations.push(`${relativePath}: ${identity}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('confines the legacy .ai-novel project boundary to its dedicated importer', () => {
    const violations: string[] = []

    for (const relativePath of trackedFiles()) {
      if (identityContractPaths.has(relativePath)) continue

      const content = readFileSync(resolve(process.cwd(), relativePath))
      if (isBinaryOrGeneratedFixture(relativePath, content)) continue

      if (!legacyPathAllowlist.has(relativePath) && /\.ai-novel\b/i.test(`${relativePath}\n${content.toString('utf8')}`)) {
        violations.push(relativePath)
      }
    }

    expect(violations).toEqual([])
  })
})
