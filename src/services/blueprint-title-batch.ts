export const BLUEPRINT_TITLE_BATCH_SIZE = 10
export const BLUEPRINT_TITLE_MAX_CHARACTERS = 60

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
  const facts = {
    novelDirection: context,
    nearbyChapters: input.adjacent.slice(0, 4).map(chapterFact),
    requestedChapters: input.targets.map(chapterFact),
  }
  const instruction = english
    ? `Propose a distinctive fiction chapter title for each requested chapter. Use its events, purpose, role, and suspense hook; reflect the novel direction and nearby titles. Keep established plot facts unchanged and avoid duplicate titles. Prefer evocative phrases of 2–8 words, at most ${BLUEPRINT_TITLE_MAX_CHARACTERS} characters. Do not write plot summaries, lists of events, chapter numbers, explanations, or subtitles. For example, a hidden letter could inspire "The Unbroken Seal", rather than a sentence describing who found it. Return JSON only: {"titles":[{"chapterNumber":1,"title":"..."}]}. Cover exactly these chapterNumber values once: ${input.targets.map(item => item.chapterNumber).join(', ')}.`
    : `为每个指定章节拟定像小说章节名的简洁标题，依据本章关键事件、目的、定位和悬念钩子，并参考全书方向及相邻章标题。不得改变既有剧情事实，标题表达要有变化且不可重名。优先 4–12 字，最多 20 个字符，以本章独特意象、冲突或悬念命名。不要剧情梗概、动作清单、逗号串联多个事件、章号、解释或副标题。例如发现旧信可拟“夜信藏锋”，不要写“主角发现旧信并追问陌生人”。只返回 JSON：{"titles":[{"chapterNumber":1,"title":"..."}]}。必须且只能完整覆盖这些 chapterNumber 各一次：${input.targets.map(item => item.chapterNumber).join('、')}。`
  return `${instruction}\n${JSON.stringify(facts)}`
}

export function parseBlueprintTitleSuggestions(
  content: string,
  expectedChapterNumbers: readonly number[],
): Array<{ chapterNumber: number; title: string }> {
  const expected = new Set(expectedChapterNumbers)
  if (
    expected.size !== expectedChapterNumbers.length
    || expectedChapterNumbers.some(chapterNumber => !Number.isSafeInteger(chapterNumber) || chapterNumber < 1)
  ) {
    throw new Error('章节标题目标范围无效')
  }

  let payload: unknown
  try {
    payload = JSON.parse(content.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')) as unknown
  } catch {
    throw new Error('AI 返回的章节标题不是有效 JSON')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('AI 返回的章节标题封装无效')
  }
  const titleValues = (payload as Record<string, unknown>).titles
  if (!Array.isArray(titleValues)) throw new Error('AI 返回的章节标题列表无效')

  const seenChapters = new Set<number>()
  const seenTitles = new Set<string>()
  const suggestions = titleValues.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`第 ${index + 1} 条标题候选格式无效`)
    }
    const row = value as Record<string, unknown>
    const chapterNumber = row.chapterNumber
    if (
      typeof chapterNumber !== 'number'
      || !Number.isSafeInteger(chapterNumber)
      || !expected.has(chapterNumber)
      || seenChapters.has(chapterNumber)
    ) {
      throw new Error('AI 返回了重复、越界或无效的章节编号')
    }
    if (typeof row.title !== 'string') throw new Error(`第 ${chapterNumber} 章缺少标题`)
    const title = row.title.trim()
    if (!title || Array.from(title).length > BLUEPRINT_TITLE_MAX_CHARACTERS) {
      throw new Error(`第 ${chapterNumber} 章标题为空或超过 ${BLUEPRINT_TITLE_MAX_CHARACTERS} 个字符`)
    }
    const normalizedTitle = title.normalize('NFKC').toLocaleLowerCase()
    if (seenTitles.has(normalizedTitle)) throw new Error(`AI 返回了重复章节标题：${title}`)
    seenChapters.add(chapterNumber)
    seenTitles.add(normalizedTitle)
    return { chapterNumber, title }
  })

  if (suggestions.length !== expected.size || expectedChapterNumbers.some(chapterNumber => !seenChapters.has(chapterNumber))) {
    throw new Error('AI 未完整返回本批次的全部章节标题')
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
      parsed = parseBlueprintTitleSuggestions(result.content, targets.map(target => target.chapterNumber))
      const existingTitles = new Set(suggestions.map(item => item.title.normalize('NFKC').toLocaleLowerCase()))
      if (parsed.some(item => existingTitles.has(item.title.normalize('NFKC').toLocaleLowerCase()))) {
        throw new Error(english ? 'Do not repeat a title from an earlier sub-batch.' : '不要重复本批次之前已生成的章节名。')
      }
      if (parsed.some(item => /[\r\n]/u.test(item.title) || /^第\s*\d+\s*章/u.test(item.title)
        || (!english && (Array.from(item.title).length > 20 || /[，,；;。]/u.test(item.title))))) {
        throw new Error(english ? 'Use concise chapter titles.' : '请返回简洁章节名，不要剧情梗概、章号或多事件清单。')
      }
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
