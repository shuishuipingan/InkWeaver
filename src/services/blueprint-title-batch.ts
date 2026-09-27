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
    ? `Propose a distinctive title for each requested chapter. Use its events, purpose, role, and suspense hook; reflect the novel direction and nearby titles. Keep established plot facts unchanged, vary the title phrasing, and avoid duplicate titles. Each title must be 1–${BLUEPRINT_TITLE_MAX_CHARACTERS} characters. Return JSON only: {"titles":[{"chapterNumber":1,"title":"..."}]}. Cover exactly these chapterNumber values once: ${input.targets.map(item => item.chapterNumber).join(', ')}.`
    : `为每个指定章节拟定有辨识度的标题，依据本章关键事件、目的、定位和悬念钩子，并参考全书方向及相邻章标题。不得改变既有剧情事实，标题表达要有变化且不可重名。每个标题为 1–${BLUEPRINT_TITLE_MAX_CHARACTERS} 个字符。只返回 JSON：{"titles":[{"chapterNumber":1,"title":"..."}]}。必须且只能完整覆盖这些 chapterNumber 各一次：${input.targets.map(item => item.chapterNumber).join('、')}。`
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
    payload = JSON.parse(content.trim()) as unknown
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
