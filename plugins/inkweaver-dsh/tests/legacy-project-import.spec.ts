import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { importLegacyProject, previewLegacyProjectImport } from '../src/legacy-project-import.ts'
import { openNovelStore, recoverNovelStoreBinding } from '../src/novel-store.ts'
import { makeTestWorkspace } from './test-workspace.ts'

const projectId = '123e4567-e89b-42d3-a456-426614174000'

async function write(path: string, contents: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

async function createLegacyProject(root: string): Promise<void> {
  await write(join(root, '.ai-novel', 'project.json'), `${JSON.stringify({
    formatVersion: 1,
    kind: 'harness-novel-project',
    projectId,
    title: '潮汐来信',
    language: 'zh-CN',
    genre: '奇幻悬疑',
    plannedChapters: 12,
    targetWordsPerChapter: 3000,
    creativeStrategy: 'consistency-first',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  }, null, 2)}\n`)
  await write(join(root, '.ai-novel', 'characters.json'), `${JSON.stringify({
    characters: [{
      id: 'lin-xia', name: '林夏', role: '主角', summary: '追查未来信件的记者。', goal: '找回失踪的弟弟。',
      relationships: [], notes: '保留完整记忆。',
    }],
  }, null, 2)}\n`)
  await write(join(root, '.ai-novel', 'blueprints', 'story.json'), `${JSON.stringify({
    premise: '退潮后出现来自未来的信件。', themes: ['记忆'], world: '近未来海港城。',
    mainPlot: '调查潮汐站旧案。', endingGoal: '公开真相。',
  }, null, 2)}\n`)
  await write(join(root, '.ai-novel', 'blueprints', 'chapters', '0001.json'), `${JSON.stringify({
    chapter: 1, title: '退潮来信', purpose: '收到第一封信。', beats: ['夜潮退去'],
    characterIds: ['lin-xia'], continuityNotes: [], status: 'drafted',
  }, null, 2)}\n`)
  await write(join(root, 'chapters', '0001.md'), '# 第一章\n\n潮水退去。\n')
}

describe('legacy project import boundary', () => {
  it('previews legacy bytes without creating or changing any file', async () => {
    const root = await makeTestWorkspace('legacy-preview-read-only-')
    await createLegacyProject(root)
    const beforeEntries = await readdir(root)
    const beforeManifest = await readFile(join(root, '.ai-novel', 'project.json'), 'utf8')

    const preview = await previewLegacyProjectImport(root)

    expect(preview).toMatchObject({ projectId, sourceCount: 5, chapterCount: 1, draftCount: 1 })
    expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(await readdir(root)).toEqual(beforeEntries)
    await expect(readFile(join(root, '.ai-novel', 'project.json'), 'utf8')).resolves.toBe(beforeManifest)
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a fingerprint that was not the preview shown to the user', async () => {
    const root = await makeTestWorkspace('legacy-preview-fingerprint-')
    await createLegacyProject(root)

    await expect(importLegacyProject(root, '0'.repeat(64))).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('publishes one validated InkWeaver tree and leaves the legacy tree byte-identical', async () => {
    const root = await makeTestWorkspace('legacy-import-publish-')
    await createLegacyProject(root)
    const beforeManifest = await readFile(join(root, '.ai-novel', 'project.json'), 'utf8')
    const preview = await previewLegacyProjectImport(root)

    const receipt = await importLegacyProject(root, preview.fingerprint)

    expect(receipt).toMatchObject({ projectId, fingerprint: preview.fingerprint, sourceCount: 5, chapterCount: 1, draftCount: 1 })
    expect((await readdir(root)).filter(name => name.includes('.staging'))).toEqual([])
    await expect(readFile(join(root, '.ai-novel', 'project.json'), 'utf8')).resolves.toBe(beforeManifest)
    await expect(access(join(root, '.inkweaver', 'novel.db'))).resolves.toBeUndefined()
    await expect(readFile(join(root, receipt.archivePath, '.ai-novel', 'project.json'), 'utf8')).resolves.toBe(beforeManifest)
    const store = await openNovelStore(root, WorkspaceId(projectId))
    try {
      await expect(store.read(new AbortController().signal)).resolves.toMatchObject({
        project: { title: '潮汐来信' },
        architecture: { premise: '退潮后出现来自未来的信件。' },
        characters: { items: [{ characterId: 'lin-xia', name: '林夏' }] },
        chapters: [{ chapter: 1, title: '退潮来信', status: 'reviewing' }],
        artifacts: [{ chapter: 1, kind: 'draft', content: '# 第一章\n\n潮水退去。\n' }],
        migration: { fingerprint: preview.fingerprint },
      })
    } finally {
      await store.dispose()
    }
  })

  it('is fail-safe under a different host Workspace ID and supports explicit reattachment', async () => {
    const root = await makeTestWorkspace('legacy-import-reattach-')
    await createLegacyProject(root)
    const preview = await previewLegacyProjectImport(root)
    const receipt = await importLegacyProject(root, preview.fingerprint)
    const hostWorkspaceId = WorkspaceId('123e4567-e89b-42d3-a456-426614174201')

    expect(receipt).toMatchObject({ requiresWorkspaceReattach: true, importedWorkspaceId: projectId })
    const detached = await openNovelStore(root, hostWorkspaceId)
    await expect(detached.read(new AbortController().signal)).resolves.toMatchObject({ readOnly: true })
    await detached.dispose()

    await expect(recoverNovelStoreBinding(root, hostWorkspaceId, 'reattach', new AbortController().signal))
      .resolves.toMatchObject({ workspaceId: hostWorkspaceId, mode: 'reattach' })
    const attached = await openNovelStore(root, hostWorkspaceId)
    try {
      await expect(attached.read(new AbortController().signal)).resolves.toMatchObject({ readOnly: false })
    } finally {
      await attached.dispose()
    }
  })

  it('rejects normal readers while an owned import reservation is incomplete', async () => {
    const root = await makeTestWorkspace('legacy-import-incomplete-')
    await write(join(root, '.inkweaver', '.importing'), 'owned-token\n')

    await expect(openNovelStore(root, WorkspaceId(projectId), { create: false }))
      .rejects.toMatchObject({ code: 'WRITE_LOCKED' })
  })

  it('never replaces an existing InkWeaver directory', async () => {
    const root = await makeTestWorkspace('legacy-import-existing-')
    await createLegacyProject(root)
    const preview = await previewLegacyProjectImport(root)
    await write(join(root, '.inkweaver', 'owner.txt'), 'keep me\n')

    await expect(importLegacyProject(root, preview.fingerprint)).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' })
    await expect(readFile(join(root, '.inkweaver', 'owner.txt'), 'utf8')).resolves.toBe('keep me\n')
  })

  it('rejects invalid legacy relationships before creating an InkWeaver tree', async () => {
    const root = await makeTestWorkspace('legacy-import-invalid-')
    await createLegacyProject(root)
    const charactersPath = join(root, '.ai-novel', 'characters.json')
    const characters = JSON.parse(await readFile(charactersPath, 'utf8')) as { characters: Array<Record<string, unknown>> }
    characters.characters[0]!.relationships = [{ characterId: 'missing', type: '合作', summary: '不存在' }]
    await writeFile(charactersPath, `${JSON.stringify(characters, null, 2)}\n`, 'utf8')

    await expect(previewLegacyProjectImport(root)).rejects.toMatchObject({ code: 'INVALID_CONTENT' })
    await expect(access(join(root, '.inkweaver'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
