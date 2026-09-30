import type { BlueprintData } from '../../electron/repositories/blueprint-repository'
import type { ProjectCoreData } from '../../electron/repositories/project-core-repository'
import type { NarrativeThreadPlanInput } from '../shared/narrative-thread'
import {
  STORY_DIRECTION_BLUEPRINT_FIELDS,
  STORY_DIRECTION_CHARACTER_FIELDS,
  STORY_DIRECTION_CORE_FIELDS,
  type StoryDirectionBlueprintChange,
  type StoryDirectionCoreField,
  type StoryDirectionCharacterField,
} from '../shared/story-direction'
import {
  normalizeTerminologyReplacements,
  replaceTerminologyNameArray,
  type StoryDirectionTerminologyReplacement,
} from '../shared/story-direction-terminology'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('方向调整响应必须是 JSON 对象')
  return value as Record<string, unknown>
}

export function parseDirectionJson(content: string): Record<string, unknown> {
  const clean = content.replace(/^```(?:json)?\s*/iu, '').replace(/```\s*$/u, '').trim()
  return object(JSON.parse(clean) as unknown)
}

function normalizeCoreField(field: string): StoryDirectionCoreField {
  if (STORY_DIRECTION_CORE_FIELDS.includes(field as StoryDirectionCoreField)) return field as StoryDirectionCoreField
  if (/(?:主角|主人公|人格|第二人格)/u.test(field)) return 'protagonistProfile'
  if (/(?:世界|法则|规则)/u.test(field)) return 'worldSetting'
  if (/(?:前提|核心冲突)/u.test(field)) return 'premise'
  if (/(?:大纲|情节|剧情)/u.test(field)) return 'synopsis'
  if (/(?:金手指|外挂)/u.test(field)) return 'goldenFinger'
  if (/(?:风格|参考作品)/u.test(field)) return 'globalGuidance'
  if (/(?:设定|指导|调整|方向)/u.test(field)) return 'globalGuidance'
  // An unexpected free-form label remains visible to the author, but it can
  // no longer invalidate an otherwise useful proposal.
  return 'globalGuidance'
}

export function decodeCoreDirectionChanges(
  content: string,
  current: ProjectCoreData,
  rosterNames: readonly string[] = [],
  existingThreadTitles: readonly string[] = [],
  latestFinalizedChapter = 0,
  totalChapters = Number.MAX_SAFE_INTEGER,
  authorTerminologyReplacements: readonly StoryDirectionTerminologyReplacement[] = [],
): { changes: Partial<Record<StoryDirectionCoreField, string>>; characterChanges: Array<{ name: string; changes: Partial<Record<StoryDirectionCharacterField, string>> }>; newNarrativeThreads: NarrativeThreadPlanInput[]; terminologyReplacements: StoryDirectionTerminologyReplacement[]; summary: string; conflicts: string[] } {
  const root = parseDirectionJson(content)
  const rawCoreChanges = object(root.coreChanges ?? {})
  let modelTerminologyReplacements: StoryDirectionTerminologyReplacement[] = []
  try {
    modelTerminologyReplacements = normalizeTerminologyReplacements(
      root.terminologyReplacements ?? rawCoreChanges.terminology,
    )
  } catch {
    // The explicit author instruction remains authoritative; malformed optional
    // model terminology must not invalidate otherwise usable project fields.
  }
  const terminologyReplacements = authorTerminologyReplacements.length > 0
    ? [...authorTerminologyReplacements]
    : modelTerminologyReplacements
  const raw = { ...rawCoreChanges }
  delete raw.terminology
  // Models may report unmodified fields alongside patches. This is response
  // metadata, never a project field or prose to append to global guidance.
  delete raw.unchanged
  const changes: Partial<Record<StoryDirectionCoreField, string>> = {}
  const normalizedLabels: string[] = []
  for (const [field, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || value.length > 20_000) throw new Error(`方向调整项目字段值无效：${field}`)
    const normalizedField = normalizeCoreField(field)
    const normalizedValue = field === normalizedField ? value.trim() : `【${field}】\n${value.trim()}`
    if (normalizedField !== field) normalizedLabels.push(`${field}→${normalizedField}`)
    if (!normalizedValue.trim() || normalizedValue === current[normalizedField]) continue
    const previous = changes[normalizedField]
    changes[normalizedField] = previous && field !== normalizedField
      ? `${previous}\n\n${normalizedValue}`
      : normalizedValue
  }
  const conflicts = Array.isArray(root.conflicts)
    ? root.conflicts.filter((item): item is string => typeof item === 'string').map(item => item.slice(0, 500)).slice(0, 20)
    : []
  const characterChanges: Array<{ name: string; changes: Partial<Record<StoryDirectionCharacterField, string>> }> = []
  const rawCharacters = root.characterChanges ?? []
  if (!Array.isArray(rawCharacters)) throw new Error('方向调整角色变更列表无效')
  const seen = new Set<string>()
  for (const rawItem of rawCharacters) {
    const item = object(rawItem)
    const name = item.name
    if (typeof name !== 'string' || !rosterNames.includes(name) || seen.has(name)) {
      throw new Error('方向调整返回未知或重复的角色')
    }
    seen.add(name)
    const rawChanges = object(item.changes)
    const next: Partial<Record<StoryDirectionCharacterField, string>> = {}
    for (const [field, value] of Object.entries(rawChanges)) {
      if (field === 'unchanged') continue
      if (!STORY_DIRECTION_CHARACTER_FIELDS.includes(field as StoryDirectionCharacterField)
        || typeof value !== 'string' || value.length > 20_000) throw new Error(`角色「${name}」方向调整字段无效：${field}`)
      if (value.trim()) next[field as StoryDirectionCharacterField] = value.trim()
    }
    if (Object.keys(next).length > 0) characterChanges.push({ name, changes: next })
  }
  const newNarrativeThreads: NarrativeThreadPlanInput[] = []
  const rawThreads = root.newNarrativeThreads ?? []
  if (!Array.isArray(rawThreads) || rawThreads.length > 50) throw new Error('方向调整叙事线索列表无效')
  const threadTitles = new Set(existingThreadTitles)
  for (const rawItem of rawThreads) {
    const item = object(rawItem)
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120
      || threadTitles.has(item.title.trim()) || typeof item.type !== 'string' || !item.type.trim() || item.type.length > 60
      || typeof item.authorIntent !== 'string' || !item.authorIntent.trim() || item.authorIntent.length > 1_000
      || !Number.isSafeInteger(item.targetStartChapter) || !Number.isSafeInteger(item.targetEndChapter)
      || Number(item.targetStartChapter) <= latestFinalizedChapter
      || Number(item.targetEndChapter) < Number(item.targetStartChapter)
      || Number(item.targetEndChapter) > totalChapters) {
      throw new Error('方向调整新增叙事线索无效')
    }
    threadTitles.add(item.title.trim())
    newNarrativeThreads.push({
      title: item.title.trim(), type: item.type.trim(), authorIntent: item.authorIntent.trim(),
      targetStartChapter: Number(item.targetStartChapter), targetEndChapter: Number(item.targetEndChapter),
      lane: item.lane === 'main' ? 'main' : 'sub',
    })
  }
  return {
    changes,
    characterChanges,
    newNarrativeThreads,
    terminologyReplacements,
    summary: [typeof root.summary === 'string' ? root.summary.slice(0, 1_800) : '',
      ...(normalizedLabels.length > 0 ? [`AI 字段标签已兼容映射：${normalizedLabels.slice(0, 20).join('、')}`] : []),
      ...(terminologyReplacements.length > 0
        ? [`术语替换：${terminologyReplacements.map(pair => `${pair.from}→${pair.to}`).join('、')}`]
        : [])]
      .filter(Boolean).join('\n'),
    conflicts,
  }
}

export function decodeBlueprintDirectionChanges(
  content: string,
  expected: readonly BlueprintData[],
  terminologyReplacements: readonly StoryDirectionTerminologyReplacement[] = [],
): StoryDirectionBlueprintChange[] {
  const root = parseDirectionJson(content)
  if (!Array.isArray(root.changes)) throw new Error('方向调整缺少章节变更列表')
  const byNumber = new Map(expected.map(item => [item.chapterNumber, item]))
  const seen = new Set<number>()
  return root.changes.flatMap((rawItem: unknown) => {
    const item = object(rawItem)
    const chapterNumber = item.chapterNumber
    if (!Number.isSafeInteger(chapterNumber) || !byNumber.has(Number(chapterNumber)) || seen.has(Number(chapterNumber))) {
      throw new Error('方向调整返回了范围外或重复的章节')
    }
    seen.add(Number(chapterNumber))
    const rawChanges = object(item.changes)
    const current = byNumber.get(Number(chapterNumber))!
    const changes: StoryDirectionBlueprintChange['changes'] = {}
    for (const [field, value] of Object.entries(rawChanges)) {
      if (field === 'unchanged') continue
      if (field === 'characters' && Array.isArray(value)
        && value.every((name): name is string => typeof name === 'string')) {
        const proposedCharacters = [...value].sort()
        const allowedCharacterLists = [
          [...current.characters],
          ...(terminologyReplacements.length > 0
            ? [replaceTerminologyNameArray(current.characters, terminologyReplacements)]
            : []),
        ].map(names => JSON.stringify(names.sort()))
        if (allowedCharacterLists.includes(JSON.stringify(proposedCharacters))) continue
      }
      if (!STORY_DIRECTION_BLUEPRINT_FIELDS.includes(field as keyof typeof changes)
        || typeof value !== 'string' || value.length > 20_000) throw new Error(`第 ${chapterNumber} 章方向调整字段无效：${field}`)
      if (value.trim() && value !== current[field as keyof typeof changes]) {
        changes[field as keyof typeof changes] = value.trim()
      }
    }
    return Object.keys(changes).length ? [{ chapterNumber: Number(chapterNumber), changes }] : []
  })
}
