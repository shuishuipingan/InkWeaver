import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')

/** 配置文件是 JSON5（带行注释）；这里按字符串感知方式去注释，保留 URL 里的 //。 */
function stripJson5LineComments(text: string): string {
  let result = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      result += '\n'
      continue
    }
    result += char
  }
  return result
}

interface BuilderConfig {
  linux?: { maintainer?: unknown }
  deb?: { afterInstall?: string }
  rpm?: { afterInstall?: string }
  afterPack?: string
}

function readBuilderConfig(): BuilderConfig {
  const text = stripJson5LineComments(
    readFileSync(path.join(repositoryRoot, 'electron-builder.json5'), 'utf8'),
  )
  return JSON.parse(text) as BuilderConfig
}

describe('Linux desktop package metadata', () => {
  it('provides a maintainer contact accepted by deb and rpm package builders', () => {
    const config = readBuilderConfig()
    const maintainer = config.linux?.maintainer

    expect(typeof maintainer).toBe('string')
    expect(maintainer as string).toMatch(/^InkWeaver Maintainers <[^<>\s]+@[^<>\s]+>$/)
  })

  it('sets the Chromium sandbox helper to root-owned mode 4755 after deb and rpm installation', () => {
    const config = readBuilderConfig()
    const hook = 'scripts/linux-sandbox-post-install.sh'

    expect(config.deb?.afterInstall).toBe(hook)
    expect(config.rpm?.afterInstall).toBe(hook)
    const postInstallScript = readFileSync(path.join(repositoryRoot, hook), 'utf8')
    expect(postInstallScript).toContain('chown root:root "$sandbox_path"')
    expect(postInstallScript).toContain('chmod 4755 "$sandbox_path"')
  })

  it('builds AppImage separately without the privileged sandbox helper', () => {
    const config = readBuilderConfig()
    const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const hook = 'scripts/after-pack.cjs'

    expect(config.afterPack).toBe(hook)
    expect(packageJson.scripts?.['build:linux:artifacts']).toContain('electron-builder --linux deb rpm --x64 --publish never')
    expect(packageJson.scripts?.['build:linux:artifacts']).toContain('AI_NOVEL_LINUX_APPIMAGE_BUILD=1 electron-builder --linux AppImage --x64 --publish never')

    const hookSource = readFileSync(path.join(repositoryRoot, hook), 'utf8')
    expect(hookSource).toContain("require('./linux-appimage-after-pack.cjs')")
    const appImageHook = readFileSync(
      path.join(repositoryRoot, 'scripts/linux-appimage-after-pack.cjs'),
      'utf8',
    )
    expect(appImageHook).toContain('AI_NOVEL_LINUX_APPIMAGE_BUILD')
    expect(appImageHook).toContain('chrome-sandbox')
    expect(appImageHook).toContain("await rm(path.join(context.appOutDir, 'chrome-sandbox')")
  })
})
