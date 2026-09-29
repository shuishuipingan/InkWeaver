import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')

describe('Linux desktop package metadata', () => {
  it('provides a maintainer contact accepted by deb and rpm package builders', () => {
    const configText = readFileSync(path.join(repositoryRoot, 'electron-builder.json5'), 'utf8')
      .replace(/^\/\/[^\r\n]*(?:\r?\n|$)/, '')
    const config = JSON.parse(configText) as { linux?: { maintainer?: unknown } }

    const maintainer = config.linux?.maintainer
    expect(typeof maintainer).toBe('string')
    expect(maintainer as string).toMatch(/^InkWeaver Maintainers <[^<>\s]+@[^<>\s]+>$/)
  })
})
