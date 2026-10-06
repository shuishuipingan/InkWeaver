import { describe, expect, it } from 'vitest'

import { resolveModelProfileReasoningMapping } from '../provider-presets'

/**
 * 家族推断的边界护栏。
 *
 * 判据（Lead 裁决）：家族规则在「该家族从该版本起整体支持该参数」时成立。
 * 用户要的正是家族级自动映射 —— 原话是「总不能出一个新的 gpt6.4 sol 或是
 * claude oops5.5 我都要自己在添加映射吧」。所以对已确认整体支持的家族，
 * **更高版本号被推断出来是正向预期**；而拿不准的家族（版本下限以下的旧档、
 * 以及无法确认整体支持的家族）一律不得推断——宁可显示「不支持」，也不盲发参数。
 */

interface Probe { provider: string; protocol: string; modelName: string }

// 正向：用户明确要的家族级映射。这些名字在目录里没有字面量条目，只能靠家族推断。
const FAMILY_EXPECTED: readonly (Probe & { adapter: string })[] = Object.freeze([
  { provider: 'deepseek', protocol: 'openai', modelName: 'deepseek-v5-flash', adapter: 'deepseek-v4-thinking' },
  { provider: 'deepseek', protocol: 'openai', modelName: 'deepseek-v4-turbo', adapter: 'deepseek-v4-thinking' },
  { provider: 'openai', protocol: 'openai', modelName: 'gpt-6-turbo', adapter: 'openai-reasoning-effort' },
  { provider: 'openai', protocol: 'openai', modelName: 'gpt-5.7', adapter: 'openai-reasoning-effort' },
  { provider: 'gemini', protocol: 'gemini', modelName: 'gemini-4-pro', adapter: 'gemini-thinking-budget' },
  { provider: 'bigmodel', protocol: 'openai', modelName: 'glm-5.4', adapter: 'glm-thinking' },
  { provider: 'anthropic', protocol: 'openai', modelName: 'claude-opus-6', adapter: 'glm-thinking' },
  { provider: 'anthropic', protocol: 'openai', modelName: 'claude-sonnet-5', adapter: 'glm-thinking' },
])

// 负向：不得推断。前两条是 mistral 全家（已裁决移除规则）；后五条是版本下限以下的
// 旧档或无法确认整体支持的家族，它们正确返回 undefined 恰好证明下限仍然有效。
const FAMILY_REJECTED: readonly Probe[] = Object.freeze([
  { provider: 'mistral', protocol: 'openai', modelName: 'mistral-medium-2505' },
  { provider: 'mistral', protocol: 'openai', modelName: 'mistral-xl-9' },
  { provider: 'gemini', protocol: 'gemini', modelName: 'gemini-2.0-flash' },
  { provider: 'qwen', protocol: 'openai', modelName: 'qwen2.5-turbo' },
  { provider: 'xai', protocol: 'openai', modelName: 'grok-3-mini' },
  { provider: 'mistral', protocol: 'openai', modelName: 'magistral-medium' },
  { provider: 'custom', protocol: 'openai', modelName: 'some-gateway-model' },
])

describe('推理强度家族推断 · 正向（用户要的家族级映射）', () => {
  it.each(FAMILY_EXPECTED)('$provider/$modelName 经家族推断得到 $adapter', (entry) => {
    const mapping = resolveModelProfileReasoningMapping(entry)
    expect(mapping, entry.modelName + ' 未解析出映射').toBeDefined()
    expect(mapping?.adapter).toBe(entry.adapter)
    expect(mapping?.supportedEfforts.length).toBeGreaterThan(0)
  })
})

describe('推理强度家族推断 · 负向（防盲发参数）', () => {
  it.each(FAMILY_REJECTED)('$provider/$modelName 不得被推断出映射', (entry) => {
    expect(resolveModelProfileReasoningMapping(entry)).toBeUndefined()
  })
})

/**
 * 既有归一化路径（不在本卡范围，仅记录事实，不做修改）。
 *
 * gpt-4o-2025-01-01 命中的不是家族规则，而是既有的名字归一化：
 * normalizeModelNameForPreset（provider-presets.ts:891）会剥掉 ISO 日期后缀，
 * 再由 findPresetModel（:916）精确命中目录里本来就带 mapping 的 gpt-4o 条目（:124-131）。
 * 这是 v1.3.x 的既有决策，本次家族推断没有改变它。
 */
/**
 * 既有前缀回退（不在本卡范围，仅记录事实，不做修改）。
 *
 * mistral-large-3 命中的不是家族规则，而是 findPresetModel 的前缀回退
 * （provider-presets.ts:929-935）：它把该名字指向目录里本来就带
 * openai-reasoning-effort 的 mistral-large 条目（:816-824）。
 * 证据：my-proxy/mistral-large-3 与 mistral/mistral-xl-9（无同族模板）都返回 undefined，
 * 说明这不是跨 provider 的家族规则串台。Lead 明确不动这段前缀回退。
 */
describe('既有前缀回退（仅记录）', () => {
  it('mistral-large-3 解析出的映射逐字等于目录 mistral-large 条目', () => {
    const viaPrefixFallback = resolveModelProfileReasoningMapping({
      provider: 'mistral', protocol: 'openai', modelName: 'mistral-large-3',
    })
    const catalogEntry = resolveModelProfileReasoningMapping({
      provider: 'mistral', protocol: 'openai', modelName: 'mistral-large',
    })

    expect(viaPrefixFallback).toBeDefined()
    expect(viaPrefixFallback).toEqual(catalogEntry)
  })

  it('无同族模板的 mistral 名字仍不得被推断（前缀回退不越界）', () => {
    expect(resolveModelProfileReasoningMapping({
      provider: 'mistral', protocol: 'openai', modelName: 'mistral-xl-9',
    })).toBeUndefined()
  })
})

describe('既有归一化路径（仅记录）', () => {
  it('gpt-4o-2025-01-01 与 gpt-4o 解析出完全相同的映射（归一化命中，非家族规则）', () => {
    const dated = resolveModelProfileReasoningMapping({ provider: 'openai', protocol: 'openai', modelName: 'gpt-4o-2025-01-01' })
    const base = resolveModelProfileReasoningMapping({ provider: 'openai', protocol: 'openai', modelName: 'gpt-4o' })

    expect(dated).toBeDefined()
    expect(dated).toEqual(base)
  })
})