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

  it('sets the Chromium sandbox helper to root-owned mode 4755 after deb and rpm installation', () => {
    const configText = readFileSync(path.join(repositoryRoot, 'electron-builder.json5'), 'utf8')
      .replace(/^\/\/[^\r\n]*(?:\r?\n|$)/, '')
    const config = JSON.parse(configText) as {
      deb?: { afterInstall?: string }
      rpm?: { afterInstall?: string }
    }
    const hook = 'scripts/linux-sandbox-post-install.sh'

    expect(config.deb?.afterInstall).toBe(hook)
    expect(config.rpm?.afterInstall).toBe(hook)
    const postInstallScript = readFileSync(path.join(repositoryRoot, hook), 'utf8')
    expect(postInstallScript).toContain('chown root:root "$sandbox_path"')
    expect(postInstallScript).toContain('chmod 4755 "$sandbox_path"')
  })
})
