import type { Locale } from '../i18n/types'

export interface RelationshipEdge {
  target: string
  relation: string
  direction?: 'outgoing' | 'incoming' | 'mutual'
  sourceChapter?: number
  evidence?: string
}

export interface RelationshipTextOptions {
  knownNames?: readonly string[]
  selfName?: string
  previousStorage?: string
}

export interface RelationshipEditorPresentationOptions {
  locale?: Locale
}

type UnknownRecord = Record<string, unknown>

const UNKNOWN_JSON_RELATIONSHIP_GUIDANCE: Record<Locale, string> = {
  'zh-CN': '关系数据格式无法识别。请按“角色：关系”逐行重写。',
  'en-US': 'Relationship data format is unrecognized. Rewrite one relationship per line as “Character: relationship”.',
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function relationshipEdgeFromRecord(value: UnknownRecord): RelationshipEdge | null {
  const target = textValue(value.target) ?? textValue(value.name)
  const relation = textValue(value.relation) ?? textValue(value.label)
  const direction = value.direction
  const sourceChapter = value.sourceChapter
  const evidenceValue = textValue(value.evidence)
  const evidence = evidenceValue === null ? undefined : evidenceValue
  if (direction !== undefined && !['outgoing', 'incoming', 'mutual'].includes(String(direction))) return null
  if (sourceChapter !== undefined && (!Number.isSafeInteger(sourceChapter) || Number(sourceChapter) < 1)) return null
  return target && relation ? {
    target,
    relation,
    ...(direction === undefined ? {} : { direction: direction as RelationshipEdge['direction'] }),
    ...(sourceChapter === undefined ? {} : { sourceChapter: Number(sourceChapter) }),
    ...(evidence === undefined ? {} : { evidence }),
  } : null
}

/**
 * Accepts the structured relationship shapes already persisted by legacy
 * projects. Returning null distinguishes unstructured user notes from an
 * intentionally empty structured relationship list.
 */
function parseStructuredRelationships(value: string): RelationshipEdge[] | null {
  const text = value.trim()
  if (!text) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (Array.isArray(parsed)) {
    const relationships = parsed.map((item) => (
      isRecord(item) ? relationshipEdgeFromRecord(item) : null
    ))
    return relationships.every((relationship): relationship is RelationshipEdge => relationship !== null)
      ? relationships
      : null
  }

  if (!isRecord(parsed)) return null

  const singleRelationship = relationshipEdgeFromRecord(parsed)
  if (singleRelationship) return [singleRelationship]

  return null
}

function isJsonValue(value: string): boolean {
  try {
    JSON.parse(value.trim())
    return true
  } catch {
    return false
  }
}

function formatRelationForEditor(relation: string): string {
  const fields = relation
    .split(/[；;]/)
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => {
      const match = field.match(/^([^：:]+)[：:]\s*(.+)$/)
      return match
        ? { key: match[1].trim(), value: match[2].trim() }
        : null
    })

  const relationTypeIndex = fields.findIndex((field) => (
    field?.key === '关系类型' || field?.key === '关系'
  ))
  if (relationTypeIndex < 0) return relation

  const relationType = fields[relationTypeIndex]
  if (!relationType) return relation

  const details = fields
    .filter((field, index) => field && index !== relationTypeIndex)
    .map((field) => (
      field?.key === '矛盾张力'
        ? field.value
        : `${field?.key}：${field?.value}`
    ))

  return details.length > 0
    ? `${relationType.value}（${details.join('；')}）`
    : relationType.value
}

function formatRelationshipEdgeForEditor(edge: RelationshipEdge): string {
  return `${edge.target}：${formatRelationForEditor(edge.relation)}`
}

function knownNameSet(options: RelationshipTextOptions): Set<string> | null {
  if (!options.knownNames || options.knownNames.length === 0) return null
  return new Set(options.knownNames.map((name) => name.trim()).filter(Boolean))
}

function isAllowedEdge(edge: RelationshipEdge, options: RelationshipTextOptions): boolean {
  if (options.selfName && edge.target === options.selfName) return false
  const names = knownNameSet(options)
  return !names || names.has(edge.target)
}

function deduplicateEdges(edges: readonly RelationshipEdge[]): RelationshipEdge[] {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = `${edge.target}\u0000${edge.relation}\u0000${String(edge.direction ?? '')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseTextRelationships(value: string): RelationshipEdge[] {
  const edges: RelationshipEdge[] = []
  const lines = value.split(/[\n,，;；]/)

  for (const line of lines) {
    const match = line.trim().match(/^(.+?)[：:—-]\s*(.+)$/)
    if (!match) continue
    const target = match[1].trim()
    const relation = match[2].trim()
    if (target && relation) edges.push({ target, relation })
  }

  return edges
}

function parseEditorLines(value: string, options: RelationshipTextOptions): RelationshipEdge[] | null {
  const names = knownNameSet(options)
  if (!names) return null

  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const edges = lines.map((line) => {
    const match = line.match(/^(.+?)[：:]\s*(.+)$/)
    if (!match) return null
    const target = match[1].trim()
    const relation = match[2].trim()
    if (!target || !relation || target === options.selfName || !names.has(target)) return null
    return { target, relation }
  })

  return edges.every((edge): edge is RelationshipEdge => edge !== null)
    ? edges
    : null
}

function preserveUnchangedLegacyRelations(
  edges: readonly RelationshipEdge[],
  previousStorage: string | undefined,
): RelationshipEdge[] {
  if (!previousStorage) return [...edges]
  const previousEdges = parseStructuredRelationships(previousStorage)
  if (!previousEdges) return [...edges]

  return edges.map((edge) => {
    const unchanged = previousEdges.find((previous) => (
      previous.target === edge.target
      && formatRelationForEditor(previous.relation) === edge.relation
    ))
    return unchanged ?? edge
  })
}

/**
 * Formats structured persistence data for the character editor. Free-form
 * notes deliberately stay untouched; syntactically valid but unrecognized JSON
 * receives repair guidance instead of exposing storage syntax to the user.
 */
export function formatRelationshipsForEditor(
  value: string,
  options: RelationshipEditorPresentationOptions = {},
): string {
  const relationships = parseStructuredRelationships(value)
  if (relationships === null) {
    return isJsonValue(value)
      ? UNKNOWN_JSON_RELATIONSHIP_GUIDANCE[options.locale ?? 'zh-CN']
      : value
  }
  return relationships.map(formatRelationshipEdgeForEditor).join('\n')
}

/**
 * Converts an editor value to the canonical graph-readable JSON only when every
 * non-empty line is an unambiguous relation to a known character. Otherwise it
 * retains the original text, which the roster seam preserves as legacy notes.
 */
export function relationshipStorageFromEditor(
  value: string,
  options: RelationshipTextOptions,
): string {
  if (!value.trim()) return ''
  if (parseStructuredRelationships(value) !== null) return value

  const edges = parseEditorLines(value, options)
  if (edges === null) return value
  return JSON.stringify(preserveUnchangedLegacyRelations(edges, options.previousStorage))
}

/**
 * Shared graph/parser seam for persisted JSON and existing plain-text notes.
 * Callers may supply the visible roster to prevent dangling graph edges.
 */
export function parseRelationshipEdges(
  value: string,
  options: RelationshipTextOptions = {},
): RelationshipEdge[] {
  const structured = parseStructuredRelationships(value)
  const edges = structured ?? (isJsonValue(value) ? [] : parseTextRelationships(value))
  return deduplicateEdges(edges.filter((edge) => isAllowedEdge(edge, options)))
}

/* ===== 关系类型分类（关系图谱连线的着色/线型语义） ===== */

export type RelationKind = 'hostile' | 'romance' | 'mentor' | 'family' | 'ally' | 'neutral'

/** 类型判定优先级：先判冲突/婚恋/师承，避免"杀父之仇"被"父"误判成亲情 */
export const RELATION_KIND_PRIORITY: readonly RelationKind[] = [
  'hostile',
  'romance',
  'mentor',
  'family',
  'ally',
  'neutral',
]

const RELATION_KIND_RULES: ReadonlyArray<{ kind: RelationKind; keywords: readonly string[] }> = [
  {
    kind: 'hostile',
    keywords: [
      '敌', '仇', '恨', '杀', '对立', '宿敌', '反目', '背叛', '陷害', '追杀',
      '争夺', '争抢', '冲突', '竞争', '对手', '厌恶', '报复', '恩怨', '嫌隙',
      '决裂', '算计', '利用', '胁迫',
    ],
  },
  {
    kind: 'romance',
    keywords: [
      '恋', '爱慕', '暗恋', '爱人', '心仪', '钟情', '倾心', '喜欢', '妻', '妾',
      '夫', '情侣', '道侣', '伴侣', '未婚', '订婚', '成亲', '婚', '情愫', '相好',
      '旧情', '心上人', '红颜', '告白',
    ],
  },
  {
    kind: 'mentor',
    keywords: [
      '师父', '师傅', '师尊', '师门', '师承', '师徒', '师', '徒', '弟子', '授业',
      '传艺', '导师', '老师', '前辈', '晚辈', '传承', '教导', '教诲',
    ],
  },
  {
    kind: 'family',
    keywords: [
      '父', '母', '爹', '娘', '爸', '妈', '兄', '姐', '弟', '妹', '儿子', '女儿',
      '孙', '祖', '叔', '伯', '姑', '舅', '姨', '侄', '甥', '表亲', '表兄', '表姐',
      '堂亲', '堂兄', '堂姐', '血脉', '亲生', '家人', '家族', '养子', '养女',
      '养父', '养母', '义父', '义母', '义子', '义女', '义兄', '义妹', '同族', '血亲',
    ],
  },
  {
    kind: 'ally',
    keywords: [
      '友', '盟', '挚', '同伴', '伙伴', '搭档', '合作', '同门', '同僚', '战友',
      '队友', '知己', '信任', '互助', '生死之交', '故交', '旧识', '同乡', '恩人',
      '救命', '提携', '扶持', '交好', '亲近',
    ],
  },
]

/** 按关键词把自由文本的关系描述归入图谱连线类型；未命中则视为"相识" */
export function classifyRelation(relation: string): RelationKind {
  const value = relation ?? ''
  for (const rule of RELATION_KIND_RULES) {
    if (rule.keywords.some((keyword) => value.includes(keyword))) return rule.kind
  }
  return 'neutral'
}

/**
 * 提取图谱边上展示的短标签：剥掉存储态"关系：xx"前缀、开头分隔符与括号补充，
 * 只保留核心短语并限制长度（完整描述仍在角色卡里）。
 */
export function relationShortLabel(relation: string): string {
  let value = (relation ?? '').trim()
  const typed = value.match(/(?:^|[；;])\s*(?:关系类型|关系)[：:]\s*([^；;]+)/)
  if (typed) value = typed[1].trim()
  value = value.replace(/^[—\-–:：\s]+/, '')
  const stripped = value.replace(/[（(][^）)]*[）)]/g, '').trim()
  const core = stripped || value
  return core.length > 10 ? `${core.slice(0, 9)}…` : core
}
