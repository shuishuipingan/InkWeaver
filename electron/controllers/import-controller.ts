import { app, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import {
  ExternalFileGrantService,
  externalFileGrants,
} from '../services/external-file-grant-service'
import {
  ImportInspectionStore,
  importInspectionStore,
} from '../services/import-inspection-store'
import { ImportSourceIdentityRepository } from '../repositories/import-source-identity-repository'
import { loadApplicationImportSourceSecret } from '../services/import-source-identity-secret'
import { mainText } from '../i18n'
import {
  windowsSafeFileSystem,
  type WindowsSafeFileSystem,
} from '../security/windows-safe-file-system'
import {
  DEFAULT_IMPORT_RESOURCE_LIMITS,
  type ImportResourceLimits,
} from '../../src/shared/import-limits'
import type {
  ImportNovelFileSelectionRequest,
  ImportPurpose,
  ImportRunChapterInput,
  ImportRunLocale,
  ImportSourceFileIdentity,
} from '../../src/shared/import-run'
import type { ProjectSessionContext } from '../../src/shared/ipc-channels'
import { countDraftUnits } from '../../src/shared/draft-units'
import { getCurrentProjectPath, getProjectDb } from '../database'
import { projectAccess } from '../services/project-access'
import { assertRequiredExpectedProjectPath } from '../utils/project-context'
import { ImportRunRepository } from '../repositories/import-run-repository'
import {
  EPUB_MAX_ARCHIVE_ENTRIES,
  EPUB_MAX_ENTRY_BYTES,
  EPUB_MAX_EXTRACTED_BYTES,
  extractEpubChapters,
} from '../services/epub-extraction-service'

/**
 * 导入小说控制器 — 处理文件选择与章节拆分
 *
 * 拆章策略按优先级顺序尝试匹配：
 * 1. 中文标准格式："第X章/回/话/节 标题"（含阿拉伯数字与中文数字）
 * 2. 中文特殊章节："序章 / 楔子 / 引子 / 尾声 / 番外 / 后记" 等
 * 3. 英文标准格式："Chapter X: Title"
 * 4. Markdown 标题格式："# 第X章 标题"
 * 如果所有正则均不命中，则将整个文件视为单章。
 */

// ===== 拆章正则池 =====

const RE_CN_NUMBER = '[一二三四五六七八九十百千万零两\\d壹贰叁肆伍陆柒捌玖拾]+'

/**
 * 中文"第X章"格式（兼容卷）。章/卷后的标题可以直接相连（"第三章夜信"）。
 */
const RE_CN_CHAPTER = new RegExp(`^第(${RE_CN_NUMBER})(章|卷)[\\s：:·—-]*(.*)`)
/**
 * "第X回/话/节"只在有分隔符时才算章节标题：正文里"第二回合开始了"
 * 这类句子不能被误判成章节边界。
 */
const RE_CN_EPISODE = new RegExp(`^第(${RE_CN_NUMBER})(回|话|节)[\\s：:·—-]+(.*)`)

/** 中文特殊章节名（序章/楔子/尾声/番外…），这些同样是章节边界 */
const CN_SPECIAL_KEYWORD = '(?:序章|序言|序幕|楔子|引子|前言|开篇|尾声|终章|结局篇|后记|番外[0-9一二三四五六七八九十]*|外传|附录|序)'
const RE_CN_SPECIAL = new RegExp(`^(?:${CN_SPECIAL_KEYWORD})(?:$|[\\s：:·—-]+(.*))`)

/** 英文 "Chapter X" 格式 */
const RE_EN_CHAPTER = /^Chapter\s+(\d+)[\s：:·—-]*(.*)/i

/** Markdown 标题格式："# 第X章" / "## Chapter X" / "# 楔子" */
const RE_MD_HEADING = new RegExp(`^#{1,3}\\s+(?:第${RE_CN_NUMBER}(?:章|回|话|节|卷)|Chapter\\s+\\d+)[\\s：:·—-]*(.*)`, 'i')
const RE_MD_SPECIAL = new RegExp(`^#{1,3}\\s+${CN_SPECIAL_KEYWORD}(?:$|[\\s：:·—-]+(.*))`)

/** 所有候选正则 */
const CHAPTER_PATTERNS = [
  RE_CN_CHAPTER, RE_CN_EPISODE, RE_CN_SPECIAL, RE_EN_CHAPTER, RE_MD_HEADING, RE_MD_SPECIAL,
]

const IMPORT_GRANT_TTL_MS = 5 * 60 * 1000

export type ImportFileIdentityProvider = (filePath: string) => ImportSourceFileIdentity

/** Raw identities never leave main-process memory; project storage only receives a salted HMAC. */
function defaultFileIdentity(filePath: string): ImportSourceFileIdentity {
  const canonicalLocation = realpathSync.native(filePath)
  const stats = statSync(canonicalLocation, { bigint: true })
  return {
    canonicalLocation,
    ...(stats.ino === 0n
      ? {}
      : { fileIdentity: `dev:${stats.dev.toString()}:ino:${stats.ino.toString()}` }),
  }
}

function text(zhCNText: string, enUSText: string): string {
  return mainText(app.getLocale(), zhCNText, enUSText)
}

function importText(locale: ImportRunLocale | undefined, zhCNText: string, enUSText: string): string {
  return locale === 'en-US' ? enUSText : locale === 'zh-CN' ? zhCNText : text(zhCNText, enUSText)
}

function importSelectionErrorMessage(
  error: unknown,
  locale: ImportRunLocale | undefined,
  limits: ImportResourceLimits,
): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'IMPORT_SOURCE_COUNT_EXCEEDED') {
    return importText(
      locale,
      `所选文件数量超过导入上限（最多 ${limits.maxSourceFiles} 个）。`,
      `The import source-file limit was exceeded (limit: ${limits.maxSourceFiles}).`,
    )
  }
  if (code === 'IMPORT_SOURCE_BYTES_EXCEEDED' || code === 'SECURE_FS_FILE_TOO_LARGE') {
    return importText(
      locale,
      `所选文件总大小超过导入上限（最多 ${limits.maxTotalBytes} 字节）。`,
      `The import source-size limit was exceeded (limit: ${limits.maxTotalBytes} bytes).`,
    )
  }
  if (code === 'IMPORT_CHAPTER_COUNT_EXCEEDED') {
    return importText(
      locale,
      `拆分后的章节数超过导入上限（最多 ${limits.maxChapters} 章）。`,
      `The import chapter limit was exceeded (limit: ${limits.maxChapters}).`,
    )
  }
  if (code === 'EPUB_DRM_UNSUPPORTED') {
    return importText(
      locale,
      '该 EPUB 受 DRM 或加密保护，无法导入。请使用无 DRM 的 EPUB 或文本文件。',
      'This EPUB is DRM-protected or encrypted and cannot be imported. Use a DRM-free EPUB or text file.',
    )
  }
  if (code === 'EPUB_EXPANSION_LIMIT') {
    return importText(
      locale,
      '该 EPUB 的条目数或解压后内容超过安全上限，无法导入。',
      'This EPUB exceeds the safe entry-count or expanded-content limit and cannot be imported.',
    )
  }
  if (code === 'EPUB_INVALID_ARCHIVE') {
    return importText(
      locale,
      'EPUB 文件已损坏，或缺少有效的 container.xml、OPF 与正文阅读顺序。',
      'The EPUB is damaged or lacks a valid container.xml, OPF package, or textual reading order.',
    )
  }
  return importText(
    locale,
    '无法读取所选文件；请重新选择后再试。',
    'Could not read the selected files. Please choose them again.',
  )
}

/** 中文数字到阿拉伯数字的映射 */
function chineseNumToArabic(str: string): number {
  const map: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100, '千': 1000, '万': 10000,
    '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5,
    '陆': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
  }

  // 纯阿拉伯数字
  const n = parseInt(str)
  if (!isNaN(n)) return n

  // 中文数字解析（支持"一百二十三"等简单组合）
  let result = 0
  let current = 0
  for (const ch of str) {
    const val = map[ch]
    if (val === undefined) continue
    if (val >= 10) {
      if (current === 0) current = 1
      current *= val
      result += current
      current = 0
    } else {
      current = val
    }
  }
  return result + current
}

/** 从章节标题行提取章节号；无编号的特殊章节（楔子/序章/番外…）返回 0 */
function extractChapterNumber(line: string): number {
  // 尝试从"第X章/回/话/节/卷"格式提取（含 Markdown 前缀）
  const cnMatch = line.match(new RegExp(`第(${RE_CN_NUMBER})(?:章|回|话|节|卷)`))
  if (cnMatch) return chineseNumToArabic(cnMatch[1])

  // 尝试从"Chapter X"格式提取
  const enMatch = line.match(/Chapter\s+(\d+)/i)
  if (enMatch) return parseInt(enMatch[1])

  // 无编号的特殊章节（楔子/序章/番外…）交由自增序号处理
  return 0
}

/** 检测一行是否是章节标题 */
function isChapterHeading(line: string): boolean {
  const trimmed = line.trim()
  return CHAPTER_PATTERNS.some(re => re.test(trimmed))
}

/** 去掉 Markdown 标题前缀 */
function headingText(line: string): string {
  return line.trim().replace(/^#{1,3}\s*/u, '').trim()
}

/** 从章节标题行提取标题文字（去掉"第X章"前缀） */
function extractTitle(line: string): string {
  const trimmed = line.trim()
  // 楔子/序章/番外 这类关键词本身就是标题的一部分，整行保留。
  if (RE_CN_SPECIAL.test(trimmed) || RE_MD_SPECIAL.test(trimmed)) return headingText(trimmed)
  for (const re of CHAPTER_PATTERNS) {
    const match = trimmed.match(re)
    if (match) {
      // 取最后一个捕获组（标题部分）
      const title = match[match.length - 1]?.trim()
      if (title) return title
      // 如果标题为空，返回完整行（不含 Markdown 前缀）
      return headingText(trimmed)
    }
  }
  return trimmed
}

interface ParsedChapter {
  number: number
  title: string
  content: string
  wordCount: number
  contentFingerprint?: string
  contentSize?: number
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function sourceMediaType(displayName: string): string {
  const extension = path.extname(displayName).toLowerCase()
  if (extension === '.epub') return 'application/epub+zip'
  return extension === '.md' ? 'text/markdown' : 'text/plain'
}

/** 正文之前的书稿信息少于该长度时视为书名/作者行，不生成“前言”章节。 */
const PREAMBLE_CHAPTER_MIN_CHARACTERS = 80

function preambleChapterTitle(lines: readonly string[]): string {
  const firstLine = lines.find(line => line.trim())?.trim() ?? ''
  if (!firstLine || Array.from(firstLine).length > 40) return '前言'
  return firstLine
}

/** 将单个文件内容拆分为章节数组 */
function splitSingleFileContent(content: string, maxChapters: number): ParsedChapter[] {
  const lines = content.split('\n')
  const chapters: ParsedChapter[] = []
  let currentChapter: { headerLine: string; lines: string[] } | null = null
  let preamble: string[] = []
  let autoNumber = 0

  const appendChapter = (chapter: ParsedChapter) => {
    if (chapters.length >= maxChapters) {
      throw new Error('IMPORT_CHAPTER_COUNT_EXCEEDED')
    }
    chapters.push(chapter)
  }

  const flushPreamble = () => {
    const text = preamble.join('\n').trim()
    preamble = []
    // 短前言通常只是书名/作者/简介，单独成章会把后续章号整体推后一位。
    if (text.length < PREAMBLE_CHAPTER_MIN_CHARACTERS) return
    appendChapter({
      number: 0,
      title: preambleChapterTitle(text.split('\n')),
      content: text,
      wordCount: countDraftUnits(text),
    })
  }

  for (const line of lines) {
    if (isChapterHeading(line)) {
      // 保存上一个章节
      if (currentChapter) {
        autoNumber++
        const num = extractChapterNumber(currentChapter.headerLine) || autoNumber
        const text = currentChapter.lines.join('\n').trim()
        if (text.length > 0) {
          appendChapter({
            number: num,
            title: extractTitle(currentChapter.headerLine),
            content: text,
            wordCount: countDraftUnits(text),
          })
        }
      }
      flushPreamble()
      // 开始新章节
      currentChapter = { headerLine: line, lines: [] }
    } else if (currentChapter) {
      currentChapter.lines.push(line)
    } else {
      // 第一个章节标题之前的内容是书稿前言，不再丢掉首行正文。
      preamble.push(line)
    }
  }

  // 保存最后一个章节
  if (currentChapter) {
    autoNumber++
    const num = extractChapterNumber(currentChapter.headerLine) || autoNumber
    const text = currentChapter.lines.join('\n').trim()
    if (text.length > 0) {
      appendChapter({
        number: num,
        title: extractTitle(currentChapter.headerLine),
        content: text,
        wordCount: countDraftUnits(text),
      })
    }
  } else {
    flushPreamble()
  }

  return chapters
}

/** 内容中是否存在任何可识别的章节标题；没有任何标记时改用结构回退切分。 */
function hasChapterHeadings(content: string): boolean {
  const lines = content.split('\n')
  return lines.some(line => isChapterHeading(line))
}

/** 回退切分目标长度（字符）：无标记文本按此聚合成节。 */
const FALLBACK_CHAPTER_TARGET_CHARACTERS = 3_000
/** 少于该长度的尾节并入上一节，避免出现只有几行的“章节”。 */
const FALLBACK_CHAPTER_MIN_CHARACTERS = 1_200

/** 无标题章节的标签：取首行（够短时）作为可辨认的节名。 */
function fallbackUnitTitle(text: string, index: number): string {
  const firstLine = text.split('\n').find(line => line.trim())?.trim() ?? ''
  const candidate = firstLine.replace(/[。！？!?…].*$/su, '').trim()
  return candidate && Array.from(candidate).length <= 24 ? candidate : `第${index + 1}节`
}

/** 单段就超长（整章没有空行）时按句子边界切开，兜底再按长度硬切。 */
function splitOversizedBlock(block: string): string[] {
  const sentences = block.match(/[^。！？!?…\n]+[。！？!?…]*/gu) ?? [block]
  const pieces: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && Array.from(current).length >= FALLBACK_CHAPTER_TARGET_CHARACTERS) {
      pieces.push(current.trim())
      current = ''
    }
    current += sentence
  }
  if (current.trim()) pieces.push(current.trim())
  return pieces.flatMap(piece => {
    const characters = Array.from(piece)
    if (characters.length <= FALLBACK_CHAPTER_TARGET_CHARACTERS * 2) return [piece]
    const chunks: string[] = []
    for (let offset = 0; offset < characters.length; offset += FALLBACK_CHAPTER_TARGET_CHARACTERS) {
      chunks.push(characters.slice(offset, offset + FALLBACK_CHAPTER_TARGET_CHARACTERS).join(''))
    }
    return chunks
  })
}

/**
 * 没有任何章节标记的书（例如靠空行分节的长文）过去会被当成一整章，
 * 拆解阶段因此只能看到开头、蓝图也只生成一条。这里按空行与段落边界
 * 切成目标长度的连续片段，让拆解与蓝图生成有合理的章节粒度。
 * 内容本身不超过目标长度时保持单章，不做无意义切分。
 */
function splitUnmarkedContent(
  content: string,
  maxChapters: number,
): ParsedChapter[] {
  const normalized = content.replace(/\r\n?/gu, '\n').trim()
  if (!normalized) return []
  const blocks = normalized.split(/\n\s*\n/u).map(block => block.trim()).filter(Boolean)
  const units: string[] = []
  let buffer: string[] = []
  let bufferedCharacters = 0
  const close = () => {
    const text = buffer.join('\n\n').trim()
    buffer = []
    bufferedCharacters = 0
    if (text) units.push(text)
  }
  for (const block of blocks) {
    if (Array.from(block).length > FALLBACK_CHAPTER_TARGET_CHARACTERS * 2) {
      close()
      units.push(...splitOversizedBlock(block))
      continue
    }
    buffer.push(block)
    bufferedCharacters += Array.from(block).length
    if (bufferedCharacters >= FALLBACK_CHAPTER_TARGET_CHARACTERS) close()
  }
  close()
  if (units.length > 1 && Array.from(units.at(-1)!).length < FALLBACK_CHAPTER_MIN_CHARACTERS) {
    const tail = units.pop()!
    units[units.length - 1] = `${units.at(-1)!}\n\n${tail}`
  }
  if (units.length > maxChapters) throw new Error('IMPORT_CHAPTER_COUNT_EXCEEDED')
  return units.map((text, index) => ({
    number: index + 1,
    title: fallbackUnitTitle(text, index),
    content: text,
    wordCount: countDraftUnits(text),
  }))
}

export function registerImportController(
  fileSystem: WindowsSafeFileSystem = windowsSafeFileSystem,
  fileIdentity: ImportFileIdentityProvider = defaultFileIdentity,
  limitOverrides: Partial<ImportResourceLimits> = {},
  grantService: ExternalFileGrantService = externalFileGrants,
  inspectionStore: ImportInspectionStore = importInspectionStore,
  applicationSecret?: Buffer,
) {
  const limits: ImportResourceLimits = {
    ...DEFAULT_IMPORT_RESOURCE_LIMITS,
    ...limitOverrides,
  }
  for (const [key, value] of Object.entries(limits) as Array<[keyof ImportResourceLimits, number]>) {
    if (
      !Number.isSafeInteger(value)
      || value < 1
      || value > DEFAULT_IMPORT_RESOURCE_LIMITS[key]
    ) throw new Error(`导入资源限制 ${key} 无效`)
  }
  // Selection, bounded reading, and inspection are one main-process operation.
  // The renderer receives only the final inspection token and safe display facts.
  ipcMain.handle('dialog:select-novel-files', async (
    event,
    request?: ImportPurpose | ImportNovelFileSelectionRequest,
    projectSession?: ProjectSessionContext,
  ) => {
    event.sender.once('destroyed', () => {
      grantService.revokeWebContents(event.sender.id)
      inspectionStore.revokeForWebContents(event.sender.id)
    })
    const structuredRequest = typeof request === 'object' && request !== null ? request : undefined
    const purpose: ImportPurpose = typeof request === 'string' ? request : (structuredRequest?.purpose ?? 'reference')
    let frozenProject: { rootPath: string; session: ProjectSessionContext } | undefined
    let responseLocale = structuredRequest?.locale
    const assertFrozenProject = () => {
      if (!frozenProject) return
      const active = projectAccess.assertCurrentProjectContext(
        frozenProject.session,
        getCurrentProjectPath(),
      )
      assertRequiredExpectedProjectPath(active.rootPath, frozenProject.rootPath)
    }
    try {
      if (purpose !== 'reference' && purpose !== 'author-manuscript') throw new Error('IMPORT_PURPOSE_INVALID')
      if (structuredRequest) {
        const active = projectAccess.assertCurrentProjectContext(projectSession, getCurrentProjectPath())
        assertRequiredExpectedProjectPath(active.rootPath, structuredRequest.expectedProjectPath)
        frozenProject = {
          rootPath: active.rootPath,
          session: Object.freeze({ ...projectSession }) as ProjectSessionContext,
        }
      }
      const result = await dialog.showOpenDialog({
        title: purpose === 'author-manuscript'
          ? text('选择作者原稿文件', 'Choose author manuscript files')
          : text('选择参考小说文件', 'Choose reference novel files'),
        filters: [
          { name: text('小说文件', 'Novel files'), extensions: ['txt', 'md', 'text', 'epub'] },
          { name: text('所有文件', 'All files'), extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
      })
      assertFrozenProject()
      if (result.canceled || result.filePaths.length === 0) return null
      inspectionStore.revokeForWebContents(event.sender.id)
      if (result.filePaths.length > limits.maxSourceFiles) {
        throw new Error('IMPORT_SOURCE_COUNT_EXCEEDED')
      }

      // Count, identity, stat, and aggregate-size preflight all complete before
      // the first capability is allocated.
      let selectedBytes = 0
      const selected = result.filePaths.map(filePath => {
        const identity = fileIdentity(filePath)
        const selectedSize = statSync(identity.canonicalLocation).size
        if (!Number.isSafeInteger(selectedSize) || selectedSize < 0) {
          throw new Error('IMPORT_SOURCE_SIZE_INVALID')
        }
        if (selectedSize > limits.maxTotalBytes - selectedBytes) {
          throw new Error('IMPORT_SOURCE_BYTES_EXCEEDED')
        }
        selectedBytes += selectedSize
        return { filePath, identity, displayName: path.basename(filePath), selectedSize }
      }).sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN', { numeric: true }))
      const encodedIdentities = ImportSourceIdentityRepository.encodeSources(
        selected.map(source => source.identity),
        purpose,
        applicationSecret ?? loadApplicationImportSourceSecret(),
      )
      const parsingContext = structuredRequest?.purpose === 'reference'
        ? (() => {
            assertFrozenProject()
            const projectDb = getProjectDb()
            if (!projectDb) throw new Error('项目数据库未打开')
            return projectDb.transaction(() => {
              const resolvedIdentity = ImportSourceIdentityRepository.resolveEncodedSources(
                encodedIdentities,
                structuredRequest.purpose,
                applicationSecret ?? loadApplicationImportSourceSecret(),
              )
              const parsingRun = ImportRunRepository.beginParsing({
                runId: structuredRequest.runId,
                purpose: structuredRequest.purpose,
                sourceFingerprint: resolvedIdentity.sourceFingerprint,
                sourceIds: resolvedIdentity.sourceIds,
                sourceFingerprints: resolvedIdentity.sourceFingerprints,
                legacySourceFingerprints: resolvedIdentity.legacySourceFingerprints,
                legacyCollectionFingerprint: resolvedIdentity.legacyCollectionFingerprint,
                sourceDisplay: selected.map(source => ({
                  displayName: source.displayName,
                  mediaType: sourceMediaType(source.displayName),
                  size: source.selectedSize,
                })),
                locale: structuredRequest.locale,
              })
              if (parsingRun.totalContentSize > limits.maxTotalBytes - selectedBytes) {
                throw new Error('IMPORT_SOURCE_BYTES_EXCEEDED')
              }
              return { resolvedIdentity, parsingRun }
            })()
          })()
        : undefined
      const resolvedIdentity = parsingContext?.resolvedIdentity
      const parsingRun = parsingContext?.parsingRun
      // An ordinary selection may discover an unfinished run by source
      // identity even when the renderer supplied a fresh run id and a changed
      // UI locale. From this point onward, the durable run owns user-facing
      // parsing copy as well as persisted failures.
      responseLocale = parsingRun?.locale ?? responseLocale

      let chapterCount = parsingRun?.completedChapters ?? 0
      const sources: Array<{
        locationAliasDigest: string
        fileAliasDigest?: string
        displayName: string
        mediaType: string
        size: number
      }> = []
      let consumedBytes = parsingRun?.totalContentSize ?? 0

      const reserveSourceBytes = (content: string): number => {
        const contentBytes = Buffer.byteLength(content, 'utf8')
        if (contentBytes > limits.maxTotalBytes - consumedBytes) {
          throw new Error('IMPORT_SOURCE_BYTES_EXCEEDED')
        }
        consumedBytes += contentBytes
        return contentBytes
      }

      const appendChapters = (chapters: ParsedChapter[]) => {
        if (chapters.length > limits.maxChapters - chapterCount) {
          throw new Error('IMPORT_CHAPTER_COUNT_EXCEEDED')
        }
        chapterCount += chapters.length
      }

      const inspectedChapters: Array<ParsedChapter & { sourceIndex: number; sourceChapterNumber: number }> = []
      let emptySourceFound = false
      let titleOnlySourceFound = false
      for (let sourceIndex = 0; sourceIndex < selected.length; sourceIndex++) {
        const source = selected[sourceIndex]
        const encoded = encodedIdentities[sourceIndex]
        const opaqueSourceId = resolvedIdentity?.sourceIds[sourceIndex]
        assertFrozenProject()
        if (parsingRun && opaqueSourceId
          && ImportRunRepository.parsedSourceStatus(parsingRun.id, opaqueSourceId) === 'completed') {
          continue
        }
        let grantId = ''
        try {
          const grant = grantService.issueFile({
            webContentsId: event.sender.id,
            filePath: source.filePath,
            operations: ['read'],
            ttlMs: IMPORT_GRANT_TTL_MS,
            maxUses: 1,
          })
          grantId = grant.grantId
          const capability = grantService.resolve({
            grantId,
            webContentsId: event.sender.id,
            operation: 'read',
          })
          const sourceFileName = source.displayName
          const remainingBytes = limits.maxTotalBytes - consumedBytes
          const isEpub = path.extname(sourceFileName).toLowerCase() === '.epub'
          let parsed: ParsedChapter[]
          let contentBytes: number
          let content = ''
          if (isEpub) {
            const archive = await fileSystem.readBytes(capability, remainingBytes)
            assertFrozenProject()
            const extracted = await extractEpubChapters(archive, {
              maxEntries: EPUB_MAX_ARCHIVE_ENTRIES,
              maxEntryBytes: Math.min(EPUB_MAX_ENTRY_BYTES, remainingBytes),
              maxExtractedBytes: Math.min(EPUB_MAX_EXTRACTED_BYTES, remainingBytes),
            })
            contentBytes = reserveSourceBytes(extracted.map(chapter => chapter.content).join(''))
            parsed = extracted.flatMap((chapter) => {
              if (hasChapterHeadings(chapter.content)) {
                return splitSingleFileContent(
                  chapter.content,
                  limits.maxChapters - chapterCount,
                )
              }
              // 单个 spine 文档没有章节标记时同样按结构回退切分；
              // 第一段沿用文档标题，其余用首行标签。
              return splitUnmarkedContent(chapter.content, limits.maxChapters - chapterCount)
                .map((unit, unitIndex) => (
                  unitIndex === 0 && chapter.title ? { ...unit, title: chapter.title } : unit
                ))
            })
          } else {
            content = await fileSystem.readText(capability, remainingBytes)
            assertFrozenProject()
            contentBytes = reserveSourceBytes(content)
            content = content.trim()
            if (!content) {
              emptySourceFound = true
              if (parsingRun && opaqueSourceId) {
                assertFrozenProject()
                ImportRunRepository.failParsedSource(
                  parsingRun.id,
                  opaqueSourceId,
                  importText(responseLocale, '所选来源文件为空', 'Selected source file is empty'),
                )
              }
              continue
            }
            const fallbackUnits = hasChapterHeadings(content)
              ? null
              : splitUnmarkedContent(content, limits.maxChapters - chapterCount)
            if (fallbackUnits) {
              // 单节文件保持旧行为：用文件名当章节名。
              const fileName = path.basename(sourceFileName, path.extname(sourceFileName))
              parsed = fallbackUnits.length === 1 && fileName
                ? [{
                    ...fallbackUnits[0]!,
                    number: extractChapterNumber(fileName) || fallbackUnits[0]!.number,
                    title: fileName,
                  }]
                : fallbackUnits
            } else {
              parsed = splitSingleFileContent(content, limits.maxChapters - chapterCount)
            }
          }
          sources.push({
            ...encoded,
            displayName: sourceFileName,
            mediaType: sourceMediaType(sourceFileName),
            size: contentBytes,
          })
          if (parsed.length === 0) {
            titleOnlySourceFound = true
            if (parsingRun && opaqueSourceId) {
              assertFrozenProject()
              ImportRunRepository.failParsedSource(
                parsingRun.id,
                opaqueSourceId,
                importText(
                  responseLocale,
                  '所选来源文件只有章节标题，没有可导入的正文',
                  'The selected source file contains chapter headings but no body text',
                ),
              )
            }
            continue
          }
          appendChapters(parsed)
          const usedLocalNumbers = new Set<number>()
          let nextLocalNumber = 1
          const firstInspectedChapter = inspectedChapters.length
          for (const chapter of parsed) {
            let sourceChapterNumber = chapter.number
            if (!Number.isSafeInteger(sourceChapterNumber) || sourceChapterNumber < 1 || usedLocalNumbers.has(sourceChapterNumber)) {
              while (usedLocalNumbers.has(nextLocalNumber)) nextLocalNumber++
              sourceChapterNumber = nextLocalNumber
            }
            usedLocalNumbers.add(sourceChapterNumber)
            inspectedChapters.push({ ...chapter, sourceIndex, sourceChapterNumber })
          }
          if (parsingRun && opaqueSourceId) {
            const sourceChapters: ImportRunChapterInput[] = parsed.map((chapter, index) => {
              const persisted = inspectedChapters[firstInspectedChapter + index]
              const sourceChapterNumber = persisted?.sourceChapterNumber ?? chapter.number
              return {
                number: sourceChapterNumber,
                sourceChapterNumber,
                title: chapter.title,
                content: chapter.content,
                contentFingerprint: sha256(chapter.content),
                contentSize: Buffer.byteLength(chapter.content, 'utf8'),
              }
            })
            assertFrozenProject()
            ImportRunRepository.commitParsedSource(parsingRun.id, opaqueSourceId, sourceChapters)
          }
          content = ''
        } catch (error) {
          let projectStillCurrent = false
          try {
            assertFrozenProject()
            projectStillCurrent = true
          } catch {
            // A stale project session must not turn a read failure into a write
            // against the newly active project's database.
          }
          if (projectStillCurrent && parsingRun && opaqueSourceId
            && ImportRunRepository.parsedSourceStatus(parsingRun.id, opaqueSourceId) !== 'completed') {
            assertFrozenProject()
            ImportRunRepository.failParsedSource(
              parsingRun.id,
              opaqueSourceId,
              importSelectionErrorMessage(error, responseLocale, limits),
            )
          }
          throw error
        } finally {
          if (grantId) grantService.revoke(grantId)
        }
      }

      if (emptySourceFound) {
        const error = responseLocale === 'en-US'
          ? 'One or more selected files are empty. Add novel text and choose the unfinished files again.'
          : responseLocale === 'zh-CN'
            ? '一个或多个所选文件为空。请补充小说正文后，重新选择未完成的文件。'
            : text(
                '一个或多个所选文件为空。请补充小说正文后，重新选择未完成的文件。',
                'One or more selected files are empty. Add novel text and choose the unfinished files again.',
              )
        return { success: false, error }
      }

      if (titleOnlySourceFound) {
        return {
          success: false,
          error: importText(
            responseLocale,
            '一个或多个所选文件只有章节标题，没有可导入的正文。请补充小说正文后，重新选择未完成的文件。',
            'One or more selected files contain chapter headings but no body text. Add novel text and choose the unfinished files again.',
          ),
        }
      }

      if (parsingRun) {
        assertFrozenProject()
        return { success: true, preparation: ImportRunRepository.finalizeParsing(parsingRun.id) }
      }

      // Preview numbers are renderer-only. Stable global numbers are assigned
      // later from (opaque source id, source-local chapter number) in SQLite.
      const numbered = inspectedChapters.map((ch, idx) => ({
        ...ch,
        number: purpose === 'author-manuscript' ? ch.number : idx + 1,
        contentFingerprint: sha256(ch.content),
        contentSize: Buffer.byteLength(ch.content, 'utf8'),
      }))
      if (purpose === 'author-manuscript') {
        const seen = new Set<number>()
        for (const chapter of numbered) {
          if (!Number.isSafeInteger(chapter.number) || chapter.number < 1 || seen.has(chapter.number)) {
            throw new Error(`AUTHOR_MANUSCRIPT_DUPLICATE_CHAPTER:${chapter.number}`)
          }
          seen.add(chapter.number)
        }
      }

      return {
        success: true,
        inspection: inspectionStore.create({ webContentsId: event.sender.id, purpose, sources, chapters: numbered }),
      }
    } catch (error) {
      inspectionStore.revokeForWebContents(event.sender.id)
      const message = error instanceof Error ? error.message : String(error)
      const duplicateChapter = /^AUTHOR_MANUSCRIPT_DUPLICATE_CHAPTER:(\d+)$/u.exec(message)
      return {
        success: false,
        error: duplicateChapter
          ? text(
              `作者原稿包含重复的第 ${duplicateChapter[1]} 章；请修正章节号后重新选择。`,
              `The author manuscript contains duplicate Chapter ${duplicateChapter[1]}. Correct the chapter numbers and choose the files again.`,
            )
          : importSelectionErrorMessage(error, responseLocale, limits),
      }
    }
  })
}
