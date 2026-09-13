import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('README language variants', () => {
  it('keeps Chinese README as the repository default and uses the local workflow asset', () => {
    const readme = readFileSync('README.md', 'utf8')
    expect(readme).toMatch(/\[English\]\(README_en\.md\)\s*\|\s*\*\*中文\*\*/)
    expect(readme).toContain('# 织墨 / InkWeaver')
    expect(readme).toContain('![InkWeaver continuous writing loop](docs/assets/inkweaver-writing-loop.svg)')
    expect(readme).not.toMatch(/<img\b/iu)
  })

  it('keeps the English README linked to Chinese README and the same local workflow asset', () => {
    const readme = readFileSync('README_en.md', 'utf8')
    expect(readme).toMatch(/\*\*English\*\*\s*\|\s*\[中文\]\(README\.md\)/)
    expect(readme).toContain('# InkWeaver / 织墨')
    expect(readme).toContain('![InkWeaver continuous writing loop](docs/assets/inkweaver-writing-loop.svg)')
    expect(readme).not.toMatch(/<img\b/iu)
  })
})
