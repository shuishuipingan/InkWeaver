/** Optional real-profile composition check for dsh-web-all tool isolation. */
import { execFile } from 'node:child_process'
import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { makeTestWorkspace } from './test-workspace.ts'

const execFileAsync = promisify(execFile)
const fixtureRoot = join(import.meta.dirname, 'fixtures', 'complete-chapter')
const profileRoot = process.env.DSH_WEB_PROFILE_ROOT
const installedPresetRoot = process.env.DSH_NOVEL_PRESET_ROOT
const realProfileIt = profileRoot === undefined ? it.skip : it

describe('dsh-web-all installed-profile composition', () => {
  realProfileIt('keeps only the two novel tools in every real request header', async () => {
    if (profileRoot === undefined) throw new Error('real-profile test requires DSH_WEB_PROFILE_ROOT')
    if (installedPresetRoot === undefined) throw new Error('real-profile test requires DSH_NOVEL_PRESET_ROOT')
    const workspace = await makeTestWorkspace('web-ui-all-composition-')
    const packageRoot = (packageName: string): string => {
      const profilePackage = join(profileRoot, 'node_modules', ...packageName.split('/'))
      if (existsSync(profilePackage)) return profilePackage
      return join(profileRoot, '..', 'node_modules', ...packageName.split('/'))
    }
    const packageEntry = (packageName: string) => join(packageRoot(packageName), 'lib', 'index.js')
    const fallbackPackages = [
      '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-instructions', '@deepseek-ai/dsh-agent-loop',
      '@deepseek-ai/dsh-agent-presets', '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-persona',
      '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-user-approval',
    ]
    for (const packageName of fallbackPackages) {
      const [scope, name] = packageName.split('/')
      const scopeRoot = join(workspace, 'node_modules', scope!)
      await mkdir(scopeRoot, { recursive: true })
      const target = join(scopeRoot, name!)
      if (!existsSync(target)) await symlink(packageRoot(packageName), target, 'junction')
    }
    const pluginScope = join(workspace, 'node_modules', '@ethanyoq')
    await mkdir(pluginScope, { recursive: true })
    const pluginLink = join(pluginScope, 'dsh-ai-novel-writer')
    if (!existsSync(pluginLink)) await symlink(packageRoot('@ethanyoq/dsh-ai-novel-writer'), pluginLink, 'junction')
    const entries = {
      DSH_WEB_UI_ALL_ENTRY: pathToFileURL(packageEntry('@linxin666/dsh-web-all')).href,
      DSH_WEB_UI_SSH_ENTRY: pathToFileURL(packageEntry('@linxin666/dsh-ssh')).href,
      DSH_WEB_UI_DESCRIBE_ENTRY: pathToFileURL(packageEntry('@linxin666/dsh-tool-describe-image')).href,
      DSH_SNAPSHOT_BACKEND_ENTRY: pathToFileURL(join(fixtureRoot, 'snapshot-backend.mjs')).href,
    }
    await Promise.all(Object.values(entries).map(entry => access(new URL(entry))))
    const configPath = join(workspace, 'web-ui-all.cordis.yml')
    let config = await readFile(join(fixtureRoot, 'web-ui-all.cordis.yml'), 'utf8')
    for (const [name, entry] of Object.entries(entries)) config = config.replaceAll(`__${name}__`, JSON.stringify(entry))
    await writeFile(configPath, config, 'utf8')

    const { stdout } = await execFileAsync(process.execPath, [
      join(fixtureRoot, 'driver.mjs'),
      configPath,
    ], {
      cwd: workspace,
      env: {
        ...process.env,
        DSH_HOME: join(workspace, '.dsh'),
        DSH_AGENTS_HOME: join(workspace, '.agents'),
        DSH_NOVEL_PRESET_ROOT: installedPresetRoot,
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    })
    const requests = stdout.trimEnd().split('\n')
      .map(line => JSON.parse(line) as { type: string; request?: { tools?: { name: string }[] } })
      .filter(line => line.type === 'model_request')
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every(line =>
      line.request?.tools?.map(tool => tool.name).sort().join(',') === 'novel_apply_change,novel_read')).toBe(true)
  }, 45_000)
})
