import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StepCallbacks, WorkflowContext } from '../../../../stores/workflow-store'
import { useProjectStore } from '../../../../stores/project-store'
import {
  type GenerationAttemptReceipt,
  type GenerationSession,
} from '../../../generation/generation-harness'
import type { GenerationRuntime } from '../../../generation/generation-runtime'
import { GenerateDirectoryCommand } from '../directory.command'

/**
 * 蓝图新角色链路的**用户场景端到端回归**。
 *
 * 用户原话：「ai 生成蓝图，它只会根据现有的角色卡去生成，它不会自动生成角色卡……按理来说，
 * 它生成蓝图，在需要的时候会自动添加新的人物，然后添加对应的角色卡以及里面的内容等东西才合理」。
 *
 * 与磐石/星芒的测试分工：他们验各组件「实现正确」（候选划分、挑选判据、只填空、上限、解析）；
 * 本文件跑**完整 GenerateDirectoryCommand**，只验用户看到的那一条链路，以及「回退即红」。
 */

const AUTO_MARKER = '自动候选来源：章节蓝图'
const NEWCOMER = '太虚宫主'

type Blueprint = {
  chapterNumber: number
  title: string
  role: string
  purpose: string
  keyEvents: string
  characters: string[]
  relationshipHints: unknown[]
  suspenseHook: string
  userGuidance: string
  notes: string
  notesUpdatedAt: string
}

const projectSnapshot = {
  expectedProjectPath: 'C:\\tmp\\vela-enrichment-e2e',
  novelConfig: { totalChapters: 3, globalGuidance: '', genre: '玄幻' },
}

function modelBlueprint(chapterNumber: number, characters: string[]): Record<string, unknown> {
  return {
    chapterNumber,
    title: `第${chapterNumber}章`,
    role: '发展',
    purpose: `推进第${chapterNumber}章`,
    keyEvents: `第${chapterNumber}章发生关键事件`,
    characters,
    relationships: [],
    suspenseHook: `第${chapterNumber}章留下新的悬念`,
  }
}

function generationReceipt(attempt: number, purpose?: string): GenerationAttemptReceipt {
  return {
    ...(purpose ? { purpose } : {}),
    model: { id: 'model-1', configurationRevision: 'revision-1', endpointFingerprint: 'endpoint-1' },
    capabilities: {
      contextWindowTokens: null,
      maxOutputTokens: 4096,
      reasoning: null,
      structuredOutput: true,
      usage: true,
      source: { contextWindowTokens: 'unknown', maxOutputTokens: 'legacy-profile', featureFlags: 'unknown' },
    },
    budget: Object.freeze({
      attempt,
      maxAttempts: 20,
      requestedOutputTokens: 4096,
      cumulativeRequestedOutputTokens: attempt * 4096,
      maxRequestedOutputTokens: 100_000,
      maxRequestedOutputTokensPerAttempt: 4096,
      deadlineAt: Number.MAX_SAFE_INTEGER,
    }),
    finishReason: 'stop',
  }
}

function generationSession(complete: GenerationSession['complete']): GenerationSession {
  return {
    budget: Object.freeze({
      maxAttempts: 20,
      maxRequestedOutputTokens: 100_000,
      maxRequestedOutputTokensPerAttempt: 4096,
      deadlineAt: Number.MAX_SAFE_INTEGER,
    }),
    complete,
  }
}

function testRuntime(session: GenerationSession): GenerationRuntime & { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => {})
  return { close, execute: operation => operation({ session }) }
}

function stepCallbacks(): StepCallbacks {
  return { log: vi.fn(), setProgress: vi.fn(), appendText: vi.fn() }
}

function workflowContext(): WorkflowContext {
  return {
    runId: 'enrichment-e2e',
    projectPath: projectSnapshot.expectedProjectPath,
    projectSession: {
      projectId: 'enrichment-e2e',
      leaseId: 'lease-enrichment-e2e',
      projectPath: projectSnapshot.expectedProjectPath,
    },
    writingLanguage: 'zh-CN',
    uiLocale: 'zh-CN',
    data: { architecture: '故事前提'.repeat(30) },
    cancelled: false,
  } as unknown as WorkflowContext
}

/** 内存角色名册 + 同步作业表：commit 真的写进去，因为补档会再读一次快照。 */
function stubIpcWithRoster(initial: Array<Record<string, unknown>> = []) {
  const roster: { revision: number; entries: Array<Record<string, unknown>> } = {
    revision: initial.length > 0 ? 1 : 0,
    entries: initial.map(entry => ({ ...entry })),
  }
  const syncOperations = new Map<string, Record<string, unknown>>()
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'prompt:load-global') return { templates: [], diagnostics: [] }
    if (channel === 'fs:check-exists') return false
    if (channel === 'db:draft-authority-sequence') {
      return {
        status: 'empty',
        lastChapterNumber: 0,
        nextChapterNumber: 1,
        duplicateChapterNumbers: [],
        authorityFingerprint: 'f'.repeat(64),
      }
    }
    if (channel === 'db:blueprint-commit-range') {
      const request = args[0] as {
        mode: string
        operationId: string
        startChapter: number
        endChapter: number
        blueprints: Blueprint[]
      }
      const snapshot = request.blueprints
      const syncOperation = {
        operationId: `blueprint-sync-${request.operationId}`,
        blueprintCommitOperationId: request.operationId,
        blueprintCommitPayloadHash: 'a'.repeat(64),
        status: 'pending',
        startChapter: request.startChapter,
        endChapter: request.endChapter,
        characterSyncInput: snapshot,
        createdAt: '2026-01-01 00:00:00',
        updatedAt: '2026-01-01 00:00:00',
      }
      syncOperations.set(syncOperation.operationId, syncOperation)
      return {
        success: true,
        receipt: {
          mode: request.mode,
          operationId: request.operationId,
          payloadHash: 'a'.repeat(64),
          idempotent: false,
          startChapter: request.startChapter,
          endChapter: request.endChapter,
          chapterNumbers: snapshot.map(item => item.chapterNumber),
          snapshot,
          characterSyncInput: snapshot,
          characterSyncOperation: syncOperation,
        },
      }
    }
    if (channel === 'db:blueprint-character-sync-list-pending') {
      return [...syncOperations.values()].filter(operation => operation.status === 'pending')
    }
    if (channel === 'db:blueprint-character-sync-get') {
      return syncOperations.get(String(args[0])) ?? null
    }
    if (channel === 'db:blueprint-character-sync-complete') {
      const operationId = String(args[0])
      const operation = syncOperations.get(operationId)
      if (!operation) return { success: false, error: 'operation missing' }
      const completed = {
        ...operation,
        status: 'completed',
        completionReceipt: {
          blueprintCommitOperationId: operation.blueprintCommitOperationId,
          operationId,
          status: 'already-satisfied',
        },
        completedAt: '2026-01-01 00:01:00',
        updatedAt: '2026-01-01 00:01:00',
      }
      syncOperations.set(operationId, completed)
      return { success: true, operation: completed }
    }
    if (channel === 'db:character-roster-read') {
      return { status: roster.entries.length > 0 ? 'ready' : 'empty', revision: roster.revision, entries: roster.entries }
    }
    if (channel === 'db:character-roster-commit') {
      const request = args[0] as { entries: Array<Record<string, unknown>> }
      roster.revision += 1
      roster.entries = request.entries.map(entry => ({ ...entry }))
      return { success: true, receipt: { revision: roster.revision, snapshot: { status: 'ready', entries: roster.entries } } }
    }
    return { success: true }
  })
  vi.stubGlobal('window', {
    velaAPI: {
      invoke, on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  return { invoke, roster }
}

const PROFILE_FIELDS = ['gender', 'age', 'appearance', 'personality', 'background', 'abilities', 'motivation', 'arc'] as const

beforeEach(() => {
  useProjectStore.setState({
    currentProject: {
      id: 'enrichment-e2e',
      name: '测试项目',
      path: projectSnapshot.expectedProjectPath,
      sessionLease: 'lease-enrichment-e2e',
      novelConfig: { genre: '玄幻', subGenre: '', targetAudience: '', totalChapters: 3, wordsPerChapter: 3000, plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '', worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '', writingStyle: '' },
    },
  } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('蓝图新角色：用户场景端到端', () => {
  // 这条用例曾经是真的红的：GenerateDirectoryCommand 是全仓唯一不调用
  // executeWithGenerationRuntime 的生成命令，导致补档走的 callLLMWithBoundedCompletion
  // 必然抛「生成调用必须位于命令执行期 GenerationRuntime 内」，被 catch 吞成日志 ——
  // 用户的空卡在生产环境也补不上。当时用 it.fails 记录，task-106 修好后它在 it.fails 下
  // 报「意外通过」，据此翻回 it：**绿只能来自生产路径被修通，不是断言被放宽**。
  it('蓝图里出现新角色名 → 跑完目录生成 → 角色卡资料非空且保留来源标记', async () => {
    const { roster } = stubIpcWithRoster()
    const blueprints = [1, 2, 3].map(n => modelBlueprint(n, [NEWCOMER]))
    const session = generationSession(async task => {
      if (task.purpose === 'blueprint-character-profiles') {
        // 补档调用：模型依据蓝图事实给出档案。
        return {
          status: 'completed' as const,
          finishReason: 'stop' as const,
          receipt: generationReceipt(1, task.purpose),
          content: JSON.stringify({
            profiles: [{
              name: NEWCOMER,
              gender: '女',
              age: '不详',
              appearance: '宫装，面覆轻纱',
              personality: '威压而克制',
              background: '太虚宫的实际掌权者',
              abilities: '以势压人，操控宫务',
              motivation: '守住太虚宫的传承',
              arc: '从幕后走向台前',
            }],
          }),
        }
      }
      return {
        status: 'completed' as const,
        finishReason: 'stop' as const,
        receipt: generationReceipt(1, task.purpose),
        content: JSON.stringify({ blueprints }),
      }
    })
    const command = new GenerateDirectoryCommand(
      { mode: 'full', count: 3 },
      projectSnapshot as never,
      { createRuntime: vi.fn(async () => testRuntime(session)) },
    )

    await command.execute({ step: {}, context: workflowContext(), callbacks: stepCallbacks() })

    const card = roster.entries.find(entry => entry.name === NEWCOMER)
    expect(card, '蓝图里的新角色没有被建档').toBeDefined()
    // 用户场景的核心断言：资料不能是八项全空。
    for (const field of PROFILE_FIELDS) {
      expect(String(card![field] ?? '').length, `字段 ${field} 仍是空的 —— 档案没有被自动补上`).toBeGreaterThan(0)
    }
    expect(String(card!.notes)).toContain(AUTO_MARKER)
  })

  it('判别力自证：补档调用什么都不产出时，同一夹具的卡就是空卡 —— 主用例确实在测自动补档', async () => {
    const { roster } = stubIpcWithRoster()
    const blueprints = [1, 2, 3].map(n => modelBlueprint(n, [NEWCOMER]))
    const session = generationSession(async task => {
      if (task.purpose === 'blueprint-character-profiles') {
        // 等价于「回退空字段补齐这一环」：模型没有任何可采纳的值。
        return {
          status: 'completed' as const,
          finishReason: 'stop' as const,
          receipt: generationReceipt(1, task.purpose),
          content: JSON.stringify({ profiles: [] }),
        }
      }
      return {
        status: 'completed' as const,
        finishReason: 'stop' as const,
        receipt: generationReceipt(1, task.purpose),
        content: JSON.stringify({ blueprints }),
      }
    })
    const command = new GenerateDirectoryCommand(
      { mode: 'full', count: 3 },
      projectSnapshot as never,
      { createRuntime: vi.fn(async () => testRuntime(session)) },
    )

    await command.execute({ step: {}, context: workflowContext(), callbacks: stepCallbacks() })

    const card = roster.entries.find(entry => entry.name === NEWCOMER)
    expect(card).toBeDefined()
    // 没有可采纳的档案值 → 八项仍为空。这与主用例的结果相反，
    // 证明主用例那条「非空」断言依赖的正是补档这一环。
    for (const field of PROFILE_FIELDS) {
      expect(String(card![field] ?? '')).toBe('')
    }
  })

  it('多人合并名与势力形态名不建卡，且不影响正常角色的建档', async () => {
    const { roster } = stubIpcWithRoster()
    const blueprints = [
      modelBlueprint(1, ['林岚、周砚', '仙盟高层', NEWCOMER]),
      modelBlueprint(2, ['仙盟高层', NEWCOMER]),
      modelBlueprint(3, [NEWCOMER]),
    ]
    const session = generationSession(async task => {
      if (task.purpose === 'blueprint-character-profiles') {
        return {
          status: 'completed' as const,
          finishReason: 'stop' as const,
          receipt: generationReceipt(1, task.purpose),
          content: JSON.stringify({ profiles: [{ name: NEWCOMER, personality: '威压而克制' }] }),
        }
      }
      return {
        status: 'completed' as const,
        finishReason: 'stop' as const,
        receipt: generationReceipt(1, task.purpose),
        content: JSON.stringify({ blueprints }),
      }
    })
    const command = new GenerateDirectoryCommand(
      { mode: 'full', count: 3 },
      projectSnapshot as never,
      { createRuntime: vi.fn(async () => testRuntime(session)) },
    )

    await command.execute({ step: {}, context: workflowContext(), callbacks: stepCallbacks() })

    const names = roster.entries.map(entry => entry.name)
    expect(names).toContain(NEWCOMER) // 具体人物照常建档（含「宫」但不含聚合词）
    expect(names).not.toContain('林岚、周砚') // 多人合并名
    expect(names).not.toContain('仙盟高层') // 势力标志词 + 聚合词
  })

  it('作者已手填档案的角色逐字不被覆盖 —— 哪怕模型为同名角色返回了不同内容', async () => {
    // 预置一位作者亲手写过 personality / background 的角色，其余字段留空。
    const authorWritten = {
      name: '苏倦',
      role: 'protagonist',
      gender: '',
      age: '',
      appearance: '',
      personality: '作者写的性格：沉静、算计',
      background: '作者写的背景：边城私塾出身',
      abilities: '',
      motivation: '',
      arc: '',
      relationships: [],
      notes: '作者备注',
    }
    const { roster } = stubIpcWithRoster([authorWritten])
    const blueprints = [1, 2, 3].map(n => modelBlueprint(n, ['苏倦']))
    const session = generationSession(async task => {
      if (task.purpose === 'blueprint-character-profiles') {
        // 模型对着同一名字给出完全不同的说法 —— 不得覆盖作者内容。
        return {
          status: 'completed' as const,
          finishReason: 'stop' as const,
          receipt: generationReceipt(1, task.purpose),
          content: JSON.stringify({
            profiles: [{
              name: '苏倦',
              personality: '模型写的性格：暴躁、鲁莽',
              background: '模型写的背景：王都贵族',
              abilities: '模型补充的能力',
            }],
          }),
        }
      }
      return {
        status: 'completed' as const,
        finishReason: 'stop' as const,
        receipt: generationReceipt(1, task.purpose),
        content: JSON.stringify({ blueprints }),
      }
    })
    const command = new GenerateDirectoryCommand(
      { mode: 'full', count: 3 },
      projectSnapshot as never,
      { createRuntime: vi.fn(async () => testRuntime(session)) },
    )

    await command.execute({ step: {}, context: workflowContext(), callbacks: stepCallbacks() })

    const card = roster.entries.find(entry => entry.name === '苏倦')!
    // 逐字未变：作者的两个字段一个字符都没被模型值替换。
    expect(card.personality).toBe('作者写的性格：沉静、算计')
    expect(card.background).toBe('作者写的背景：边城私塾出身')
    expect(String(card.notes)).toContain('作者备注')
  })

  it('作者在自动建档空卡的备注里追加的内容不被抹掉，且档案照常补上', async () => {
    // 历史空卡 + 作者手动追加的备注：这张卡会被补档选中，所以它会走完整提交路径。
    const { roster } = stubIpcWithRoster([{
      name: NEWCOMER,
      role: 'supporting',
      gender: '',
      age: '',
      appearance: '',
      personality: '',
      background: '',
      abilities: '',
      motivation: '',
      arc: '',
      relationships: [],
      notes: `${AUTO_MARKER}（第1、2、3章）\n作者追加：此人本卷不登场，档案仅供参考`,
    }])
    const blueprints = [1, 2, 3].map(n => modelBlueprint(n, [NEWCOMER]))
    const session = generationSession(async task => {
      if (task.purpose === 'blueprint-character-profiles') {
        return {
          status: 'completed' as const,
          finishReason: 'stop' as const,
          receipt: generationReceipt(1, task.purpose),
          content: JSON.stringify({ profiles: [{ name: NEWCOMER, personality: '模型补的性格' }] }),
        }
      }
      return {
        status: 'completed' as const,
        finishReason: 'stop' as const,
        receipt: generationReceipt(1, task.purpose),
        content: JSON.stringify({ blueprints }),
      }
    })
    const command = new GenerateDirectoryCommand(
      { mode: 'full', count: 3 },
      projectSnapshot as never,
      { createRuntime: vi.fn(async () => testRuntime(session)) },
    )

    await command.execute({ step: {}, context: workflowContext(), callbacks: stepCallbacks() })

    const card = roster.entries.find(entry => entry.name === NEWCOMER)!
    // 作者的追加内容与来源标记都还在（可以追加说明，不能抹掉）。
    expect(String(card.notes)).toContain('作者追加：此人本卷不登场')
    expect(String(card.notes)).toContain(AUTO_MARKER)
    // 同时这张卡确实被补上了档案。
    expect(card.personality).toBe('模型补的性格')
  })

  it('补档返回非法 JSON 时不抛，蓝图完好，空卡保持空（可下次再补）', async () => {
    const { roster } = stubIpcWithRoster()
    const blueprints = [1, 2, 3].map(n => modelBlueprint(n, [NEWCOMER]))
    const session = generationSession(async task => {
      if (task.purpose === 'blueprint-character-profiles') {
        return {
          status: 'completed' as const,
          finishReason: 'stop' as const,
          receipt: generationReceipt(1, task.purpose),
          content: '这不是 JSON，模型跑偏了。',
        }
      }
      return {
        status: 'completed' as const,
        finishReason: 'stop' as const,
        receipt: generationReceipt(1, task.purpose),
        content: JSON.stringify({ blueprints }),
      }
    })
    const command = new GenerateDirectoryCommand(
      { mode: 'full', count: 3 },
      projectSnapshot as never,
      { createRuntime: vi.fn(async () => testRuntime(session)) },
    )
    const context = workflowContext()

    await expect(command.execute({ step: {}, context, callbacks: stepCallbacks() })).resolves.toBeDefined()

    // 蓝图已落库且完好；空卡保持空，下一轮幂等判据会再挑到它。
    expect(context.data.blueprintCommitReceipt).toMatchObject({ chapterNumbers: [1, 2, 3] })
    const card = roster.entries.find(entry => entry.name === NEWCOMER)
    expect(card).toBeDefined()
    for (const field of PROFILE_FIELDS) expect(String(card![field] ?? '')).toBe('')
  })
})