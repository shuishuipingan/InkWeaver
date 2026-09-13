import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(process.cwd())

function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
}

describe('public quickstart contract', () => {
  it('documents a complete first-chapter path without requiring hidden credentials', () => {
    const guide = read('docs/quickstart/README.md')
    expect(guide).toContain('releases/tag/v1.2.0')
    expect(guide).toContain('Node.js')
    expect(guide).toContain('pnpm')
    expect(guide).toContain('模型账号')
    expect(guide).toContain('未签名')
    expect(guide).toContain('dsh plugin --profile web add')
    expect(guide).toContain('example-project/story-bible.md')
    expect(guide).toContain('example-project/chapters/chapter-01.md')
    expect(guide).toMatch(/(?:审稿|review)/iu)
    expect(guide).toMatch(/(?:定稿|finalize)/iu)
    expect(guide).toMatch(/(?:下一章|next chapter)/iu)
    expect(guide).not.toMatch(/(?:sk-[A-Za-z0-9]|gh[pousr]_[A-Za-z0-9])/u)
  })

  it('ships an original example with a continuity hook and no secrets', () => {
    const files = [
      'docs/quickstart/example-project/README.md',
      'docs/quickstart/example-project/project-brief.md',
      'docs/quickstart/example-project/story-bible.md',
      'docs/quickstart/example-project/outline.md',
      'docs/quickstart/example-project/chapters/chapter-01.md',
    ]
    for (const file of files) {
      const content = read(file)
      expect(content.trim().length).toBeGreaterThan(0)
      expect(content).not.toMatch(/(?:sk-[A-Za-z0-9]|gh[pousr]_[A-Za-z0-9]|api[_-]?key\s*[:=])/iu)
    }
    const chapter = read(files.at(-1)!)
    expect(chapter).toMatch(/(?:未解|悬念|unresolved|question)/iu)
  })
})
