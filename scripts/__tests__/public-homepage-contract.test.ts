import { existsSync, readFileSync } from 'node:fs'
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
    const version = (JSON.parse(read('package.json')) as { version: string }).version
    for (const content of [chinese, english]) {
      expect(content).toContain(`v${version}`)
      expect(content).toContain(`releases/tag/v${version}`)
      expect(content).toContain('docs/quickstart/README.md')
      expect(content).toContain('docs/assets/inkweaver-writing-loop.svg')
      expect(content).toContain('docs/assets/inkweaver-welcome.png')
      expect(content).toContain('@shuishuipingan/inkweaver-dsh')
      expect(content).toContain('issues/new/choose')
      expect(content).toContain('/discussions')
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
    expect(existsSync(path.join(repositoryRoot, 'docs/assets/inkweaver-welcome.png'))).toBe(true)
  })

  it('does not publish broken relative links in the three public README entry points', () => {
    for (const relativeFile of ['README.md', 'README_en.md', 'README_zh.md']) {
      const content = read(relativeFile)
      const links = [...content.matchAll(/\]\(([^)]+)\)/gu)].map(match => match[1]!)
      for (const link of links) {
        if (/^(?:https?:|mailto:|#)/iu.test(link)) continue
        const target = link.split('#', 1)[0]
        expect(existsSync(path.resolve(repositoryRoot, path.dirname(relativeFile), target)), `${relativeFile} -> ${link}`).toBe(true)
      }
    }
  })
})
