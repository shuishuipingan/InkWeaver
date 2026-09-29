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

  it('builds AppImage separately without the privileged sandbox helper', () => {
    const configText = readFileSync(path.join(repositoryRoot, 'electron-builder.json5'), 'utf8')
      .replace(/^\/\/[^\r\n]*(?:\r?\n|$)/, '')
    const config = JSON.parse(configText) as { afterPack?: string }
    const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const hook = 'scripts/linux-appimage-after-pack.cjs'

    expect(config.afterPack).toBe(hook)
    expect(packageJson.scripts?.['build:linux:artifacts']).toContain('electron-builder --linux deb rpm --x64 --publish never')
    expect(packageJson.scripts?.['build:linux:artifacts']).toContain('AI_NOVEL_LINUX_APPIMAGE_BUILD=1 electron-builder --linux AppImage --x64 --publish never')
    const appImageHook = readFileSync(path.join(repositoryRoot, hook), 'utf8')
    expect(appImageHook).toContain('AI_NOVEL_LINUX_APPIMAGE_BUILD')
    expect(appImageHook).toContain('chrome-sandbox')
    expect(appImageHook).toContain("await rm(path.join(context.appOutDir, 'chrome-sandbox')")
  })
})
