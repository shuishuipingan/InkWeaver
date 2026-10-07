import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { getProjectDb } from '../../database'
import {
  AGENT_CONVERSATION_MAX_MESSAGES,
  AGENT_MESSAGE_MAX_CHARS,
  AGENT_MESSAGE_TRUNCATION_SUFFIX,
  AgentConversationRepository,
  ensureAgentConversationSchema,
} from '../agent-conversation-repository'

vi.mock('../../database', () => ({ getProjectDb: vi.fn() }))
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

function saveConversation(id: string, title = `会话 ${id}`, mode = 'fast'): void {
  AgentConversationRepository.saveMeta({ id, title, mode, modelId: null })
}

function append(conversationId: string, id: string, content = '正文', role = 'user') {
  return AgentConversationRepository.appendMessage({ conversationId, message: { id, role, content } })
}

beforeEach(() => {
  db = new Database(':memory:')
  ensureAgentConversationSchema(db)
  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => db.close())

describe('AgentConversationRepository 会话持久化', () => {
  it('保存会话元数据后可 list（倒序），且列表只返回元数据', () => {
    saveConversation('c1', '设定讨论')
    saveConversation('c2', '线索回收')
    const list = AgentConversationRepository.list()
    expect(new Set(list.map(item => item.id))).toEqual(new Set(['c1', 'c2']))
    // 元数据按 updatedAt 非递增
    expect(list.every((item, index) => index === 0 || list[index - 1]!.updatedAt >= item.updatedAt)).toBe(true)
    const first = list[0]!
    expect(Object.keys(first).sort()).toEqual([
      'createdAt', 'id', 'messageCount', 'mode', 'modelId', 'title', 'updatedAt',
    ])
    expect(first.messageCount).toBe(0)
    expect(typeof first.createdAt).toBe('number')
    expect(typeof first.updatedAt).toBe('number')
  })

  it('saveMeta 幂等：重复保存不报错且保留 createdAt', () => {
    const first = AgentConversationRepository.saveMeta({ id: 'c1', title: '标题 A', mode: 'planning', modelId: 'gpt-6.1-sol' })
    const second = AgentConversationRepository.saveMeta({ id: 'c1', title: '标题 B', mode: 'fast', modelId: null })
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.title).toBe('标题 B')
    expect(second.mode).toBe('fast')
    expect(second.modelId).toBeNull()
    expect(AgentConversationRepository.list()).toHaveLength(1)
  })

  it('append 多条后 load 按 seq 升序返回（与插入顺序一致，不受 id 影响）', () => {
    saveConversation('c1')
    expect(append('c1', 'm2', '第二条', 'assistant').success).toBe(true)
    expect(append('c1', 'm1', '第一条').success).toBe(true)
    const { conversation, messages } = AgentConversationRepository.load('c1')
    expect(messages.map(message => message.id)).toEqual(['m2', 'm1'])
    expect(messages.map(message => message.seq)).toEqual([1, 2])
    expect(conversation?.messageCount).toBe(2)
    expect(messages.every(message => typeof message.createdAt === 'number')).toBe(true)
  })

  it('toolCalls / artifacts 以 JSON 原样往返，缺省为 null', () => {
    saveConversation('c1')
    AgentConversationRepository.appendMessage({
      conversationId: 'c1',
      message: {
        id: 'm1', role: 'assistant', content: '调用了工具',
        toolCalls: [{ id: 'call-1', name: 'read_drafts' }],
        artifacts: [{ type: 'file', path: 'a.md' }],
      },
    })
    const [message] = AgentConversationRepository.load('c1').messages
    expect(message!.toolCalls).toEqual([{ id: 'call-1', name: 'read_drafts' }])
    expect(message!.artifacts).toEqual([{ type: 'file', path: 'a.md' }])
    expect(append('c1', 'm2').message!.toolCalls).toBeNull()
  })

  it('同 id 重复 append 幂等：不重复插入，也不覆盖首次内容', () => {
    saveConversation('c1')
    const first = append('c1', 'm1', '你好')
    const second = append('c1', 'm1', '你好（重复投递）')
    expect(second.success).toBe(true)
    expect(second.message?.seq).toBe(first.message?.seq)
    expect(second.message?.content).toBe('你好')
    expect(AgentConversationRepository.load('c1').messages).toHaveLength(1)
  })

  it('删除会话会连带删掉它的消息，且不影响其它会话', () => {
    saveConversation('c1')
    saveConversation('c2')
    append('c1', 'm1')
    append('c2', 'm2')
    expect(AgentConversationRepository.deleteConversation('c1')).toEqual({ success: true, removedMessages: 1 })
    expect(AgentConversationRepository.load('c1')).toEqual({ conversation: null, messages: [] })
    expect(AgentConversationRepository.load('c2').messages).toHaveLength(1)
  })

  it('clearAll 清空当前项目的全部会话与消息', () => {
    saveConversation('c1')
    saveConversation('c2')
    append('c1', 'm1')
    append('c2', 'm2')
    const result = AgentConversationRepository.clearAll()
    expect(result.success).toBe(true)
    expect(result.removedConversations).toBe(2)
    expect(result.removedMessages).toBe(2)
    expect(AgentConversationRepository.list()).toEqual([])
  })

  it('超长正文写入前被截断并附截断标记', () => {
    saveConversation('c1')
    const result = append('c1', 'm1', '字'.repeat(AGENT_MESSAGE_MAX_CHARS + 500))
    const content = result.message!.content
    expect(content.length).toBe(AGENT_MESSAGE_MAX_CHARS + AGENT_MESSAGE_TRUNCATION_SUFFIX.length)
    expect(content.endsWith(AGENT_MESSAGE_TRUNCATION_SUFFIX)).toBe(true)
    expect(content.startsWith('字'.repeat(64))).toBe(true)
    // 未超限的正文原样保留
    const short = append('c1', 'm2', '字'.repeat(100))
    expect(short.message!.content).toBe('字'.repeat(100))
  })

  it('超过会话消息上限时淘汰最旧的、保留最新的', () => {
    saveConversation('c1')
    const total = AGENT_CONVERSATION_MAX_MESSAGES + 3
    for (let index = 0; index < total; index += 1) {
      expect(append('c1', `m${index}`, `第 ${index} 条`).success).toBe(true)
    }
    const { conversation, messages } = AgentConversationRepository.load('c1')
    expect(messages).toHaveLength(AGENT_CONVERSATION_MAX_MESSAGES)
    expect(conversation?.messageCount).toBe(AGENT_CONVERSATION_MAX_MESSAGES)
    expect(messages[0]!.id).toBe('m3')
    expect(messages.at(-1)!.id).toBe(`m${total - 1}`)
  }, 60000)

  it('对不存在的会话 / 非法 role 返回可读错误而不是抛裸异常', () => {
    const missing = append('missing', 'm1')
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('目标会话不存在')

    saveConversation('c1')
    const badRole = AgentConversationRepository.appendMessage({
      conversationId: 'c1',
      message: { id: 'm2', role: 'hacker', content: 'x' },
    })
    expect(badRole.success).toBe(false)
    expect(badRole.error).toContain('role')

    const noId = AgentConversationRepository.appendMessage({ conversationId: 'c1', message: { id: '  ', role: 'user', content: 'x' } })
    expect(noId.success).toBe(false)
  })
})
