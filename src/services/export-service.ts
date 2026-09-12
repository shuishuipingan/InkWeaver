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
import type { ProjectSessionContext } from '../shared/ipc-channels'
import type { AuthoritativeChapterSequence } from '../shared/author-manuscript-import'
import { countDraftUnits } from '../shared/draft-units'
import { textFingerprint } from '../shared/character-extraction'
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
  includeOutline?: boolean
  includeCharacters?: boolean
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
  wordCount?: number
}

export type FinalizedExportPlan =
  | { ok: true; chapters: FinalizedExportPlanChapter[] }
  | { ok: false; error: string }

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
      ...(typeof draft.wordCount === 'number' ? { wordCount: draft.wordCount } : {}),
    })
  }
  const unexpected = finalized.some(draft => draft.chapterNumber > authority.lastChapterNumber || draft.chapterNumber < 1)
  return unexpected
    ? { ok: false, error: '定稿事实超出连续权威章节范围，无法安全导出' }
    : { ok: true, chapters }
}

const PROJECT_SESSION_CHANGED_ERROR = '项目会话已变化，本次导出已取消'

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
  addLog('info', `开始导出（${formatLabel(options.format)}）...`)

  try {
    // Planning blueprints may be ahead of, or missing from, the manuscript.
    // Export is therefore enumerated exclusively from finalized authority.
    const authority = await ipc.invokeWithProjectSession(
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
    const plan = createFinalizedExportPlan(authority, allDrafts)
    if (!plan.ok) return { success: false, error: plan.error }

    const chapterContents: Array<{ chapterNumber: number; name: string; title: string; content: string; wordCount: number; contentHash: string }> = []
    for (const chapter of plan.chapters) {
      const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', chapter.id, projectSession.projectPath) as unknown as {
        content?: unknown
        wordCount?: unknown
        chapterTitle?: unknown
      } | null
      if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
      if (!full || typeof full.content !== 'string' || !full.content.trim()) {
        return { success: false, error: `第 ${chapter.chapterNumber} 章正文为空，无法安全导出` }
      }
      const computedWordCount = countDraftUnits(full.content)
      if (computedWordCount <= 0) return { success: false, error: `第 ${chapter.chapterNumber} 章没有可计数正文，无法安全导出` }
      const storedWordCount = typeof full.wordCount === 'number' && full.wordCount > 0
        ? full.wordCount
        : chapter.wordCount
      if (typeof storedWordCount === 'number' && storedWordCount > 0 && storedWordCount !== computedWordCount) {
        return { success: false, error: `第 ${chapter.chapterNumber} 章字数校验失败，无法安全导出` }
      }
      if (typeof full.chapterTitle === 'string' && full.chapterTitle.trim() && full.chapterTitle.trim() !== chapter.chapterTitle) {
        return { success: false, error: `第 ${chapter.chapterNumber} 章标题校验失败，无法安全导出` }
      }
      chapterContents.push({
        chapterNumber: chapter.chapterNumber,
        name: `chapter_${chapter.chapterNumber}.md`,
        title: chapter.chapterTitle,
        content: full.content,
        wordCount: computedWordCount,
        contentHash: await contentHash(full.content),
      })
    }

    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    addLog('info', `找到 ${chapterContents.length} 个已定稿章节`)

    let outputPath = ''
    const projectFileStem = exportFileStem(project.name)

    switch (options.format) {
      case 'merged-md': {
        // 合并为单个 Markdown
        let content = `# ${project.name}\n\n`
        content += `> ${project.novelConfig.genre} · ${project.novelConfig.targetAudience}\n\n---\n\n`

        // 可选：包含大纲
        if (options.includeOutline) {
          const core = await ipc.invokeWithProjectSession(
            projectSession,
            'db:project-core-get',
            projectSession.projectPath,
          )
          if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
          if (core?.synopsis) {
            content += core.synopsis + '\n\n---\n\n'
          }
        }

        // 章节内容
        for (const ch of chapterContents) {
          content += ch.content + '\n\n---\n\n'
        }

        outputPath = `${projectFileStem}.md`
        const writeResult = await ipc.invoke('fs:grant-write-file', options.grantId, outputPath, content)
        if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
        requireIpcSuccess(writeResult, '写入导出文件')
        if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
        await verifyWrittenFile(options.grantId, outputPath, content)
        break
      }

      case 'split-md': {
        // 每章一个 Markdown
        const splitDir = projectFileStem
        const mkdirResult = await ipc.invoke('fs:grant-mkdir', options.grantId, splitDir)
        if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
        requireIpcSuccess(mkdirResult, '创建导出目录')

        for (const ch of chapterContents) {
          const writeResult = await ipc.invoke('fs:grant-write-file', options.grantId, `${splitDir}/${ch.name}`, ch.content)
          if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
          requireIpcSuccess(writeResult, `导出章节 ${ch.name}`)
          if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
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
        if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
        requireIpcSuccess(writeResult, '写入导出文件')
        if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
        await verifyWrittenFile(options.grantId, outputPath, content)
        break
      }
    }

    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
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
        outputFile: options.format === 'split-md' ? `${projectFileStem}/${chapter.name}` : outputPath,
        contentHash: chapter.contentHash,
      })),
    }
    const manifestResult = await ipc.invoke(
      'fs:grant-write-file',
      options.grantId,
      `${projectFileStem}.manifest.json`,
      JSON.stringify(manifest, null, 2),
    )
    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    requireIpcSuccess(manifestResult, '写入导出清单')
    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    await verifyWrittenFile(options.grantId, `${projectFileStem}.manifest.json`, JSON.stringify(manifest, null, 2))
    addLog('info', `导出完成: ${outputPath}`)
    return { success: true, path: outputPath }
  } catch (error) {
    if (!isProjectSessionCurrent(projectSession)) return staleExportResult()
    addLog('error', `导出失败: ${error}`)
    return { success: false, error: String(error) }
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
