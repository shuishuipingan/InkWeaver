/**
 * AgentConversationRepository — 助手会话与消息持久化（agent_conversations / agent_messages）
 *
 * 为什么需要它：助手会话此前只活在渲染进程内存里，应用重启即全部丢失，作者与助手做过的
 * 决定（"这个设定定成 X"）随之消失。本仓储把它们落到**项目级** SQLite（跟着项目库走）。
 *
 * 三条硬边界：
 * - 单条正文写入前按 AGENT_MESSAGE_MAX_CHARS 截断并附截断标记，防止个别超长输出把库撑爆；
 * - 每个会话只保留最近 AGENT_CONVERSATION_MAX_MESSAGES 条消息，超出淘汰最旧的——助手本就有
 *   历史压缩机制，旧消息早已被压缩成占位符，删掉它们不损失有效上下文；
 * - 列表接口只返回元数据，正文只在 load 时按需取；日志与返回值都不回显正文。
 *
 * 时间：库里存 ISO 文本（与既有表一致），对外返回毫秒时间戳（与渲染层 AgentConversation 对齐）。
 * 删除：显式事务删除消息 + 会话，同时保留外键 ON DELETE CASCADE 声明，不依赖 pragma 状态。
 */
import type BetterSqlite3 from 'better-sqlite3'
import { getProjectDb } from '../database'
import type {
  AgentConversationMeta,
  AgentMessageAppendInput,
  AgentMessageRecord,
} from '../../src/shared/ipc-channels'

/** 单条消息正文的字符上限：超出即截断，防止超长输出撑爆库。 */
export const AGENT_MESSAGE_MAX_CHARS = 40_000
/** 单个会话保留的消息条数上限：超出淘汰最旧的（旧消息已被历史压缩成占位符）。 */
export const AGENT_CONVERSATION_MAX_MESSAGES = 2_000
/** 截断标记（附在截断后的正文末尾）。 */
export const AGENT_MESSAGE_TRUNCATION_SUFFIX = '（内容过长已截断）'
const AGENT_TITLE_MAX_CHARS = 200
const AGENT_TARGET_ID_MAX_CHARS = 128
const AGENT_ROLE_VALUES = new Set(['user', 'assistant', 'system'])

interface ConversationRow {
  id: string
  title: string
  mode: string
  model_id: string | null
  created_at: string
  updated_at: string
  message_count: number
}

interface MessageRow {
  id: string
  conversation_id: string
  seq: number
  role: string
  content: string
  tool_calls_json: string | null
  artifacts_json: string | null
  created_at: string
}

const CONVERSATION_SELECT = `
  SELECT
    c.id, c.title, c.mode, c.model_id, c.created_at, c.updated_at,
    (SELECT COUNT(*) FROM agent_messages m WHERE m.conversation_id = c.id) AS message_count
  FROM agent_conversations c
`

const MESSAGE_SELECT = `
  SELECT id, conversation_id, seq, role, content, tool_calls_json, artifacts_json, created_at
  FROM agent_messages
`

export function ensureAgentConversationSchema(database: BetterSqlite3.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      model_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls_json TEXT,
      artifacts_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation_seq
      ON agent_messages(conversation_id, seq);
  `)
}

function db() {
  const value = getProjectDb()
  if (!value) throw new Error('项目数据库未打开')
  return value
}

function nowIso(): string {
  return new Date().toISOString()
}

function toEpochMs(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function truncateContent(content: string): string {
  if (content.length <= AGENT_MESSAGE_MAX_CHARS) return content
  return `${content.slice(0, AGENT_MESSAGE_MAX_CHARS)}${AGENT_MESSAGE_TRUNCATION_SUFFIX}`
}

function parseJsonArray(value: string | null): unknown[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeTargetId(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, AGENT_TARGET_ID_MAX_CHARS) : ''
}

function rowToMeta(row: ConversationRow): AgentConversationMeta {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    modelId: typeof row.model_id === 'string' && row.model_id.trim() ? row.model_id : null,
    createdAt: toEpochMs(row.created_at),
    updatedAt: toEpochMs(row.updated_at),
    messageCount: Number(row.message_count) || 0,
  }
}

function rowToMessage(row: MessageRow): AgentMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    seq: Number(row.seq) || 0,
    role: row.role,
    content: row.content,
    toolCalls: parseJsonArray(row.tool_calls_json),
    artifacts: parseJsonArray(row.artifacts_json),
    createdAt: toEpochMs(row.created_at),
  }
}

export class AgentConversationRepository {
  /** 全部会话的元数据（按 updated_at 倒序；不含 messages）。 */
  static list(): AgentConversationMeta[] {
    const rows = db().prepare(`${CONVERSATION_SELECT} ORDER BY c.updated_at DESC, c.id ASC`).all() as ConversationRow[]
    return rows.map(rowToMeta)
  }

  /** 读单个会话：元数据 + 消息（按 seq 升序）。会话不存在时 conversation 为 null。 */
  static load(conversationId: string): { conversation: AgentConversationMeta | null; messages: AgentMessageRecord[] } {
    const id = normalizeTargetId(conversationId)
    if (!id) return { conversation: null, messages: [] }
    const database = db()
    const conversation = database.prepare(`${CONVERSATION_SELECT} WHERE c.id = ?`).get(id) as ConversationRow | undefined
    if (!conversation) return { conversation: null, messages: [] }
    const messages = database
      .prepare(`${MESSAGE_SELECT} WHERE conversation_id = ? ORDER BY seq ASC`)
      .all(id) as MessageRow[]
    return { conversation: rowToMeta(conversation), messages: messages.map(rowToMessage) }
  }

  /** upsert 会话元数据（幂等）：已存在时保留 createdAt，只更新 title / mode / modelId / updatedAt。 */
  static saveMeta(params: { id: string; title: string; mode: string; modelId?: string | null }): AgentConversationMeta {
    const id = normalizeTargetId(params?.id)
    if (!id) throw new Error('会话 ID 无效')
    const title = typeof params.title === 'string' && params.title.trim()
      ? params.title.trim().slice(0, AGENT_TITLE_MAX_CHARS)
      : '未命名会话'
    const mode = typeof params.mode === 'string' && params.mode.trim() ? params.mode.trim() : 'fast'
    const modelId = typeof params.modelId === 'string' && params.modelId.trim() ? params.modelId.trim() : null
    const timestamp = nowIso()
    const database = db()
    database.prepare(`
      INSERT INTO agent_conversations (id, title, mode, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        mode = excluded.mode,
        model_id = excluded.model_id,
        updated_at = excluded.updated_at
    `).run(id, title, mode, modelId, timestamp, timestamp)
    const row = database.prepare(`${CONVERSATION_SELECT} WHERE c.id = ?`).get(id) as ConversationRow
    return rowToMeta(row)
  }

  /**
   * 追加一条消息：seq = 会话内最大 seq + 1；同 id 重复调用幂等（返回已有记录）。
   * 正文超长按上限截断；插入后若超过会话消息上限，淘汰最旧的若干条。
   */
  static appendMessage(params: { conversationId: string; message: AgentMessageAppendInput }): {
    success: boolean
    message?: AgentMessageRecord
    error?: string
  } {
    const conversationId = normalizeTargetId(params?.conversationId)
    if (!conversationId) return { success: false, error: '缺少会话 ID' }
    const input = params?.message
    if (!input || typeof input !== 'object') return { success: false, error: '缺少消息内容' }
    const messageId = normalizeTargetId(input.id)
    if (!messageId) return { success: false, error: '消息缺少 id' }
    if (typeof input.content !== 'string') return { success: false, error: '消息正文必须是文本' }
    if (typeof input.role !== 'string' || !AGENT_ROLE_VALUES.has(input.role)) {
      return { success: false, error: '消息 role 必须是 user / assistant / system' }
    }
    const database = db()
    const conversation = database.prepare('SELECT 1 AS ok FROM agent_conversations WHERE id = ?').get(conversationId)
    if (!conversation) return { success: false, error: '目标会话不存在，请先保存会话元数据' }

    const existing = database.prepare(`${MESSAGE_SELECT} WHERE id = ?`).get(messageId) as MessageRow | undefined
    if (existing) return { success: true, message: rowToMessage(existing) }

    const content = truncateContent(input.content)
    const createdAt = typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
      ? new Date(input.createdAt).toISOString()
      : nowIso()
    const toolCallsJson = Array.isArray(input.toolCalls) && input.toolCalls.length > 0 ? JSON.stringify(input.toolCalls) : null
    const artifactsJson = Array.isArray(input.artifacts) && input.artifacts.length > 0 ? JSON.stringify(input.artifacts) : null

    const append = database.transaction(() => {
      const maxSeq = Number((database.prepare(
        'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM agent_messages WHERE conversation_id = ?',
      ).get(conversationId) as { maxSeq: number }).maxSeq) || 0
      database.prepare(`
        INSERT INTO agent_messages (id, conversation_id, seq, role, content, tool_calls_json, artifacts_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(messageId, conversationId, maxSeq + 1, input.role, content, toolCallsJson, artifactsJson, createdAt)
      database.prepare('UPDATE agent_conversations SET updated_at = ? WHERE id = ?').run(nowIso(), conversationId)
      const total = Number((database.prepare(
        'SELECT COUNT(*) AS total FROM agent_messages WHERE conversation_id = ?',
      ).get(conversationId) as { total: number }).total) || 0
      const overflow = total - AGENT_CONVERSATION_MAX_MESSAGES
      if (overflow > 0) {
        database.prepare(`
          DELETE FROM agent_messages
          WHERE id IN (
            SELECT id FROM agent_messages
            WHERE conversation_id = ?
            ORDER BY seq ASC
            LIMIT ?
          )
        `).run(conversationId, overflow)
      }
    })
    append()

    const saved = database.prepare(`${MESSAGE_SELECT} WHERE id = ?`).get(messageId) as MessageRow
    return { success: true, message: rowToMessage(saved) }
  }

  /** 删除会话及其全部消息（显式事务；不依赖外键 pragma 状态）。 */
  static deleteConversation(conversationId: string): { success: boolean; removedMessages?: number; error?: string } {
    const id = normalizeTargetId(conversationId)
    if (!id) return { success: false, error: '缺少会话 ID' }
    const database = db()
    const remove = database.transaction(() => {
      const removed = database.prepare('DELETE FROM agent_messages WHERE conversation_id = ?').run(id).changes
      database.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id)
      return removed
    })
    return { success: true, removedMessages: remove() }
  }

  /** 清空当前项目的全部助手会话与消息。 */
  static clearAll(): { success: boolean; removedConversations?: number; removedMessages?: number; error?: string } {
    const database = db()
    const clear = database.transaction(() => {
      const removedMessages = database.prepare('DELETE FROM agent_messages').run().changes
      const removedConversations = database.prepare('DELETE FROM agent_conversations').run().changes
      return { removedMessages, removedConversations }
    })
    const result = clear()
    return { success: true, ...result }
  }
}
