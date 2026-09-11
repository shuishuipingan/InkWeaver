import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { openNovelStore } from '../src/novel-store.ts'
import type { NovelProposalRequest, NovelStore, NovelStoreInitializeRequest } from '../src/novel-store.ts'
import { makeTestWorkspace } from './test-workspace.ts'

const signal = new AbortController().signal
const workspaceId = WorkspaceId('123e4567-e89b-42d3-a456-426614174126')
const opened: NovelStore[] = []

const initialization: NovelStoreInitializeRequest = {
  workspaceId,
  title: '潮汐来信',
  language: 'zh-CN',
  genre: '奇幻悬疑',
  plannedChapters: 2,
  targetWordsPerChapter: 3_000,
  creativeStrategy: 'consistency-first',
  structureMode: 'three-act',
  narrativePov: 'third-limited',
  globalGuidance: '保持冷峻而温柔的语气。',
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function proposal(payload: unknown): NovelProposalRequest {
  return {
    sessionId: 'artifact-session',
    callId: `artifact-call-${createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex').slice(0, 8)}`,
    argsHash: createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex'),
    payload,
  }
}

async function initializedStore(): Promise<{ readonly root: string; readonly store: NovelStore }> {
  const root = await makeTestWorkspace('novel-artifacts-')
  const store = await openNovelStore(root, workspaceId)
  opened.push(store)
  await store.initialize(initialization, signal)
  const initial = await store.read(signal)
  await store.applyChange({
    changeSetId: 'artifact-chapter-1-blueprint',
    operation: 'replace',
    aggregate: { kind: 'chapter', chapter: 1 },
    baseAggregateRevision: 0,
    baseGlobalRevision: initial.globalRevision,
    nextValue: {
      chapter: 1,
      title: '第一封信',
      purpose: '建立日常与第一次异常。',
      plotBeats: ['潮汐涨落'],
      characters: [],
      keyEvents: ['未来信件抵达'],
      suspense: '寄信人知道灯塔守会读信。',
      status: 'drafting',
    },
    provenance: { origin: 'manual' },
  }, signal)
  return { root, store }
}

afterEach(async () => {
  await Promise.all(opened.map(store => store.dispose()))
  opened.length = 0
})

describe('NovelStore artifact version chain', () => {
  it('persists draft, review, revision and final selection with bounded previous-final context', async () => {
    const { store } = await initializedStore()
    expect((await store.read(signal)).storage.userVersion).toBe(5)

    const draft = await store.submitProposal(proposal({
      changes: [{
        kind: 'artifact/draft',
        artifactId: 'chapter-1-draft-1',
        chapter: 1,
        content: '潮水退去时，信匣露出了海面。',
        summary: '完成第一章初稿。',
      }],
    }), signal)
    await store.applyProposal(draft.proposal.proposalId, signal)

    const review = await store.submitProposal(proposal({
      changes: [{
        kind: 'artifact/review',
        artifactId: 'chapter-1-review-1',
        chapter: 1,
        parentArtifactId: 'chapter-1-draft-1',
        report: '悬念建立清晰，但需要强化灯塔意象。',
        summary: '完成第一章审稿。',
      }],
    }), signal)
    await store.applyProposal(review.proposal.proposalId, signal)

    const revision = await store.submitProposal(proposal({
      changes: [{
        kind: 'artifact/revision',
        artifactId: 'chapter-1-revision-1',
        chapter: 1,
        parentArtifactId: 'chapter-1-review-1',
        content: '潮水退去时，灯塔下的信匣露出了海面。',
        summary: '按审稿意见完成第一章修订。',
      }, {
        kind: 'chapter/select-final',
        chapter: 1,
        artifactId: 'chapter-1-revision-1',
        summary: '选择第一章修订稿为定稿。',
      }],
    }), signal)
    await store.applyProposal(revision.proposal.proposalId, signal)

    const snapshot = await store.read(signal)
    expect(snapshot.artifacts).toEqual([
      expect.objectContaining({ artifactId: 'chapter-1-draft-1', kind: 'draft', summary: '完成第一章初稿。' }),
      expect.objectContaining({ artifactId: 'chapter-1-review-1', kind: 'review', parentArtifactId: 'chapter-1-draft-1', report: '悬念建立清晰，但需要强化灯塔意象。' }),
      expect.objectContaining({ artifactId: 'chapter-1-revision-1', kind: 'revision', parentArtifactId: 'chapter-1-review-1', summary: '按审稿意见完成第一章修订。' }),
    ])
    expect(snapshot.chapterFinals).toEqual([expect.objectContaining({
      chapter: 1,
      artifactId: 'chapter-1-revision-1',
      summary: '选择第一章修订稿为定稿。',
    })])
    await expect(store.readChapterContext(1, signal)).resolves.toEqual({ chapter: 1 })
    await expect(store.readChapterContext(2, signal)).resolves.toEqual({
      chapter: 2,
      previousFinal: {
        chapter: 1,
        artifactId: 'chapter-1-revision-1',
        content: '潮水退去时，灯塔下的信匣露出了海面。',
        summary: '选择第一章修订稿为定稿。',
      },
    })
  })

  it('carries source-bound handoff and confirmed knowledge into the next chapter context', async () => {
    const { store } = await initializedStore()
    const beforeCharacters = await store.read(signal)
    await store.applyChange({
      changeSetId: 'continuity-character', operation: 'replace', aggregate: { kind: 'characters' },
      baseAggregateRevision: beforeCharacters.characters.revision,
      baseGlobalRevision: beforeCharacters.globalRevision,
      nextValue: {
        items: [{ characterId: 'hero', name: '阿澈', role: '主角', summary: '守灯人', goal: '守住灯塔', currentState: '警觉', notes: '' }],
        relationships: [],
      },
      provenance: { origin: 'manual' },
    }, signal)
    const afterCharacters = await store.read(signal)
    const chapterOne = afterCharacters.chapters.find(chapter => chapter.chapter === 1)!
    await store.applyChange({
      changeSetId: 'continuity-chapter-2', operation: 'replace', aggregate: { kind: 'chapter', chapter: 2 },
      baseAggregateRevision: 0, baseGlobalRevision: afterCharacters.globalRevision,
      nextValue: {
        chapter: 2, title: '第二封信', purpose: '让秘密进入角色知情范围。', plotBeats: [], characters: ['hero'],
        keyEvents: [], suspense: '谁在篡改信件？', status: 'drafting',
        handoff: {
          sourceChapter: 1, sourceRevision: chapterOne.revision, transition: 'deliberate',
          scene: '灯塔下的信匣', emotionalState: '警觉但克制', openActions: ['核对信件来源'],
          unresolvedQuestions: ['寄信人是谁？'],
        },
        knowledgeEvents: [
          {
            eventId: 'secret-confirmed', characterId: 'hero', statement: '信件来自未来', kind: 'fact',
            acquisition: '亲自读取信件', sourceChapter: 1, validFromChapter: 2,
            evidence: '第一章末尾的信件原文', status: 'confirmed',
          },
          {
            eventId: 'rumor-candidate', characterId: 'hero', statement: '寄信人是海神', kind: 'rumor',
            acquisition: '港口传闻', sourceChapter: 1, validFromChapter: 2,
            evidence: '未核实的酒馆传闻', status: 'candidate',
          },
        ],
      },
      provenance: { origin: 'manual' },
    }, signal)

    await expect(store.readChapterContext(2, signal)).resolves.toMatchObject({
      chapter: 2,
      handoff: {
        sourceChapter: 1, transition: 'deliberate', scene: '灯塔下的信匣',
        unresolvedQuestions: ['寄信人是谁？'],
      },
      knowledgeEvents: [{ eventId: 'secret-confirmed', status: 'confirmed', characterId: 'hero' }],
    })
  })

  it('migrates V3 migrated drafts and proposal inbox records into V4 without loss', async () => {
    const { root, store } = await initializedStore()
    const draftPayload = {
      changes: [{
        kind: 'artifact/draft', artifactId: 'v3-migrated-draft-1', chapter: 1,
        content: 'V1 已迁移的第一章草稿。', summary: '导入前的临时摘要。',
      }],
    }
    const draft = await store.submitProposal(proposal(draftPayload), signal)
    await store.applyProposal(draft.proposal.proposalId, signal)
    const state = await store.read(signal)
    const { revision: _revision, ...architecture } = state.architecture
    const inboxPayload = {
      changes: [{
        changeSetId: 'v3-proposal-retained', aggregate: { kind: 'architecture' },
        baseAggregateRevision: state.architecture.revision, baseGlobalRevision: state.globalRevision,
        nextValue: { ...architecture, premise: '保留既有 V3 proposal。' },
      }],
    }
    const inbox = await store.submitProposal(proposal(inboxPayload), signal)
    await store.dispose()
    opened.length = 0

    const database = new DatabaseSync(join(root, '.ai-novel', 'novel.db'))
    try {
      database.exec('DROP TABLE chapter_finals')
      database.exec('ALTER TABLE artifacts DROP COLUMN summary')
      database.prepare("UPDATE meta SET value = '3' WHERE key = 'schema_version'").run()
      database.exec('PRAGMA user_version = 3')
    } finally {
      database.close()
    }

    const reopened = await openNovelStore(root, workspaceId)
    opened.push(reopened)
    expect((await reopened.read(signal)).storage.userVersion).toBe(5)
    expect((await reopened.read(signal)).artifacts).toEqual([
      expect.objectContaining({
        artifactId: 'v3-migrated-draft-1', content: 'V1 已迁移的第一章草稿。', summary: 'Migrated V1 draft.',
      }),
    ])
    await expect(reopened.listProposals(signal)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ proposalId: inbox.proposal.proposalId, status: 'pending' }),
    ]))
  })

  it('allows same-chapter manual revisions from prose artifacts while keeping review parents draft-only', async () => {
    const { store } = await initializedStore()
    const draft = await store.submitProposal(proposal({ changes: [{
      kind: 'artifact/draft', artifactId: 'lineage-draft-1', chapter: 1,
      content: '可供校验父链的草稿。', summary: '提交父链校验草稿。',
    }] }), signal)
    await store.applyProposal(draft.proposal.proposalId, signal)
    const afterDraft = await store.read(signal)
    await store.applyChange({
      changeSetId: 'artifact-chapter-2-blueprint', operation: 'replace', aggregate: { kind: 'chapter', chapter: 2 },
      baseAggregateRevision: 0, baseGlobalRevision: afterDraft.globalRevision,
      nextValue: {
        chapter: 2, title: '第二封信', purpose: '继续异常。', plotBeats: [], characters: [],
        keyEvents: [], suspense: '下一封信来自何处？', status: 'drafting',
      }, provenance: { origin: 'manual' },
    }, signal)
    const crossChapterReview = await store.submitProposal(proposal({ changes: [{
      kind: 'artifact/review', artifactId: 'lineage-review-cross', chapter: 2, parentArtifactId: 'lineage-draft-1',
      report: '错误的跨章审稿。', summary: '尝试跨章审稿。',
    }] }), signal)
    const directRevision = await store.submitProposal(proposal({ changes: [{
      kind: 'artifact/revision', artifactId: 'lineage-revision-from-draft', chapter: 1, parentArtifactId: 'lineage-draft-1',
      content: '人工直接修订草稿后的正文。', summary: '直接从草稿创建人工修订。',
    }] }), signal)
    await expect(store.applyProposal(directRevision.proposal.proposalId, signal)).resolves.toMatchObject({
      proposal: { items: [{ status: 'applied' }] },
    })

    const chainedRevision = await store.submitProposal(proposal({ changes: [{
      kind: 'artifact/revision', artifactId: 'lineage-revision-from-revision', chapter: 1, parentArtifactId: 'lineage-revision-from-draft',
      content: '人工再次修订后的正文。', summary: '直接从修订稿创建下一版人工修订。',
    }] }), signal)
    await expect(store.applyProposal(chainedRevision.proposal.proposalId, signal)).resolves.toMatchObject({
      proposal: { items: [{ status: 'applied' }] },
    })

    const wrongParentReview = await store.submitProposal(proposal({ changes: [{
      kind: 'artifact/review', artifactId: 'lineage-review-wrong', chapter: 1, parentArtifactId: 'lineage-revision-from-draft',
      report: '审稿不能以修订稿为父项。', summary: '尝试以修订稿作为审稿父项。',
    }] }), signal)
    const missingFinal = await store.submitProposal(proposal({ changes: [{
      kind: 'chapter/select-final', chapter: 1, artifactId: 'missing-artifact', summary: '尝试选择不存在的定稿。',
    }] }), signal)

    for (const submitted of [crossChapterReview, wrongParentReview, missingFinal]) {
      await expect(store.applyProposal(submitted.proposal.proposalId, signal)).resolves.toMatchObject({
        proposal: { items: [{ status: 'failed', failure: 'INVALID_CONTENT' }] },
      })
    }
    const snapshot = await store.read(signal)
    expect(snapshot.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ artifactId: 'lineage-revision-from-draft', kind: 'revision', parentArtifactId: 'lineage-draft-1' }),
      expect.objectContaining({ artifactId: 'lineage-revision-from-revision', kind: 'revision', parentArtifactId: 'lineage-revision-from-draft' }),
    ]))
    expect(snapshot.chapterFinals).toEqual([])
  })

  it('J11 upgrades a legacy workspace, keeps extracted knowledge candidates, and rejects a proposal after the source chapter changes', async () => {
    const { root, store } = await initializedStore()
    const before = await store.read(signal)
    const sourceChapter = before.chapters.find(chapter => chapter.chapter === 1)!
    const { revision: sourceRevision, ...sourceValue } = sourceChapter
    const pending = await store.submitProposal(proposal({
      changes: [{
        changeSetId: 'j11-extracted-knowledge',
        aggregate: { kind: 'chapter', chapter: 1 },
        baseAggregateRevision: sourceRevision,
        baseGlobalRevision: before.globalRevision,
        nextValue: {
          ...sourceValue,
          knowledgeEvents: [{
            eventId: 'j11-secret-candidate', characterId: 'hero', statement: '信件来自未来', kind: 'fact',
            acquisition: '提取自第一章正文', sourceChapter: 1, validFromChapter: 1,
            evidence: '第一章末尾的信件原文', status: 'candidate',
          }],
        },
      }],
    }), signal)

    await store.dispose()
    opened.length = 0
    const database = new DatabaseSync(join(root, '.ai-novel', 'novel.db'))
    try {
      database.exec('DROP TABLE chapter_finals')
      database.exec('ALTER TABLE artifacts DROP COLUMN summary')
      database.prepare("UPDATE meta SET value = '3' WHERE key = 'schema_version'").run()
      database.exec('PRAGMA user_version = 3')
    } finally {
      database.close()
    }

    const upgraded = await openNovelStore(root, workspaceId)
    opened.push(upgraded)
    expect((await upgraded.read(signal)).storage.userVersion).toBe(5)
    await expect(upgraded.listProposals(signal)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ proposalId: pending.proposal.proposalId, status: 'pending' }),
    ]))

    const beforeAuthorEdit = await upgraded.read(signal)
    const currentChapter = beforeAuthorEdit.chapters.find(chapter => chapter.chapter === 1)!
    const { revision: currentRevision, ...currentValue } = currentChapter
    await upgraded.applyChange({
      changeSetId: 'j11-author-source-edit',
      operation: 'replace',
      aggregate: { kind: 'chapter', chapter: 1 },
      baseAggregateRevision: currentRevision,
      baseGlobalRevision: beforeAuthorEdit.globalRevision,
      nextValue: { ...currentValue, keyEvents: [...currentValue.keyEvents, '作者先修改了正文来源'] },
      provenance: { origin: 'manual' },
    }, signal)

    const stale = await upgraded.applyProposal(pending.proposal.proposalId, signal)
    expect(stale).toMatchObject({
      appliedItemIds: [],
      proposal: { status: 'stale', items: [{ status: 'stale', failure: 'STALE_REVISION' }] },
    })
    const after = await upgraded.read(signal)
    expect(after.chapters.find(chapter => chapter.chapter === 1)?.keyEvents).toContain('作者先修改了正文来源')
    expect(after.chapters.find(chapter => chapter.chapter === 1)?.knowledgeEvents).toBeUndefined()
  })
})
