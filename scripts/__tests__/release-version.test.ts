import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('v1.3.20 release metadata', () => {
  it('uses the release version in package metadata', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(pkg.version).toBe('1.3.20')
  })

  it('resolves the release tag and exact thirteen-asset contract from the package version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    const profile = JSON.parse(readFileSync('.release/release-profile.json', 'utf8')) as {
      releaseAssets: Array<{ name: string }>
    }

    expect(`v${pkg.version}`).toBe('v1.3.20')
    expect(profile.releaseAssets.map(({ name }) => name.replaceAll('{version}', pkg.version))).toEqual([
      'inkweaver-setup-1.3.20.exe',
      'inkweaver-setup-1.3.20.exe.blockmap',
      'latest.yml',
      'inkweaver-mac-arm64-1.3.20-installer.dmg',
      'inkweaver-mac-arm64-1.3.20-installer.dmg.sha256',
      'inkweaver-mac-x64-1.3.20-installer.dmg',
      'inkweaver-mac-x64-1.3.20-installer.dmg.sha256',
      'inkweaver-linux-x64-1.3.20.AppImage',
      'inkweaver-linux-x64-1.3.20.AppImage.sha256',
      'inkweaver-linux-x64-1.3.20.deb',
      'inkweaver-linux-x64-1.3.20.deb.sha256',
      'inkweaver-linux-x64-1.3.20.rpm',
      'inkweaver-linux-x64-1.3.20.rpm.sha256',
    ])
  })

  it('documents the bilingual v1.2.0 feature set, platform coverage, and security disclosure', () => {
    const chineseReadme = readFileSync('README.md', 'utf8')
    const englishReadme = readFileSync('README_en.md', 'utf8')

    for (const expected of [
      'v1.2.0',
      '长篇一致性上下文继承',
      '伏笔与叙事线索系统',
      'EPUB 导入',
      '缩放、平移和一键清空',
      '章节模型与字数控制',
      '人工审稿闭环',
      '差异对比',
      '模型高级设置',
      '获取模型列表',
      '重复任务',
      '更准确的失败提示',
      'macOS Apple Silicon',
      'macOS Intel',
      '13 项资产',
      '未代码签名',
      '未公证',
      'Ubuntu 22.04',
      'Debian 13',
      'Fedora 44',
      'glibc 2.35',
      '.AppImage',
      '.deb',
      '.rpm',
      '--appimage-extract-and-run',
      '未签名',
    ]) {
      expect(chineseReadme).toContain(expected)
    }

    for (const untested of ['Ubuntu 20.04', 'Ubuntu 24.04', 'Debian 12', 'Fedora 43', 'Fedora 45', 'Arch Linux']) {
      expect(chineseReadme).not.toContain(untested)
    }

    for (const expected of [
      'v1.2.0',
      'Long-form continuity context',
      'Foreshadowing and narrative threads',
      'EPUB import',
      'zoom, pan, or clear',
      'Per-chapter model and length control',
      'Human-confirmed review loop',
      'inspect the diff',
      'Advanced model settings',
      'fetch the model list',
      'Duplicate jobs',
      'More precise failure messages',
      'macOS Apple Silicon',
      'macOS Intel',
      '13 assets',
      'not code-signed',
      'not notarized',
      'Ubuntu 22.04',
      'Debian 13',
      'Fedora 44',
      'glibc 2.35',
      '.AppImage',
      '.deb',
      '.rpm',
      '--appimage-extract-and-run',
      'unsigned',
    ]) {
      expect(englishReadme).toContain(expected)
    }

    for (const untested of ['Ubuntu 20.04', 'Ubuntu 24.04', 'Debian 12', 'Fedora 43', 'Fedora 45', 'Arch Linux']) {
      expect(englishReadme).not.toContain(untested)
    }
  })

  it('documents exact tested Linux installation formats and compatibility boundaries in the quickstart and release notes', () => {
    const quickstart = readFileSync('docs/quickstart/README.md', 'utf8')
    const changelog = readFileSync('CHANGELOG.md', 'utf8')
    for (const source of [quickstart, changelog]) {
      for (const expected of [
        'inkweaver-linux-x64-1.3.20.AppImage',
        'inkweaver-linux-x64-1.3.20.deb',
        'inkweaver-linux-x64-1.3.20.rpm',
        'Ubuntu 22.04', 'Debian 13', 'Fedora 44', 'glibc 2.35',
        '--appimage-extract-and-run',
      ]) expect(source).toContain(expected)
      for (const untested of ['Ubuntu 20.04', 'Ubuntu 24.04', 'Debian 12', 'Fedora 43', 'Fedora 45', 'Arch Linux']) {
        expect(source).not.toContain(untested)
      }
    }
  })

  it('keeps stale Mythpen branding out of release metadata', () => {
    const releaseConfig = readFileSync('package.json', 'utf8')
    expect(releaseConfig.toLowerCase()).not.toContain('mythpen')
  })

  it('lets the Windows smoke command discover the current release executable', () => {
    const smokeScript = readFileSync('scripts/smoke-win-app.ps1', 'utf8')
    expect(smokeScript).toContain('package.json')
    expect(smokeScript).toContain('InkWeaver.exe')
  })
})
