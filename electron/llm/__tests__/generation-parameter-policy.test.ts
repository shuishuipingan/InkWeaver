import { describe, expect, it } from 'vitest'

import { resolveGenerationParameters } from '../generation-parameter-policy'
import type { ModelProfile } from '../../../src/shared/ipc-channels'

const openAIModel: ModelProfile = {
  id: 'openai-test',
  name: 'OpenAI test',
  provider: 'openai',
  protocol: 'openai',
  modelName: 'gpt-test',
  apiKey: 'test-key',
  baseUrl: 'https://api.openai.com/v1',
  temperature: 1,
  maxTokens: 4096,
  purposes: ['generation'],
}

/**
 * 判据：推理字段与温度字段的约束来源不同，断言必须分开写。
 *
 * · temperature 等官方特例规则 —— 与「是否走官方 endpoint」相关。
 *   官方 Kimi 主机才套用固定温度规则；代理、非法或非 HTTPS 端点一律不套用。
 * · 推理字段（reasoning_effort / thinking / thinkingBudget）—— 参数格式由**模型本身**决定，
 *   与网关地址无关（provider-presets.ts:1162）。用户实际就是经第三方网关调用同名模型的；
 *   若让家族推断受 endpoint 约束，他的需求就直接不成立（UI 会退回「不支持」）。
 *   provider 层按 adapter 分支而非 provider，本就是为「网关 + 同名模型」设计的。
 *
 * 因此下面每组都用两个精确断言分别覆盖两类约束，**不要**合回一个 toEqual/toMatchObject：
 * 那样会把「参数到底发没发」这件事一起掩盖掉。
 */
describe('generation parameter policy', () => {
  it('forwards generic model settings without inventing a reasoning field', () => {
    expect(resolveGenerationParameters(openAIModel, {
      maxTokens: 512,
      responseFormat: { type: 'json_object' },
      reasoningStage: 'drafting',
      creativeStrategy: 'deep-planning',
    })).toEqual({
      temperature: 1,
      maxTokens: 512,
      responseFormat: { type: 'json_object' },
    })
  })

  const officialKimiHosts = [
    'https://api.moonshot.cn/v1',
    'https://api.moonshot.ai/v1',
  ]
  const fixedKimiModels = ['kimi-k3', 'kimi-k2.7', 'kimi-k2.6', 'kimi-k2.5']

  it.each(officialKimiHosts.flatMap(baseUrl => fixedKimiModels.map(modelName => ({ baseUrl, modelName }))))(
    'omits fixed temperature for $modelName on $baseUrl',
    ({ baseUrl, modelName }) => {
      const resolved = resolveGenerationParameters({
        ...openAIModel,
        provider: 'custom',
        baseUrl,
        modelName,
        temperature: 0.7,
      }, { maxTokens: 512 })

      // 组一·endpoint 相关：固定温度规则只对官方 Kimi 主机生效，故 temperature 被省略。
      expect(resolved.temperature).toBeUndefined()
      expect(resolved.maxTokens).toBe(512)
      // 组二·模型能力相关：kimi-k2.x/k3 属 Kimi K2+ 家族，默认 auto+general 请求 low 档。
      expect(resolved.reasoning).toEqual({ adapter: 'openai-reasoning-effort', reasoningEffort: 'low' })
    },
  )

  it('enforces the documented range for an official Kimi model without a fixed-temperature rule', () => {
    const unknownKimiModel = {
      ...openAIModel,
      provider: 'custom' as const,
      baseUrl: 'https://api.moonshot.cn/v1',
      modelName: 'kimi-future-preview',
      temperature: 0.6,
    }

    expect(resolveGenerationParameters(unknownKimiModel, { maxTokens: 512 })).toMatchObject({
      temperature: 0.6,
    })
    expect(() => resolveGenerationParameters({ ...unknownKimiModel, temperature: 1.1 }, { maxTokens: 512 }))
      .toThrow('0 到 1')
  })

  it('keeps the proxy temperature while still emitting reasoning for kimi-k3', () => {
    const resolved = resolveGenerationParameters({
      ...openAIModel,
      provider: 'custom',
      baseUrl: 'https://kimi-proxy.example.test/v1',
      modelName: 'kimi-k3',
      temperature: 0.3,
      reasoningOverride: 'max',
    }, { maxTokens: 512, creativeStrategy: 'deep-planning', reasoningStage: 'planning' })

    // 组一·endpoint 相关：代理地址不套用官方固定温度规则，模型温度原样保留。
    expect(resolved.temperature).toBe(0.3)
    expect(resolved.maxTokens).toBe(512)
    // 组二·模型能力相关：模型侧请求 max，该家族可取上限为 high —— 即便经代理也照发。
    expect(resolved.reasoning).toEqual({ adapter: 'openai-reasoning-effort', reasoningEffort: 'high' })
  })

  it.each([
    'api.moonshot.cn/v1',
    'http://api.moonshot.cn/v1',
    'ftp://api.moonshot.ai/v1',
  ])('keeps temperature but still emits reasoning for an invalid or non-HTTPS endpoint: %s', (baseUrl) => {
    const resolved = resolveGenerationParameters({
      ...openAIModel,
      provider: 'custom',
      baseUrl,
      modelName: 'kimi-k3',
      temperature: 0.3,
    }, { maxTokens: 512 })

    // 组一·endpoint 相关：非法或非 HTTPS 端点不算官方 Kimi 主机，固定温度规则不生效。
    expect(resolved.temperature).toBe(0.3)
    // 组二·模型能力相关：与 endpoint 无关。
    expect(resolved.reasoning).toEqual({ adapter: 'openai-reasoning-effort', reasoningEffort: 'low' })
  })

  it('maps the profile override through an exact verified model preset', () => {
    expect(resolveGenerationParameters({
      ...openAIModel,
      id: 'grok-4.5',
      provider: 'xai',
      modelName: 'grok-4.5',
      baseUrl: 'https://api.x.ai/v1',
      reasoningOverride: 'max',
    }, { maxTokens: 512, reasoningStage: 'drafting' })).toEqual({
      temperature: 1,
      maxTokens: 512,
      reasoning: { adapter: 'openai-reasoning-effort', reasoningEffort: 'high' },
    })
  })
})