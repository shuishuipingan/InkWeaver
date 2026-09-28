/**
 * 导出服务 — 将小说项目导出为多种格式
 *
 * 支持：
 * - 合并 Markdown（全书合并为单个 .md）
 * - 分章 Markdown（每章一个 .md）
 * - 纯文本 TXT
 */
import { ipc } from './ipc-client'
import { requireIpcSuccess } from './ipc-result'
import { useWorkflowStore } from '../stores/workflow-store'
import { useLocaleStore } from '../stores/locale-store'
import type { ProjectSessionContext } from '../shared/ipc-channels'
import type { AuthoritativeChapterSequence } from '../shared/author-manuscript-import'
import { countDraftUnits } from '../shared/draft-units'
import { textFingerprint } from '../shared/character-extraction'
import { randomUUID } from '../utils/id'
import {
  getActiveProjectSessionContext,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../shared/project-session-context'


export type ExportFormat = 'merged-md' | 'split-md' | 'txt'

interface ExportOptions {
  format: ExportFormat
  /** 由主进程选择目录后签发的受限授权，绝不是绝对路径。 */
  grantId: string
  /** 默认包含每章最新版本；关闭后仅导出定稿权威。 */
  includeDrafts?: boolean
  /** In-memory unsaved buffers for open latest-draft tabs; these are not persisted by export. */
  draftContentOverrides?: readonly { draftId: number; content: string; baseContent: string }[]
  includeOutline?: boolean
  includeCharacters?: boolean
  /** Fires once the complete export snapshot passes final pre-write validation. */
  onSnapshotValidated?: () => void
}

/** 导出任务冻结的项目展示数据；项目路径本身绝不作为访问凭据。 */
export interface ExportProjectSnapshot {
  id: string
  sessionLease: string
  path: string
  name: string
  novelConfig: Readonly<{
    genre: string
    targetAudience: string
  }>
}

export interface ExportDraftMeta {
  id: number
  chapterNumber: number
  chapterTitle?: string
  version: number
  status: string
  wordCount?: number
}

export interface FinalizedExportPlanChapter {
  id: number
  chapterNumber: number
  chapterTitle: string
  version: number
  status: string
  wordCount?: number
}

export type FinalizedExportPlan =
  | { ok: true; chapters: FinalizedExportPlanChapter[] }
  | { ok: false; error: string; reason?: 'empty-content' }

export interface ExportManifest {
  schemaVersion: 1
  projectName: string
  format: ExportFormat
  generatedAt: string
  authorityFingerprint: string
  chapters: Array<{
    chapterNumber: number
    title: string
    wordCount: number
    outputFile: string
    contentHash: string
  }>
}

/**
 * Selects only the canonical finalized authority. Blueprints are planning data
 * and must never add, remove, or reorder chapters in a published export.
 */
export function createFinalizedExportPlan(
  authority: AuthoritativeChapterSequence,
  drafts: readonly ExportDraftMeta[],
): FinalizedExportPlan {
  if (authority.status === 'invalid') {
    return { ok: false, error: '权威定稿章节序列存在缺章或重复，无法安全导出' }
  }
  if (authority.status === 'empty' || authority.lastChapterNumber < 1) {
    return { ok: false, error: '无可导出的章节（无定稿章节）' }
  }
  const finalized = drafts.filter(draft => draft.status === 'finalized')
  const byChapter = new Map<number, ExportDraftMeta>()
  for (const draft of finalized) {
    if (byChapter.has(draft.chapterNumber)) {
      return { ok: false, error: '定稿事实存在重复章节，无法安全导出' }
    }
    byChapter.set(draft.chapterNumber, draft)
  }
  const chapters: FinalizedExportPlanChapter[] = []
  for (let chapterNumber = 1; chapterNumber <= authority.lastChapterNumber; chapterNumber += 1) {
    const draft = byChapter.get(chapterNumber)
    if (!draft) return { ok: false, error: `定稿事实缺少第 ${chapterNumber} 章，无法安全导出` }
    chapters.push({
      id: draft.id,
      chapterNumber,
      chapterTitle: draft.chapterTitle?.trim() || `第${chapterNumber}章`,
      version: draft.version,
      status: draft.status,
      ...(typeof draft.wordCount === 'number' ? { wordCount: draft.wordCount } : {}),
    })
  }
  const unexpected = finalized.some(draft => draft.chapterNumber > authority.lastChapterNumber || draft.chapterNumber < 1)
  return unexpected
    ? { ok: false, error: '定稿事实超出连续权威章节范围，无法安全导出' }
    : { ok: true, chapters }
}

/**
 * Selects exactly one highest-version record per chapter, then validates the
 * complete canonical chapter range. Finalized authority remains a hard safety
 * boundary even when a newer candidate is selected for export.
 */
export function createLatestDraftExportPlan(
  authority: AuthoritativeChapterSequence,
  drafts: readonly ExportDraftMeta[],
): FinalizedExportPlan {
  if (authority.status === 'invalid') {
    return { ok: false, error: '权威定稿章节序列存在缺章或重复，无法安全导出' }
  }
  if (!Number.isSafeInteger(authority.lastChapterNumber) || authority.lastChapterNumber < 0) {
    return { ok: false, error: '权威定稿章节序列无效，无法安全导出' }
  }

  if (authority.status === 'continuous') {
    const finalizedPlan = createFinalizedExportPlan(authority, drafts)
    if (!finalizedPlan.ok) return finalizedPlan
  } else if (drafts.some(draft => draft.status === 'finalized')) {
    return { ok: false, error: '权威定稿章节序列与定稿事实不匹配，无法安全导出' }
  }

  const latestByChapter = new Map<number, ExportDraftMeta>()
  for (const draft of drafts.filter(candidate => candidate.status !== 'archived')) {
    if (!Number.isSafeInteger(draft.chapterNumber) || draft.chapterNumber < 1) {
      return { ok: false, error: '草稿包含无效章节编号，无法安全导出' }
    }
    if (!Number.isSafeInteger(draft.version) || draft.version < 1) {
      return { ok: false, error: `第 ${draft.chapterNumber} 章包含无效版本，无法安全导出` }
    }
    const current = latestByChapter.get(draft.chapterNumber)
    if (current?.version === draft.version) {
      return { ok: false, error: `第 ${draft.chapterNumber} 章存在重复版本，无法安全导出` }
    }
    if (!current || draft.version > current.version) {
      latestByChapter.set(draft.chapterNumber, draft)
    }
  }

  let lastChapterNumber = authority.lastChapterNumber
  const chapterNumbers = [...latestByChapter.keys()].sort((left, right) => left - right)
  for (const chapterNumber of chapterNumbers) {
    if (chapterNumber > lastChapterNumber) lastChapterNumber = chapterNumber
  }
  if (lastChapterNumber < 1) {
    return { ok: false, error: '没有可导出的定稿章节或草稿。', reason: 'empty-content' }
  }

  let expectedChapterNumber = 1
  for (const chapterNumber of chapterNumbers) {
    if (chapterNumber > expectedChapterNumber) {
      return { ok: false, error: `导出章节序列缺少第 ${expectedChapterNumber} 章，无法安全导出` }
    }
    if (chapterNumber === expectedChapterNumber) expectedChapterNumber += 1
  }
  if (expectedChapterNumber <= lastChapterNumber) {
    return { ok: false, error: `导出章节序列缺少第 ${expectedChapterNumber} 章，无法安全导出` }
  }

  const chapters = chapterNumbers.map(chapterNumber => {
    const draft = latestByChapter.get(chapterNumber)!
    return {
      id: draft.id,
      chapterNumber,
      chapterTitle: draft.chapterTitle?.trim() || `第${chapterNumber}章`,
      version: draft.version,
      status: draft.status,
      ...(typeof draft.wordCount === 'number' ? { wordCount: draft.wordCount } : {}),
    }
  })
  return { ok: true, chapters }
}

function noExportableContentMessage(): string {
  return useLocaleStore.getState().text(
    '没有可导出的定稿章节或草稿。请先完成定稿或保存至少一章草稿。',
    'There are no finalized chapters or drafts to export. Finalize content or save at least one draft first.',
  )
}

const PROJECT_SESSION_CHANGED_ERROR = '项目会话已变化，本次导出已取消'
let activeExportInProgress = false

function isProjectSessionCurrent(projectSession: ProjectSessionContext): boolean {
  return sameProjectSessionContext(projectSession, getActiveProjectSessionContext())
}

function isMatchingProjectSnapshot(
  project: ExportProjectSnapshot,
  projectSession: ProjectSessionContext,
): boolean {
  return project.id === projectSession.projectId
    && project.sessionLease === projectSession.leaseId
    && sameProjectPathKey(project.path, projectSession.projectPath)
}

function staleExportResult(): { success: false; error: string } {
  return { success: false, error: PROJECT_SESSION_CHANGED_ERROR }
}

function changedExportSnapshotResult(): { success: false; error: string } {
  return {
    success: false,
    error: useLocaleStore.getState().text(
      '项目内容在导出期间已变化，请重新导出。',
      'The project changed while the export was being prepared. Start a new export.',
    ),
  }
}

function sameExportPlan(left: FinalizedExportPlan, right: FinalizedExportPlan): boolean {
  if (!left.ok || !right.ok || left.chapters.length !== right.chapters.length) return false
  return left.chapters.every((chapter, index) => {
    const candidate = right.chapters[index]
    return candidate !== undefined
      && chapter.id === candidate.id
      && chapter.chapterNumber === candidate.chapterNumber
      && chapter.chapterTitle === candidate.chapterTitle
      && chapter.version === candidate.version
      && chapter.status === candidate.status
  })
}

async function contentHash(value: string): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return textFingerprint(value)
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return textFingerprint(value)
  }
}

async function verifyWrittenFile(
  grantId: string,
  relativePath: string,
  expectedContent: string,
): Promise<void> {
  const result = await ipc.invoke('fs:grant-read-file', grantId, relativePath)
  requireIpcSuccess(result, '回读导出文件 ' + relativePath)
  const readResult = result as { content?: unknown }
  if (typeof readResult.content !== 'string' || readResult.content !== expectedContent) {
    throw new Error('导出文件回读校验失败：' + relativePath)
  }
}

/** 导出全书 */
export async function exportNovel(
  options: ExportOptions,
  project: ExportProjectSnapshot,
  projectSession: ProjectSessionContext,
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isMatchingProjectSnapshot(project, projectSession) || !isProjectSessionCurrent(projectSession)) {
    return staleExportResult()
  }
  const addLog = useWorkflowStore.getState().addLog
  if (activeExportInProgress) {
    return {
      success: false,
      error: useLocaleStore.getState().text(
        '已有导出任务正在进行，请完成后再导出。',
        'Another export is already running. Wait for it to finish, then try again.',
      ),
    }
  }
  activeExportInProgress = true

  try {
    addLog('info', `开始导出（${formatLabel(options.format)}）...`)
    // Planning blueprints may be ahead of, or missing from, the manuscript.
    // Draft-inclusive export uses manuscript versions, while finalized authority
    // still validates any published chapters and its canonical sequence.
    let authority = await ipc.invokeWithProjectSession(
      projectSession,
      'db:draft-authority-sequence',
      projectSession.projectPath,
    )
    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    const allDrafts = await ipc.invokeWithProjectSession(
      projectSession,
      'db:draft-list-all',
      projectSession.projectPath,
    ) as unknown as ExportDraftMeta[]
    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    const plan = options.includeDrafts === false
      ? createFinalizedExportPlan(authority, allDrafts)
      : createLatestDraftExportPlan(authority, allDrafts)
    if (!plan.ok) {
      return {
        success: false,
        error: plan.reason === 'empty-content' ? noExportableContentMessage() : plan.error,
      }
    }

    const chapterContents: Array<{ chapterNumber: number; name: string; title: string; content: string; wordCount: number; contentHash: string }> = []
    const selectedDraftBodies = new Map<number, string>()
    for (const chapter of plan.chapters) {
      const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', chapter.id, projectSession.projectPath) as unknown as {
        id?: unknown
        chapterNumber?: unknown
        version?: unknown
        content?: unknown
        wordCount?: unknown
        chapterTitle?: unknown
        status?: string
      } | null
      if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
      if (!full) return changedExportSnapshotResult()
      if (
        full.status !== chapter.status
        || (typeof full.id === 'number' && full.id !== chapter.id)
        || (typeof full.chapterNumber === 'number' && full.chapterNumber !== chapter.chapterNumber)
        || (typeof full.version === 'number' && full.version !== chapter.version)
      ) return changedExportSnapshotResult()
      if (typeof full.content !== 'string') {
        return { success: false, error: `第 ${chapter.chapterNumber} 章正文为空，无法安全导出` }
      }
      selectedDraftBodies.set(chapter.id, full.content)
      const draftOverride = options.includeDrafts === false
        ? undefined
        : options.draftContentOverrides?.find(candidate => candidate.draftId === chapter.id)
      const canApplyDraftOverride = Boolean(draftOverride && full
        && full.status !== 'finalized' && full.status !== 'archived')
      if (canApplyDraftOverride && (
        typeof full?.content !== 'string'
        || (full.content !== draftOverride!.baseContent && full.content !== draftOverride!.content)
      )) {
        return {
          success: false,
          error: useLocaleStore.getState().text(
            `第 ${chapter.chapterNumber} 章草稿已在导出期间变化，请重新导出。`,
            `Chapter ${chapter.chapterNumber} changed during export. Start a new export to include the latest version.`,
          ),
        }
      }
      const content = canApplyDraftOverride ? draftOverride!.content : full?.content
      if (!full || typeof content !== 'string' || !content.trim()) {
        return { success: false, error: `第 ${chapter.chapterNumber} 章正文为空，无法安全导出` }
      }
      const computedWordCount = countDraftUnits(content)
      if (computedWordCount <= 0) return { success: false, error: `第 ${chapter.chapterNumber} 章没有可计数正文，无法安全导出` }
      const storedWordCount = typeof full.wordCount === 'number' && full.wordCount > 0
        ? full.wordCount
        : chapter.wordCount
      if (!canApplyDraftOverride && typeof storedWordCount === 'number' && storedWordCount > 0 && storedWordCount !== computedWordCount) {
        return { success: false, error: `第 ${chapter.chapterNumber} 章字数校验失败，无法安全导出` }
      }
      if (typeof full.chapterTitle === 'string' && full.chapterTitle.trim() && full.chapterTitle.trim() !== chapter.chapterTitle) {
        return { success: false, error: `第 ${chapter.chapterNumber} 章标题校验失败，无法安全导出` }
      }
      chapterContents.push({
        chapterNumber: chapter.chapterNumber,
        name: `chapter_${chapter.chapterNumber}.md`,
        title: chapter.chapterTitle,
        content,
        wordCount: computedWordCount,
        contentHash: await contentHash(content),
      })
    }

    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    addLog('info', `找到 ${chapterContents.length} 个章节`)

    let synopsis = ''
    if (options.format === 'merged-md' && options.includeOutline) {
      const core = await ipc.invokeWithProjectSession(
        projectSession,
        'db:project-core-get',
        projectSession.projectPath,
      )
      if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
      synopsis = typeof core?.synopsis === 'string' ? core.synopsis : ''
    }

    // Recheck the manuscript immediately before crossing into granted file I/O.
    // Once that immutable snapshot is validated, finish it even if the editor
    // switches projects while a write or readback is pending.
    const verifiedAuthority = await ipc.invokeWithProjectSession(
      projectSession,
      'db:draft-authority-sequence',
      projectSession.projectPath,
    )
    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    const verifiedDrafts = await ipc.invokeWithProjectSession(
      projectSession,
      'db:draft-list-all',
      projectSession.projectPath,
    ) as unknown as ExportDraftMeta[]
    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    const verifiedPlan = options.includeDrafts === false
      ? createFinalizedExportPlan(verifiedAuthority, verifiedDrafts)
      : createLatestDraftExportPlan(verifiedAuthority, verifiedDrafts)
    if (verifiedAuthority.authorityFingerprint !== authority.authorityFingerprint
      || !sameExportPlan(plan, verifiedPlan)) {
      return changedExportSnapshotResult()
    }
    for (const chapter of plan.chapters) {
      const verifiedFull = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-get-full',
        chapter.id,
        projectSession.projectPath,
      ) as unknown as {
        id?: unknown
        chapterNumber?: unknown
        version?: unknown
        content?: unknown
        status?: string
      } | null
      if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
      if (!verifiedFull || verifiedFull.status !== chapter.status
        || (typeof verifiedFull.id === 'number' && verifiedFull.id !== chapter.id)
        || (typeof verifiedFull.chapterNumber === 'number' && verifiedFull.chapterNumber !== chapter.chapterNumber)
        || (typeof verifiedFull.version === 'number' && verifiedFull.version !== chapter.version)
        || verifiedFull.content !== selectedDraftBodies.get(chapter.id)) {
        return changedExportSnapshotResult()
      }
    }
    authority = verifiedAuthority
    options.onSnapshotValidated?.()

    let outputPath = ''
    const projectFileStem = exportFileStem(project.name)

    switch (options.format) {
      case 'merged-md': {
        // 合并为单个 Markdown
        let content = `# ${project.name}\n\n`
        content += `> ${project.novelConfig.genre} · ${project.novelConfig.targetAudience}\n\n---\n\n`

        // 可选：包含大纲
        if (synopsis) {
          content += synopsis + '\n\n---\n\n'
        }

        // 章节内容
        for (const ch of chapterContents) {
          content += ch.content + '\n\n---\n\n'
        }

        outputPath = `${projectFileStem}.md`
        const writeResult = await ipc.invoke('fs:grant-write-file', options.grantId, outputPath, content)
        requireIpcSuccess(writeResult, '写入导出文件')
        await verifyWrittenFile(options.grantId, outputPath, content)
        break
      }

      case 'split-md': {
        // 每章一个 Markdown。每次导出使用新的带 run-id 目录，避免旧目录中
        // 多余章节/残留文件污染本次结果；manifest 同时记录该目录身份。
        const splitDir = `${projectFileStem}-${Date.now()}-${randomUUID().slice(0, 8)}`
        const mkdirResult = await ipc.invoke('fs:grant-mkdir', options.grantId, splitDir)
        requireIpcSuccess(mkdirResult, '创建导出目录')

        for (const ch of chapterContents) {
          const writeResult = await ipc.invoke('fs:grant-write-file', options.grantId, `${splitDir}/${ch.name}`, ch.content)
          requireIpcSuccess(writeResult, `导出章节 ${ch.name}`)
          await verifyWrittenFile(options.grantId, splitDir + '/' + ch.name, ch.content)
        }

        outputPath = splitDir
        break
      }

      case 'txt': {
        // 纯文本（去除 Markdown 格式）
        let content = `${project.name}\n${'='.repeat(project.name.length * 2)}\n\n`

        for (const ch of chapterContents) {
          // 简单去除 Markdown 标记
          const plainText = ch.content
            .replace(/^#{1,6}\s+/gm, '')  // 去掉标题标记
            .replace(/\*\*(.*?)\*\*/g, '$1')  // 去掉加粗
            .replace(/\*(.*?)\*/g, '$1')  // 去掉斜体
            .replace(/`(.*?)`/g, '$1')  // 去掉代码标记
            .replace(/---+/g, '\n')  // 分隔线
            .trim()

          content += plainText + '\n\n'
        }

        outputPath = `${projectFileStem}.txt`
        const writeResult = await ipc.invoke('fs:grant-write-file', options.grantId, outputPath, content)
        requireIpcSuccess(writeResult, '写入导出文件')
        await verifyWrittenFile(options.grantId, outputPath, content)
        break
      }
    }

    const manifest: ExportManifest = {
      schemaVersion: 1,
      projectName: project.name,
      format: options.format,
      generatedAt: new Date().toISOString(),
      authorityFingerprint: authority.authorityFingerprint,
      chapters: chapterContents.map(chapter => ({
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        wordCount: chapter.wordCount,
        outputFile: options.format === 'split-md'
          ? `${outputPath}/${chapter.name}`
          : outputPath,
        contentHash: chapter.contentHash,
      })),
    }
    const manifestResult = await ipc.invoke(
      'fs:grant-write-file',
      options.grantId,
      `${options.format === 'split-md' ? outputPath : projectFileStem}.manifest.json`,
      JSON.stringify(manifest, null, 2),
    )
    requireIpcSuccess(manifestResult, '写入导出清单')
    await verifyWrittenFile(
      options.grantId,
      `${options.format === 'split-md' ? outputPath : projectFileStem}.manifest.json`,
      JSON.stringify(manifest, null, 2),
    )
    addLog('info', `导出完成: ${outputPath}`)
    return { success: true, path: outputPath }
  } catch (error) {
    addLog('error', `导出失败: ${error}`)
    return { success: false, error: String(error) }
  } finally {
    activeExportInProgress = false
  }
}

/** Windows 与 POSIX 都安全的导出相对路径段，禁止项目名改变授权目录边界。 */
function exportFileStem(name: string): string {
  const normalized = Array.from(name, (character) => (
    character.charCodeAt(0) < 32 ? '_' : character
  )).join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return normalized || 'novel'
}

function formatLabel(format: ExportFormat): string {
  const labels: Record<ExportFormat, string> = {
    'merged-md': '合并 Markdown',
    'split-md': '分章 Markdown',
    'txt': '纯文本 TXT',
  }
  return labels[format]
}
