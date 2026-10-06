import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveGenerationParameters } from '../generation-parameter-policy'
import { OpenAIProvider } from '../openai-provider'
import { GeminiProvider } from '../gemini-provider'
import type { ModelProfile } from '../../../src/shared/ipc-channels'
import type { ProviderReasoningDirective } from '../../../src/shared/reasoning-types'

/**
 * 「模型 → resolveReasoningPolicy → provider 真实请求体」的端到端护栏。
 *
 * 用户对推理强度适配的硬要求：不要说只是把 UI 渲染成已映射。收敛点就是这里——
 * 策略层产出 directive 之后，必须真的落进 HTTP 请求体；provider 落体某天被改坏或
 * 漏掉某个 adapter 时，这条链必须先红，而不是让用户以为已映射却什么都没发。
 *
 * fetch 全程用替身捕获，不发真实网络请求。
 */
type Stage = 'drafting' | 'planning' | 'review' | 'general'
type Strategy = 'auto' | 'fluent-drafting' | 'consistency-first' | 'deep-planning'

function makeModel(provider: string, protocol: string, modelName: string): ModelProfile {
  return {
    id: modelName,
    name: modelName,
    provider: provider as ModelProfile['provider'],
    protocol: protocol as ModelProfile['protocol'],
    modelName,
    apiKey: 'test-key',
    baseUrl: provider === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://example.test/v1',
    temperature: 0.7,
    maxTokens: 65_536,
    purposes: ['generation'],
  }
}

interface Captured {
  body: Record<string, unknown>
  directive: ProviderReasoningDirective | undefined
}

function readBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

/** 走完整链：策略层解析 → provider 组装请求体 → 替身 fetch 捕获。 */
async function captureOpenAI(
  model: ModelProfile,
  options: { maxTokens?: number; creativeStrategy?: Strategy; reasoningStage?: Stage; overrideReasoning?: boolean } = {},
): Promise<Captured> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
  })
  vi.stubGlobal('fetch', fetchMock)

  const params = resolveGenerationParameters(model, {
    maxTokens: options.maxTokens ?? 1024,
    creativeStrategy: options.creativeStrategy ?? 'auto',
    reasoningStage: options.reasoningStage ?? 'review',
  })
  const withReasoning = options.overrideReasoning !== false
  await new OpenAIProvider().generate(model, [{ role: 'user', content: '写一段正文' }], {
    maxTokens: params.maxTokens,
    // LLMGenerateOptions.temperature 是必需字段；本文件的夹具都不走官方 Kimi 主机，
    // 策略层必然给出数值。
    temperature: params.temperature ?? model.temperature,
    ...(withReasoning && params.reasoning ? { reasoning: params.reasoning } : {}),
  })
  return { body: readBody(fetchMock), directive: withReasoning ? params.reasoning : undefined }
}

async function captureGemini(
  model: ModelProfile,
  options: { maxTokens?: number; creativeStrategy?: Strategy; reasoningStage?: Stage } = {},
): Promise<Captured> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }),
  })
  vi.stubGlobal('fetch', fetchMock)

  const params = resolveGenerationParameters(model, {
    maxTokens: options.maxTokens ?? 1024,
    creativeStrategy: options.creativeStrategy ?? 'auto',
    reasoningStage: options.reasoningStage ?? 'review',
  })
  // LLMGenerateOptions.temperature 是必需字段；Gemini 不在 Kimi 固定温度规则内，
  // 策略层必然给出数值（undefined 只对官方 Kimi 主机成立）。
  await new GeminiProvider().generate(model, [{ role: 'user', content: '写一段正文' }], {
    maxTokens: params.maxTokens,
    temperature: params.temperature ?? model.temperature,
    ...(params.reasoning ? { reasoning: params.reasoning } : {}),
  })
  return { body: readBody(fetchMock), directive: params.reasoning }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('推理策略 → OpenAI 兼容请求体', () => {
  it('openai-reasoning-effort 落进 body.reasoning_effort（gpt-6.1-sol）', async () => {
    const { body, directive } = await captureOpenAI(makeModel('openai', 'openai', 'gpt-6.1-sol'))

    if (directive?.adapter !== 'openai-reasoning-effort') {
      throw new Error('期望解析出 openai-reasoning-effort 指令，实际 adapter=' + String(directive?.adapter))
    }
    expect(directive.reasoningEffort).toBe('high')
    expect(body.reasoning_effort).toBe('high')
    expect(body).not.toHaveProperty('thinking')
  })

  it('deepseek-v4-thinking enabled 时同时落 thinking.type 与 reasoning_effort', async () => {
    const { body, directive } = await captureOpenAI(makeModel('deepseek', 'openai', 'deepseek-v4-flash'))

    if (directive?.adapter !== 'deepseek-v4-thinking' || directive.thinking !== 'enabled') {
      throw new Error('期望解析出 deepseek-v4-thinking(enabled) 指令，实际 adapter=' + String(directive?.adapter))
    }
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe(directive.reasoningEffort)
  })

  it('deepseek-v4-thinking disabled 时只落 thinking.type，不带 reasoning_effort', async () => {
    const { body, directive } = await captureOpenAI(
      makeModel('deepseek', 'openai', 'deepseek-v4.1-flash'),
      { creativeStrategy: 'fluent-drafting', reasoningStage: 'drafting' },
    )

    expect(directive).toMatchObject({ adapter: 'deepseek-v4-thinking', thinking: 'disabled' })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body).not.toHaveProperty('reasoning_effort')
  })

  it('glm-thinking 落 thinking.type（glm-5.3-flash）', async () => {
    const { body, directive } = await captureOpenAI(makeModel('bigmodel', 'openai', 'glm-5.3-flash'))

    if (directive?.adapter !== 'glm-thinking' || directive.thinking !== 'enabled') {
      throw new Error('期望解析出 glm-thinking 指令，实际 adapter=' + String(directive?.adapter))
    }
    expect(body.thinking).toEqual({ type: 'enabled' })
    if (directive.reasoningEffort !== undefined) {
      expect(body.reasoning_effort).toBe(directive.reasoningEffort)
    } else {
      expect(body).not.toHaveProperty('reasoning_effort')
    }
  })

  it('自建网关 provider=custom 的 claude-opus-5-5 同样真实落体', async () => {
    const { body, directive } = await captureOpenAI(makeModel('custom', 'openai', 'claude-opus-5-5'))

    expect(directive?.adapter).toBe('glm-thinking')
    expect(body.thinking).toEqual({ type: 'enabled' })
  })

  it('NovelAI 即便解析出 directive 也不得发出推理字段（!isNovelAI 守卫）', async () => {
    // novelai 在家族推断排除清单里，但精确条目 gpt-5 仍会产出 directive —— 守卫必须挡住。
    const { body } = await captureOpenAI(makeModel('novelai', 'openai', 'gpt-5'))

    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('thinking')
  })
})

describe('推理策略 → Gemini 请求体', () => {
  it('gemini-thinking-budget 落进 generationConfig.thinkingConfig.thinkingBudget', async () => {
    const { body, directive } = await captureGemini(makeModel('gemini', 'gemini', 'gemini-3.8-flash-high'))

    // ProviderReasoningDirective 是判别联合：显式收窄后才能访问 thinkingBudget。
    if (directive?.adapter !== 'gemini-thinking-budget') {
      throw new Error('期望解析出 gemini-thinking-budget 指令，实际 adapter=' + String(directive?.adapter))
    }
    const generationConfig = body.generationConfig as Record<string, unknown>
    expect(generationConfig.thinkingConfig).toEqual({ thinkingBudget: directive.thinkingBudget })
    expect(typeof directive.thinkingBudget).toBe('number')
    expect(directive.thinkingBudget).toBeGreaterThan(0)
  })
})

describe('不支持时确实不发参数（不是 UI 假象）', () => {
  it('ollama 下未知模型：策略为 unsupported，请求体不含任何推理字段', async () => {
    const { body, directive } = await captureOpenAI(makeModel('ollama', 'openai', 'llama3.1:8b'))

    expect(directive).toBeUndefined()
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('thinking')
  })

  it('Gemini 侧同样：未支持的模型不写 thinkingConfig', async () => {
    const { body, directive } = await captureGemini(makeModel('gemini', 'gemini', 'gemini-2.0-flash'))

    expect(directive).toBeUndefined()
    const generationConfig = body.generationConfig as Record<string, unknown>
    expect(generationConfig).not.toHaveProperty('thinkingConfig')
  })
})

describe('判别力自证', () => {
  it('同一模型与阶段：交给 provider 时才出现字段，不交时必然缺席', async () => {
    const model = makeModel('openai', 'openai', 'gpt-6.1-sol')

    const wired = await captureOpenAI(model)
    expect(wired.directive).toBeDefined()
    expect(wired.body.reasoning_effort).toBe('high')

    // 等价于「provider 落体分支被注释掉 / directive 未接线」：同一策略解析结果不交给 provider。
    const unwired = await captureOpenAI(model, { overrideReasoning: false })
    expect(unwired.body).not.toHaveProperty('reasoning_effort')
    expect(unwired.body).not.toHaveProperty('thinking')
  })
})