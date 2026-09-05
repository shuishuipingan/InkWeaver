import { access, link, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { makeTestWorkspace, supportsSymbolicLink } from './test-workspace.ts'

const raceHook = vi.hoisted(() => ({
  mode: 'disabled' as 'disabled' | 'drift-source' | 'create-target' | 'create-empty-target' | 'fail-stage-write' | 'swap-source' | 'swap-directory' | 'swap-ancestor' | 'swap-before-ancestor-baseline' | 'replace-staging' | 'mutate-at-commit' | 'open-before-marker' | 'swap-published-db' | 'inject-staged-member' | 'inject-archive-sibling' | 'inject-archive-empty-directories' | 'final-archive-addition' | 'final-archive-parent-swap' | 'final-source-numbered-parent-swap' | 'final-archive-readdir-swap' | 'final-numbered-readdir-swap' | 'swap-gate-before-release-check' | 'audit-recursive-cleanup',
  root: '',
  stagingPath: '',
  swapped: false,
  openerCode: '',
  projectOpenerCode: '',
  recoveryCode: '',
  gateOwner: '',
  recursiveCleanup: false,
  afterFileLstat: false,
  gateLstatCount: 0,
  markerRemoved: false,
  parentSwapArmed: false,
  parentTraversalChecks: 0,
  finalReaddirCount: 0,
}))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const renameDirectory = async (source: string, destination: string): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await actual.rename(source, destination)
        return
      } catch (cause) {
        if (attempt >= 9 || typeof cause !== 'object' || cause === null || !('code' in cause) || cause.code !== 'EPERM') {
          throw cause
        }
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    }
  }
  return {
    ...actual,
    lstat: async (...args: Parameters<typeof actual.lstat>) => {
      const path = args[0].toString()
      if (raceHook.mode === 'swap-before-ancestor-baseline' && !raceHook.afterFileLstat
        && path.endsWith(join('.ai-novel', 'project.json'))) {
        const result = await actual.lstat(...args)
        raceHook.afterFileLstat = true
        return result
      }
      if (raceHook.mode === 'swap-before-ancestor-baseline' && raceHook.afterFileLstat && !raceHook.swapped
        && path === join(raceHook.root, '.ai-novel')) {
        raceHook.swapped = true
        const original = `${path}.original`
        await actual.rename(path, original)
        await actual.mkdir(path)
        await actual.link(join(original, 'project.json'), join(path, 'project.json'))
      }
      if (raceHook.mode === 'swap-gate-before-release-check'
        && path === join(raceHook.root, '.inkweaver.operation-lock')) {
        raceHook.gateLstatCount += 1
        if (raceHook.gateLstatCount === 2) {
          raceHook.swapped = true
          await actual.rename(path, `${path}.owned-original`)
          await actual.mkdir(path)
          await actual.writeFile(join(path, 'unrelated.txt'), 'do not remove\n', 'utf8')
        }
      }
      const archiveChapterDirectory = join(raceHook.root, '.inkweaver', 'imports')
      const sourceChapterDirectory = join(raceHook.root, '.ai-novel', 'blueprints', 'chapters')
      const shouldSwapArchiveParent = raceHook.mode === 'final-archive-parent-swap'
        && raceHook.parentSwapArmed && !raceHook.swapped
        && path.includes(archiveChapterDirectory) && path.endsWith(join('blueprints', 'chapters'))
      const shouldSwapSourceParent = raceHook.mode === 'final-source-numbered-parent-swap'
        && raceHook.parentSwapArmed && !raceHook.swapped && path === sourceChapterDirectory
        && ++raceHook.parentTraversalChecks === 5
      if (shouldSwapArchiveParent || shouldSwapSourceParent) {
        const result = shouldSwapArchiveParent ? await actual.lstat(...args) : undefined
        raceHook.swapped = true
        const original = `${path}.original`
        await actual.rename(path, original)
        await actual.mkdir(path)
        await actual.link(join(original, '0001.json'), join(path, '0001.json'))
        if (shouldSwapSourceParent) {
          await actual.link(join(original, '0002.json'), join(path, '0002.json'))
        }
        return result ?? actual.lstat(...args)
      }
      if (raceHook.mode === 'replace-staging' && !raceHook.swapped && path === raceHook.stagingPath) {
        raceHook.swapped = true
        await renameDirectory(path, `${path}.owned-original`)
        await actual.mkdir(path)
        await actual.writeFile(join(path, 'unrelated.txt'), 'do not delete\n', 'utf8')
      }
      return actual.lstat(...args)
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const path = args[0].toString()
      if (raceHook.mode === 'final-archive-addition' && raceHook.markerRemoved && !raceHook.swapped
        && path.includes(join(raceHook.root, '.inkweaver', 'imports'))
        && path.endsWith(join('.ai-novel', 'project.json'))) {
        raceHook.swapped = true
        await actual.writeFile(join(path, '..', 'unexpected.bin'), 'late addition\n', 'utf8')
        await actual.mkdir(join(path, '..', 'unexpected-empty'))
      }
      if (raceHook.mode === 'swap-before-ancestor-baseline' && raceHook.afterFileLstat && !raceHook.swapped
        && path.endsWith(join('.ai-novel', 'project.json'))) {
        raceHook.swapped = true
        const legacy = join(raceHook.root, '.ai-novel')
        const original = `${legacy}.original`
        await actual.rename(legacy, original)
        await actual.mkdir(legacy)
        await actual.link(join(original, 'project.json'), join(legacy, 'project.json'))
      }
      if (raceHook.mode === 'swap-source' && !raceHook.swapped && path.endsWith(join('.ai-novel', 'project.json'))) {
        raceHook.swapped = true
        await actual.rename(path, `${path}.original`)
        await actual.writeFile(path, '{}\n', 'utf8')
      }
      if (raceHook.mode === 'swap-ancestor' && !raceHook.swapped && path.endsWith(join('.ai-novel', 'project.json'))) {
        raceHook.swapped = true
        const legacy = join(raceHook.root, '.ai-novel')
        const original = `${legacy}.original`
        await actual.rename(legacy, original)
        await actual.mkdir(legacy)
        await link(join(original, 'project.json'), join(legacy, 'project.json'))
      }
      return actual.open(...args)
    },
    readdir: async (...args: Parameters<typeof actual.readdir>) => {
      const path = args[0].toString()
      const archiveChapterDirectory = join(raceHook.root, '.inkweaver', 'imports')
      const isFinalArchiveReaddir = raceHook.mode === 'final-archive-readdir-swap'
        && raceHook.markerRemoved && path.includes(archiveChapterDirectory)
        && path.endsWith(join('blueprints', 'chapters'))
      const isFinalNumberedReaddir = raceHook.mode === 'final-numbered-readdir-swap'
        && raceHook.markerRemoved
        && path === join(raceHook.root, '.ai-novel', 'blueprints', 'chapters')
      if ((isFinalArchiveReaddir || isFinalNumberedReaddir)
        && ++raceHook.finalReaddirCount === 2) {
        raceHook.swapped = true
        const original = join(
          raceHook.root,
          isFinalArchiveReaddir ? '.race-final-archive-original' : '.race-final-numbered-original',
        )
        await renameDirectory(path, original)
        await actual.mkdir(path)
        await actual.link(join(original, '0001.json'), join(path, '0001.json'))
        if (isFinalNumberedReaddir) {
          await actual.link(join(original, '0002.json'), join(path, '0002.json'))
        }
      }
      if (raceHook.mode === 'swap-directory' && !raceHook.swapped && path.endsWith(join('blueprints', 'chapters'))) {
        raceHook.swapped = true
        await actual.rename(path, `${path}.original`)
        await actual.mkdir(path)
      }
      if (raceHook.mode === 'inject-staged-member' && !raceHook.swapped
        && path.includes('.inkweaver.import-') && path.endsWith('.inkweaver')) {
        raceHook.swapped = true
        await actual.writeFile(join(path, 'unexpected.bin'), 'unvalidated\n', 'utf8')
      }
      if (raceHook.mode === 'inject-archive-sibling' && !raceHook.swapped
        && path.includes('.inkweaver.import-') && /^[a-f0-9]{64}$/.test(path.split(/[\\/]/).at(-1) ?? '')) {
        raceHook.swapped = true
        const sibling = join(path, '..', 'other')
        await actual.mkdir(sibling)
        await actual.writeFile(join(sibling, 'unvalidated.bin'), 'unvalidated\n', 'utf8')
      }
      if (raceHook.mode === 'inject-archive-empty-directories' && !raceHook.swapped
        && path.includes('.inkweaver.import-') && /^[a-f0-9]{64}$/.test(path.split(/[\\/]/).at(-1) ?? '')) {
        raceHook.swapped = true
        await actual.mkdir(join(path, 'unexpected-empty'))
        await actual.mkdir(join(path, '..', 'other-empty'))
      }
      const result = await actual.readdir(...args)
      if (raceHook.markerRemoved && !raceHook.swapped
        && ((raceHook.mode === 'final-archive-parent-swap'
          && path.includes(join(raceHook.root, '.inkweaver', 'imports'))
          && path.endsWith(join('blueprints', 'chapters')))
        || (raceHook.mode === 'final-source-numbered-parent-swap'
          && path === join(raceHook.root, '.ai-novel', 'blueprints', 'chapters')))) {
        raceHook.parentSwapArmed = true
      }
      return result
    },
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      const destination = args[0].toString()
      if (raceHook.mode === 'open-before-marker' && destination === join(raceHook.root, '.inkweaver')) {
        await actual.mkdir(destination)
        raceHook.gateOwner = await actual.readFile(
          join(raceHook.root, '.inkweaver.operation-lock', '.owner'),
          'utf8',
        )
        try {
          const { openNovelStore } = await import('../src/novel-store.ts')
          const store = await openNovelStore(raceHook.root, WorkspaceId('123e4567-e89b-42d3-a456-426614174000'))
          await store.dispose()
          raceHook.openerCode = 'OPENED'
        } catch (cause) {
          raceHook.openerCode = typeof cause === 'object' && cause !== null && 'code' in cause
            ? String(cause.code)
            : 'UNKNOWN'
        }
        try {
          const { recoverNovelStoreBinding } = await import('../src/novel-store.ts')
          await recoverNovelStoreBinding(
            raceHook.root,
            WorkspaceId('123e4567-e89b-42d3-a456-426614174000'),
            'reattach',
            new AbortController().signal,
          )
          raceHook.recoveryCode = 'OPENED'
        } catch (cause) {
          raceHook.recoveryCode = typeof cause === 'object' && cause !== null && 'code' in cause
            ? String(cause.code)
            : 'UNKNOWN'
        }
        try {
          const { openNovelProject } = await import('../src/novel-project.ts')
          await openNovelProject(raceHook.root).read(
            { kind: 'asset', target: { kind: 'project' } },
            new AbortController().signal,
          )
          raceHook.projectOpenerCode = 'OPENED'
        } catch (cause) {
          raceHook.projectOpenerCode = typeof cause === 'object' && cause !== null && 'code' in cause
            ? String(cause.code)
            : 'UNKNOWN'
        }
        return undefined
      }
      if ((raceHook.mode === 'create-empty-target' || raceHook.mode === 'create-target')
        && destination === join(raceHook.root, '.inkweaver')) {
        await actual.mkdir(destination)
        if (raceHook.mode === 'create-target') await actual.writeFile(join(destination, 'owner.txt'), 'keep me\n', 'utf8')
      }
      return actual.mkdir(...args)
    },
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      const destination = args[0].toString()
      if (raceHook.mode === 'fail-stage-write' && destination.includes(`${join('.inkweaver', 'imports')}`)) {
        throw Object.assign(new Error('simulated staging failure'), { code: 'EIO' })
      }
      if (raceHook.mode === 'replace-staging' && destination.includes(`${join('.inkweaver', 'imports')}`)) {
        raceHook.stagingPath = destination.slice(0, destination.indexOf(`${join('.inkweaver', 'imports')}`) - 1)
        raceHook.swapped = true
        await renameDirectory(raceHook.stagingPath, `${raceHook.stagingPath}.owned-original`)
        await actual.mkdir(raceHook.stagingPath)
        await actual.writeFile(join(raceHook.stagingPath, 'unrelated.txt'), 'do not delete\n', 'utf8')
        throw Object.assign(new Error('simulated staging failure'), { code: 'EIO' })
      }
      const result = await actual.writeFile(...args)
      if (raceHook.mode === 'drift-source'
        && destination.includes(`${join('.inkweaver', 'imports')}`)
        && destination.endsWith(join('.ai-novel', 'project.json'))) {
        const manifest = join(raceHook.root, '.ai-novel', 'project.json')
        const changed = (await actual.readFile(manifest, 'utf8')).replace('潮汐来信', '并发改写')
        await actual.writeFile(manifest, changed, 'utf8')
      }
      return result
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (raceHook.mode === 'create-target' && args[1].toString().endsWith('.inkweaver')) {
        await actual.mkdir(args[1], { recursive: true })
        await actual.writeFile(join(args[1].toString(), 'owner.txt'), 'keep me\n', 'utf8')
      }
      const result = await actual.rename(...args)
      if (raceHook.mode === 'swap-published-db' && args[1].toString().endsWith(join('.inkweaver', 'novel.db'))) {
        await actual.rename(args[1], `${args[1].toString()}.validated-original`)
        await actual.writeFile(args[1], 'not sqlite\n', 'utf8')
      }
      return result
    },
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (raceHook.mode === 'audit-recursive-cleanup' && typeof args[1] === 'object' && args[1]?.recursive === true) {
        raceHook.recursiveCleanup = true
      }
      if (raceHook.mode === 'mutate-at-commit' && args[0].toString().endsWith(join('.inkweaver', '.importing'))) {
        const result = await actual.rm(...args)
        raceHook.markerRemoved = true
        const manifest = join(raceHook.root, '.ai-novel', 'project.json')
        const changed = (await actual.readFile(manifest, 'utf8')).replace('潮汐来信', '提交竞态')
        await actual.writeFile(manifest, changed, 'utf8')
        try {
          const { openNovelStore } = await import('../src/novel-store.ts')
          const store = await openNovelStore(raceHook.root, WorkspaceId('123e4567-e89b-42d3-a456-426614174000'))
          await store.dispose()
          raceHook.openerCode = 'OPENED'
        } catch (cause) {
          raceHook.openerCode = typeof cause === 'object' && cause !== null && 'code' in cause
            ? String(cause.code)
            : 'UNKNOWN'
        }
        return result
      }
      if (args[0].toString().endsWith(join('.inkweaver', '.importing'))) {
        const result = await actual.rm(...args)
        raceHook.markerRemoved = true
        return result
      }
      return actual.rm(...args)
    },
  }
})

const canCreateDirectorySymlink = await supportsSymbolicLink('dir')

afterEach(() => {
  raceHook.mode = 'disabled'
  raceHook.root = ''
  raceHook.stagingPath = ''
  raceHook.swapped = false
  raceHook.openerCode = ''
  raceHook.projectOpenerCode = ''
  raceHook.recoveryCode = ''
  raceHook.gateOwner = ''
  raceHook.recursiveCleanup = false
  raceHook.afterFileLstat = false
  raceHook.gateLstatCount = 0
  raceHook.markerRemoved = false
  raceHook.parentSwapArmed = false
  raceHook.parentTraversalChecks = 0
  raceHook.finalReaddirCount = 0
})

async function createLegacyManifest(root: string): Promise<void> {
  await mkdir(join(root, '.ai-novel'), { recursive: true })
  await writeFile(join(root, '.ai-novel', 'project.json'), `${JSON.stringify({
    formatVersion: 1,
    kind: 'harness-novel-project',
    projectId: '123e4567-e89b-42d3-a456-426614174000',
    title: '潮汐来信',
    language: 'zh-CN',
    genre: '奇幻悬疑',
    plannedChapters: 12,
    targetWordsPerChapter: 3000,
    creativeStrategy: 'consistency-first',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  }, null, 2)}\n`, 'utf8')
}

async function createLegacyChapter(root: string): Promise<void> {
  await mkdir(join(root, '.ai-novel', 'blueprints', 'chapters'), { recursive: true })
  await writeFile(join(root, '.ai-novel', 'blueprints', 'chapters', '0001.json'), `${JSON.stringify({
    chapter: 1,
    title: '退潮来信',
    purpose: '收到第一封信。',
    beats: ['夜潮退去'],
    characterIds: [],
    continuityNotes: [],
    status: 'drafted',
  }, null, 2)}\n`, 'utf8')
}

async function createSecondLegacyChapter(root: string): Promise<void> {
  await writeFile(join(root, '.ai-novel', 'blueprints', 'chapters', '0002.json'), `${JSON.stringify({
    chapter: 2,
    title: '第二封信',
    purpose: '确认潮汐规律。',
    beats: ['再次退潮'],
    characterIds: [],
    continuityNotes: [],
    status: 'planned',
  }, null, 2)}\n`, 'utf8')
}

describe('legacy project import races', () => {
  it.skipIf(!canCreateDirectorySymlink)('rejects a legacy junction that escapes the workspace', async () => {
    const root = await makeTestWorkspace('legacy-import-junction-')
    const outside = await makeTestWorkspace('legacy-import-outside-')
    await createLegacyManifest(root)
    await mkdir(join(outside, 'chapters'), { recursive: true })
    await symlink(join(outside, 'chapters'), join(root, '.ai-novel', 'blueprints'), 'junction')

    const { previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    await expect(previewLegacyProjectImport(root)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects source drift while staging without publishing a partial tree', async () => {
    const root = await makeTestWorkspace('legacy-import-drift-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'drift-source'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not replace a target that appears at the atomic publication boundary', async () => {
    const root = await makeTestWorkspace('legacy-import-publish-race-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'create-target'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' })
    await expect(readFile(join(root, '.inkweaver', 'owner.txt'), 'utf8')).resolves.toBe('keep me\n')
  })

  it('does not replace an empty target that wins the publication reservation race', async () => {
    const root = await makeTestWorkspace('legacy-import-empty-target-race-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'create-empty-target'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' })
    expect(await readdir(join(root, '.inkweaver'))).toEqual([])
  })

  it('leaves a documented fail-closed quarantine instead of recursively cleaning a failed staging path', async () => {
    const root = await makeTestWorkspace('legacy-import-stage-failure-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'fail-stage-write'

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    const quarantines = (await readdir(root)).filter(name => name.startsWith('.inkweaver.import-'))
    expect(quarantines).toHaveLength(1)
    await expect(readFile(join(root, quarantines[0]!, '.import-recovery.json'), 'utf8'))
      .resolves.toContain('fail-closed-staging')
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not read a source file whose identity is swapped between lstat and open', async () => {
    const root = await makeTestWorkspace('legacy-import-source-swap-')
    await createLegacyManifest(root)
    raceHook.mode = 'swap-source'

    const { previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    await expect(previewLegacyProjectImport(root)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
  })

  it('rejects an ancestor-directory swap even when the opened file keeps the same identity', async () => {
    const root = await makeTestWorkspace('legacy-import-ancestor-swap-')
    await createLegacyManifest(root)
    raceHook.mode = 'swap-ancestor'
    raceHook.root = root

    const { previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    await expect(previewLegacyProjectImport(root)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
  })

  it('rejects an ancestor swap after file lstat but before the old ancestor-baseline point', async () => {
    const root = await makeTestWorkspace('legacy-import-ancestor-baseline-race-')
    await createLegacyManifest(root)
    raceHook.mode = 'swap-before-ancestor-baseline'
    raceHook.root = root

    const { previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    await expect(previewLegacyProjectImport(root)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
  })

  it('rejects a source directory swapped while its entries are enumerated', async () => {
    const root = await makeTestWorkspace('legacy-import-directory-swap-')
    await createLegacyManifest(root)
    await mkdir(join(root, '.ai-novel', 'blueprints', 'chapters'), { recursive: true })
    raceHook.mode = 'swap-directory'

    const { previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    await expect(previewLegacyProjectImport(root)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
  })

  it('does not recursively delete a replacement at the owned staging pathname', async () => {
    const root = await makeTestWorkspace('legacy-import-staging-swap-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'replace-staging'

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    await expect(readFile(join(raceHook.stagingPath, 'unrelated.txt'), 'utf8')).resolves.toBe('do not delete\n')
  })

  it('never uses recursive pathname cleanup for import staging', async () => {
    const root = await makeTestWorkspace('legacy-import-no-recursive-cleanup-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'audit-recursive-cleanup'

    await importLegacyProject(root, preview.fingerprint)
    expect(raceHook.recursiveCleanup).toBe(false)
  })

  it('is born fail-closed when a normal opener races between reservation and marker creation', async () => {
    const root = await makeTestWorkspace('legacy-import-born-closed-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'open-before-marker'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).resolves.toMatchObject({ fingerprint: preview.fingerprint })
    expect(raceHook.openerCode).toBe('WRITE_LOCKED')
    expect(raceHook.projectOpenerCode).toBe('WRITE_FAILED')
    expect(raceHook.recoveryCode).toBe('WRITE_LOCKED')
    expect(raceHook.gateOwner).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('keeps readiness closed when the moved database is replaced before commit', async () => {
    const root = await makeTestWorkspace('legacy-import-db-swap-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'swap-published-db'

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    await expect(access(join(root, '.inkweaver', '.importing'))).resolves.toBeUndefined()
  })

  it('does not publish an unexpected staged member that was never validated', async () => {
    const root = await makeTestWorkspace('legacy-import-extra-member-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'inject-staged-member'

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an unexpected sibling archive containing an unvalidated file', async () => {
    const root = await makeTestWorkspace('legacy-import-archive-sibling-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'inject-archive-sibling'

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unexpected empty directories inside and beside the fingerprint archive', async () => {
    const root = await makeTestWorkspace('legacy-import-archive-empty-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'inject-archive-empty-directories'

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('leaves a replacement gate untouched when release observes identity drift', async () => {
    const root = await makeTestWorkspace('legacy-import-gate-release-swap-')
    raceHook.mode = 'swap-gate-before-release-check'
    raceHook.root = root

    const { openNovelStore } = await import('../src/novel-store.ts')
    await expect(openNovelStore(root, WorkspaceId('123e4567-e89b-42d3-a456-426614174000'), { create: false }))
      .rejects.toMatchObject({ code: 'WRITE_LOCKED' })
    expect(raceHook.swapped).toBe(true)
    await expect(readFile(join(root, '.inkweaver.operation-lock', 'unrelated.txt'), 'utf8'))
      .resolves.toBe('do not remove\n')
  })

  it('rejects a file and empty directory added after final archive enumeration', async () => {
    const root = await makeTestWorkspace('legacy-import-final-archive-addition-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'final-archive-addition'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
    await expect(access(join(root, '.inkweaver', '.importing'))).resolves.toBeUndefined()
  })

  it('rejects a nested archive parent replaced after its final enumeration', async () => {
    const root = await makeTestWorkspace('legacy-import-final-archive-parent-')
    await createLegacyManifest(root)
    await createLegacyChapter(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'final-archive-parent-swap'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
    await expect(access(join(root, '.inkweaver', '.importing'))).resolves.toBeUndefined()
  })

  it('rejects a numbered source parent replaced during the final source snapshot', async () => {
    const root = await makeTestWorkspace('legacy-import-final-source-parent-')
    await createLegacyManifest(root)
    await createLegacyChapter(root)
    await createSecondLegacyChapter(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'final-source-numbered-parent-swap'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
    await expect(access(join(root, '.inkweaver', '.importing'))).resolves.toBeUndefined()
  })

  it('rejects an archive parent replaced by the final readdir after its identity check', async () => {
    const root = await makeTestWorkspace('legacy-import-final-archive-readdir-')
    await createLegacyManifest(root)
    await createLegacyChapter(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'final-archive-readdir-swap'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
    expect(raceHook.swapped).toBe(true)
    await expect(access(join(root, '.inkweaver', '.importing'))).resolves.toBeUndefined()
  })

  it('rejects a numbered source parent replaced by the final readdir after its identity check', async () => {
    const root = await makeTestWorkspace('legacy-import-final-numbered-readdir-')
    await createLegacyManifest(root)
    await createLegacyChapter(root)
    await createSecondLegacyChapter(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'final-numbered-readdir-swap'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'PATH_REJECTED' })
    expect(raceHook.swapped).toBe(true)
    await expect(access(join(root, '.inkweaver', '.importing'))).resolves.toBeUndefined()
  })

  it('does not commit when legacy sources mutate at the readiness boundary', async () => {
    const root = await makeTestWorkspace('legacy-import-final-drift-')
    await createLegacyManifest(root)
    const { importLegacyProject, previewLegacyProjectImport } = await import('../src/legacy-project-import.ts')
    const preview = await previewLegacyProjectImport(root)
    raceHook.mode = 'mutate-at-commit'
    raceHook.root = root

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'STALE_REVISION' })
    expect(raceHook.openerCode).toBe('WRITE_LOCKED')
    await expect(access(join(root, '.inkweaver', '.importing'))).resolves.toBeUndefined()
  })
})
