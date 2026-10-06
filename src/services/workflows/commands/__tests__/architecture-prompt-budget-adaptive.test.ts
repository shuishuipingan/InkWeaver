import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { readNormalizedSource } from '../../../../../test/source-contract'

/**
 * 架构命令两处 promptBudget 必须接入自适应预算。
 *
 * 固定 24,000 字节上限把用户一份 41,516 字节的世界观设定判成超限，
 * 而他的模型有 100 万 tokens 上下文。两处（manifest 任务与 detail 任务）
 * 都要带 adaptive，否则 detail 任务仍会沿用旧的固定上限。
 *
 * 判别力由紧随其后的自证用例给出：抹掉 adaptive 后同样的断言必然失败。
 */
const ADAPTIVE_BLOCK = /adaptive:\s*\{\s*maxInputTokens:\s*DRAFT_CONTEXT_INPUT_LIMIT,\s*unknownInputTokens:\s*UNKNOWN_CONTEXT_INPUT_LIMIT\s*\}/g

describe('架构命令自适应预算的源码契约', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..')
  const sourcePath = path.join(repoRoot, 'src', 'services', 'workflows', 'commands', 'architecture.command.ts')
  const source = () => readNormalizedSource(sourcePath)

  it('两处 promptBudget 都带 adaptive，且取自共享预算模块而非就地写死', () => {
    const text = source()

    const promptBudgetCount = (text.match(/promptBudget:\s*\{/g) ?? []).length
    expect(promptBudgetCount, '架构命令应有 manifest 与 detail 两处 promptBudget').toBe(2)

    const adaptiveCount = (text.match(ADAPTIVE_BLOCK) ?? []).length
    expect(adaptiveCount, '两处 promptBudget 都必须带 adaptive').toBe(2)

    // 参数必须来自共享模块，保证与 harness 的判定口径同源。
    expect(text).toMatch(/from '(?:\.\.\/)+shared\/adaptive-prompt-budget'/)
    expect(text).toContain('DRAFT_CONTEXT_INPUT_LIMIT')
    expect(text).toContain('UNKNOWN_CONTEXT_INPUT_LIMIT')
  })

  it('固定上限仍作为回退值保留（容量未知/无模型能力时的基线）', () => {
    const text = source()

    // limitUtf8Bytes 保留固定值是对的：harness 只在 adaptive 存在时覆盖它。
    expect(text).toMatch(/limitUtf8Bytes:\s*MAX_CHARACTER_STRUCTURED_CONTEXT_UTF8_BYTES/)
    expect(text).toMatch(/MAX_CHARACTER_STRUCTURED_CONTEXT_UTF8_BYTES\s*=\s*24_000/)
  })

  it('判别力自证：抹掉两处 adaptive 后，上面的契约断言必然失败', () => {
    const mutated = source().replace(/adaptive:\s*\{[^}]*\},?\r?\n/g, '')

    expect((mutated.match(ADAPTIVE_BLOCK) ?? []).length).toBe(0)
    // 原断言要求 adaptiveCount === 2，在抹除形态下必然命中失败路径。
    expect((mutated.match(/promptBudget:\s*\{/g) ?? []).length).toBe(2)
  })
})
