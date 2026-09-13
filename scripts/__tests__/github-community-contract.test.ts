import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(process.cwd())

function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
}

describe('GitHub community contract', () => {
  it('defines safe issue forms with reproducible environment fields', () => {
    const files = [
      '.github/ISSUE_TEMPLATE/bug_report.yml',
      '.github/ISSUE_TEMPLATE/feature_request.yml',
      '.github/ISSUE_TEMPLATE/installation.yml',
    ]
    for (const file of files) {
      const content = read(file)
      expect(content).toContain('name:')
      expect(content).toContain('description:')
      expect(content).toContain('body:')
      expect(content).toContain('id: version')
      expect(content).toContain('id: platform')
      expect(content).not.toMatch(/(?:API Key|token|secret|完整正文|full manuscript)/iu)
    }
    expect(read(files[0]!)).toContain('id: reproduction')
    expect(read(files[0]!)).toContain('id: logs')
  })

  it('provides discussion templates and contributor guidance without npm claims', () => {
    const ideas = read('.github/DISCUSSION_TEMPLATE/ideas.yml')
    const questions = read('.github/DISCUSSION_TEMPLATE/questions.yml')
    expect(ideas).toContain('name:')
    expect(questions).toContain('name:')
    const contributing = read('CONTRIBUTING.md')
    const roadmap = read('ROADMAP.md')
    const dsh = read('docs/distribution/DSH-LISTING-SUBMISSION.md')
    for (const content of [contributing, roadmap, dsh]) {
      expect(content).toContain('@shuishuipingan/inkweaver-dsh')
      expect(content).toMatch(/(?:不发布 npm|npm publication is intentionally disabled)/iu)
    }
    expect(contributing).toContain('check-public-tree')
    expect(roadmap).toContain('1.2.0')
    expect(dsh).toContain('dsh-plugin')
  })
})
