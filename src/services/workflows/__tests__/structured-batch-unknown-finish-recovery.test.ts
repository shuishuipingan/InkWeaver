/**
 * task-109：finishReason=unknown 的恢复通道必须"生产真的打开了"。
 *
 * 教训：测试若用 `{ ...productionContract, flag: true }` 自补开关，就会变成
 * "机制被验证过、生产却没打开" —— 用户的 160 章蓝图跑到第 7 批一次 unknown 中断
 * 就整轮失败（已生成 72/160），而单测全绿。
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { readNormalizedSource } from '../../../../test/source-contract'
import { BLUEPRINT_BATCH_CONTRACT_FLAGS } from '../blueprint-batch-policy'
import {
  type GenerationAttemptReceipt,
  type GenerationOutcome,
  type GenerationSession,
  type GenerationTask,
} from '../../generation/generation-harness'
import {
  createStructuredBatchExecutor,
  type StructuredBatchContract,
} from '../structured-batch-executor'

type Blueprint = { chapterNumber: number; title: string }

type AttemptRequest = { items: readonly number[]; validatedPrefix: readonly Blueprint[] }

type AttemptResult =
  | { status: 'completed'; content: string; requestedTokens: number }
  | {
      status: 'incomplete'
      reason: 'output_limit' | 'safety' | 'cancelled' | 'unknown'
      content: string
      requestedTokens: number
    }

function blueprintJson(chapters: readonly number[]): string {
  return JSON.stringify({
    blueprints: chapters.map(chapterNumber => ({ chapterNumber, title: '第' + chapterNumber + '章' })),
  })
}

function taskPayload(task: GenerationTask): AttemptRequest {
  const message = task.messages.find(candidate => candidate.role === 'user')
  if (!message) throw new Error('test task is missing its user message')
  return JSON.parse(message.content) as AttemptRequest
}

function attemptReceipt(
  attempt: number,
  requestedTokens: number,
  cumulativeRequestedTokens: number,
  finishReason: GenerationAttemptReceipt['finishReason'],
): GenerationAttemptReceipt {
  return {
    model: { id: 'test-model', configurationRevision: 'revision-1', endpointFingerprint: 'openai|custom|test|model' },
    capabilities: {
      contextWindowTokens: 32_768,
      maxOutputTokens: requestedTokens,
      reasoning: null,
      structuredOutput: true,
      usage: true,
      source: {
        contextWindowTokens: 'verified-provider-preset',
        maxOutputTokens: 'user-operational-cap',
        featureFlags: 'verified-provider-preset',
      },
    },
    budget: {
      attempt,
      maxAttempts: 20,
      requestedOutputTokens: requestedTokens,
      cumulativeRequestedOutputTokens: cumulativeRequestedTokens,
      maxRequestedOutputTokens: 10_000,
      maxRequestedOutputTokensPerAttempt: requestedTokens,
      deadlineAt: 10_000,
    },
    finishReason,
  }
}

function createSession(handler: (request: AttemptRequest) => Promise<AttemptResult>): Pick<GenerationSession, 'complete'> {
  let attempts = 0
  let cumulativeRequestedTokens = 0
  return {
    async complete(task) {
      attempts += 1
      const attempt = await handler(taskPayload(task))
      cumulativeRequestedTokens += attempt.requestedTokens
      if (attempt.status === 'incomplete') {
        const finishReason: Exclude<GenerationOutcome['finishReason'], 'stop'> = attempt.reason === 'output_limit'
          ? 'length'
          : attempt.reason === 'safety' ? 'content_filter' : attempt.reason
        return {
          status: 'incomplete',
          content: attempt.content,
          finishReason,
          receipt: attemptReceipt(attempts, attempt.requestedTokens, cumulativeRequestedTokens, finishReason),
        }
      }
      return {
        status: 'completed',
        content: attempt.content,
        finishReason: 'stop',
        receipt: attemptReceipt(attempts, attempt.requestedTokens, cumulativeRequestedTokens, 'stop'),
      }
    },
  }
}

const contract: StructuredBatchContract<number, Blueprint> = {
  // 引用真实生产常量（测试不自己补开关）
  ...BLUEPRINT_BATCH_CONTRACT_FLAGS,
  buildTask: ({ items, validatedPrefix }) => ({
    purpose: 'chapter-blueprints',
    output: 'structured-data',
    messages: [{ role: 'user', content: JSON.stringify({ items, validatedPrefix }) }],
  }),
  inputKey: chapterNumber => chapterNumber,
  outputKey: blueprint => blueprint.chapterNumber,
  decode: content => (JSON.parse(content) as { blueprints: Blueprint[] }).blueprints,
  validateItem: blueprint => (blueprint.title.trim() ? undefined : '标题不能为空'),
}

function executeWithSession(
  session: Pick<GenerationSession, 'complete'>,
  items: readonly number[],
  onUnknownFinishRetry?: (input: { items: readonly number[]; strategy: 'retry' | 'split' }) => void,
) {
  const executor = createStructuredBatchExecutor({ contract, session, writingLanguage: 'zh-CN', onUnknownFinishRetry })
  return executor.execute({
    items,
    limits: { maxBatchItems: 2, maxCompactSingleFallbacks: 0, maxSemanticRepairCalls: 0 },
  })
}

describe('unknown-finish 恢复通道（生产开关必须真的打开）', () => {
  it('真实生产常量必须开启恢复 —— 去掉开关这条必红', () => {
    expect(BLUEPRINT_BATCH_CONTRACT_FLAGS.recoverUnknownFinish).toBe(true)
    expect(BLUEPRINT_BATCH_CONTRACT_FLAGS.retryInvalidOutputWithSmallerBatch).toBe(true)
  })

  it('两个生产命令的合同都必须引用该常量，而不是自己写开关', () => {
    for (const file of [
      'src/services/workflows/commands/directory.command.ts',
      'src/services/workflows/commands/import-novel.command.ts',
    ]) {
      expect(readNormalizedSource(path.resolve(file))).toContain('...BLUEPRINT_BATCH_CONTRACT_FLAGS')
    }
  })

  it('用户场景：某批 unknown 且内容不完整时走拆分恢复，整轮仍然完成', async () => {
    const retries: Array<{ items: readonly number[]; strategy: string }> = []
    const session = createSession(async ({ items }) => {
      if (items.length === 2 && items[0] === 3) {
        return { status: 'incomplete', reason: 'unknown', content: '{"blueprints":[', requestedTokens: 100 }
      }
      return { status: 'completed', content: blueprintJson(items), requestedTokens: 100 }
    })

    const result = await executeWithSession(session, [1, 2, 3, 4, 5, 6], input => retries.push(input))

    expect(result.ok).toBe(true)
    expect(result.ok && result.items.map(item => item.chapterNumber)).toEqual([1, 2, 3, 4, 5, 6])
    expect(retries.some(item => item.strategy === 'split')).toBe(true)
  })

  it('长跑：每个顶层批次各有一份恢复额度 —— 回退成整轮一次则此用例必红', async () => {
    const session = createSession(async ({ items }) => {
      if (items.length === 2 && (items[0] === 3 || items[0] === 5)) {
        return { status: 'incomplete', reason: 'unknown', content: '{"blueprints":[', requestedTokens: 100 }
      }
      return { status: 'completed', content: blueprintJson(items), requestedTokens: 100 }
    })

    const result = await executeWithSession(session, [1, 2, 3, 4, 5, 6])

    expect(result.ok).toBe(true)
    expect(result.ok && result.items).toHaveLength(6)
  })

  it('unknown 但内容完整时直接接受（不重试、不丢数据）', async () => {
    const session = createSession(async ({ items }) => ({
      status: 'incomplete',
      reason: 'unknown',
      content: blueprintJson(items),
      requestedTokens: 100,
    }))

    const result = await executeWithSession(session, [1, 2, 3, 4])

    expect(result.ok).toBe(true)
    expect(result.ok && result.items).toHaveLength(4)
    expect(result.receipt.calls).toBe(2)
  })

  it('绝不把不完整输出当成功：单项批无法拆分时必须失败', async () => {
    const session = createSession(async () => ({
      status: 'incomplete',
      reason: 'unknown',
      content: '{"blueprints":[{"chapterNumber":1,',
      requestedTokens: 100,
    }))

    const result = await executeWithSession(session, [1])

    expect(result.ok).toBe(false)
    expect(!result.ok && result.failure.reason).toBe('unknown')
  })
})
