import { describe, expect, it } from 'vitest'

import { BUILTIN_PRESETS, resolveModelProfileReasoningMapping } from '../provider-presets'
import { resolveReasoningPolicy } from '../reasoning-policy'
import type { ModelProfile } from '../ipc-channels'
import type { VerifiedReasoningMapping } from '../reasoning-types'

/**
 * 推理强度家族推断的验收与回归护栏。
 *
 * 此前推理强度要求 modelName 精确命中内置目录，新模型一律 unsupported——
 * 用户 6 个在用模型里有 3 个因此拿不到任何推理参数（gpt-6.1-sol 就是报错的那个）。
 * 本文件把「既有精确条目零回归」与「新模型经家族推断可用」同时固定下来。
 */

interface UserModelCase {
  provider: string
  protocol: string
  modelName: string
  adapter: VerifiedReasoningMapping['adapter']
  /** true 表示该名字在目录里没有任何字面量条目，只能靠家族推断。 */
  familyOnly: boolean
}

// 用户本机 models.json 的 6 个模型（Lead 已脱敏核对）。
const USER_MODELS: readonly UserModelCase[] = Object.freeze([
  { provider: 'deepseek', protocol: 'openai', modelName: 'deepseek-v4-flash', adapter: 'deepseek-v4-thinking', familyOnly: false },
  { provider: 'gemini', protocol: 'gemini', modelName: 'gemini-3.8-flash-high', adapter: 'gemini-thinking-budget', familyOnly: true },
  { provider: 'deepseek', protocol: 'openai', modelName: 'deepseek-v4.1-flash', adapter: 'deepseek-v4-thinking', familyOnly: false },
  { provider: 'bigmodel', protocol: 'openai', modelName: 'glm-5.3-flash', adapter: 'glm-thinking', familyOnly: false },
  { provider: 'openai', protocol: 'openai', modelName: 'gpt-6.1-sol', adapter: 'openai-reasoning-effort', familyOnly: true },
  { provider: 'custom', protocol: 'openai', modelName: 'claude-opus-5-5', adapter: 'glm-thinking', familyOnly: true },
])

/**
 * 刻意不含 capabilities/reasoningOverride：能力提示不得成为协议证据。
 * provider/protocol 用 cast 收窄：ModelProfile 的联合类型只覆盖产品内枚举，
 * 而负向样例刻意包含目录/产品枚举之外的网关名（qwen、mistral 等），
 * 这里要验的正是这些名字不得被推断出推理映射。
 */
function makeModel(entry: { provider: string; protocol: string; modelName: string }): ModelProfile {
  return {
    id: entry.modelName,
    name: entry.modelName,
    provider: entry.provider as ModelProfile['provider'],
    protocol: entry.protocol as ModelProfile['protocol'],
    modelName: entry.modelName,
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    temperature: 0.7,
    maxTokens: 65_536,
    purposes: ['generation'],
  }
}

/**
 * 复刻家族推断**之前**的解析路径：provider+protocol 命中预设，且 modelName 必须
 * 精确命中目录（或兼容/展示别名）。用于判别力自证——纯家族模型在无家族规则时必然解析不出来。
 */
function legacyExactLookup(profile: { provider: string; protocol: string; modelName: string }): VerifiedReasoningMapping | undefined {
  const preset = BUILTIN_PRESETS.find(candidate => candidate.provider === profile.provider)
  if (!preset || preset.protocol !== profile.protocol) return undefined
  const model = preset.models.find(candidate => candidate.name === profile.modelName)
    ?? preset.models.find(candidate => candidate.compatibilityAliases?.includes(profile.modelName))
    ?? preset.models.find(candidate => candidate.capabilityAliases?.includes(profile.modelName))
  return model?.reasoningMapping ? { ...model.reasoningMapping } as VerifiedReasoningMapping : undefined
}

const MISSING_MAPPING = ' 未解析出任何推理映射'

describe('推理强度家族推断 · 用户模型验收', () => {
  it.each(USER_MODELS)('解析 $provider/$modelName 出 $adapter', (entry) => {
    const mapping = resolveModelProfileReasoningMapping(entry)
    expect(mapping, entry.modelName + MISSING_MAPPING).toBeDefined()
    expect(mapping?.adapter).toBe(entry.adapter)
    expect(mapping?.supportedEfforts.length).toBeGreaterThan(0)
    expect(mapping?.providerValues).toBeTruthy()
  })

  it.each(USER_MODELS)('$modelName 在 auto 下 planning/review 不再 unsupported', (entry) => {
    const model = makeModel(entry)
    const planning = resolveReasoningPolicy({ model, creativeStrategy: 'auto', stage: 'planning' })
    const review = resolveReasoningPolicy({ model, creativeStrategy: 'auto', stage: 'review' })

    // 阶段请求值由策略表决定，与家族无关。
    expect(planning.requested).toBe('medium')
    expect(review.requested).toBe('high')

    for (const resolution of [planning, review]) {
      expect(resolution.status, entry.modelName + ' 仍被判为 unsupported').not.toBe('unsupported')
      expect(resolution.effective).not.toBeNull()
      expect(resolution.providerDirective, entry.modelName + ' 未产出 provider 指令').toBeTruthy()
      expect(resolution.providerDirective?.adapter).toBe(entry.adapter)
    }

    // effective 必须落在该家族声明的档位集合内（允许 capped/forced 折算）。
    const supported = resolveModelProfileReasoningMapping(entry)?.supportedEfforts ?? []
    expect(supported).toContain(planning.effective)
    expect(supported).toContain(review.effective)
  })
})

describe('推理强度家族推断 · 既有目录零回归', () => {
  function mappingOf(model: { reasoningMapping?: VerifiedReasoningMapping }): VerifiedReasoningMapping | undefined {
    const mapping = model.reasoningMapping
    if (!mapping) return undefined
    return {
      adapter: mapping.adapter,
      supportedEfforts: [...mapping.supportedEfforts],
      providerValues: { ...mapping.providerValues },
      ...(mapping.requestAliases ? { requestAliases: { ...mapping.requestAliases } } : {}),
    }
  }

  it('每个内置精确条目仍解析出与目录逐字一致的映射', () => {
    let checked = 0
    for (const preset of BUILTIN_PRESETS) {
      for (const model of preset.models) {
        const expected = mappingOf(model)
        if (!expected) continue
        checked += 1
        const resolved = resolveModelProfileReasoningMapping({
          provider: preset.provider,
          protocol: preset.protocol,
          modelName: model.name,
        })
        expect(resolved, preset.provider + '/' + model.name + ' 在家族推断后丢失或改变了映射').toEqual(expected)
      }
    }
    // 目录里必须确有成规模的精确条目被覆盖到，否则本用例是空转。
    expect(checked).toBeGreaterThan(40)
  })

  it('兼容别名与展示别名同样保持可解析（家族规则不得抢占精确命中）', () => {
    let aliasChecked = 0
    for (const preset of BUILTIN_PRESETS) {
      for (const model of preset.models) {
        if (!model.reasoningMapping) continue
        for (const alias of [...(model.compatibilityAliases ?? []), ...(model.capabilityAliases ?? [])]) {
          aliasChecked += 1
          expect(
            resolveModelProfileReasoningMapping({ provider: preset.provider, protocol: preset.protocol, modelName: alias }),
            preset.provider + '/' + alias + ' 的别名解析发生变化',
          ).toEqual(mappingOf(model))
        }
      }
    }
    expect(aliasChecked).toBeGreaterThan(0)
  })
})

describe('推理强度家族推断 · 负向（防盲发参数）', () => {
  // 注意：gpt-4o 与 qwen2.5-max 在目录里**带 reasoningMapping**（provider-presets.ts:124/:610），
  // 它们不是负向样例，见下面「已收录条目不得因家族规则失效」一条。
  const NEGATIVE_CASES = [
    { provider: 'openai', protocol: 'openai', modelName: 'totally-unknown-model' },
    { provider: 'mistral', protocol: 'openai', modelName: 'mistral-medium-2505' },
    { provider: 'ollama', protocol: 'openai', modelName: 'llama3.1:8b' },
    { provider: 'ollama', protocol: 'openai', modelName: 'qwen3:14b' },
    { provider: 'siliconflow', protocol: 'openai', modelName: 'deepseek-ai/DeepSeek-V3' },
    { provider: 'novelai', protocol: 'openai', modelName: 'kayra-v1' },
  ] as const

  it.each(NEGATIVE_CASES)('$provider/$modelName 仍必须返回 undefined', (entry) => {
    expect(resolveModelProfileReasoningMapping(entry)).toBeUndefined()
  })

  it.each(NEGATIVE_CASES)('$provider/$modelName 的推理策略仍为 unsupported', (entry) => {
    const resolution = resolveReasoningPolicy({ model: makeModel(entry), creativeStrategy: 'auto', stage: 'planning' })
    expect(resolution.status).toBe('unsupported')
    expect(resolution.effective).toBeNull()
    expect(resolution).not.toHaveProperty('providerDirective')
  })

  it('已收录的推理模型仍精确解析，家族规则不得覆盖目录既有结论', () => {
    for (const modelName of ['gpt-4o', 'qwen2.5-max', 'gpt-3.5-turbo']) {
      const mapping = resolveModelProfileReasoningMapping({ provider: modelName === 'qwen2.5-max' ? 'qwen' : 'openai', protocol: 'openai', modelName })
      const preset = BUILTIN_PRESETS.find(candidate => candidate.provider === (modelName === 'qwen2.5-max' ? 'qwen' : 'openai'))
      const expected = preset?.models.find(candidate => candidate.name === modelName)?.reasoningMapping
      if (!expected) {
        // 目录里没有映射的条目必须继续返回 undefined。
        expect(mapping).toBeUndefined()
        continue
      }
      expect(mapping?.adapter).toBe(expected.adapter)
    }
  })

  it('协议不匹配时不得凭模型名推断（gemini 名配 openai 协议）', () => {
    expect(resolveModelProfileReasoningMapping({
      provider: 'gemini',
      protocol: 'openai',
      modelName: 'gemini-3.8-flash-high',
    })).toBeUndefined()
  })
})

describe('推理强度家族推断 · 判别力自证', () => {
  it('仅靠家族的模型在「无家族规则」的精确命中路径下必然解析不出来', () => {
    const familyOnly = USER_MODELS.filter(entry => entry.familyOnly)
    expect(familyOnly.length).toBeGreaterThan(0)
    for (const entry of familyOnly) {
      expect(legacyExactLookup(entry), entry.modelName + ' 本就精确命中目录，不能算家族推断的覆盖').toBeUndefined()
    }
  })

  it('两个解析路径在同一批模型上给出相反结果（判别力成立）', () => {
    for (const entry of USER_MODELS) {
      const legacy = legacyExactLookup(entry)
      const current = resolveModelProfileReasoningMapping(entry)
      expect(current, entry.modelName + ' 生产实现应解析出映射').toBeDefined()
      if (entry.familyOnly) {
        // 家族模型：旧路径 undefined / 新路径 defined —— 抹掉家族规则即复现旧结果，断言随之变红。
        expect(legacy, entry.modelName + ' 应仅靠家族推断').toBeUndefined()
      } else {
        // 精确模型：两条路径必须一致，证明家族规则没有抢走精确命中。
        expect(current).toEqual(legacy)
      }
    }
  })
})