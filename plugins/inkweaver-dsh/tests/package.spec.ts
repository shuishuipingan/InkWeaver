import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include, { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as yaml from 'js-yaml'
import { describe, expect, it, vi } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function yamlList(path: string): Promise<unknown[]> {
  const value = yaml.load(await readFile(path, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(value)) throw new TypeError(`${path} must contain a YAML list`)
  return value
}

describe('installable InkWeaver bundle', () => {
  it('keeps an independent public MIT package face linked to its source repository', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    expect(manifest.name).toBe('@shuishuipingan/inkweaver-dsh')
    expect(manifest.version).toBe('1.0.0')
    expect(manifest.private).toBeUndefined()
    expect(manifest.license).toBe('MIT')
    expect(manifest.packageManager).toBe('pnpm@11.11.0')
    expect(manifest.publishConfig).toEqual({ access: 'public' })
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/shuishuipingan/InkWeaver.git',
      directory: 'plugins/inkweaver-dsh',
    })
    expect(manifest.bugs).toEqual({ url: 'https://github.com/shuishuipingan/InkWeaver/issues' })
    expect(manifest.homepage).toBe('https://github.com/shuishuipingan/InkWeaver/tree/main/plugins/inkweaver-dsh#readme')
    for (const packagedFile of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
      await expect(readFile(join(root, packagedFile), 'utf8')).resolves.toContain('MIT')
    }
  })

  it('loads its declared patch through the real Cordis Loader', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string; inject?: string[] } }
    }
    expect(manifest.dsh).toMatchObject({
      bundle: { patch: './cordis.patch.yml' },
      client: {
        platform: 'web',
        inject: [
          '@deepseek-ai/dsh-client-runtime',
          '@deepseek-ai/dsh-client-connection',
          '@deepseek-ai/dsh-client-ui-layout',
          '@deepseek-ai/dsh-client-ui-settings-plugins',
          '@deepseek-ai/dsh-client-ui-sidebar',
        ],
      },
    })
    const patches = await yamlList(join(root, manifest.dsh!.bundle!.patch!))
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    const handle = vi.fn(() => async () => {})
    ctx.provide('connection' as never, { rpc: { handle } } as never)
    ctx.provide('workspaceRegistry' as never, { get: () => undefined } as never)
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    try {
      await ctx.loader.create({
        name: 'cordis:include',
        config: {
          path: pathToFileURL(join(root, 'tests', 'fixtures', 'empty.cordis.yml')).href,
          patches,
        },
      })
      await ctx.loader.await()
      const entry = [...ctx.loader.entries()].find(candidate => candidate.options.id === 'inkweaver')
      expect(entry?.options.name).toBe('@shuishuipingan/inkweaver-dsh')
      expect(entry?.fiber).toBeDefined()
      expect(handle).toHaveBeenCalledWith('/inkweaver', expect.any(Function), { authority: 'loopback' })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('is discovered by the Harness preset registry and mounts only the novel composition', async () => {
    const presetRoot = join(root, 'presets', 'inkweaver')
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(ToolRuntime)
    ctx.provide('workspaceRegistry' as never, { resolveByPath: async () => undefined } as never)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, {
      default: 'inkweaver',
      roots: [{ path: join(root, 'presets'), trust: 'system' }],
      includeUserRoot: false,
    })

    const presets = await ctx.agentPresets.list()
    expect(presets.map(candidate => candidate.id)).toEqual(['inkweaver', 'inkweaver-v2'])
    for (const [id, name, agentExport] of [
      ['inkweaver', '织墨', '@shuishuipingan/inkweaver-dsh/agent'],
      ['inkweaver-v2', '织墨 V2', '@shuishuipingan/inkweaver-dsh/agent-v2'],
    ]) {
      const installed = presets.find(candidate => candidate.id === id)
      expect(installed).toMatchObject({ name, trust: 'system' })
      expect(installed?.broken).toBeUndefined()
      expect(installed?.path).toBe(join(root, 'presets', id, 'agent.cordis.yml'))
      const composition = await yamlList(installed!.path) as Array<{ id?: string; name?: string }>
      expect(composition.map(row => [row.id, row.name])).toEqual([
        ['persona', '@deepseek-ai/dsh-persona'],
        ['agent-instructions', '@deepseek-ai/dsh-agent-instructions'],
        ['novel-agent', agentExport],
      ])
      await expect(ctx.agentPresets.standingKeyFor(id)).resolves.toEqual({ agentPreset: id })
    }
    const preset = presets.find(candidate => candidate.id === 'inkweaver')
    expect(preset).toMatchObject({ name: '织墨', trust: 'system' })
    expect(preset?.broken).toBeUndefined()
    expect(preset?.path).toBe(join(presetRoot, 'agent.cordis.yml'))

    const rows = await yamlList(join(presetRoot, 'agent.cordis.yml')) as Array<{
      id?: string
      name?: string
      config?: { text?: string }
    }>
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['persona', '@deepseek-ai/dsh-persona'],
      ['agent-instructions', '@deepseek-ai/dsh-agent-instructions'],
      ['novel-agent', '@shuishuipingan/inkweaver-dsh/agent'],
    ])
    const metadata = yaml.load(await readFile(join(presetRoot, 'preset.yml'), 'utf8'))
    expect(metadata).toMatchObject({ name: '织墨' })
    expect(JSON.stringify(rows)).not.toMatch(/bash|shell|tool-fs|str-replace|code-mode/i)
    const persona = rows.find(row => row.id === 'persona')?.config?.text ?? ''
    expect(persona).toContain('auto：')
    expect(persona).toContain('fluent-drafting：')
    expect(persona).toContain('consistency-first：')
    expect(persona).toContain('deep-planning：')
    expect(persona).not.toMatch(/reasoningEffort|reasoning[_ -]?effort/i)
    const readme = await readFile(join(root, 'README.md'), 'utf8')
    const documentedPersona = /##### Stable novel persona\r?\n\r?\n```markdown\r?\n([\s\S]*?)\r?\n```/.exec(readme)?.[1]
    expect(documentedPersona?.replaceAll('\r\n', '\n')).toBe(persona)
    await ctx.fiber.dispose()
  })
})
