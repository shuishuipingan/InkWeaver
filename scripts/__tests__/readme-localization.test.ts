import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('README language variants', () => {
  it('keeps Chinese README as the image-free repository default for 织墨 / InkWeaver', () => {
    const readme = readFileSync('README.md', 'utf8')
    expect(readme).toMatch(/\[English\]\(README_en\.md\)\s*\|\s*\*\*中文\*\*/)
    expect(readme).toContain('# 织墨 / InkWeaver')
    expect(readme).not.toMatch(/<img\b|!\[[^\]]*\]\(/)
  })

  it('keeps the English README image-free and linked to the Chinese README', () => {
    const readme = readFileSync('README_en.md', 'utf8')
    expect(readme).toMatch(/\*\*English\*\*\s*\|\s*\[中文\]\(README\.md\)/)
    expect(readme).toContain('# InkWeaver / 织墨')
    expect(readme).not.toMatch(/<img\b|!\[[^\]]*\]\(/)
  })
})
