/**
 * 多实体改动计划（Change Plan）契约。
 *
 * 助手在给出影响分析后，用一份计划描述"要改哪些对象的哪些字段"。这里只做
 * 结构校验与依赖排序：模型负责判断改什么，主进程/UI 负责确认，真正的写入
 * 仍走各自既有的受保护通道（角色名单 revision、蓝图定稿保护、规划资料候选）。
 */
import { CHARACTER_ROLES } from './character-role'
import { PLANNING_MATERIAL_KINDS, type PlanningMaterialKind } from './planning-material'

export const CHANGE_PLAN_MAX_ITEMS = 40
export const CHANGE_PLAN_MAX_TEXT_CHARS = 20_000
export const CHANGE_PLAN_MAX_MATERIAL_CHARS = 200_000

/** 作品配置字段（与 propose_novel_config 的白名单保持一致）。 */
export const CHANGE_PLAN_CONFIG_STRING_FIELDS = [
  'genre', 'subGenre', 'targetAudience', 'coreOutline', 'worldSetting', 'goldenFinger',
  'protagonistProfile', 'globalGuidance', 'writingStyle', 'referenceWorks',
] as const
export const CHANGE_PLAN_CONFIG_NUMBER_FIELDS = ['totalChapters', 'wordsPerChapter'] as const
export const CHANGE_PLAN_CONFIG_ENUM_FIELDS: Readonly<Record<string, readonly string[]>> = {
  plotStructure: ['three_act', 'heros_journey', 'save_the_cat', 'kishotenketsu', 'multi_thread', 'freeform'],
  narrativePOV: ['third_limited', 'first_person', 'third_omniscient', 'multi_pov'],
  writingLanguage: ['zh-CN', 'en-US'],
}

/** 架构正文：可整体改写的创作文本字段。 */
export const CHANGE_PLAN_ARCHITECTURE_FIELDS = [
  'premise', 'worldbuilding', 'synopsis', 'coreOutline', 'worldSetting',
  'protagonistProfile', 'globalGuidance', 'goldenFinger', 'writingStyle', 'referenceWorks',
] as const

/** 人物档案字段（身份与动态状态另有专用条目类型）。 */
export const CHANGE_PLAN_PROFILE_FIELDS = [
  'role', 'gender', 'age', 'appearance', 'background',
  'personality', 'abilities', 'motivation', 'arc', 'notes',
] as const
export type ChangePlanProfileField = typeof CHANGE_PLAN_PROFILE_FIELDS[number]

export const CHANGE_PLAN_BLUEPRINT_TEXT_FIELDS = [
  'title', 'role', 'purpose', 'keyEvents', 'suspenseHook', 'userGuidance', 'notes',
] as const
export type ChangePlanBlueprintTextField = typeof CHANGE_PLAN_BLUEPRINT_TEXT_FIELDS[number]

export interface ChangePlanItemBase {
  /** 这一项为什么必须跟着改：与作者请求的因果关系。 */
  reason: string
}

export interface ChangePlanConfigItem extends ChangePlanItemBase {
  kind: 'config'
  fields: Record<string, string | number>
}

export interface ChangePlanArchitectureItem extends ChangePlanItemBase {
  kind: 'architecture'
  fields: Partial<Record<typeof CHANGE_PLAN_ARCHITECTURE_FIELDS[number], string>>
}

export interface ChangePlanCharacterProfileItem extends ChangePlanItemBase {
  kind: 'character-profile'
  character: string
  fields: Partial<Record<ChangePlanProfileField, string>>
  /** 整份替换该角色的关系列表；缺省表示保留现有关系。 */
  relationships?: Array<{ target: string; relation: string }>
}

/** 人物当前状态是结构化补丁：只覆盖给出的字段，其余沿用现有状态。 */
export const CHANGE_PLAN_STATE_FIELDS = [
  'location', 'powerLevel', 'physicalState', 'mentalState', 'keyItems', 'recentEvents',
] as const
export type ChangePlanStateField = typeof CHANGE_PLAN_STATE_FIELDS[number]

export interface ChangePlanCharacterStateItem extends ChangePlanItemBase {
  kind: 'character-state'
  character: string
  state: Partial<Record<ChangePlanStateField, string>>
  /** 这条状态从第几章之后成立。 */
  updatedAtChapter: number
}

export interface ChangePlanBlueprintItem extends ChangePlanItemBase {
  kind: 'blueprint'
  chapterNumber: number
  fields: Partial<Record<ChangePlanBlueprintTextField, string>> & { characters?: string[] }
}

export interface ChangePlanNarrativeThreadItem extends ChangePlanItemBase {
  kind: 'narrative-thread'
  /** 省略表示新建线索；给出则更新该线索。 */
  threadId?: number
  title: string
  type: string
  authorIntent: string
  targetStartChapter: number
  targetEndChapter: number
  lane?: 'main' | 'sub'
}

export interface ChangePlanPlanningMaterialItem extends ChangePlanItemBase {
  kind: 'planning-material'
  name: string
  materialKind: PlanningMaterialKind
  content: string
}

export type ChangePlanItem =
  | ChangePlanConfigItem
  | ChangePlanArchitectureItem
  | ChangePlanCharacterProfileItem
  | ChangePlanCharacterStateItem
  | ChangePlanBlueprintItem
  | ChangePlanNarrativeThreadItem
  | ChangePlanPlanningMaterialItem

export type ChangePlanItemKind = ChangePlanItem['kind']

export interface ChangePlan {
  /** 给作者看的一句话说明：这次改动整体在做什么。 */
  summary: string
  items: ChangePlanItem[]
}

export type ParseChangePlanResult =
  | { ok: true; plan: ChangePlan }
  | { ok: false; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, field: string, max = CHANGE_PLAN_MAX_TEXT_CHARS): string | { error: string } {
  if (typeof value !== 'string') return { error: `${field} 必须是文本` }
  const text = value.trim()
  if (!text) return { error: `${field} 不能为空` }
  if (text.length > max) return { error: `${field} 超过长度上限（${max} 字符）` }
  return text
}

function reasonOf(item: Record<string, unknown>, index: number): string | { error: string } {
  const value = item.reason
  if (typeof value !== 'string' || !value.trim()) return { error: `第 ${index + 1} 项缺少 reason（说明这项为什么必须改）` }
  return value.trim().slice(0, 500)
}

function parseConfigItem(item: Record<string, unknown>, index: number): ChangePlanConfigItem | { error: string } {
  const reason = reasonOf(item, index)
  if (typeof reason !== 'string') return reason
  const fields = item.fields
  if (!isPlainObject(fields) || Object.keys(fields).length === 0) return { error: `第 ${index + 1} 项的 fields 不能为空` }
  const parsed: Record<string, string | number> = {}
  for (const [field, value] of Object.entries(fields)) {
    if ((CHANGE_PLAN_CONFIG_STRING_FIELDS as readonly string[]).includes(field)) {
      const text = boundedText(value, `config.${field}`)
      if (typeof text !== 'string') return text
      parsed[field] = text
    } else if ((CHANGE_PLAN_CONFIG_NUMBER_FIELDS as readonly string[]).includes(field)) {
      if (!Number.isSafeInteger(value) || (value as number) <= 0) return { error: `config.${field} 必须是正整数` }
      parsed[field] = value as number
    } else if (field in CHANGE_PLAN_CONFIG_ENUM_FIELDS) {
      if (!CHANGE_PLAN_CONFIG_ENUM_FIELDS[field]!.includes(String(value))) {
        return { error: `config.${field} 的取值不受支持（可选：${CHANGE_PLAN_CONFIG_ENUM_FIELDS[field]!.join(' / ')}）` }
      }
      parsed[field] = String(value)
    } else {
      return { error: `未知的作品配置字段：${field}` }
    }
  }
  return { kind: 'config', reason, fields: parsed }
}

function parseArchitectureItem(item: Record<string, unknown>, index: number): ChangePlanArchitectureItem | { error: string } {
  const reason = reasonOf(item, index)
  if (typeof reason !== 'string') return reason
  const fields = item.fields
  if (!isPlainObject(fields) || Object.keys(fields).length === 0) return { error: `第 ${index + 1} 项的 fields 不能为空` }
  const parsed: Record<string, string> = {}
  for (const [field, value] of Object.entries(fields)) {
    if (!(CHANGE_PLAN_ARCHITECTURE_FIELDS as readonly string[]).includes(field)) {
      return { error: `未知的架构字段：${field}（可选：${CHANGE_PLAN_ARCHITECTURE_FIELDS.join('、')}）` }
    }
    const text = boundedText(value, `architecture.${field}`)
    if (typeof text !== 'string') return text
    parsed[field] = text
  }
  return { kind: 'architecture', reason, fields: parsed }
}

function parseProfileItem(item: Record<string, unknown>, index: number): ChangePlanCharacterProfileItem | { error: string } {
  const reason = reasonOf(item, index)
  if (typeof reason !== 'string') return reason
  const character = boundedText(item.character, 'character', 80)
  if (typeof character !== 'string') return character
  const fields = item.fields
  if (!isPlainObject(fields) || Object.keys(fields).length === 0) return { error: `第 ${index + 1} 项的 fields 不能为空` }
  const parsed: Partial<Record<ChangePlanProfileField, string>> = {}
  for (const [field, value] of Object.entries(fields)) {
    if (!(CHANGE_PLAN_PROFILE_FIELDS as readonly string[]).includes(field)) {
      return { error: `未知的人物档案字段：${field}（可选：${CHANGE_PLAN_PROFILE_FIELDS.join('、')}）` }
    }
    const text = boundedText(value, `character-profile.${field}`)
    if (typeof text !== 'string') return text
    parsed[field as ChangePlanProfileField] = text
  }
  let relationships: Array<{ target: string; relation: string }> | undefined
  if (item.relationships !== undefined) {
    if (!Array.isArray(item.relationships)) return { error: 'character-profile.relationships 必须是数组（无关系传 []）' }
    relationships = []
    for (const entry of item.relationships) {
      if (!isPlainObject(entry)) return { error: 'character-profile.relationships 的每一项必须是对象' }
      const target = boundedText(entry.target, 'relationships.target', 80)
      if (typeof target !== 'string') return target
      const relation = boundedText(entry.relation, 'relationships.relation', 80)
      if (typeof relation !== 'string') return relation
      relationships.push({ target, relation })
    }
  }
  return {
    kind: 'character-profile',
    reason,
    character,
    fields: parsed,
    ...(relationships ? { relationships } : {}),
  }
}

function parseStateItem(item: Record<string, unknown>, index: number): ChangePlanCharacterStateItem | { error: string } {
  const reason = reasonOf(item, index)
  if (typeof reason !== 'string') return reason
  const character = boundedText(item.character, 'character', 80)
  if (typeof character !== 'string') return character
  const state = item.state
  if (!isPlainObject(state) || Object.keys(state).length === 0) {
    return { error: `第 ${index + 1} 项的 state 必须是非空对象（可写字段：${CHANGE_PLAN_STATE_FIELDS.join('、')}）` }
  }
  const parsed: Partial<Record<ChangePlanStateField, string>> = {}
  for (const [field, value] of Object.entries(state)) {
    if (!(CHANGE_PLAN_STATE_FIELDS as readonly string[]).includes(field)) {
      return { error: `未知的人物状态字段：${field}（可选：${CHANGE_PLAN_STATE_FIELDS.join('、')}）` }
    }
    const text = boundedText(value, `state.${field}`, 1_000)
    if (typeof text !== 'string') return text
    parsed[field as ChangePlanStateField] = text
  }
  const updatedAtChapter = item.updatedAtChapter
  if (!Number.isSafeInteger(updatedAtChapter) || (updatedAtChapter as number) < 0) {
    return { error: 'character-state.updatedAtChapter 必须是不小于 0 的整数' }
  }
  return { kind: 'character-state', reason, character, state: parsed, updatedAtChapter: updatedAtChapter as number }
}

function parseBlueprintItem(item: Record<string, unknown>, index: number): ChangePlanBlueprintItem | { error: string } {
  const reason = reasonOf(item, index)
  if (typeof reason !== 'string') return reason
  const chapterNumber = item.chapterNumber
  if (!Number.isSafeInteger(chapterNumber) || (chapterNumber as number) < 1) {
    return { error: `第 ${index + 1} 项的 chapterNumber 必须是正整数` }
  }
  const fields = item.fields
  if (!isPlainObject(fields) || Object.keys(fields).length === 0) return { error: `第 ${index + 1} 项的 fields 不能为空` }
  const parsed: ChangePlanBlueprintItem['fields'] = {}
  for (const [field, value] of Object.entries(fields)) {
    if (field === 'characters') {
      if (!Array.isArray(value)) return { error: 'blueprint.characters 必须是字符串数组' }
      const names = value.map(entry => (typeof entry === 'string' ? entry.trim() : ''))
      if (names.some(name => !name)) return { error: 'blueprint.characters 不能包含空名字' }
      if (new Set(names).size !== names.length) return { error: 'blueprint.characters 不能有重复名字' }
      parsed.characters = names
      continue
    }
    if (!(CHANGE_PLAN_BLUEPRINT_TEXT_FIELDS as readonly string[]).includes(field)) {
      return { error: `未知的蓝图字段：${field}（可选：${CHANGE_PLAN_BLUEPRINT_TEXT_FIELDS.join('、')}、characters）` }
    }
    const text = boundedText(value, `blueprint.${field}`, 4_000)
    if (typeof text !== 'string') return text
    parsed[field as ChangePlanBlueprintTextField] = text
  }
  return { kind: 'blueprint', reason, chapterNumber: chapterNumber as number, fields: parsed }
}

function parseThreadItem(item: Record<string, unknown>, index: number): ChangePlanNarrativeThreadItem | { error: string } {
  const reason = reasonOf(item, index)
  if (typeof reason !== 'string') return reason
  const title = boundedText(item.title, 'title', 120)
  if (typeof title !== 'string') return title
  const type = boundedText(item.type, 'type', 60)
  if (typeof type !== 'string') return type
  const authorIntent = boundedText(item.authorIntent, 'authorIntent', 1_000)
  if (typeof authorIntent !== 'string') return authorIntent
  const targetStartChapter = item.targetStartChapter
  const targetEndChapter = item.targetEndChapter
  if (!Number.isSafeInteger(targetStartChapter) || (targetStartChapter as number) < 1) {
    return { error: 'narrative-thread.targetStartChapter 必须是正整数' }
  }
  if (!Number.isSafeInteger(targetEndChapter) || (targetEndChapter as number) < (targetStartChapter as number)) {
    return { error: 'narrative-thread.targetEndChapter 必须不小于 targetStartChapter' }
  }
  let threadId: number | undefined
  if (item.threadId !== undefined) {
    if (!Number.isSafeInteger(item.threadId) || (item.threadId as number) < 1) {
      return { error: 'narrative-thread.threadId 必须是正整数' }
    }
    threadId = item.threadId as number
  }
  const lane = item.lane
  if (lane !== undefined && lane !== 'main' && lane !== 'sub') {
    return { error: 'narrative-thread.lane 只能是 main 或 sub' }
  }
  return {
    kind: 'narrative-thread',
    reason,
    title,
    type,
    authorIntent,
    targetStartChapter: targetStartChapter as number,
    targetEndChapter: targetEndChapter as number,
    ...(threadId ? { threadId } : {}),
    ...(lane ? { lane } : {}),
  }
}

function parseMaterialItem(item: Record<string, unknown>, index: number): ChangePlanPlanningMaterialItem | { error: string } {
  const reason = reasonOf(item, index)
  if (typeof reason !== 'string') return reason
  const name = boundedText(item.name, 'name', 160)
  if (typeof name !== 'string') return name
  const materialKind = item.materialKind
  if (typeof materialKind !== 'string' || !(PLANNING_MATERIAL_KINDS as readonly string[]).includes(materialKind)) {
    return { error: `planning-material.materialKind 不受支持（可选：${PLANNING_MATERIAL_KINDS.join('、')}）` }
  }
  const content = boundedText(item.content, 'content', CHANGE_PLAN_MAX_MATERIAL_CHARS)
  if (typeof content !== 'string') return content
  return { kind: 'planning-material', reason, name, materialKind: materialKind as PlanningMaterialKind, content }
}

/** 把模型给出的 JSON 解析为结构化计划；错误信息会原样交回模型用于自我修复。 */
export function parseChangePlan(raw: unknown): ParseChangePlanResult {
  if (!isPlainObject(raw)) return { ok: false, error: '计划必须是对象：{ summary, items }' }
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : ''
  if (!summary) return { ok: false, error: '缺少 summary（一句话说明这次改动整体在做什么）' }
  const items = raw.items
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'items 必须是非空数组' }
  if (items.length > CHANGE_PLAN_MAX_ITEMS) {
    return { ok: false, error: `items 最多 ${CHANGE_PLAN_MAX_ITEMS} 项，请拆分为多次改动` }
  }
  const parsed: ChangePlanItem[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!isPlainObject(item)) return { ok: false, error: `第 ${index + 1} 项必须是对象` }
    const kind = item.kind
    const result = kind === 'config' ? parseConfigItem(item, index)
      : kind === 'architecture' ? parseArchitectureItem(item, index)
        : kind === 'character-profile' ? parseProfileItem(item, index)
          : kind === 'character-state' ? parseStateItem(item, index)
            : kind === 'blueprint' ? parseBlueprintItem(item, index)
              : kind === 'narrative-thread' ? parseThreadItem(item, index)
                : kind === 'planning-material' ? parseMaterialItem(item, index)
                  : { error: `未知的改动类型：${String(kind)}` }
    if ('error' in result) return { ok: false, error: result.error }
    parsed.push(result)
  }
  return { ok: true, plan: { summary, items: parsed } }
}

// ===== 项目事实校验 =====

export interface ChangePlanContext {
  characters: Array<{ name: string; aliases: readonly string[] }>
  blueprintChapters: readonly number[]
  finalizedChapters: readonly number[]
  threads: ReadonlyArray<{ id: number }>
  /** 蓝图/定稿事实允许的最大章节号（用于新建线索的区间上限）。 */
  maxChapter: number
}

export interface ChangePlanValidationItem {
  index: number
  kind: ChangePlanItemKind
  label: string
  ok: boolean
  blocked: boolean
  errors: string[]
  warnings: string[]
}

export interface ChangePlanValidation {
  ok: boolean
  items: ChangePlanValidationItem[]
  errors: string[]
  warnings: string[]
}

export function changePlanItemLabel(item: ChangePlanItem): string {
  switch (item.kind) {
    case 'config':
      return `作品配置（${Object.keys(item.fields).join('、')}）`
    case 'architecture':
      return `架构设定（${Object.keys(item.fields).join('、')}）`
    case 'character-profile':
      return `${item.character} 的人物档案`
    case 'character-state':
      return `${item.character} 的当前状态`
    case 'blueprint':
      return `第 ${item.chapterNumber} 章蓝图`
    case 'narrative-thread':
      return item.threadId ? `线索 #${item.threadId}：${item.title}` : `新建线索：${item.title}`
    case 'planning-material':
      return `规划资料：${item.name}`
  }
}

function resolveCharacterName(
  input: string,
  context: ChangePlanContext,
): { name: string } | { error: string } {
  const trimmed = input.trim()
  const exact = context.characters.find(character => character.name === trimmed)
  if (exact) return { name: exact.name }
  const byAlias = context.characters.find(character => character.aliases.includes(trimmed))
  if (byAlias) return { name: byAlias.name }
  return { error: `角色名单中没有「${trimmed}」；新角色必须先走候选确认流程，不能用改动计划直接创建` }
}

function validateBlueprintChapter(chapterNumber: number, context: ChangePlanContext): string[] {
  const errors: string[] = []
  if (!context.blueprintChapters.includes(chapterNumber)) {
    errors.push(`第 ${chapterNumber} 章还没有蓝图；请先生成或创建该章蓝图`)
  }
  if (context.finalizedChapters.includes(chapterNumber)) {
    errors.push(`第 ${chapterNumber} 章已定稿：蓝图与正文属于已确认事实，不能通过改动计划静默改写`)
  }
  return errors
}

export function validateChangePlan(plan: ChangePlan, context: ChangePlanContext): ChangePlanValidation {
  const items: ChangePlanValidationItem[] = []
  const planErrors: string[] = []
  const planWarnings: string[] = []
  const seen = new Set<string>()

  plan.items.forEach((item, index) => {
    const errors: string[] = []
    const warnings: string[] = []
    const label = changePlanItemLabel(item)

    if (item.kind === 'character-profile' || item.kind === 'character-state') {
      const resolved = resolveCharacterName(item.character, context)
      if ('error' in resolved) errors.push(resolved.error)
      if (item.kind === 'character-profile' && item.fields.role !== undefined
        && !(CHARACTER_ROLES as readonly string[]).includes(item.fields.role)) {
        errors.push(`人物定位只能是：${CHARACTER_ROLES.join('、')}（收到「${item.fields.role}」）`)
      }
      if (item.kind === 'character-profile' && item.relationships) {
        for (const relationship of item.relationships) {
          const target = resolveCharacterName(relationship.target, context)
          if ('error' in target) errors.push(`关系目标无效：${target.error}`)
        }
      }
      if (item.kind === 'character-state' && item.updatedAtChapter > context.maxChapter && context.maxChapter > 0) {
        warnings.push(`状态章号（第 ${item.updatedAtChapter} 章）超过项目现有章节范围（${context.maxChapter}），请确认是否正确`)
      }
    }

    if (item.kind === 'blueprint') {
      errors.push(...validateBlueprintChapter(item.chapterNumber, context))
      if (item.fields.characters) {
        const unknown = item.fields.characters.filter(name => 'error' in resolveCharacterName(name, context))
        if (unknown.length > 0) {
          errors.push(`出场人物未建档：${unknown.join('、')}（新角色必须先经过候选确认）`)
        }
      }
      if (item.fields.title !== undefined && item.fields.title.length > 60) {
        errors.push('蓝图标题超过 60 字上限')
      }
    }

    if (item.kind === 'narrative-thread') {
      if (item.threadId !== undefined && !context.threads.some(thread => thread.id === item.threadId)) {
        errors.push(`线索 #${item.threadId} 不存在`)
      }
      const touchingFinalized = context.finalizedChapters.filter(
        chapter => chapter >= item.targetStartChapter && chapter <= item.targetEndChapter,
      )
      if (touchingFinalized.length > 0) {
        warnings.push(`线索区间包含已定稿章节（第 ${touchingFinalized.join('、')} 章）：只能调整未定稿部分的规划`)
      }
      if (context.maxChapter > 0 && item.targetEndChapter > context.maxChapter) {
        warnings.push(`线索结束章（${item.targetEndChapter}）超过项目现有章节范围（${context.maxChapter}）`)
      }
    }

    const duplicateKey = item.kind === 'blueprint' ? `blueprint:${item.chapterNumber}`
      : item.kind === 'character-profile' ? `character-profile:${item.character}`
        : item.kind === 'character-state' ? `character-state:${item.character}`
          : item.kind === 'planning-material' ? `planning-material:${item.name}`
            : item.kind === 'narrative-thread' && item.threadId ? `thread:${item.threadId}`
              : `${item.kind}:${index}`
    if (seen.has(duplicateKey)) {
      planErrors.push(`同一目标在计划中出现多次：${label}。请合并为一项。`)
    }
    seen.add(duplicateKey)

    const blocked = context.finalizedChapters.length > 0
      && item.kind === 'blueprint'
      && context.finalizedChapters.includes(item.chapterNumber)
    items.push({
      index,
      kind: item.kind,
      label,
      ok: errors.length === 0,
      blocked,
      errors,
      warnings,
    })
  })

  const hasExecutable = items.some(item => item.ok && !item.blocked)
  if (!hasExecutable && planErrors.length === 0) {
    planErrors.push('计划中没有可执行的项目')
  }

  return {
    ok: planErrors.length === 0 && items.every(item => item.ok) && hasExecutable,
    items,
    errors: planErrors,
    warnings: planWarnings,
  }
}

const EXECUTION_ORDER: Record<ChangePlanItemKind, number> = {
  config: 0,
  architecture: 1,
  'character-profile': 2,
  'character-state': 3,
  blueprint: 4,
  'narrative-thread': 5,
  'planning-material': 6,
}

/** 依赖顺序：设定 → 档案 → 状态 → 蓝图 → 线索 → 资料。 */
export function orderChangePlanItems(items: readonly ChangePlanItem[]): ChangePlanItem[] {
  return [...items].sort((left, right) => (
    EXECUTION_ORDER[left.kind] - EXECUTION_ORDER[right.kind]
  ))
}

const KIND_LABELS: Record<ChangePlanItemKind, string> = {
  config: '作品配置',
  architecture: '架构设定',
  'character-profile': '人物档案',
  'character-state': '人物状态',
  blueprint: '章节蓝图',
  'narrative-thread': '叙事线索',
  'planning-material': '规划资料',
}

export function summarizeChangePlan(plan: ChangePlan): string {
  const counts = new Map<ChangePlanItemKind, number>()
  for (const item of plan.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  const parts = [...counts.entries()].map(([kind, count]) => `${KIND_LABELS[kind]}×${count}`)
  return `${plan.summary}｜共 ${plan.items.length} 项：${parts.join('，')}`
}
