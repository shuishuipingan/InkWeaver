import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(__dirname, '../..')

function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
}

describe('public homepage contract', () => {
  it('exposes a consistent product-first entry in Chinese and English', () => {
    const chinese = read('README.md')
    const english = read('README_en.md')
    for (const content of [chinese, english]) {
      expect(content).toContain('v1.2.0')
      expect(content).toContain('releases/tag/v1.2.0')
      expect(content).toContain('docs/quickstart/README.md')
      expect(content).toContain('docs/assets/inkweaver-writing-loop.svg')
      expect(content).toContain('@shuishuipingan/inkweaver-dsh')
      expect(content).toMatch(/(?:不发布 npm|npm publication remains out of scope)/u)
      expect(content).toMatch(/(?:未(?:代码)?签名|unsigned|not code-signed)/iu)
    }
  })

  it('keeps the visual flow asset local and accessible', () => {
    const svg = read('docs/assets/inkweaver-writing-loop.svg')
    expect(svg).toMatch(/<title(?:\s|>)/u)
    expect(svg).toMatch(/<desc(?:\s|>)/u)
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/u)
    expect(svg).not.toMatch(/(?:href|xlink:href|src)="https?:\/\//iu)
  })
})
