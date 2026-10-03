/**
 * 改动影响分析（确定性事实层）。
 *
 * 作者提出一处改动时，模型不能凭感觉判断"还要改哪些地方"。本模块从一个
 * 只读的项目快照出发，算出真实被牵涉的对象（配置字段、架构正文、人物档案、
 * 人物状态、章节蓝图、线索、定稿事实……），并给出可复核的理由与证据。
 * 报告是事实与提示，不是写作禁令；真正的修改仍由作者确认后执行。
 */
import {
  parseExplicitTerminologyReplacements,
  type StoryDirectionTerminologyReplacement,
} from './story-direction-terminology'

export type ChangeImpactTargetKind =
  | 'novel-config'
  | 'architecture'
  | 'character-profile'
  | 'character-state'
  | 'blueprint'
  | 'finalized-chapter'
  | 'chapter-handoff'
  | 'knowledge-event'
  | 'narrative-thread'
  | 'planning-material'
  | 'continuity-fact'

export type ChangeImpactSeverity = 'must-change' | 'should-review' | 'cannot-auto-change'
/** editable：助手可在改动计划中修改；finalized-immutable：已定稿，正文不可改写；
 * author-only：只能由作者在对应面板中处理（例如知情边界与定稿交接）。 */
export type ChangeImpactProtection = 'editable' | 'finalized-immutable' | 'author-only'
export type ChangeImpactScope = 'architecture' | 'character' | 'chapter' | 'config' | 'general'

export interface ChangeImpactTarget {
  /** Stable id such as `character:林尘` or `blueprint:12`. */
  id: string
  kind: ChangeImpactTargetKind
  label: string
  chapterNumber?: number
  /** Why this target is affected by the requested change. */
  reason: string
  severity: ChangeImpactSeverity
  protection: ChangeImpactProtection
  /** Fields worth revisiting when they are known. */
  fields?: string[]
  /** Verbatim project evidence backing this target. */
  evidence?: string
}

export interface ChangeImpactCharacterState {
  state: string
  updatedAtChapter: number
}

export interface ChangeImpactSnapshot {
  projectName: string
  core: {
    genre: string
    subGenre: string
    targetAudience: string
    totalChapters: number
    wordsPerChapter: number
    writingLanguage: string
    creativeStrategy: string
    narrativePov: string
    plotStructure: string
    coreOutline: string
    worldSetting: string
    protagonistProfile: string
    globalGuidance: string
    goldenFinger: string
    premise: string
    worldbuilding: string
    synopsis: string
    writingStyle: string
    referenceWorks: string
  } | null
  characters: Array<{
    name: string
    aliases: string[]
    role: string
    appearance: string
    personality: string
    background: string
    abilities: string
    motivation: string
    arc: string
    notes: string
    relationships: Array<{ target: string; relation: string }>
    currentState?: ChangeImpactCharacterState
  }>
  blueprints: Array<{
    chapterNumber: number
    title: string
    role: string
    purpose: string
    keyEvents: string
    characters: string[]
    suspenseHook: string
    userGuidance: string
    notes: string
  }>
  /** One entry per draft row (a chapter may have several versions). */
  drafts: Array<{ chapterNumber: number; status: string; version: number }>
  handoffs: Array<{ chapterNumber: number; status: string; presentCharacters: string[]; immediateGoal: string }>
  /** Confirmed knowledge boundaries: who knows what, and when they learned it. */
  knowledgeEvents: Array<{
    character: string
    information: string
    certainty: string
    falseBelief: boolean
    sourceChapter: number
  }>
  threads: Array<{
    id: number
    title: string
    type: string
    authorIntent: string
    targetStartChapter: number
    targetEndChapter: number
    lane: string
    status: string
  }>
  /** Confirmed planning material with a bounded content window for name matching. */
  planningMaterials: Array<{ id: string; name: string; kind: string; status: string; excerpt: string }>
  continuityFacts: Array<{ category: string; entities: string[]; statement: string; sourceChapter: number }>
}

export interface ChangeImpactRequest {
  /** The author's change request in their own words. */
  change: string
  /** Optional explicit entities the author named (character names, chapter numbers). */
  focusCharacters?: readonly string[]
  focusChapters?: readonly number[]
}

export interface ChangeImpactReport {
  request: ChangeImpactRequest
  detected: {
    scope: ChangeImpactScope
    characters: string[]
    chapters: number[]
    terminology: StoryDirectionTerminologyReplacement[]
    /** Identity renames (「X 改名为 Y」); they must go through the roster channel. */
    renames: StoryDirectionTerminologyReplacement[]
    /** Architecture/config fields the wording points at. */
    fields: string[]
  }
  targets: ChangeImpactTarget[]
  summary: {
    total: number
    mustChange: number
    shouldReview: number
    cannotAutoChange: number
    truncated: boolean
    byKind: Partial<Record<ChangeImpactTargetKind, number>>
  }
  advisories: string[]
}

/**
 * 影响清单要能放进一次工具结果（引擎上限 8000 字符），因此按总量与按类别
 * 双重封顶；被截断的类别会在提示里给出真实总数，模型据此知道波及范围。
 */
const MAX_TARGETS = 30
const MAX_TARGETS_PER_KIND = 10
const MAX_DETECTED_CHARACTERS = 24
const MAX_PLANNING_EXCERPT_CHARS = 4_000

/** 架构/配置字段的关键词线索：作者描述改动时会用到这些说法。 */
const FIELD_HINTS: ReadonlyArray<{ field: string; label: string; patterns: RegExp }> = [
  { field: 'worldSetting', label: '世界观设定', patterns: /世界观|世界设定|世界规则|力量体系|修炼体系|魔法体系|科技水平|时代背景/u },
  { field: 'coreOutline', label: '核心大纲', patterns: /大纲|主线|故事走向|整体走向|剧情走向/u },
  { field: 'premise', label: '故事前提', patterns: /前提|立意|核心设定/u },
  { field: 'worldbuilding', label: '世界观文档', patterns: /地理|势力|国家|门派|组织|种族|历史|地图/u },
  { field: 'synopsis', label: '剧情概要', patterns: /概要|简介|故事梗概/u },
  { field: 'protagonistProfile', label: '主角设定', patterns: /主角设定|主角人设|主角定位/u },
  { field: 'goldenFinger', label: '金手指', patterns: /金手指|系统设定|外挂/u },
  { field: 'globalGuidance', label: '全局写作指引', patterns: /写作指引|全局要求|总体风格|基调/u },
  { field: 'writingStyle', label: '文风', patterns: /文风|笔法|叙事风格|语言风格/u },
  { field: 'genre', label: '题材', patterns: /题材|类型改成|改成.*类/u },
  { field: 'targetAudience', label: '目标读者', patterns: /读者|受众|面向/u },
  { field: 'narrativePov', label: '叙事视角', patterns: /视角|人称|第一人称|第三人称/u },
  { field: 'plotStructure', label: '剧情结构', patterns: /结构|三幕|起承转合|节奏/u },
  { field: 'totalChapters', label: '总章节数', patterns: /总章数|章节总数|多少章|篇幅/u },
  { field: 'wordsPerChapter', label: '单章字数', patterns: /每章字数|单章字数|章节字数/u },
  { field: 'writingLanguage', label: '写作语言', patterns: /写作语言|语言改成|中英/u },
]

/** 会改写人物"当前状态"或占位的语义线索。 */
const STATE_HINTS = /死|去世|身亡|复活|重生|受伤|残废|失去|得到|获得|晋升|突破|身份|立场|叛变|背叛|反目|结盟|知道|得知|发现真相|地点|前往|离开|留在|成为|变成|反派|正派/u

const ARCHITECTURE_SCOPE_PATTERN = /世界观|世界|架构|大纲|主线|题材|体系|格局|底层|规则|走向|全书|整本|整体/u
const CONFIG_SCOPE_PATTERN = /总章数|章节总数|每章字数|单章字数|写作语言|叙事视角|视角|文风|目标读者|创作策略/u
const CHARACTER_SCOPE_PATTERN = /人物|角色|主角|配角|反派|师父|师兄|师姐|父亲|母亲|女主|男主/u

/**
 * Author wording such as「把灵气统一改成以太」puts an adverb between the term
 * and the verb; drop those adverbs before handing the text to the shared
 * terminology parser, which expects to see the verb directly.
 */
const TERMINOLOGY_NOISE_PATTERN = /(统一|全部|全都|一律|一律都|都|统统)\s*(?=(?:替换成|替换为|换成|换为|改成|改为|变成|→|->|=>))/gu

/** 改名请求（改名为/更名为/重命名为）走角色身份通道，而不是术语替换。 */
const RENAME_PATTERN = /["“「『]?([\p{L}\p{N}·_-]{1,80})["”」』]?\s*(?:改名为|更名为|重命名为|改名成)\s*["“「『]?([\p{L}\p{N}·_-]{1,80})["”」』]?/gu

function normalizeName(value: string): string {
  return value.trim()
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function clampExcerpt(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}…` : value
}

function detectChapters(text: string): number[] {
  const chapters: number[] = []
  for (const match of text.matchAll(/第\s*(\d+)\s*(?:章|节|回|话)/gu)) {
    const value = Number.parseInt(match[1]!, 10)
    if (Number.isSafeInteger(value) && value > 0) chapters.push(value)
  }
  for (const match of text.matchAll(/(\d+)\s*(?:-|~|至|到)\s*(\d+)\s*(?:章|节|回|话)/gu)) {
    const start = Number.parseInt(match[1]!, 10)
    const end = Number.parseInt(match[2]!, 10)
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start && end - start <= 200) {
      for (let chapter = start; chapter <= end; chapter += 1) chapters.push(chapter)
    }
  }
  return unique(chapters).sort((left, right) => left - right)
}

function detectCharacters(
  request: ChangeImpactRequest,
  snapshot: ChangeImpactSnapshot,
): string[] {
  const haystack = request.change
  const explicit = (request.focusCharacters ?? []).map(normalizeName).filter(Boolean)
  const mentioned = snapshot.characters
    .filter((entry) => {
      const names = [entry.name, ...entry.aliases]
      return names.some(name => name.length >= 2 && haystack.includes(name))
    })
    .map(entry => entry.name)
  return unique([...explicit, ...mentioned]).slice(0, MAX_DETECTED_CHARACTERS)
}

/** 请求解析结果：影响分析、服务层预取与计划校验共用同一份识别逻辑。 */
export interface ChangeImpactMentions {
  scope: ChangeImpactScope
  characters: string[]
  chapters: number[]
  terminology: StoryDirectionTerminologyReplacement[]
  renames: StoryDirectionTerminologyReplacement[]
  fields: string[]
}

export function detectChangeImpactMentions(
  snapshot: ChangeImpactSnapshot,
  request: ChangeImpactRequest,
): ChangeImpactMentions {
  const change = request.change.trim()
  const { terminology, renames } = parseTerminology(change)
  const fields = detectFields(change)
  const chapters = detectChapters(change)
  const characters = detectCharacters({ ...request, change }, snapshot)
  const detectedScope = detectScope({ ...request, change }, fields, characters, chapters)
  const scope: ChangeImpactScope = detectedScope !== 'architecture' && renames.length > 0
    ? 'character'
    : detectedScope
  return { scope, characters, chapters, terminology, renames, fields }
}

function detectScope(request: ChangeImpactRequest, fields: readonly string[], characters: readonly string[], chapters: readonly number[]): ChangeImpactScope {
  const text = request.change
  if (ARCHITECTURE_SCOPE_PATTERN.test(text) || fields.some(field => field === 'worldSetting' || field === 'coreOutline' || field === 'premise')) {
    return 'architecture'
  }
  if (CONFIG_SCOPE_PATTERN.test(text)) return 'config'
  if (chapters.length > 0 || /第\s*\d+\s*(?:章|节|回|话)/u.test(text)) return 'chapter'
  if (characters.length > 0 || CHARACTER_SCOPE_PATTERN.test(text)) return 'character'
  return 'general'
}

/** 「把灵气改成以太」会把动词前的助词一并吃进原名，这里把它剥掉。 */
const LEADING_PARTICLE_PATTERN = /^(?:帮我|麻烦|我想|想要|需要|请|把那个|把这个|把|将|让|给|对)+/u
const TRAILING_PARTICLE_PATTERN = /[吧呀啊哦。，,、；;！!？?]+$/u

function cleanReplacementPair(pair: StoryDirectionTerminologyReplacement): StoryDirectionTerminologyReplacement | null {
  const from = pair.from.replace(LEADING_PARTICLE_PATTERN, '').replace(TRAILING_PARTICLE_PATTERN, '').trim()
  const to = pair.to.replace(LEADING_PARTICLE_PATTERN, '').replace(TRAILING_PARTICLE_PATTERN, '').trim()
  if (!from || !to || from === to) return null
  return { from, to }
}

function parseTerminology(change: string): {
  terminology: StoryDirectionTerminologyReplacement[]
  renames: StoryDirectionTerminologyReplacement[]
} {
  const renames: StoryDirectionTerminologyReplacement[] = []
  for (const match of change.matchAll(RENAME_PATTERN)) {
    const pair = cleanReplacementPair({ from: match[1]!, to: match[2]! })
    if (pair) renames.push(pair)
  }
  const withoutRenames = change.replace(RENAME_PATTERN, ' ')
  try {
    const parsed = parseExplicitTerminologyReplacements(
      withoutRenames.replace(TERMINOLOGY_NOISE_PATTERN, ''),
    )
    return {
      terminology: parsed
        .map(cleanReplacementPair)
        .filter((pair): pair is StoryDirectionTerminologyReplacement => Boolean(pair))
        .slice(0, 20),
      renames: renames.slice(0, 20),
    }
  } catch {
    return { terminology: [], renames: renames.slice(0, 20) }
  }
}

function detectFields(change: string): string[] {
  return FIELD_HINTS.filter(hint => hint.patterns.test(change)).map(hint => hint.field)
}

function fieldLabel(field: string): string {
  return FIELD_HINTS.find(hint => hint.field === field)?.label ?? field
}

function characterAppearances(snapshot: ChangeImpactSnapshot): Map<string, number[]> {
  const appearances = new Map<string, number[]>()
  for (const blueprint of snapshot.blueprints) {
    for (const name of blueprint.characters) {
      const list = appearances.get(name) ?? []
      list.push(blueprint.chapterNumber)
      appearances.set(name, list)
    }
  }
  return appearances
}

function finalizedChapterNumbers(snapshot: ChangeImpactSnapshot): Set<number> {
  return new Set(
    snapshot.drafts
      .filter(draft => draft.status === 'finalized')
      .map(draft => draft.chapterNumber),
  )
}

function pushTarget(
  targets: ChangeImpactTarget[],
  target: ChangeImpactTarget,
): void {
  if (targets.some(existing => existing.id === target.id)) return
  targets.push(target)
}

function characterFieldHints(mention: string): string[] {
  return STATE_HINTS.test(mention)
    ? ['currentState', 'motivation', 'arc', 'relationships', 'notes']
    : ['personality', 'background', 'motivation', 'arc', 'relationships', 'notes']
}

function addCharacterTargets(
  targets: ChangeImpactTarget[],
  snapshot: ChangeImpactSnapshot,
  characterName: string,
  request: ChangeImpactRequest,
  appearances: Map<string, number[]>,
  finalized: Set<number>,
): void {
  const entry = snapshot.characters.find(character => character.name === characterName)
  const stateHinted = STATE_HINTS.test(request.change)
  const severity: ChangeImpactSeverity = stateHinted ? 'must-change' : 'should-review'

  pushTarget(targets, {
    id: `character-profile:${characterName}`,
    kind: 'character-profile',
    label: `${characterName}（人物档案）`,
    reason: '改动涉及该角色时，档案字段（定位/性格/动机/弧光/关系）需要与新的设定保持一致。',
    severity,
    protection: 'editable',
    fields: characterFieldHints(request.change),
    ...(entry ? { evidence: `定位：${entry.role}；动机：${clampExcerpt(entry.motivation)}` } : {}),
  })

  pushTarget(targets, {
    id: `character-state:${characterName}`,
    kind: 'character-state',
    label: `${characterName}（当前状态）`,
    reason: '角色状态是定稿事实的投影；设定变化后需要确认哪些章节之后的状态描述需要更新。',
    severity: stateHinted ? 'must-change' : 'should-review',
    protection: 'editable',
    fields: ['currentState'],
    ...(entry?.currentState
      ? { evidence: `第 ${entry.currentState.updatedAtChapter} 章后：${clampExcerpt(entry.currentState.state)}` }
      : { evidence: '尚无已确认的当前状态' }),
  })

  for (const chapterNumber of appearances.get(characterName) ?? []) {
    const blueprint = snapshot.blueprints.find(item => item.chapterNumber === chapterNumber)
    const immutable = finalized.has(chapterNumber)
    pushTarget(targets, {
      id: `blueprint:${chapterNumber}`,
      kind: 'blueprint',
      label: `第 ${chapterNumber} 章蓝图${blueprint?.title ? `：${blueprint.title}` : ''}`,
      chapterNumber,
      reason: `该章蓝图的出场人物包含${characterName}，其职责/关键事件/钩子可能需要随改动调整。`,
      severity: immutable ? 'cannot-auto-change' : 'should-review',
      protection: immutable ? 'finalized-immutable' : 'editable',
      fields: ['purpose', 'keyEvents', 'suspenseHook', 'userGuidance', 'notes'],
      ...(blueprint ? { evidence: `第 ${chapterNumber} 章关键事件：${clampExcerpt(blueprint.keyEvents)}` } : {}),
    })
  }

  for (const thread of snapshot.threads) {
    const haystack = `${thread.title} ${thread.authorIntent}`
    if (!haystack.includes(characterName)) continue
    pushTarget(targets, {
      id: `narrative-thread:${thread.id}`,
      kind: 'narrative-thread',
      label: `线索：${thread.title}`,
      reason: `线索的目标区间（第 ${thread.targetStartChapter}-${thread.targetEndChapter} 章）与意图提到${characterName}，改动可能改变这条线索的走向。`,
      severity: 'should-review',
      protection: 'editable',
      fields: ['title', 'authorIntent', 'targetStartChapter', 'targetEndChapter'],
    })
  }

  for (const material of snapshot.planningMaterials) {
    if (!material.excerpt.includes(characterName)) continue
    pushTarget(targets, {
      id: `planning-material:${material.id}`,
      kind: 'planning-material',
      label: `规划资料：${material.name}`,
      reason: `已确认的规划资料中提到${characterName}，改动后这份资料会与设定不一致。`,
      severity: 'should-review',
      protection: 'editable',
    })
  }

  for (const handoff of snapshot.handoffs) {
    if (!handoff.presentCharacters.includes(characterName)) continue
    pushTarget(targets, {
      id: `chapter-handoff:${handoff.chapterNumber}`,
      kind: 'chapter-handoff',
      label: `第 ${handoff.chapterNumber} 章交接`,
      chapterNumber: handoff.chapterNumber,
      reason: `该章交接记录了${characterName}的在场状态与未完成动作；交接绑定已定稿正文并由作者确认，改动后需要重新生成交接再确认。`,
      severity: 'cannot-auto-change',
      protection: 'finalized-immutable',
      fields: ['immediateGoal', 'constraints', 'openQuestions', 'emotionalState'],
      ...(handoff.immediateGoal ? { evidence: `即时目标：${clampExcerpt(handoff.immediateGoal)}` } : {}),
    })
  }

  for (const event of snapshot.knowledgeEvents) {
    if (event.character !== characterName) continue
    pushTarget(targets, {
      id: `knowledge-event:${characterName}:${event.sourceChapter}:${normalizeName(event.information).slice(0, 24)}`,
      kind: 'knowledge-event',
      label: `${characterName}的知情记录（第 ${event.sourceChapter} 章）`,
      chapterNumber: event.sourceChapter,
      reason: `知情边界记录了一条既有信息${event.falseBelief ? '（且为误信）' : ''}；改动后需要确认这条信息是否仍然成立、由谁何时知晓。这属于作者确认的事实，需在故事连续性面板中处理，不能写进改动计划。`,
      severity: /知道|得知|秘密|身份|真相|立场/u.test(request.change) ? 'must-change' : 'should-review',
      protection: 'author-only',
      fields: ['information', 'certainty', 'falseBelief', 'validFromChapter'],
      evidence: clampExcerpt(event.information),
    })
  }

  for (const projection of snapshot.continuityFacts) {
    if (!projection.entities.includes(characterName)) continue
    pushTarget(targets, {
      id: `continuity-fact:${projection.sourceChapter}:${projection.category}`,
      kind: 'continuity-fact',
      label: `第 ${projection.sourceChapter} 章定稿事实（${projection.category}）`,
      chapterNumber: projection.sourceChapter,
      reason: `该定稿事实记录了${characterName}的既有状态；如果改动与之矛盾，正文无法自动改写，需要走改稿或影响重建流程。`,
      severity: 'cannot-auto-change',
      protection: 'finalized-immutable',
      evidence: clampExcerpt(projection.statement),
    })
  }
}

function addScopeTargets(
  targets: ChangeImpactTarget[],
  snapshot: ChangeImpactSnapshot,
  report: Pick<ChangeImpactReport, 'detected'>,
  finalized: Set<number>,
): void {
  const scope = report.detected.scope

  if (scope === 'architecture' || scope === 'config') {
    if (snapshot.core) {
      const fields = report.detected.fields.length > 0
        ? report.detected.fields
        : ['worldSetting', 'coreOutline', 'premise', 'synopsis']
      pushTarget(targets, {
        id: 'architecture:core',
        kind: 'architecture',
        label: '架构与核心设定',
        reason: '底层设定变化会影响全文的设定描述与规划文档。',
        severity: 'must-change',
        protection: 'editable',
        fields,
        evidence: fields.map(fieldLabel).join('、'),
      })
      pushTarget(targets, {
        id: 'novel-config:core',
        kind: 'novel-config',
        label: '作品配置',
        reason: '题材/视角/篇幅等配置需要与新设定一致。',
        severity: scope === 'config' ? 'must-change' : 'should-review',
        protection: 'editable',
        fields: ['genre', 'subGenre', 'targetAudience', 'plotStructure', 'narrativePov', 'writingStyle', 'writingLanguage', 'totalChapters', 'wordsPerChapter'],
      })
    }
    for (const character of snapshot.characters) {
      pushTarget(targets, {
        id: `character-profile:${character.name}`,
        kind: 'character-profile',
        label: `${character.name}（人物档案）`,
        reason: '底层设定变化后，人物档案需要重新核对是否仍然成立。',
        severity: 'should-review',
        protection: 'editable',
        fields: ['role', 'background', 'abilities', 'motivation', 'arc', 'relationships'],
      })
    }
    for (const blueprint of snapshot.blueprints) {
      const immutable = finalized.has(blueprint.chapterNumber)
      pushTarget(targets, {
        id: `blueprint:${blueprint.chapterNumber}`,
        kind: 'blueprint',
        label: `第 ${blueprint.chapterNumber} 章蓝图${blueprint.title ? `：${blueprint.title}` : ''}`,
        chapterNumber: blueprint.chapterNumber,
        reason: '章节蓝图与新设定的一致性需要核对。',
        severity: immutable ? 'cannot-auto-change' : 'should-review',
        protection: immutable ? 'finalized-immutable' : 'editable',
        fields: ['purpose', 'keyEvents', 'suspenseHook', 'userGuidance', 'notes'],
      })
    }
  }

  if (scope === 'chapter') {
    for (const chapterNumber of report.detected.chapters) {
      const blueprint = snapshot.blueprints.find(item => item.chapterNumber === chapterNumber)
      const immutable = finalized.has(chapterNumber)
      pushTarget(targets, {
        id: `blueprint:${chapterNumber}`,
        kind: 'blueprint',
        label: `第 ${chapterNumber} 章蓝图${blueprint?.title ? `：${blueprint.title}` : ''}`,
        chapterNumber,
        reason: '作者点名了这一章，其蓝图字段是可直接调整的规划事实。',
        severity: immutable ? 'cannot-auto-change' : 'must-change',
        protection: immutable ? 'finalized-immutable' : 'editable',
        fields: ['title', 'purpose', 'keyEvents', 'characters', 'suspenseHook', 'userGuidance', 'notes'],
      })
      if (immutable) {
        pushTarget(targets, {
          id: `finalized-chapter:${chapterNumber}`,
          kind: 'finalized-chapter',
          label: `第 ${chapterNumber} 章定稿正文`,
          chapterNumber,
          reason: '该章已定稿：正文不可静默改写，需要作者发起改稿并由影响重建流程处理后续章节投影。',
          severity: 'cannot-auto-change',
          protection: 'finalized-immutable',
        })
      }
    }
  }
}

function addTerminologyTargets(
  targets: ChangeImpactTarget[],
  snapshot: ChangeImpactSnapshot,
  report: Pick<ChangeImpactReport, 'detected'>,
  finalized: Set<number>,
): void {
  const replacements: Array<{ pair: StoryDirectionTerminologyReplacement; rename: boolean }> = [
    ...report.detected.terminology.map(pair => ({ pair, rename: false })),
    ...report.detected.renames.map(pair => ({ pair, rename: true })),
  ]
  for (const { pair, rename } of replacements) {
    const matchedCharacters = snapshot.characters
      .filter(character => character.name === pair.from || character.aliases.includes(pair.from))
      .map(character => character.name)
    if (matchedCharacters.length > 0) {
      for (const name of matchedCharacters) {
        pushTarget(targets, {
          id: `character-profile:${name}`,
          kind: 'character-profile',
          label: `${name}（人物档案）`,
          reason: rename
            ? `改名「${pair.from} → ${pair.to}」必须走角色名单的身份通道，才能同时改写档案、蓝图出场人物、线索与规划资料中的引用。`
            : `替换「${pair.from} → ${pair.to}」命中角色名；改名请使用「${pair.from} 改名为 ${pair.to}」的明确写法，才能同步身份引用。`,
          severity: 'must-change',
          protection: 'editable',
          fields: rename ? ['name', 'relationships'] : ['relationships', 'notes'],
        })
      }
      continue
    }
    if (rename) {
      pushTarget(targets, {
        id: `rename:${pair.from}`,
        kind: 'architecture',
        label: `改名：${pair.from} → ${pair.to}`,
        reason: '未在角色名单中找到原名：请确认名字是否准确，或该名称属于术语而非角色身份。',
        severity: 'should-review',
        protection: 'editable',
      })
      continue
    }
    const immutableChapters = snapshot.drafts
      .filter(draft => draft.status === 'finalized' && finalized.has(draft.chapterNumber))
      .map(draft => draft.chapterNumber)
    pushTarget(targets, {
      id: `terminology:${pair.from}`,
      kind: 'architecture',
      label: `术语替换：${pair.from} → ${pair.to}`,
      reason: '术语替换需要同时作用于架构正文、规划文本与蓝图；已定稿正文只能由作者改稿。',
      severity: immutableChapters.length > 0 ? 'cannot-auto-change' : 'must-change',
      protection: immutableChapters.length > 0 ? 'finalized-immutable' : 'editable',
      ...(immutableChapters.length > 0
        ? { evidence: `已定稿章节：第 ${immutableChapters.join('、')} 章` }
        : {}),
    })
  }
}

export function analyzeChangeImpact(
  snapshot: ChangeImpactSnapshot,
  request: ChangeImpactRequest,
): ChangeImpactReport {
  const change = request.change.trim()
  const detected: ChangeImpactMentions = detectChangeImpactMentions(snapshot, { ...request, change })
  const { characters, chapters, scope } = detected
  const finalized = finalizedChapterNumbers(snapshot)
  const appearances = characterAppearances(snapshot)

  const targets: ChangeImpactTarget[] = []
  // 改名/术语替换先入表：同一角色被改名时，身份通道的说明比通用档案提示更关键。
  addTerminologyTargets(targets, snapshot, { detected }, finalized)
  for (const character of characters) {
    addCharacterTargets(targets, snapshot, character, request, appearances, finalized)
  }
  addScopeTargets(targets, snapshot, { detected }, finalized)

  const severityRank: Record<ChangeImpactSeverity, number> = {
    'must-change': 0,
    'should-review': 1,
    'cannot-auto-change': 2,
  }
  const sorted = [...targets].sort((left, right) => (
    severityRank[left.severity] - severityRank[right.severity]
    || (left.chapterNumber ?? 0) - (right.chapterNumber ?? 0)
    || left.id.localeCompare(right.id)
  ))
  const totalsByKind = new Map<ChangeImpactTargetKind, number>()
  for (const target of sorted) totalsByKind.set(target.kind, (totalsByKind.get(target.kind) ?? 0) + 1)
  const perKind = new Map<ChangeImpactTargetKind, number>()
  const bounded: ChangeImpactTarget[] = []
  for (const target of sorted) {
    const used = perKind.get(target.kind) ?? 0
    if (used >= MAX_TARGETS_PER_KIND) continue
    if (bounded.length >= MAX_TARGETS) continue
    perKind.set(target.kind, used + 1)
    bounded.push(target)
  }

  const advisories: string[] = []
  if (bounded.length < sorted.length) {
    const truncatedKinds = [...totalsByKind.entries()]
      .filter(([kind, total]) => (perKind.get(kind) ?? 0) < total)
      .map(([kind, total]) => `${TARGET_KIND_LABELS[kind]} 共 ${total} 项，列出 ${perKind.get(kind) ?? 0} 项`)
    advisories.push(`影响清单已截断：共 ${sorted.length} 项，仅列出 ${bounded.length} 项最相关的对象。`)
    if (truncatedKinds.length > 0) {
      advisories.push(`未逐项列出的类别（规模仍然成立，可自行按章节或角色展开）：${truncatedKinds.join('；')}。`)
    }
  }
  const immutableChapters = unique(
    bounded.filter(target => target.protection === 'finalized-immutable' && target.chapterNumber)
      .map(target => target.chapterNumber!),
  ).sort((left, right) => left - right)
  if (immutableChapters.length > 0) {
    advisories.push(`第 ${immutableChapters.join('、')} 章已定稿：正文与定稿事实不可自动改写，只能由作者改稿并重建受影响的后续投影。`)
  }
  const orphanBlueprintNames = unique(
    snapshot.blueprints
      .flatMap(blueprint => blueprint.characters)
      .filter(name => name.trim() && !snapshot.characters.some(character => character.name === name)),
  )
  if (orphanBlueprintNames.length > 0) {
    advisories.push(`蓝图出现未建档角色（${orphanBlueprintNames.slice(0, 6).join('、')}）：新角色必须经过候选确认流程，不能直接写入角色名单。`)
  }
  if (characters.length === 0 && scope === 'character') {
    advisories.push('未在角色名单中定位到改动对象：请先用角色名单中的名字描述改动，或补充 focus_characters。')
  }
  if (detected.renames.length === 0 && detected.terminology.length === 0 && /改名|重命名/u.test(change)) {
    advisories.push('看起来是改名请求：角色改名需要给出「原名 改名为 新名」的明确写法，才能走角色名单的身份通道。')
  }

  const byKind: Partial<Record<ChangeImpactTargetKind, number>> = {}
  for (const target of bounded) {
    byKind[target.kind] = (byKind[target.kind] ?? 0) + 1
  }

  return {
    request: { ...request, change, ...(characters.length > 0 ? { focusCharacters: characters } : {}), ...(chapters.length > 0 ? { focusChapters: chapters } : {}) },
    detected,
    targets: bounded,
    summary: {
      total: sorted.length,
      mustChange: bounded.filter(target => target.severity === 'must-change').length,
      shouldReview: bounded.filter(target => target.severity === 'should-review').length,
      cannotAutoChange: bounded.filter(target => target.severity === 'cannot-auto-change').length,
      truncated: bounded.length < sorted.length,
      byKind,
    },
    advisories,
  }
}

const TARGET_KIND_LABELS: Record<ChangeImpactTargetKind, string> = {
  'novel-config': '作品配置',
  architecture: '架构设定',
  'character-profile': '人物档案',
  'character-state': '人物状态',
  blueprint: '章节蓝图',
  'finalized-chapter': '定稿正文',
  'chapter-handoff': '章节交接',
  'knowledge-event': '知情边界',
  'narrative-thread': '叙事线索',
  'planning-material': '规划资料',
  'continuity-fact': '定稿事实',
}

const SEVERITY_LABELS: Record<ChangeImpactSeverity, string> = {
  'must-change': '必须修改',
  'should-review': '需要复核',
  'cannot-auto-change': '不可自动修改',
}

const PROTECTION_LABELS: Record<ChangeImpactProtection, string> = {
  editable: '可写入计划',
  'finalized-immutable': '已定稿',
  'author-only': '仅作者可改',
}

export function formatChangeImpactReport(report: ChangeImpactReport): string {
  const scopeLabels: Record<ChangeImpactScope, string> = {
    architecture: '底层架构/设定',
    character: '人物',
    chapter: '章节',
    config: '作品配置',
    general: '综合',
  }
  const lines: string[] = [
    `改动：${report.request.change}`,
    `识别范围：${scopeLabels[report.detected.scope]}`,
    `涉及对象：角色 ${report.detected.characters.join('、') || '（未点名）'}；章节 ${report.detected.chapters.join('、') || '（未点名）'}`,
    `统计：共 ${report.summary.total} 项（必须修改 ${report.summary.mustChange}、需要复核 ${report.summary.shouldReview}、不可自动修改 ${report.summary.cannotAutoChange}）`,
    '',
    '逐项影响：',
  ]
  for (const target of report.targets) {
    const chapter = target.chapterNumber ? `第 ${target.chapterNumber} 章` : ''
    lines.push(`- [${SEVERITY_LABELS[target.severity]}｜${PROTECTION_LABELS[target.protection]}] ${TARGET_KIND_LABELS[target.kind]}｜${target.label}${chapter && !target.label.includes('第') ? `（${chapter}）` : ''}`)
    lines.push(`  原因：${target.reason}`)
    if (target.fields && target.fields.length > 0) lines.push(`  建议字段：${target.fields.join('、')}`)
    if (target.evidence) lines.push(`  依据：${target.evidence}`)
  }
  if (report.advisories.length > 0) {
    lines.push('', '提示：')
    for (const advisory of report.advisories) lines.push(`- ${advisory}`)
  }
  return lines.join('\n')
}

/** The excerpt window used when the service loads planning material content. */
export const CHANGE_IMPACT_PLANNING_EXCERPT_CHARS = MAX_PLANNING_EXCERPT_CHARS
