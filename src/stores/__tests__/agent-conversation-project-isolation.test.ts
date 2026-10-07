import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  closeProjectDatabase,
  getCurrentProjectPath,
  initProjectDatabase,
} from '../../../electron/database'
import { AgentConversationRepository } from '../../../electron/repositories/agent-conversation-repository'
import { useAgentStore } from '../agent-store'
import { useProjectStore } from '../project-store'

/**
 * 助手会话的项目隔离不变量。
 *
 * 用户报的缺陷是「换项目后助手还记着上个项目的会话」。排查能发现现有问题，
 * 但真正的防线是把不变量钉成测试 —— 下一个改动打破它时必须立刻变红。
 *
 * 【为什么库层断言放在 stores 目录】本文件顶部两条按任务 scope 落在 src/stores/__tests__/，
 * 因此 import 了 electron/database 与 AgentConversationRepository —— 已确认 electron/database.ts
 * 只依赖 node: 内建与 better-sqlite3（不 import electron），所以能在 node 测试下真实建库。
 * 它验证的是**跨层不变量**（两个真实项目库之间的隔离），放在这里只是位置偏好，不是正确性问题。
 * 若你更想让它落到 electron/repositories/__tests__/，平移即可。
 *
 * 与 agent-project-switch.test.ts 的分工：那份验证「修复生效」（reset / 代次 / 同项目未落库），
 * 本文件覆盖更广的不变量：**库层真实双库隔离**，以及「切走不显示、**切回仍在**」这另一半
 * （数据来自库，不是被清空）。
 */
const projectA = { id: 'A', sessionLease: 'lease-A', name: 'A', path: 'C:\\novels\\A', novelConfig: {} }
const projectB = { id: 'B', sessionLease: 'lease-B', name: 'B', path: 'C:\\novels\\B', novelConfig: {} }

function meta(id: string, title: string) {
  return { id, title, mode: 'planning', modelId: null, createdAt: 1, updatedAt: 2, messageCount: 0 }
}

function stubApi(routes: Record<string, unknown> = {}) {
  const invoke = vi.fn(async (channel: string, ...rest: unknown[]) => {
    void rest
    return channel in routes ? routes[channel] : []
  })
  vi.stubGlobal('window', {
    velaAPI: {
      invoke,
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  return invoke
}

describe('库层：会话数据按项目数据库隔离（两个真实临时库）', () => {
  let projectPathA: string
  let projectPathB: string

  beforeEach(() => {
    projectPathA = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-agent-isolation-A-'))
    projectPathB = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-agent-isolation-B-'))
  })

  afterEach(() => {
    closeProjectDatabase()
    for (const projectPath of [projectPathA, projectPathB]) {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  it('两个真实项目库互不可见，且切回后原数据仍在（切走不显示 ≠ 被删掉）', () => {
    // —— 项目 A 的真实库
    initProjectDatabase(projectPathA)
    expect(getCurrentProjectPath()).toBe(projectPathA)
    AgentConversationRepository.saveMeta({ id: 'conv-a', title: 'A 的会话', mode: 'planning', modelId: null })
    AgentConversationRepository.appendMessage({
      conversationId: 'conv-a',
      message: { id: 'm-a1', role: 'user', content: 'A 的私密正文' },
    })
    expect(AgentConversationRepository.list().map(conversation => conversation.id)).toEqual(['conv-a'])

    // —— 切到项目 B 的真实库：不得看到 A 的任何会话，连正文也取不到
    initProjectDatabase(projectPathB)
    expect(getCurrentProjectPath()).toBe(projectPathB)
    expect(AgentConversationRepository.list()).toEqual([])
    expect(AgentConversationRepository.load('conv-a')).toEqual({ conversation: null, messages: [] })

    // B 自己的会话照常读写
    AgentConversationRepository.saveMeta({ id: 'conv-b', title: 'B 的会话', mode: 'fast', modelId: null })
    expect(AgentConversationRepository.list().map(conversation => conversation.id)).toEqual(['conv-b'])

    // —— 切回 A：数据仍在（这是「不是被删掉」的库层证据）
    initProjectDatabase(projectPathA)
    expect(AgentConversationRepository.list().map(conversation => conversation.id)).toEqual(['conv-a'])
    expect(AgentConversationRepository.load('conv-a')).toMatchObject({
      conversation: { id: 'conv-a', title: 'A 的会话' },
      messages: [{ id: 'm-a1', content: 'A 的私密正文' }],
    })
  })

  it('判别力自证：不切库时同一查询仍返回 A 的数据 —— 上面那条断言确实在测库边界', () => {
    initProjectDatabase(projectPathA)
    AgentConversationRepository.saveMeta({ id: 'conv-a', title: 'A 的会话', mode: 'planning', modelId: null })

    // 刻意不切库：仓储读到的就是 A —— 说明断言依赖的是「当前库」而不是某种全局缓存。
    expect(AgentConversationRepository.list().map(conversation => conversation.id)).toEqual(['conv-a'])

    // 一旦切到 B 的真实库，同一调用必然为空。两个状态相反，因此只要隔离被回退
    // （例如让仓储忽略当前库、或复用上一个项目的连接），上面那条空列表断言就会立刻变红。
    initProjectDatabase(projectPathB)
    expect(AgentConversationRepository.list()).toEqual([])
  })
})

describe('渲染层：切走不显示、切回仍在', () => {
  function conversationIds(): string[] {
    return useAgentStore.getState().conversations.map(conversation => conversation.id)
  }

  beforeEach(() => {
    useAgentStore.setState({
      conversations: [],
      activeConversationId: null,
      showHistory: false,
      generating: false,
      activeRequestId: null,
      historyHydrated: false,
      lastPersistenceWarning: null,
      toolsInitialized: true,
    })
    useProjectStore.setState({ currentProject: projectA as never })
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid') })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useProjectStore.setState({ currentProject: null })
  })

  it('切到 B 不显示 A 的会话，切回 A 又能看到（数据来自库，不是被清空）', async () => {
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话')] })
    await useAgentStore.getState().restoreConversations()
    expect(conversationIds()).toEqual(['conv-a1'])
    useAgentStore.setState({ activeConversationId: 'conv-a1' }) // 用户此刻正在看 A 的会话

    // 切到 B
    useProjectStore.setState({ currentProject: projectB as never })
    useAgentStore.getState().resetAgentConversationsForProjectSwitch()
    // 界面上不得有任何 A 的痕迹：列表里没有，**激活指针也不能还指着 A**。
    // 只换列表不清指针的话，界面会显示一个不属于当前项目的会话 —— 那正是用户报的形态。
    expect(conversationIds()).not.toContain('conv-a1')
    expect(useAgentStore.getState().activeConversationId).toBeNull()
    stubApi({ 'db:agent-conversation-list': [meta('conv-b1', 'B 的会话')] })
    await useAgentStore.getState().restoreConversations()
    expect(conversationIds()).toEqual(['conv-b1'])
    expect(useAgentStore.getState().activeConversationId).not.toBe('conv-a1')

    // 切回 A：库里的 A 会话必须重新出现 —— 这是「切走不显示」的反面，
    // 若哪天改成切项目时删数据，这条会立刻红。
    useProjectStore.setState({ currentProject: projectA as never })
    useAgentStore.getState().resetAgentConversationsForProjectSwitch()
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话')] })
    await useAgentStore.getState().restoreConversations()
    expect(conversationIds()).toEqual(['conv-a1'])
  })

  it('判别力自证：切项目时不重置（等价回退修复）会让激活指针留在旧项目会话上', async () => {
    stubApi({ 'db:agent-conversation-list': [meta('conv-a1', 'A 的会话')] })
    await useAgentStore.getState().restoreConversations()
    useAgentStore.setState({ activeConversationId: 'conv-a1' })

    // 刻意不调用 resetAgentConversationsForProjectSwitch()：这正是修复被回退的形态。
    useProjectStore.setState({ currentProject: projectB as never })
    stubApi({ 'db:agent-conversation-list': [meta('conv-b1', 'B 的会话')] })
    await useAgentStore.getState().restoreConversations()

    // 实测确认的两件事：
    // (a) restoreConversations 本身会替换列表，所以「列表里没有 A」这条不依赖 reset；
    //     —— 这也解释了为什么只测列表不足以钉住这条不变量。
    expect(conversationIds()).toEqual(['conv-b1'])
    // (b) 真正依赖 reset 的是激活指针：它仍指着 A 的会话，而该会话已不在列表里 ——
    //     界面因此显示一个不属于当前项目的会话。上一条用例里 toBeNull() 在此必然变红。
    expect(useAgentStore.getState().activeConversationId).toBe('conv-a1')
  })
})
