/**
 * 蓝图自动建档的角色档案填充。
 *
 * 用户诉求：蓝图引入新角色时，应该"把角色卡的内容一起建好"，而不是只留一个名字。
 * 本模块挑出**自动建的空卡**（判据幂等：来源标记 + 资料八项全空，因此历史空卡也会被补），
 * 按蓝图事实生成档案，再只填空字段地提交。
 *
 * 三条硬约束：
 *  1) **只填空字段** —— 作者写过的内容一个字符都不覆盖（合并语义由仓储的 blueprint_sync
 *     分支的 fill-empty 兜底，这里也做一次同样的判断，双重保险）；
 *  2) 每条内容必须指回蓝图事实，拿不准就留空，不编造；
 *  3) **失败不阻塞** —— 补档失败只记日志，绝不把已经提交的蓝图带崩。
 */
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import type { CharacterRosterEntry } from '../../shared/character-roster'
import { ipc } from '../ipc-client'
import { stripThinkingTags } from './workflow-utils'

/** 自动建档的来源标记前缀（完整形式是「自动候选来源：章节蓝图（第N、M章）」）。 */
export const BLUEPRINT_AUTO_CARD_SOURCE_MARKER = '自动候选来源：章节蓝图'
/** 单次模型调用最多处理几个角色（控制单个请求的上下文规模）。 */
export const MAX_ENRICHMENT_CHARACTERS = 12
/**
 * 单轮补档的总量上限（5 批 × 12）。用户积压过 57 张自动建档的空卡，
 * 每轮只补 12 名意味着他要重新生成 5 轮蓝图才能补完 —— 这不是"能用"的形态，
 * 所以在同一轮内循环分批直到没有候选或触及这个上限；上限本身由绝对墙兜底。
 */
export const MAX_ENRICHMENT_TOTAL_CHARACTERS = 60
/** 每个角色最多引用几章蓝图事实。 */
export const MAX_ENRICHMENT_CHAPTERS_PER_CHARACTER = 8
const MAX_DIGEST_FIELD_CHARS = 200

/** 可被自动填充的资料字段（八项，与用户要的"角色卡内容"一致）。 */
export const ENRICHABLE_PROFILE_FIELDS = [
  'gender', 'age', 'appearance', 'personality', 'background', 'abilities', 'motivation', 'arc',
] as const
export type EnrichableProfileField = typeof ENRICHABLE_PROFILE_FIELDS[number]

export interface EnrichmentBlueprintSource {
  chapterNumber: number
  characters: readonly string[]
  role?: string
  purpose?: string
  keyEvents?: string
}

export interface EnrichmentCandidate {
  name: string
  chapters: number[]
}

export interface EnrichmentOutcome {
  /** 真正被补上资料的角色名。 */
  enriched: string[]
  /** 因超限留到下一轮的角色数。 */
  deferredForLimit: number
  /** 失败原因（失败不抛出，只回报）。 */
  error?: string
}

function trimField(value: unknown, max = MAX_DIGEST_FIELD_CHARS): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * 挑选待补档的角色。
 *
 * 判据幂等（不限于"本轮新建"），所以用户库里历史遗留的空卡也会被这一轮顺带补上。
 */
export function selectEnrichmentCandidates(
  entries: readonly CharacterRosterEntry[],
  blueprints: readonly EnrichmentBlueprintSource[],
): EnrichmentCandidate[] {
  const chaptersByName = new Map<string, Set<number>>()
  for (const blueprint of blueprints) {
    for (const rawName of blueprint.characters) {
      if (typeof rawName !== 'string' || !rawName.trim()) continue
      const name = rawName.trim()
      const chapters = chaptersByName.get(name) ?? new Set<number>()
      chapters.add(blueprint.chapterNumber)
      chaptersByName.set(name, chapters)
    }
  }

  return entries
    .filter(entry => entry.notes.includes(BLUEPRINT_AUTO_CARD_SOURCE_MARKER))
    .filter(entry => ENRICHABLE_PROFILE_FIELDS.every(field => !trimField(entry[field]).length))
    .map(entry => ({
      name: entry.name,
      chapters: [...(chaptersByName.get(entry.name) ?? [])].sort((left, right) => left - right),
    }))
    .filter(candidate => candidate.chapters.length > 0)
}

/** 某个角色在本批蓝图里的事实摘要（供模型据此写档案）。 */
export function buildEnrichmentDigest(
  blueprints: readonly EnrichmentBlueprintSource[],
  candidate: EnrichmentCandidate,
): string {
  const wanted = new Set(candidate.chapters)
  return blueprints
    .filter(blueprint => wanted.has(blueprint.chapterNumber))
    .slice(0, MAX_ENRICHMENT_CHAPTERS_PER_CHARACTER)
    .map(blueprint => {
      const parts = [
        trimField(blueprint.role, 80),
        trimField(blueprint.purpose, 240),
        trimField(blueprint.keyEvents, 700),
      ].filter(Boolean)
      return `第${blueprint.chapterNumber}章：${parts.join(' | ')}`
    })
    .join('\n')
}

export function buildEnrichmentPrompt(
  candidates: ReadonlyArray<{ candidate: EnrichmentCandidate; digest: string }>,
  writingLanguage: 'zh-CN' | 'en-US',
): { systemPrompt: string; prompt: string } {
  const systemPrompt = writingLanguage === 'en-US'
    ? 'You complete character profiles strictly from the supplied chapter-blueprint facts.'
    : '你只依据给定的章节蓝图事实补全角色档案。'
  const blocks = candidates.map(({ candidate, digest }) => (
    `角色「${candidate.name}」（出场：第${candidate.chapters.join('、')}章）\n${digest}`
  )).join('\n\n')
  const prompt = writingLanguage === 'en-US'
    ? [
        'The following characters were added automatically from chapter blueprints and have no profile yet.',
        'Complete each profile ONLY from the blueprint facts below. Every line must be traceable to a fact.',
        'If a field cannot be supported by the facts, leave it as an empty string — never invent details.',
        'Return strict JSON: {"profiles":[{"name":"...","gender":"","age":"","appearance":"","personality":"","background":"","abilities":"","motivation":"","arc":""}]}',
        '',
        blocks,
      ].join('\n')
    : [
        '以下角色是章节蓝图自动建档的候选，档案目前为空。',
        '只依据下面给出的蓝图事实补全档案，每条内容都必须能指回事实。',
        '无法由事实支撑的字段一律留空字符串，不要编造。',
        '严格返回 JSON：{"profiles":[{"name":"...","gender":"","age":"","appearance":"","personality":"","background":"","abilities":"","motivation":"","arc":""}]}',
        '',
        blocks,
      ].join('\n')
  return { systemPrompt, prompt }
}

/** 解析模型返回；形状不对的条目直接跳过（不崩、不编造）。 */
export function decodeEnrichmentProfiles(
  content: string,
): Map<string, Partial<Record<EnrichableProfileField, string>>> {
  const result = new Map<string, Partial<Record<EnrichableProfileField, string>>>()
  const text = stripThinkingTags(content).trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // 退一步：截取首个 { 到最后一个 }（模型偶尔在 JSON 前后带说明文字）。
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return result
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return result
    }
  }
  if (!parsed || typeof parsed !== 'object') return result
  const profiles = Array.isArray((parsed as { profiles?: unknown }).profiles)
    ? (parsed as { profiles: unknown[] }).profiles
    : []
  for (const raw of profiles) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const name = trimField(record.name, 80)
    if (!name) continue
    const profile: Partial<Record<EnrichableProfileField, string>> = {}
    for (const field of ENRICHABLE_PROFILE_FIELDS) {
      const value = trimField(record[field])
      if (value) profile[field] = value
    }
    if (Object.keys(profile).length > 0) result.set(name, profile)
  }
  return result
}

export interface EnrichmentDeps {
  expectedProjectPath: string
  projectSession: ProjectSessionContext
  blueprints: readonly EnrichmentBlueprintSource[]
  writingLanguage: 'zh-CN' | 'en-US'
  /** 复用命令既有的受预算约束调用（directory.command 的 callLLMWithBoundedCompletion）。 */
  generate: (request: { systemPrompt: string; prompt: string; purpose: string }) => Promise<string>
  log: (message: string) => void
  uiText: (zh: string, en: string) => string
}

/**
 * 补档主流程。**任何失败都只回报，不抛出**：蓝图与空卡已经落库，
 * 绝不能让补档失败把整个工作流带崩。
 */
export async function enrichBlueprintCharacterProfiles(deps: EnrichmentDeps): Promise<EnrichmentOutcome> {
  try {
    const roster = await ipc.invokeWithProjectSession(
      deps.projectSession,
      'db:character-roster-read',
      deps.expectedProjectPath,
    )
    const entries = (roster.entries ?? []) as CharacterRosterEntry[]
    const all = selectEnrichmentCandidates(entries, deps.blueprints)
    if (all.length === 0) return { enriched: [], deferredForLimit: 0 }

    // 同一轮内循环分批：每批都是独立的请求上下文（不把 57 个角色的出场章节塞进一次调用），
    // 每批独立提交，失败的批次不回滚已成功的批次。总量由 MAX_ENRICHMENT_TOTAL_CHARACTERS
    // 与调用方给这次窗口的预算（调用次数/时长）共同兜底。
    const enriched: string[] = []
    let batchError: string | undefined
    const budget = Math.min(all.length, MAX_ENRICHMENT_TOTAL_CHARACTERS)
    for (let start = 0; start < budget; start += MAX_ENRICHMENT_CHARACTERS) {
      const batchOutcome = await enrichOneBatch(deps, all.slice(start, start + MAX_ENRICHMENT_CHARACTERS))
      if (batchOutcome.error) {
        batchError = batchOutcome.error
        break
      }
      enriched.push(...batchOutcome.enriched)
    }
    return {
      enriched,
      deferredForLimit: all.length - enriched.length,
      ...(batchError ? { error: batchError } : {}),
    }
  } catch (error) {
    return { enriched: [], deferredForLimit: 0, error: String(error) }
  }
}

/** 处理一批角色：各自独立的读快照 → 一次调用 → 一次提交。 */
async function enrichOneBatch(
  deps: EnrichmentDeps,
  selected: readonly EnrichmentCandidate[],
): Promise<{ enriched: string[]; error?: string }> {
  try {
    // 每批都重新读快照：上一批的提交推进了 revision，用旧 revision 会被仓储拒绝。
    const roster = await ipc.invokeWithProjectSession(
      deps.projectSession,
      'db:character-roster-read',
      deps.expectedProjectPath,
    )
    const entries = (roster.entries ?? []) as CharacterRosterEntry[]

    deps.log(deps.uiText(
      `正在为 ${selected.length} 名新角色生成档案…`,
      `Generating profiles for ${selected.length} new characters…`,
    ))

    const { systemPrompt, prompt } = buildEnrichmentPrompt(
      selected.map(candidate => ({ candidate, digest: buildEnrichmentDigest(deps.blueprints, candidate) })),
      deps.writingLanguage,
    )
    const content = await deps.generate({ systemPrompt, prompt, purpose: 'blueprint-character-profiles' })
    const profiles = decodeEnrichmentProfiles(content)
    if (profiles.size === 0) {
      return { enriched: [], error: '模型未返回可用的角色档案' }
    }

    // 只填旧值为空的字段：这里与仓储的 fill-empty 是同一口径，双重保险。
    const byName = new Map(entries.map(entry => [entry.name, entry]))
    const updated: CharacterRosterEntry[] = []
    for (const candidate of selected) {
      const existing = byName.get(candidate.name)
      const profile = profiles.get(candidate.name)
      if (!existing || !profile) continue
      const next: CharacterRosterEntry = { ...existing }
      let changed = false
      for (const field of ENRICHABLE_PROFILE_FIELDS) {
        const incoming = profile[field]
        if (!incoming) continue
        if (trimField(existing[field]).length) continue
        Object.assign(next, { [field]: incoming })
        changed = true
      }
      if (changed) updated.push(next)
    }
    if (updated.length === 0) return { enriched: [] }

    const commit = await ipc.invokeWithProjectSession(
      deps.projectSession,
      'db:character-roster-commit',
      {
        operationId: `blueprint-profile-${Date.now()}`,
        expectedRevision: roster.revision,
        schemaVersion: 1,
        // 复用蓝图同步入口：仓储在该分支只做"空字段补齐 + 附加关系"，不会覆盖作者内容。
        intent: 'blueprint_sync',
        entries: updated,
      },
      deps.expectedProjectPath,
    )
    if (!commit?.success) {
      return { enriched: [], error: String(commit?.error ?? '提交角色档案失败') }
    }
    return { enriched: updated.map(entry => entry.name) }
  } catch (error) {
    return { enriched: [], error: String(error) }
  }
}
