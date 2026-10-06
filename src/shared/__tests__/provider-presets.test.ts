import { describe, expect, it } from 'vitest'

import {
  createProviderCatalog,
  resolveModelProfileCapabilities,
  resolveModelProfileReasoningMapping,
} from '../provider-presets'

describe('provider catalog', () => {
  it('exposes xAI Grok through its documented OpenAI-compatible preset', () => {
    const xai = createProviderCatalog().find((preset) => preset.provider === 'xai')

    expect(xai).toMatchObject({
      provider: 'xai',
      displayName: 'xAI(Grok)',
      baseUrl: 'https://api.x.ai/v1',
      protocol: 'openai',
    })
    expect(xai?.models).toContainEqual(expect.objectContaining({
      name: 'grok-4.5',
      maxTokens: 8192,
      capabilities: {
        contextWindowTokens: 500_000,
        maxOutputTokens: 8192,
        reasoning: true,
        structuredOutput: true,
        usage: true,
      },
      reasoningMapping: {
        adapter: 'openai-reasoning-effort',
        supportedEfforts: ['low', 'medium', 'high'],
        providerValues: { low: 'low', medium: 'medium', high: 'high' },
      },
    }))
  })

  it('resolves current DeepSeek facts through a supported API alias', () => {
    const legacy = {
      provider: 'deepseek',
      protocol: 'openai',
      baseUrl: 'https://api.deepseek.com/',
      modelName: 'deepseek-v4-flash',
      maxTokens: 100_000,
      capabilities: null,
    }

    expect(resolveModelProfileCapabilities(legacy)).toEqual({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 393_216,
      reasoning: true,
      structuredOutput: true,
      usage: true,
    })

    // 第三方中转按 provider+protocol+model 继承官方事实（含推理映射），端点不再参与匹配。
    expect(resolveModelProfileCapabilities({
      ...legacy,
      baseUrl: 'https://proxy.example.com/v1',
    })).toEqual({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 393_216,
      reasoning: true,
      structuredOutput: true,
      usage: true,
    })

    expect(resolveModelProfileCapabilities({
      ...legacy,
      protocol: 'gemini',
    })).toBeUndefined()

    const explicit = {
      contextWindowTokens: 32_768,
      maxOutputTokens: 2048,
      reasoning: true,
      structuredOutput: false,
      usage: false,
    }
    expect(resolveModelProfileCapabilities({ ...legacy, capabilities: explicit })).toEqual({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 393_216,
      reasoning: true,
      structuredOutput: true,
      usage: true,
    })

    expect(resolveModelProfileReasoningMapping(legacy)).toEqual({
      adapter: 'deepseek-v4-thinking',
      supportedEfforts: ['off', 'low', 'high', 'max'],
      providerValues: { off: 'disabled', low: 'low', high: 'high', max: 'max' },
      requestAliases: { medium: 'high' },
    })
  })

  it.each(['deepseek-flash', 'deepseek-v4.1-flash'])(
    'recognizes JSON output capability for DeepSeek V4.1 Flash model id %s',
    (modelName) => {
      expect(resolveModelProfileCapabilities({
        provider: 'deepseek',
        protocol: 'openai',
        baseUrl: 'https://api.deepseek.com',
        modelName,
      })).toEqual({
        contextWindowTokens: 1_048_576,
        maxOutputTokens: 393_216,
        reasoning: true,
        structuredOutput: true,
        usage: true,
      })
    },
  )

  it('offers current DeepSeek API model ids in its built-in catalog', () => {
    const deepseek = createProviderCatalog().find(preset => preset.provider === 'deepseek')

    expect(deepseek?.models.map(model => model.name)).toEqual([
      'deepseek-flash',
      'deepseek-v4-pro',
    ])
  })

  it.each([
    // 手动输入：大小写不同
    'GLM-5.3-FLASH',
    // 手动输入：部署变体后缀
    'glm-5.3-flash-32b',
    // 手动输入：日期后缀
    'glm-5.3-flash-0630',
    // 手动输入：分隔符/空格变体
    'glm5.3 flash',
    'glm_5.3_flash',
    // 手动输入：OpenRouter 风格路由后缀
    'glm-5.3-flash:free',
  ])('keeps the GLM reasoning mapping alive for manually entered model name %s', (modelName) => {
    expect(resolveModelProfileReasoningMapping({
      provider: 'bigmodel',
      protocol: 'openai',
      modelName,
    })).toEqual({
      adapter: 'glm-thinking',
      supportedEfforts: ['low', 'medium', 'high', 'max'],
      providerValues: { low: 'low', medium: 'medium', high: 'high', max: 'max' },
    })
    expect(resolveModelProfileCapabilities({
      provider: 'bigmodel',
      protocol: 'openai',
      modelName,
    })).toMatchObject({ reasoning: true, structuredOutput: true })
  })

  it('still rejects manually entered names that do not resolve to a preset model', () => {
    expect(resolveModelProfileReasoningMapping({
      provider: 'deepseek',
      protocol: 'openai',
      modelName: 'deepseek-chat',
    })).toBeUndefined()
    expect(resolveModelProfileReasoningMapping({
      provider: 'bigmodel',
      protocol: 'openai',
      modelName: 'gpt-4o',
    })).toBeUndefined()
  })

  it('publishes gemini-3.8-flash with the thinking-budget mapping and strength-suffix aliases', () => {
    const gemini = createProviderCatalog().find(preset => preset.provider === 'gemini')

    expect(gemini?.models).toContainEqual(expect.objectContaining({
      name: 'gemini-3.8-flash',
      capabilities: {
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 65_536,
        reasoning: true,
        structuredOutput: true,
        usage: true,
      },
      reasoningMapping: {
        adapter: 'gemini-thinking-budget',
        supportedEfforts: ['off', 'low', 'medium', 'high'],
        providerValues: { off: 0, low: 2048, medium: 16384, high: 49152 },
      },
    }))
  })

  it.each([
    'gemini-3.8-flash',
    'gemini-3.8-flash-high',
    'gemini-3.8-flash-low',
    'gemini-3.8-flash-thinking',
    'gemini-3.8-flash-0930',
    'GEMINI-3.8-FLASH',
  ])('resolves strength-suffixed gemini-3.8-flash name %s to the thinking-budget mapping', (modelName) => {
    const profile = { provider: 'gemini', protocol: 'gemini', modelName }
    expect(resolveModelProfileReasoningMapping(profile)).toMatchObject({
      adapter: 'gemini-thinking-budget',
      supportedEfforts: ['off', 'low', 'medium', 'high'],
    })
    expect(resolveModelProfileCapabilities(profile)).toMatchObject({
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 65_536,
      reasoning: true,
    })
  })

  it('extends the Gemini family to unlisted generations while keeping the 2.5 floor', () => {
    // 家族推断的目的就是让未收录的新代次也拿到映射；gemini-4.0-flash 正属此列。
    expect(resolveModelProfileReasoningMapping({
      provider: 'gemini',
      protocol: 'gemini',
      modelName: 'gemini-4.0-flash',
    })).toMatchObject({
      adapter: 'gemini-thinking-budget',
      supportedEfforts: ['off', 'low', 'medium', 'high'],
    })
    // 下限以下（gemini-2.0）仍不推断，避免对老模型盲发参数。
    expect(resolveModelProfileReasoningMapping({
      provider: 'gemini',
      protocol: 'gemini',
      modelName: 'gemini-2.0-flash',
    })).toBeUndefined()
  })

  it('publishes Gemini 2.5 Flash-Lite as one exact official capability fact', () => {
    const gemini = createProviderCatalog().find((preset) => preset.provider === 'gemini')

    expect(gemini).toMatchObject({
      baseUrl: 'https://generativelanguage.googleapis.com',
      protocol: 'gemini',
    })
    expect(gemini?.models).toContainEqual({
      name: 'gemini-2.5-flash-lite',
      maxTokens: 65_536,
      capabilities: {
        contextWindowTokens: 1_048_576,
        maxOutputTokens: 65_536,
        reasoning: true,
        structuredOutput: true,
        usage: true,
      },
      reasoningMapping: {
        adapter: 'gemini-thinking-budget',
        supportedEfforts: ['off', 'low', 'medium', 'high'],
        providerValues: { off: 0, low: 1_024, medium: 8_192, high: 24_576 },
      },
    })
    expect(resolveModelProfileCapabilities({
      provider: 'gemini',
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      modelName: 'gemini-2.5-flash-lite',
    })).toEqual(gemini?.models.find(model => model.name === 'gemini-2.5-flash-lite')?.capabilities)
  })
})
