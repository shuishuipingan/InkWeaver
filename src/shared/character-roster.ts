/**
 * 结构化角色名单的跨进程契约。
 *
 * 角色的持久化事实仍只存在于 SQLite characters 表；本文件只定义读写
 * seam 的数据形状，不引入第二份 roster JSON 事实源。
 */
import { CHARACTER_ROLES, type CharacterRole } from './character-role'

export const CHARACTER_ROSTER_SCHEMA_VERSION = 1 as const

export const CHARACTER_ROSTER_ROLES = CHARACTER_ROLES

export type CharacterRosterRole = CharacterRole

export type CharacterRosterMigrationState =
  | 'empty'
  | 'legacy_cards_preserved'
  | 'legacy_markdown_pending'
  | 'ready'

/**
 * 面向界面的可执行状态。migrationState 保留持久化来源，status 则把安全
 * 判断收敛为调用方真正需要处理的四种情形。
 */
export type CharacterRosterStatus =
  | 'empty'
  | 'ready'
  | 'legacy_repair_required'
  | 'inconsistent'

/**
 * 关系的多个维度。同一对角色可以有多条不同 kind 的关系文本，
 * 而不是把整段关系压成 relation 里的一句话。
 */
export const RELATIONSHIP_FACET_KINDS = ['stance', 'emotion', 'dependency', 'knowledge', 'history'] as const

export type RelationshipFacetKind = typeof RELATIONSHIP_FACET_KINDS[number]

export interface CharacterRosterRelationshipFacet {
  kind: RelationshipFacetKind
  /** 该维度的一句话描述；没有依据时不要写这条 facet，而不是填占位。 */
  text: string
}

/**
 * 角色对一个势力 / 组织 / 阵营的立场。
 *
 * 势力在本项目里不是实体（只存在于世界观正文与角色卡的 location），所以势力关系
 * 挂在**角色**上而不是图上：每个角色各自维护对若干势力的立场，天然就是「一个角色一份」，
 * 不会像独立势力表那样引出跨表引用、去重与迁移成本。
 */
export interface CharacterFactionEdge {
  faction: string
  /** 一句话立场，例如「名义归属，暗中怀疑」。 */
  stance: string
  /** 可选的补充依据。 */
  text?: string
}

export interface CharacterRosterRelationship {
  target: string
  relation: string
  /** 多面关系。缺省时按单一 relation 显示（旧数据原样可用）。 */
  facets?: CharacterRosterRelationshipFacet[]
  direction?: 'outgoing' | 'incoming' | 'mutual'
  sourceChapter?: number
  evidence?: string
}

export interface CharacterRosterCharacterState {
  location: string
  powerLevel: string
  physicalState: string
  mentalState: string
  keyItems: string
  recentEvents: string
  updatedAtChapter: number
  /** How this state was obtained and, for model output, which finalized source supports it. */
  provenance?: CharacterStateProvenance
}

export type CharacterStateProvenance =
  | { source: 'author'; recordedAt?: string }
  | { source: 'model'; sourceDraftId: number; sourceContentHash: string; evidence: string; recordedAt?: string }
  | { source: 'legacy-unknown'; recordedAt?: string }

/**
 * 角色名单中的一个结构化事实条目。`characterId` 是跨改名保持不变的
 * 本地身份；关系仍以 display name 读写以兼容旧项目，迁移映射由主进程
 * 保存并校验引用闭合。
 */
export interface CharacterRosterEntry {
  characterId?: string
  name: string
  aliases?: string[]
  role: CharacterRosterRole
  gender: string
  age: string
  appearance: string
  personality: string
  background: string
  abilities: string
  motivation: string
  relationships: CharacterRosterRelationship[]
  /** 角色对势力的立场；缺省表示该角色没有可依据的势力归属。 */
  factionEdges?: CharacterFactionEdge[]
  arc: string
  notes: string
  currentState?: CharacterRosterCharacterState
  /**
   * 旧 characters.relationships 的自由文本证据。只会由 read 返回，或由
   * manual_edit 原样回写；模型生成、导入、蓝图同步、章节推进与旧图谱修复
   * 均不可提交此字段。
   */
  legacyRelationshipNotes?: string
}

export interface CharacterRosterSnapshot {
  schemaVersion: typeof CHARACTER_ROSTER_SCHEMA_VERSION
  revision: number
  migrationState: CharacterRosterMigrationState
  status: CharacterRosterStatus
  entries: CharacterRosterEntry[]
  renderedMarkdown: string
  projectionHash: string
  /** 覆盖角色资料、结构化关系与 currentState 的完整事实哈希。 */
  factHash: string
  /** 升级前的 characters_arch 原文，仅作迁移证据，绝不反向解析为角色名单。 */
  legacyMarkdown?: string
}

/**
 * `initialize` 只允许空角色名单首次建档；正常角色架构重新生成使用
 * `architecture_generation`，并由主进程保守合并已存在的手工字段。
 */
export type CharacterRosterCommitIntent =
  | 'initialize'
  | 'architecture_generation'
  | 'legacy_repair'
  /** 旧项目已有卡片时，由用户显式确认后只重建只读图谱，不改写卡片。 */
  | 'legacy_cards_adoption'
  /** 角色管理的完整手工快照；允许新增、改名、删除和空名单。 */
  | 'manual_edit'
  /** 仿写导入产生的角色候选，保守合并到现有名单。 */
  | 'novel_import'
  /** 已落盘的一批蓝图发现角色或结构化关系后的增量同步。 */
  | 'blueprint_sync'
  /** 章节定稿后角色状态与新出场角色的原子推进。 */
  | 'chapter_progress'
  /** Author-confirmed story direction edits to existing character profile fields only. */
  | 'direction_adjustment'

export interface CharacterRosterRename {
  originalName: string
  newName: string
}

export interface CharacterRosterCommitRequest {
  operationId: string
  expectedRevision: number
  schemaVersion: typeof CHARACTER_ROSTER_SCHEMA_VERSION
  entries: CharacterRosterEntry[]
  intent?: CharacterRosterCommitIntent
  /** 仅 manual_edit 使用；由角色管理的草稿账本明确给出身份映射。 */
  renames?: CharacterRosterRename[]
  /**
   * 仅 manual_edit 使用。默认 false：改名只贯穿作者撰写的规划字段
   * （外貌/性格/背景/能力/动机/弧光/关系描述），备注、动态状态、关系证据、
   * 知情事件正文与导入规划资料这类“证据型文本”保持原样，避免改写冻结事实。
   * 拆书仿写式整体改名为 true：上述证据型文本一并改写，使作品不再残留旧名。
   */
  fullIdentityRename?: boolean
  /**
   * legacy_repair / legacy_cards_adoption 使用。它是从只读快照回传的原始
   * 证据，用来拒绝把旧 Markdown A 的候选提交到后来已变为 Markdown B 的项目中。
   */
  expectedLegacyMarkdown?: string
}

export interface CharacterRosterCommitReceipt {
  operationId: string
  payloadHash: string
  /** 始终等于 snapshot.revision；幂等 replay 返回当前无写入观察，不重放历史 payload。 */
  revision: number
  idempotent: boolean
  snapshot: CharacterRosterSnapshot
}
