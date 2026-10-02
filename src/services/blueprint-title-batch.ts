export const BLUEPRINT_TITLE_BATCH_SIZE = 10
/** Storage/contract ceiling for a blueprint title. */
export const BLUEPRINT_TITLE_MAX_CHARACTERS = 60
/** 中文写作习惯下章节名的合理上限；超出即视为模型跑偏并要求重写。 */
export const BLUEPRINT_TITLE_ZH_STYLE_MAX_CHARACTERS = 20
/** 中文写作习惯下章节名的常见长度区间（仅用于提示与校验文案）。 */
export const BLUEPRINT_TITLE_ZH_STYLE_MIN_CHARACTERS = 2

export interface BlueprintTitleSource {
  chapterNumber: number
  title: string
  role: string
  purpose: string
  keyEvents: string
  suspenseHook: string
}

export interface BlueprintTitleProjectContext {
  genre?: string
  subGenre?: string
  premise?: string
  synopsis?: string
  coreOutline?: string
  worldSetting?: string
  protagonistProfile?: string
  writingStyle?: string
  globalGuidance?: string
}

function bounded(value: string | undefined, limit: number): string {
  const trimmed = value?.trim() ?? ''
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`
}

function chapterFact(source: BlueprintTitleSource) {
  return {
    chapterNumber: source.chapterNumber,
    currentTitle: bounded(source.title, BLUEPRINT_TITLE_MAX_CHARACTERS),
    role: bounded(source.role, 80),
    purpose: bounded(source.purpose, 240),
    keyEvents: bounded(source.keyEvents, 500),
    suspenseHook: bounded(source.suspenseHook, 200),
  }
}

const TITLE_WRAPPER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['《', '》'], ['〈', '〉'], ['「', '」'], ['『', '』'], ['【', '】'], ['〔', '〕'],
  ['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"], ['（', '）'], ['(', ')'],
]

/**
 * 章节名是作品的门面，模型却常返回《书名号》、引号、`第3章`／`3.`／`三、`
 * 前缀、`标题：` 标签或结尾句号。落库前统一清洗成读者熟悉的章节名形态。
 */
export function sanitizeChapterTitle(raw: string): string {
  let title = raw.replace(/[\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (!title) return ''
  title = title.replace(/^#{1,6}\s*/u, '').replace(/\*\*/gu, '').trim()
  let changed = true
  while (changed) {
    changed = false
    for (const [open, close] of TITLE_WRAPPER_PAIRS) {
      if (title.length > open.length + close.length && title.startsWith(open) && title.endsWith(close)) {
        title = title.slice(open.length, -close.length).trim()
        changed = true
      }
    }
  }
  title = title
    .replace(/^第\s*[0-9０-９一二三四五六七八九十百千万]+\s*[章回节话篇幕]\s*[:：、.．\-—]?\s*/u, '')
    .replace(/^(?:chapter|ch\.?|part)\s*[0-9ivxlcdm]+\s*[:：.、\-—]?\s*/iu, '')
    .replace(/^(?:标题|题目|章名|章节名)\s*[:：]\s*/u, '')
    .replace(/^[0-9０-９]{1,4}\s*[.、．:：)）]\s*/u, '')
    .replace(/^[一二三四五六七八九十百]{1,3}\s*[、.．)）]\s*/u, '')
    .trim()
  title = title.replace(/[。．.，,；;：:！!？?、…~～—-]+$/u, '').trim()
  return title
}

/** 比较用键：清洗后再去掉全部标点与空白，避免《X》与 X 被当成两个不同标题。 */
export function normalizeChapterTitleKey(raw: string): string {
  return sanitizeChapterTitle(raw)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function styleIssue(title: string, english: boolean): string | null {
  if (!title) return 'empty'
  if (/[\r\n]/u.test(title)) return 'multiline'
  if (/^第\s*[0-9０-９一二三四五六七八九十百千万]+\s*[章回节话篇]/u.test(title)) return 'chapter-number'
  const length = Array.from(title).length
  if (length > BLUEPRINT_TITLE_MAX_CHARACTERS) return 'too-long'
  if (english) return null
  if (length > BLUEPRINT_TITLE_ZH_STYLE_MAX_CHARACTERS) return 'too-long'
  if (length < BLUEPRINT_TITLE_ZH_STYLE_MIN_CHARACTERS) return 'too-short'
  if (/[，,；;。]/u.test(title)) return 'summary-like'
  return null
}

/** 面向模型的修复提示：只说“不简洁”没用，必须点明违反了哪条命名约定。 */
function styleIssueMessage(issue: string, english: boolean): string {
  const messages: Record<string, [string, string]> = {
    empty: ['标题不能为空', 'The title must not be empty'],
    multiline: ['标题只能是单行', 'Titles must be a single line'],
    'chapter-number': ['标题不要带“第N章”前缀', 'Do not prefix the title with a chapter number'],
    'too-long': [
      `标题过长（中文请控制在 ${BLUEPRINT_TITLE_ZH_STYLE_MAX_CHARACTERS} 个字符以内，优先 4-12 字）`,
      `Title is too long (keep it within ${BLUEPRINT_TITLE_MAX_CHARACTERS} characters)`,
    ],
    'too-short': ['标题过短，请写出完整的章节名', 'Title is too short to read as a chapter title'],
    'summary-like': ['标题不能写成剧情梗概（不要逗号串联多个事件，也不要句号）', 'Do not write a plot summary with comma-separated events'],
  }
  const entry = messages[issue] ?? ['标题格式不符合章节名习惯', 'Title does not read like a chapter title']
  return english ? entry[1] : entry[0]
}

function chapterTitleStyleRequirement(english: boolean, chapterNumbers: string): string {
  if (english) {
    return [
      `Propose the chapter title for each requested chapter. Write titles the way published fiction does: short, concrete noun/verb phrases that name the chapter's key event, confrontation, decision, reveal, or hook.`,
      `Rules: prefer 2-8 words and at most ${BLUEPRINT_TITLE_MAX_CHARACTERS} characters; keep every title unique across the whole book; put no book-title marks, quotes, punctuation, chapter numbers, numbering prefixes, "Title:" labels, subtitles, explanations, or Markdown in the title.`,
      `Do not write plot summaries, action lists, comma-chained events, stacked abstract imagery, rare words, or poem-like fragments.`,
      `Good: "The Unexpected Guest", "Night Search", "First Clash", "The Truth Surfaces". Bad: "Lin Zhou discovers the old letter and questions the stranger" (summary), "Whispers of the Unbroken Seal" (vague imagery), ""Night Search"" (quoted).`,
      `Return JSON only: {"titles":[{"chapterNumber":1,"title":"..."}]}. Cover exactly these chapterNumber values once: ${chapterNumbers}.`,
    ].join('')
  }
  return [
    `为每个指定章节拟定一个真正的章节名：像已出版小说那样，用简短具体的词直接点出本章的核心事件、冲突、转折、决定或悬念，并参考全书方向、既有章标题与相邻章标题。不得改变既有剧情事实。`,
    `命名约定：优先 4-12 个字，最多 ${BLUEPRINT_TITLE_ZH_STYLE_MAX_CHARACTERS} 个字符；全书标题不可重复；标题里不要出现书名号、引号、标点、章号、“第X章”“3.”“三、”这类序号、“标题：”前缀、副标题、解释或 Markdown。`,
    `不要剧情梗概、不要动作清单、不要逗号串联多个事件，也不要堆砌抽象意象、生僻词或诗句化短语。`,
    `正例：“夜探书房”“意外的访客”“第一次交锋”“真相初现”“雨夜来客”。反例：“主角发现旧信并追问陌生人”（梗概）、“夜信藏锋”（过于含蓄抽象，读者看不出本章在讲什么）、“《夜探书房》”（带书名号）。`,
    `只返回 JSON：{"titles":[{"chapterNumber":1,"title":"..."}]}。必须且只能完整覆盖这些 chapterNumber 各一次：${chapterNumbers}。`,
  ].join('')
}

export function chunkBlueprintTitleTargets<T extends BlueprintTitleSource>(
  sources: readonly T[],
): T[][] {
  const batches: T[][] = []
  for (let offset = 0; offset < sources.length; offset += BLUEPRINT_TITLE_BATCH_SIZE) {
    batches.push(sources.slice(offset, offset + BLUEPRINT_TITLE_BATCH_SIZE))
  }
  return batches
}

export function buildBlueprintTitleBatchPrompt(input: {
  writingLanguage: 'zh-CN' | 'en-US'
  core: BlueprintTitleProjectContext
  targets: readonly BlueprintTitleSource[]
  adjacent: readonly BlueprintTitleSource[]
  /** 全书其它章节的现有标题，用于避免跨批次重名。 */
  existingTitles?: readonly string[]
}): string {
  const english = input.writingLanguage === 'en-US'
  const context = Object.fromEntries(
    Object.entries({
      genre: bounded(input.core.genre, 160),
      subGenre: bounded(input.core.subGenre, 160),
      premise: bounded(input.core.premise, 1_000),
      synopsis: bounded(input.core.synopsis, 1_600),
      coreOutline: bounded(input.core.coreOutline, 1_200),
      worldSetting: bounded(input.core.worldSetting, 800),
      protagonistProfile: bounded(input.core.protagonistProfile, 600),
      writingStyle: bounded(input.core.writingStyle, 400),
      globalGuidance: bounded(input.core.globalGuidance, 600),
    }).filter(([, value]) => value),
  )
  const existingTitles = [...new Set((input.existingTitles ?? [])
    .map(title => bounded(title, 40))
    .filter(Boolean))]
  const facts = {
    novelDirection: context,
    ...(existingTitles.length > 0 ? { existingChapterTitles: existingTitles.slice(0, 120) } : {}),
    nearbyChapters: input.adjacent.slice(0, 4).map(chapterFact),
    requestedChapters: input.targets.map(chapterFact),
  }
  const chapterNumbers = input.targets.map(item => item.chapterNumber)
  const instruction = chapterTitleStyleRequirement(
    english,
    (english ? chapterNumbers.join(', ') : chapterNumbers.join('、')),
  )
  return `${instruction}\n${JSON.stringify(facts)}`
}

export function parseBlueprintTitleSuggestions(
  content: string,
  expectedChapterNumbers: readonly number[],
  options: { writingLanguage?: 'zh-CN' | 'en-US'; reservedTitles?: readonly string[] } = {},
): Array<{ chapterNumber: number; title: string }> {
  const english = options.writingLanguage === 'en-US'
  const expected = new Set(expectedChapterNumbers)
  if (
    expected.size !== expectedChapterNumbers.length
    || expectedChapterNumbers.some(chapterNumber => !Number.isSafeInteger(chapterNumber) || chapterNumber < 1)
  ) {
    throw new Error(english ? 'The chapter-title target range is invalid' : '章节标题目标范围无效')
  }
  let payload: unknown
  try {
    payload = JSON.parse(content.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')) as unknown
  } catch {
    throw new Error(english ? 'The model response is not valid JSON' : 'AI 返回的章节标题不是有效 JSON')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(english ? 'The model returned an invalid chapter-title envelope' : 'AI 返回的章节标题封装无效')
  }
  const titleValues = (payload as Record<string, unknown>).titles
  if (!Array.isArray(titleValues)) throw new Error(english ? 'The model returned an invalid chapter-title list' : 'AI 返回的章节标题列表无效')

  const seenChapters = new Set<number>()
  const seenTitles = new Set<string>()
  const suggestions = titleValues.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(english ? `Title candidate ${index + 1} is malformed` : `第 ${index + 1} 条标题候选格式无效`)
    }
    const row = value as Record<string, unknown>
    const chapterNumber = row.chapterNumber
    if (
      typeof chapterNumber !== 'number'
      || !Number.isSafeInteger(chapterNumber)
      || !expected.has(chapterNumber)
      || seenChapters.has(chapterNumber)
    ) {
      throw new Error(english ? 'The model returned a duplicate, out-of-range, or invalid chapter number' : 'AI 返回了重复、越界或无效的章节编号')
    }
    if (typeof row.title !== 'string') throw new Error(english ? `Chapter ${chapterNumber} has no title` : `第 ${chapterNumber} 章缺少标题`)
    // 清洗后再校验：模型常把书名号、序号或前缀一起返回，清洗掉即合规。
    const title = sanitizeChapterTitle(row.title)
    if (!title || Array.from(title).length > BLUEPRINT_TITLE_MAX_CHARACTERS) {
      throw new Error(english
        ? `Chapter ${chapterNumber} title is empty or longer than ${BLUEPRINT_TITLE_MAX_CHARACTERS} characters`
        : `第 ${chapterNumber} 章标题为空或超过 ${BLUEPRINT_TITLE_MAX_CHARACTERS} 个字符`)
    }
    const normalizedTitle = normalizeChapterTitleKey(title)
    if (seenTitles.has(normalizedTitle)) {
      throw new Error(english ? `Duplicate chapter title returned: ${title}` : `AI 返回了重复章节标题：${title}`)
    }
    seenChapters.add(chapterNumber)
    seenTitles.add(normalizedTitle)
    return { chapterNumber, title }
  })

  if (suggestions.length !== expected.size || expectedChapterNumbers.some(chapterNumber => !seenChapters.has(chapterNumber))) {
    throw new Error(english ? 'The model did not return every chapter title in this batch' : 'AI 未完整返回本批次的全部章节标题')
  }
  const reserved = new Set((options.reservedTitles ?? []).map(normalizeChapterTitleKey).filter(Boolean))
  for (const suggestion of suggestions) {
    const issue = styleIssue(suggestion.title, english)
    if (issue) {
      throw new Error(english
        ? `Chapter ${suggestion.chapterNumber} does not read like a chapter title: ${styleIssueMessage(issue, english)}`
        : `第 ${suggestion.chapterNumber} 章标题不符合章节名习惯：${styleIssueMessage(issue, english)}`)
    }
    if (reserved.has(normalizeChapterTitleKey(suggestion.title))) {
      throw new Error(english
        ? `Chapter ${suggestion.chapterNumber} reuses an existing chapter title: ${suggestion.title}`
        : `第 ${suggestion.chapterNumber} 章标题与全书已有章节名重复：${suggestion.title}`)
    }
  }
  return suggestions.sort((left, right) => left.chapterNumber - right.chapterNumber)
}

interface TitleGenerationResponse {
  success: boolean
  finishReason: string
  content: string
  error?: string
}

/** Bounded recovery: truncated output is discarded, verified sub-batches survive. */
export async function generateBlueprintTitleSuggestions(input: {
  targets: readonly BlueprintTitleSource[]
  writingLanguage: 'zh-CN' | 'en-US'
  configuredMaxTokens?: number
  /** 全书其它章节的现有标题：既用于提示，也用于拒绝重名。 */
  reservedTitles?: readonly string[]
  request: (targets: readonly BlueprintTitleSource[], maxTokens: number, repairHint?: string) => Promise<TitleGenerationResponse>
  isCancelled?: () => boolean
  onSuggestions?: (suggestions: Array<{ chapterNumber: number; title: string }>) => void
  onRetry?: (reason: 'length' | 'invalid-titles', chapterCount: number, requestCount: number) => void
}): Promise<{ suggestions: Array<{ chapterNumber: number; title: string }>; cancelled: boolean }> {
  const suggestions: Array<{ chapterNumber: number; title: string }> = []
  const maxTokens = input.configuredMaxTokens && input.configuredMaxTokens > 0
    ? Math.min(16_384, Math.floor(input.configuredMaxTokens)) : 16_384
  const english = input.writingLanguage === 'en-US'
  let requestCount = 0
  const run = async (targets: readonly BlueprintTitleSource[], depth: number, repairHint?: string): Promise<void> => {
    if (targets.length === 0 || input.isCancelled?.()) return
    if (requestCount >= 7) throw new Error(english ? 'Title recovery request limit reached. Completed titles are preserved.' : '章节名恢复请求已达上限，已保留完成的候选，可继续生成。')
    requestCount += 1
    const result = await input.request(targets, maxTokens, repairHint)
    if (result.finishReason === 'length' && targets.length > 1 && depth < 2) {
      if (input.isCancelled?.()) return
      input.onRetry?.('length', targets.length, requestCount)
      const middle = Math.ceil(targets.length / 2)
      await run(targets.slice(0, middle), depth + 1)
      await run(targets.slice(middle), depth + 1)
      return
    }
    if (!result.success || result.finishReason !== 'stop') {
      const hint = result.finishReason === 'length'
        ? english ? ' Increase the model output limit or reduce its thinking budget.' : '请提高模型输出上限或降低思考预算。'
        : ''
      throw new Error(`${english ? 'Chapter titles did not finish' : '章节名未完整生成'} (${result.finishReason})：${result.error ?? ''}${hint}`)
    }
    let parsed: Array<{ chapterNumber: number; title: string }>
    try {
      parsed = parseBlueprintTitleSuggestions(
        result.content,
        targets.map(target => target.chapterNumber),
        {
          writingLanguage: input.writingLanguage,
          reservedTitles: [
            ...(input.reservedTitles ?? []),
            ...suggestions.map(item => item.title),
          ],
        },
      )
    } catch (error) {
      if (repairHint || input.isCancelled?.()) throw error
      input.onRetry?.('invalid-titles', targets.length, requestCount)
      await run(targets, depth, error instanceof Error ? error.message : String(error))
      return
    }
    suggestions.push(...parsed)
    input.onSuggestions?.(parsed)
  }
  await run(input.targets, 0)
  return { suggestions, cancelled: input.isCancelled?.() ?? false }
}
