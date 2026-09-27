import { createHash, randomUUID } from 'node:crypto'

import { getProjectDb } from '../database'
import { BlueprintRepository } from './blueprint-repository'
import { ProjectCoreRepository } from './project-core-repository'
import { CharacterRosterRepository } from './character-roster-repository'
import { RevisionRepository } from './revision-repository'
import { NarrativeThreadRepository } from './narrative-thread-repository'
import { CHARACTER_ROSTER_SCHEMA_VERSION } from '../../src/shared/character-roster'
import { BLUEPRINT_SEMANTIC_CONTRACT_MANIFEST } from '../../src/shared/blueprint-semantic-contract'
import {
  STORY_DIRECTION_BLUEPRINT_FIELDS,
  STORY_DIRECTION_CHARACTER_FIELDS,
  STORY_DIRECTION_CORE_FIELDS,
  type StoryDirectionApplyRequest,
  type StoryDirectionSnapshot,
  type StoryDirectionRun,
} from '../../src/shared/story-direction'

function dbOrThrow() {
  const db = getProjectDb()
  if (!db) throw new Error('项目数据库未打开')
  return db
}

function readSnapshot(): StoryDirectionSnapshot {
  const db = dbOrThrow()
  const core = ProjectCoreRepository.get()
  if (!core) throw new Error('项目配置不存在')
  const blueprints = BlueprintRepository.getAll()
  const drafts = db.prepare('SELECT id, chapter_number, version, status FROM drafts ORDER BY id')
    .all() as Array<{ id: number; chapter_number: number; version: number; status: string }>
  const draftFacts = drafts.map(row => ({
    id: row.id, chapterNumber: row.chapter_number, version: row.version, status: row.status,
  }))
  const hasThreadsTable = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'narrative_thread_plans'").get()
  const threadRows = hasThreadsTable
    ? db.prepare('SELECT id, title, type, target_start_chapter, target_end_chapter, author_intent, lane, parent_id FROM narrative_thread_plans ORDER BY id')
        .all() as Array<{ id: number; title: string; type: string; target_start_chapter: number; target_end_chapter: number; author_intent: string; lane: 'main' | 'sub'; parent_id: number | null }>
    : []
  const threadPlans = threadRows.map(row => ({
    id: row.id, title: row.title, type: row.type,
    targetStartChapter: row.target_start_chapter, targetEndChapter: row.target_end_chapter,
    authorIntent: row.author_intent, lane: row.lane,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
  }))
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ core, blueprints, drafts: draftFacts, threadPlans }))
    .digest('hex')
  return { core, blueprints, drafts: draftFacts, threadPlans, fingerprint }
}

function assertStringChanges(
  changes: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const [field, value] of Object.entries(changes)) {
    if (!allowed.includes(field) || typeof value !== 'string' || value.length > 20_000) {
      throw new Error(`${label}字段 ${field} 无效`)
    }
  }
}

function ensureRunSchema(): void {
  dbOrThrow().exec(`
    CREATE TABLE IF NOT EXISTS story_direction_runs (
      id TEXT PRIMARY KEY,
      idea TEXT NOT NULL,
      model_id TEXT NOT NULL,
      core_changes TEXT NOT NULL,
      character_changes TEXT NOT NULL DEFAULT '[]',
      narrative_threads TEXT NOT NULL DEFAULT '[]',
      blueprint_changes TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS story_direction_drafts (
      run_id TEXT NOT NULL,
      draft_id INTEGER NOT NULL,
      chapter_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'failed', 'completed')),
      revision_id INTEGER,
      error TEXT,
      PRIMARY KEY(run_id, draft_id),
      FOREIGN KEY(run_id) REFERENCES story_direction_runs(id) ON DELETE CASCADE
    );
  `)
}

export class StoryDirectionRepository {
  static snapshot(): StoryDirectionSnapshot {
    return dbOrThrow().transaction(readSnapshot)()
  }

  static apply(request: StoryDirectionApplyRequest): { snapshot: StoryDirectionSnapshot; runId?: string } {
    const db = dbOrThrow()
    return db.transaction(() => {
      const before = readSnapshot()
      if (before.fingerprint !== request.expectedFingerprint) {
        throw new Error('项目规划或章节状态已变化，请重新生成方向调整预览')
      }
      assertStringChanges(request.coreChanges as Record<string, unknown>, STORY_DIRECTION_CORE_FIELDS, '项目配置')
      if (!Array.isArray(request.blueprintChanges) || request.blueprintChanges.length > 1_000) {
        throw new Error('章节蓝图变更数量无效')
      }
      const finalized = new Set(before.drafts.filter(draft => draft.status === 'finalized')
        .map(draft => draft.chapterNumber))
      const byChapter = new Map(before.blueprints.map(blueprint => [blueprint.chapterNumber, blueprint]))
      const seen = new Set<number>()
      for (const item of request.blueprintChanges) {
        if (!Number.isSafeInteger(item.chapterNumber) || seen.has(item.chapterNumber)) {
          throw new Error('章节蓝图变更存在无效或重复章号')
        }
        seen.add(item.chapterNumber)
        if (finalized.has(item.chapterNumber)) throw new Error(`第 ${item.chapterNumber} 章已定稿，不能批量改动其蓝图`)
        const current = byChapter.get(item.chapterNumber)
        if (!current) throw new Error(`第 ${item.chapterNumber} 章蓝图不存在`)
        assertStringChanges(item.changes as Record<string, unknown>, STORY_DIRECTION_BLUEPRINT_FIELDS, '章节蓝图')
        if (Object.hasOwn(item.changes, 'title')) {
          const title = item.changes.title!.trim()
          if (!title || Array.from(title).length > BLUEPRINT_SEMANTIC_CONTRACT_MANIFEST.outputLimits.titleCharacters) {
            throw new Error(`第 ${item.chapterNumber} 章标题无效：标题不能为空且不得超过 ${BLUEPRINT_SEMANTIC_CONTRACT_MANIFEST.outputLimits.titleCharacters} 个字符`)
          }
        }
      }
      if (Object.keys(request.coreChanges).length === 0 && request.blueprintChanges.length === 0) {
        if (!request.characterChanges?.length && !request.newNarrativeThreads?.length) {
          throw new Error('方向调整方案没有可提交的变更')
        }
      }
      const characterChanges = request.characterChanges ?? []
      if (!Array.isArray(characterChanges) || characterChanges.length > 1_000) throw new Error('角色变更数量无效')
      let roster: ReturnType<typeof CharacterRosterRepository.read> | null = null
      if (characterChanges.length > 0) {
        roster = CharacterRosterRepository.read()
        if (roster.status !== 'ready' || roster.revision !== request.expectedRosterRevision) {
          throw new Error('角色名单已变化或不可安全更新，请重新生成预览')
        }
        const existingNames = new Set(roster.entries.map(entry => entry.name))
        const seenNames = new Set<string>()
        for (const item of characterChanges) {
          if (!existingNames.has(item.name) || seenNames.has(item.name)) throw new Error('角色变更引用未知或重复角色')
          seenNames.add(item.name)
          assertStringChanges(item.changes as Record<string, unknown>, STORY_DIRECTION_CHARACTER_FIELDS, '角色卡')
        }
      }
      const newThreads = request.newNarrativeThreads ?? []
      if (!Array.isArray(newThreads) || newThreads.length > 50) throw new Error('新增叙事线索数量无效')
      const existingTitles = new Set(before.threadPlans.map(item => item.title.trim()))
      const latestFinalizedChapter = Math.max(0, ...before.drafts.filter(draft => draft.status === 'finalized').map(draft => draft.chapterNumber))
      for (const thread of newThreads) {
        if (!thread.title?.trim() || existingTitles.has(thread.title.trim())
          || !Number.isSafeInteger(thread.targetStartChapter)
          || !Number.isSafeInteger(thread.targetEndChapter)
          || thread.targetStartChapter <= latestFinalizedChapter
          || thread.targetEndChapter < thread.targetStartChapter
          || thread.targetEndChapter > before.core.totalChapters) {
          throw new Error('新增叙事线索无效或触及已定稿章节')
        }
        existingTitles.add(thread.title.trim())
      }
      if (Object.keys(request.coreChanges).length > 0) ProjectCoreRepository.update(request.coreChanges)
      for (const item of request.blueprintChanges) {
        const changes = Object.hasOwn(item.changes, 'title')
          ? { ...item.changes, title: item.changes.title!.trim() }
          : item.changes
        BlueprintRepository.upsert({ ...byChapter.get(item.chapterNumber)!, ...changes })
      }
      if (roster) {
        const byName = new Map(characterChanges.map(item => [item.name, item.changes]))
        CharacterRosterRepository.commit({
          operationId: `story-direction-${randomUUID()}`,
          expectedRevision: roster.revision,
          schemaVersion: CHARACTER_ROSTER_SCHEMA_VERSION,
          intent: 'direction_adjustment',
          entries: roster.entries.flatMap(entry => {
            const changes = byName.get(entry.name)
            if (!changes) return []
            const safeEntry = { ...entry }
            delete safeEntry.legacyRelationshipNotes
            return [{ ...safeEntry, ...changes }]
          }),
        })
      }
      for (const thread of newThreads) NarrativeThreadRepository.createPlan(thread)
      const snapshot = readSnapshot()
      let runId: string | undefined
      if (request.idea?.trim()) {
        ensureRunSchema()
        runId = randomUUID()
        db.prepare(`INSERT INTO story_direction_runs (id, idea, model_id, core_changes, character_changes, narrative_threads, blueprint_changes)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
          runId, request.idea.trim().slice(0, 4_000), request.modelId ?? '',
          JSON.stringify(request.coreChanges), JSON.stringify(request.characterChanges ?? []),
          JSON.stringify(newThreads), JSON.stringify(request.blueprintChanges),
        )
        if (request.generateDraftCandidates) {
          const affected = new Set(request.blueprintChanges.map(item => item.chapterNumber))
          const latest = new Map<number, (typeof before.drafts)[number]>()
          for (const draft of before.drafts) {
            if (!affected.has(draft.chapterNumber) || draft.status === 'finalized') continue
            if ((latest.get(draft.chapterNumber)?.version ?? -1) < draft.version) latest.set(draft.chapterNumber, draft)
          }
          const insert = db.prepare(`INSERT INTO story_direction_drafts (run_id, draft_id, chapter_number) VALUES (?, ?, ?)`)
          for (const draft of latest.values()) insert.run(runId, draft.id, draft.chapterNumber)
        }
      }
      return { snapshot, ...(runId ? { runId } : {}) }
    })()
  }

  static latestRun(): StoryDirectionRun | null {
    ensureRunSchema()
    const db = dbOrThrow()
    const row = db.prepare('SELECT * FROM story_direction_runs ORDER BY created_at DESC, rowid DESC LIMIT 1')
      .get() as { id: string; idea: string; model_id: string; core_changes: string; character_changes: string; narrative_threads: string; blueprint_changes: string } | undefined
    if (!row) return null
    const drafts = db.prepare('SELECT * FROM story_direction_drafts WHERE run_id = ? ORDER BY chapter_number, draft_id')
      .all(row.id) as Array<{ draft_id: number; chapter_number: number; status: StoryDirectionRun['drafts'][number]['status']; revision_id: number | null; error: string | null }>
    return {
      id: row.id, idea: row.idea, modelId: row.model_id,
      coreChanges: JSON.parse(row.core_changes) as StoryDirectionRun['coreChanges'],
      characterChanges: JSON.parse(row.character_changes) as StoryDirectionRun['characterChanges'],
      newNarrativeThreads: JSON.parse(row.narrative_threads) as StoryDirectionRun['newNarrativeThreads'],
      blueprintChanges: JSON.parse(row.blueprint_changes) as StoryDirectionRun['blueprintChanges'],
      drafts: drafts.map(draft => ({
        draftId: draft.draft_id, chapterNumber: draft.chapter_number, status: draft.status,
        ...(draft.revision_id ? { revisionId: draft.revision_id } : {}),
        ...(draft.error ? { error: draft.error } : {}),
      })),
    }
  }

  static saveCandidate(request: {
    runId: string; draftId: number; content: string; wordCount: number; baseContentHash: string
  }): number {
    ensureRunSchema()
    const db = dbOrThrow()
    return db.transaction(() => {
      const target = db.prepare(`SELECT task.status, task.revision_id, run.idea
        FROM story_direction_drafts AS task JOIN story_direction_runs AS run ON run.id = task.run_id
        WHERE task.run_id = ? AND task.draft_id = ?`)
        .get(request.runId, request.draftId) as { status: string; revision_id: number | null; idea: string } | undefined
      if (!target) throw new Error('该草稿不属于当前方向调整方案')
      if (target.status === 'completed' && target.revision_id) return target.revision_id
      const draft = db.prepare('SELECT chapter_number, version, status FROM drafts WHERE id = ?')
        .get(request.draftId) as { chapter_number: number; version: number; status: string } | undefined
      if (!draft || draft.status === 'finalized') throw new Error('目标草稿已不存在或已定稿')
      const latest = db.prepare('SELECT MAX(version) AS version FROM drafts WHERE chapter_number = ?')
        .get(draft.chapter_number) as { version: number | null }
      if ((latest.version ?? 0) > draft.version) throw new Error('章节出现更新版本，旧方向调整任务不能生成修稿')
      const created = RevisionRepository.create({
        baseDraftId: request.draftId, revisionType: 'refine', content: request.content,
        wordCount: request.wordCount, baseContentHash: request.baseContentHash,
        userPrompt: `全书方向调整：${target.idea.slice(0, 240)}`,
      })
      db.prepare("UPDATE story_direction_drafts SET status = 'completed', revision_id = ?, error = NULL WHERE run_id = ? AND draft_id = ?")
        .run(created.id, request.runId, request.draftId)
      return created.id
    })()
  }

  static markDraftFailed(runId: string, draftId: number, error: string): void {
    ensureRunSchema()
    const result = dbOrThrow().prepare(`UPDATE story_direction_drafts
      SET status = 'failed', error = ? WHERE run_id = ? AND draft_id = ? AND status <> 'completed'`)
      .run(error.slice(0, 500), runId, draftId)
    if (result.changes !== 1) throw new Error('方向调整草稿任务不存在或已经完成')
  }
}
