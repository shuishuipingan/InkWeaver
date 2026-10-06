/**
 * 服务商预设配置 — 共享类型定义
 * 渲染进程与主进程共同使用，持久化在 ~/.vela/provider-presets.json
 */

import type { VerifiedReasoningMapping } from './reasoning-types'

/** 单个模型的预设 — name + 该模型的输出 token 上限 */
export interface ModelPreset {
  name: string
  /** API ids the provider documents as compatible with this model; not shown as separate choices. */
  compatibilityAliases?: readonly string[]
  /** Display names from existing profiles; grant capabilities but still require endpoint verification. */
  capabilityAliases?: readonly string[]
  /** Model-specific capability metadata. `maxTokens` remains the legacy output limit. */
  capabilities?: ModelCapabilities
  /** Provider request mapping verified against the official model documentation. */
  reasoningMapping?: VerifiedReasoningMapping
  maxTokens: number
}

/** Optional capabilities supported by a model endpoint. */
export interface ModelCapabilities {
  /** `null` means the endpoint has not declared a context window. */
  contextWindowTokens: number | null
  maxOutputTokens: number
  reasoning: boolean
  structuredOutput: boolean
  usage: boolean
}

/** Persisted profile fields needed to resolve effective built-in capabilities. */
export interface ModelCapabilityProfile {
  provider?: unknown
  protocol?: unknown
  baseUrl?: unknown
  modelName?: unknown
  maxTokens?: unknown
  capabilities?: ModelCapabilities | null
}

/** 单个服务商的预设配置 */
export interface ProviderPreset {
  /** 服务商唯一标识（内置值如 openai/deepseek，用户可自定义如 my-proxy） */
  provider: string
  /** 界面显示名称，缺省时使用 provider ID */
  displayName?: string
  /** 默认 API 地址 */
  baseUrl: string
  /** 默认调用协议：openai 兼容 或 gemini 原生 */
  protocol: string
  /** 支持的生成模型列表（含各自的 maxTokens） */
  models: ModelPreset[]
  /** 支持的向量模型列表（embedding 模型不需要 maxTokens） */
  embeddingModels: string[]
  /** 向量模型的能力元数据，按模型 ID 索引以保持旧的 string[] 配置兼容。 */
  embeddingModelCapabilities?: Record<string, ModelCapabilities>
}

/**
 * 创建内置服务商目录。
 *
 * 每次调用均返回新的对象，方便调用方安全地派生 UI 状态而不污染全局预设。
 */
export function createProviderCatalog(): ProviderPreset[] {
  return [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    protocol: 'openai',
    models: [
      {
        name: 'gpt-5.6',
        maxTokens: 128000,
        capabilities: { contextWindowTokens: 400000, maxOutputTokens: 128000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-5.5',
        maxTokens: 128000,
        capabilities: { contextWindowTokens: 400000, maxOutputTokens: 128000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-5.4',
        maxTokens: 128000,
        capabilities: { contextWindowTokens: 400000, maxOutputTokens: 128000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-5.4-nano',
        maxTokens: 64000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 64000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-5',
        maxTokens: 128000,
        capabilities: { contextWindowTokens: 400000, maxOutputTokens: 128000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-4o',
        maxTokens: 16384,
        capabilities: { contextWindowTokens: 128000, maxOutputTokens: 16384, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-4o-mini',
        maxTokens: 16384,
        capabilities: { contextWindowTokens: 128000, maxOutputTokens: 16384, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-4-turbo',
        maxTokens: 4096,
        capabilities: { contextWindowTokens: 128000, maxOutputTokens: 4096, reasoning: false, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'gpt-3.5-turbo',
        maxTokens: 4096,
        capabilities: { contextWindowTokens: 16385, maxOutputTokens: 4096, reasoning: false, structuredOutput: true, usage: true },
      },
      {
        name: 'o3',
        maxTokens: 100000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 100000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'o3-mini',
        maxTokens: 100000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 100000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'o4-mini',
        maxTokens: 100000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 100000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
    ],
    embeddingModels: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  },
  {
    provider: 'xai',
    displayName: 'xAI(Grok)',
    baseUrl: 'https://api.x.ai/v1',
    protocol: 'openai',
    models: [
      {
        name: 'grok-5',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 500000, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'grok-4.5',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 500000, maxOutputTokens: 8192, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'grok-4',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 500000, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
    ],
    embeddingModels: [],
  },
  {
    provider: 'siliconflow',
    displayName: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'openai',
    models: [],
    embeddingModels: ['BAAI/bge-m3'],
    embeddingModelCapabilities: {
      'BAAI/bge-m3': {
        contextWindowTokens: 8192,
        maxOutputTokens: 0,
        reasoning: false,
        structuredOutput: false,
        usage: true,
      },
    },
  },
  {
    provider: 'novelai',
    displayName: 'NovelAI',
    baseUrl: 'https://text.novelai.net/oa',
    protocol: 'openai',
    models: [],
    embeddingModels: [],
  },
  {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    protocol: 'openai',
    models: [
      {
        name: 'deepseek-flash',
        compatibilityAliases: [
          'deepseek-v4-flash',
          'deepseek-v4-flash-vision-exp',
        ],
        capabilityAliases: ['deepseek-v4.1-flash'],
        maxTokens: 393_216,
        capabilities: {
          contextWindowTokens: 1_048_576,
          maxOutputTokens: 393_216,
          reasoning: true,
          structuredOutput: true,
          usage: true,
        },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'low', 'high', 'max'],
          providerValues: { off: 'disabled', low: 'low', high: 'high', max: 'max' },
          requestAliases: { medium: 'high' },
        },
      },
      {
        name: 'deepseek-v4-pro',
        maxTokens: 393_216,
        capabilities: {
          contextWindowTokens: 1_048_576,
          maxOutputTokens: 393_216,
          reasoning: true,
          structuredOutput: true,
          usage: true,
        },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'low', 'high', 'max'],
          providerValues: { off: 'disabled', low: 'low', high: 'high', max: 'max' },
          requestAliases: { medium: 'high' },
        },
      },
    ],
    embeddingModels: [],
  },
  {
    /** 智谱 BigModel — OpenAI 兼容协议，API 路径为 /v4 */
    provider: 'bigmodel',
    displayName: 'BigModel（智谱）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'openai',
    models: [
      {
        name: 'glm-5.3',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 1000000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        // GLM-5.3 强制思考（thinking.type=disabled 会报错），仅支持 reasoning_effort max/high/low
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['low', 'medium', 'high', 'max'],
          providerValues: { low: 'low', medium: 'medium', high: 'high', max: 'max' },
        },
      },
      {
        name: 'glm-5.3-flash',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 1000000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['low', 'medium', 'high', 'max'],
          providerValues: { low: 'low', medium: 'medium', high: 'high', max: 'max' },
        },
      },
      {
        name: 'glm-5.2',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 1000000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        // GLM-5.2 支持 reasoning_effort：max/xhigh/high/medium/low/minimal/none
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'low', 'medium', 'high', 'max'],
          providerValues: { off: 'disabled', low: 'low', medium: 'medium', high: 'high', max: 'max' },
        },
      },
      {
        name: 'glm-5.1',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-5',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-5-turbo',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.7',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.7-flashx',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.7-flash',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.6',
        maxTokens: 131072,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 131072, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.5',
        maxTokens: 98304,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 98304, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.5-air',
        maxTokens: 98304,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 98304, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.5-airx',
        maxTokens: 98304,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 98304, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4.5-flash',
        maxTokens: 98304,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 98304, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'glm-4-long',
        maxTokens: 4096,
        capabilities: { contextWindowTokens: 1000000, maxOutputTokens: 4096, reasoning: false, structuredOutput: false, usage: true },
      },
    ],
    embeddingModels: ['embedding-3'],
  },
  {
    provider: 'gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    protocol: 'gemini',
    models: [
      {
        name: 'gemini-2.5-flash-lite',
        maxTokens: 65536,
        capabilities: {
          contextWindowTokens: 1_048_576,
          maxOutputTokens: 65_536,
          reasoning: true,
          structuredOutput: true,
          usage: true,
        },
        // https://ai.google.dev/gemini-api/docs/generate-content/thinking
        reasoningMapping: {
          adapter: 'gemini-thinking-budget',
          supportedEfforts: ['off', 'low', 'medium', 'high'],
          providerValues: { off: 0, low: 1_024, medium: 8_192, high: 24_576 },
        },
      },
      {
        name: 'gemini-3.1-pro-preview',
        maxTokens: 65536,
        capabilities: { contextWindowTokens: 1000000, maxOutputTokens: 65536, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'gemini-thinking-budget',
          supportedEfforts: ['off', 'low', 'medium', 'high'],
          providerValues: { off: 0, low: 2048, medium: 16384, high: 49152 },
        },
      },
      {
        name: 'gemini-3-flash-preview',
        maxTokens: 65536,
        capabilities: { contextWindowTokens: 1000000, maxOutputTokens: 65536, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'gemini-thinking-budget',
          supportedEfforts: ['off', 'low', 'medium', 'high'],
          providerValues: { off: 0, low: 2048, medium: 16384, high: 49152 },
        },
      },
      {
        // 手输名常带强度别名后缀（gemini-3.8-flash-high / -low），映射由
        // thinkingConfig.thinkingBudget 承担，模型名后缀只影响预设命中。
        name: 'gemini-3.8-flash',
        compatibilityAliases: ['gemini-3.8-flash-pro'],
        capabilityAliases: ['gemini-3.8-flash-thinking'],
        maxTokens: 65536,
        capabilities: { contextWindowTokens: 1000000, maxOutputTokens: 65536, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'gemini-thinking-budget',
          supportedEfforts: ['off', 'low', 'medium', 'high'],
          providerValues: { off: 0, low: 2048, medium: 16384, high: 49152 },
        },
      },
    ],
    embeddingModels: ['text-embedding-004'],
  },
  {
    provider: 'ollama',
    displayName: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    protocol: 'openai',
    models: [
      { name: 'qwen3-14b-abliterated-novel-q4', maxTokens: 8192 },
      { name: 'llama3.3', maxTokens: 4096 },
      { name: 'llama3.2', maxTokens: 4096 },
      { name: 'qwen2.5', maxTokens: 8192 },
      { name: 'qwen2.5-coder', maxTokens: 8192 },
      { name: 'mistral', maxTokens: 4096 },
      { name: 'phi4', maxTokens: 4096 },
      { name: 'gemma3', maxTokens: 8192 },
    ],
    embeddingModels: ['nomic-embed-text', 'mxbai-embed-large', 'bge-m3'],
  },
  {
    provider: 'qwen',
    displayName: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'openai',
    models: [
      {
        name: 'qwen3.8-flash-next',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'qwen3.8',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'qwen3-max',
        maxTokens: 16384,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 16384, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'qwen3-coder',
        maxTokens: 16384,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 16384, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'qwen3-flash',
        maxTokens: 16384,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 16384, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'qwen2.5-max',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 32768, maxOutputTokens: 8192, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'qwen2.5-72b-instruct',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 8192, reasoning: false, structuredOutput: true, usage: true },
      },
      {
        name: 'qwen2.5-32b-instruct',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 8192, reasoning: false, structuredOutput: true, usage: true },
      },
    ],
    embeddingModels: ['text-embedding-v3', 'text-embedding-v4'],
  },
  {
    provider: 'moonshot',
    displayName: 'Moonshot（Kimi）',
    baseUrl: 'https://api.moonshot.cn/v1',
    protocol: 'openai',
    models: [
      {
        name: 'kimi-k3',
        maxTokens: 65536,
        capabilities: { contextWindowTokens: 262144, maxOutputTokens: 65536, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'kimi-k2.7',
        maxTokens: 65536,
        capabilities: { contextWindowTokens: 262144, maxOutputTokens: 65536, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'kimi-k2.6',
        maxTokens: 65536,
        capabilities: { contextWindowTokens: 262144, maxOutputTokens: 65536, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'kimi-k2.5',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'kimi-k2',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'kimi-k2-turbo-preview',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'moonshot-v1-32k',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 32768, maxOutputTokens: 8192, reasoning: false, structuredOutput: true, usage: true },
      },
      {
        name: 'moonshot-v1-128k',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 8192, reasoning: false, structuredOutput: true, usage: true },
      },
    ],
    embeddingModels: [],
  },
  {
    provider: 'anthropic',
    displayName: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    protocol: 'openai',
    models: [
      {
        name: 'claude-opus-4.8',
        maxTokens: 64000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 64000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'claude-opus-4.6',
        maxTokens: 64000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 64000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'claude-opus-4.5',
        maxTokens: 64000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 64000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'claude-sonnet-4.5',
        maxTokens: 64000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 64000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'claude-sonnet-4',
        maxTokens: 64000,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 64000, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'claude-3-7-sonnet',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 8192, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'claude-3-5-sonnet',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 8192, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'claude-3-opus',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 200000, maxOutputTokens: 8192, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'glm-thinking',
          supportedEfforts: ['off', 'high'],
          providerValues: { off: 'disabled', high: 'enabled' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
    ],
    embeddingModels: [],
  },
  {
    provider: 'mistral',
    displayName: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    protocol: 'openai',
    models: [
      {
        name: 'mistral-large',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'openai-reasoning-effort',
          supportedEfforts: ['low', 'medium', 'high'],
          providerValues: { low: 'low', medium: 'medium', high: 'high' },
        },
      },
      {
        name: 'mistral-small',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: false, structuredOutput: true, usage: true },
      },
      {
        name: 'mistral-medium',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: false, structuredOutput: true, usage: true },
      },
      {
        name: 'codestral',
        maxTokens: 32768,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 32768, reasoning: false, structuredOutput: true, usage: true },
      },
    ],
    embeddingModels: ['mistral-embed'],
  },
  {
    provider: 'custom',
    displayName: '自定义',
    baseUrl: '',
    protocol: 'openai',
    models: [],
    embeddingModels: [],
  },
  ]
}

/** 内置默认预设（首次启动时写入持久化文件） */
export const BUILTIN_PRESETS: ProviderPreset[] = createProviderCatalog()

function validatedCapabilities(value: unknown): ModelCapabilities | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<ModelCapabilities>
  const validContext = candidate.contextWindowTokens === null
    || (Number.isSafeInteger(candidate.contextWindowTokens) && Number(candidate.contextWindowTokens) > 0)
  if (
    !validContext
    || !Number.isSafeInteger(candidate.maxOutputTokens)
    || Number(candidate.maxOutputTokens) <= 0
    || typeof candidate.reasoning !== 'boolean'
    || typeof candidate.structuredOutput !== 'boolean'
    || typeof candidate.usage !== 'boolean'
  ) return undefined
  return {
    contextWindowTokens: candidate.contextWindowTokens as number | null,
    maxOutputTokens: candidate.maxOutputTokens as number,
    reasoning: candidate.reasoning,
    structuredOutput: candidate.structuredOutput,
    usage: candidate.usage,
  }
}

/**
 * 归一化模型名：去掉日期/版本/修订后缀与路由后缀，回退到基础型号，并做
 * 大小写与分隔符折叠。第三方中转站常用 "模型名-YYYYMMDD" / "模型名-0731" /
 * "模型名-vN" / "模型名:free"（OpenRouter 风格）命名，或直接改变大小写，
 * 使手输名也能继承官方预设的推理映射与能力。
 */
function normalizeModelNameForPreset(modelName: string): string {
  const name = modelName.trim().toLocaleLowerCase()
  // 去掉常见日期/版本后缀：
  //   -0731 (MMDD) / -20250831 (YYYYMMDD) / -2025-08-31 (ISO) /
  //   -v2 / -beta / -latest / -turbo-preview 等
  const base = name
    .replace(/-(?:\d{4}|\d{6}|\d{8}|\d{4}-\d{2}-\d{2})$/u, '')
    .replace(/-(?:v|r|rc|beta|stable|latest)(\d*)$/iu, '')
    .replace(/-turbo-preview$/iu, '')
    // OpenRouter 风格路由后缀：":free" / ":extended" / ":nitro" 等
    .replace(/:[a-z0-9-]+$/iu, '')
    .trim()
  return base
}

/**
 * 折叠后的比较键：小写并去掉空格、点号、连字符与下划线。
 * 手动输入的 "GLM5.3 FLASH" / "glm_5_3_flash" 与预设 "glm-5.3-flash"
 * 指向同一官方模型时，映射不再因为拼写风格差异而失效。
 */
function presetModelKey(modelName: string): string {
  return modelName.replace(/[\s._-]+/gu, '')
}

function findPresetModel(preset: ProviderPreset, modelName: string): ModelPreset | undefined {
  const normalizedName = normalizeModelNameForPreset(modelName)
  const typedKey = presetModelKey(modelName)
  const normalizedKey = presetModelKey(normalizedName)
  const exact = preset.models.find(candidate => candidate.name === modelName)
    ?? preset.models.find(candidate => candidate.compatibilityAliases?.includes(modelName))
    ?? preset.models.find(candidate => candidate.capabilityAliases?.includes(modelName))
    ?? preset.models.find(candidate => candidate.name === normalizedName)
    ?? preset.models.find(candidate => candidate.compatibilityAliases?.includes(normalizedName))
    ?? preset.models.find(candidate => candidate.capabilityAliases?.includes(normalizedName))
    ?? (typedKey.length < 3 ? undefined : preset.models.find(candidate => (
      candidate.name === typedKey
      || presetModelKey(candidate.name) === normalizedKey
      || candidate.compatibilityAliases?.some(alias => presetModelKey(alias) === normalizedKey)
      || candidate.capabilityAliases?.some(alias => presetModelKey(alias) === normalizedKey)
    )))
  if (exact) return exact
  // 前缀回退：手输名常带部署变体后缀（如 glm-5.3-flash-32b、deepseek-flash-turbo）。
  // 多个预设同为前缀时取最长命中（glm-5.3-flash-32b 命中 glm-5.3-flash 而非 glm-5.3），
  // 无任何前缀命中则放弃。
  const prefixed = preset.models
    .filter(candidate => (
      normalizedKey.startsWith(presetModelKey(candidate.name))
      && presetModelKey(candidate.name).length >= 3
    ))
    .sort((left, right) => presetModelKey(right.name).length - presetModelKey(left.name).length)
  return prefixed[0]
}

/** Whether the saved model id is documented as an API id or accepted compatibility alias. */
export function isKnownModelProfileApiId(profile: ModelCapabilityProfile): boolean {
  if (
    typeof profile.provider !== 'string'
    || typeof profile.protocol !== 'string'
    || typeof profile.modelName !== 'string'
  ) return false

  const preset = BUILTIN_PRESETS.find(candidate => candidate.provider === profile.provider)
  if (!preset || preset.protocol !== profile.protocol) return false

  // 与 findPresetModel 同一套归一化（大小写、分隔符、部署/日期/路由后缀）。
  // capabilityAliases（旧显示名）仍要求端点验证，不计入“官方已验证 API id”。
  const modelName = profile.modelName.trim()
  const normalizedName = normalizeModelNameForPreset(modelName)
  const typedKey = presetModelKey(modelName)
  const normalizedKey = presetModelKey(normalizedName)
  const matched = findPresetModel(preset, modelName)
  if (!matched) return false
  const official = [matched.name, ...(matched.compatibilityAliases ?? [])]
  const foldedOfficial = [
    presetModelKey(matched.name),
    ...(matched.compatibilityAliases ?? []).map(alias => presetModelKey(alias)),
  ]
  return official.includes(modelName)
    || official.includes(normalizedName)
    || foldedOfficial.includes(normalizedKey)
    || (typedKey.length >= 3 && foldedOfficial.includes(typedKey))
}

/**
 * Resolve verified built-in provider facts for official ids, documented aliases,
 * and known display-name aliases without mutating persisted data.
 * User-stored capabilities and output limits are operational policy, not proof
 * of what a provider endpoint supports, so they never override this result.
 */
export function resolveModelProfileCapabilities(
  profile: ModelCapabilityProfile,
): ModelCapabilities | undefined {
  if (
    typeof profile.provider !== 'string'
    || typeof profile.protocol !== 'string'
    || typeof profile.modelName !== 'string'
  ) return undefined

  const provider = profile.provider
  const protocol = profile.protocol
  const modelName = profile.modelName.trim()
  const preset = BUILTIN_PRESETS.find(candidate => candidate.provider === provider)
  if (!preset || preset.protocol !== protocol) {
    return undefined
  }

  const model = findPresetModel(preset, modelName)
  return validatedCapabilities(model?.capabilities)
}

// ===== 推理强度家族推断 =====
//
// 精确命中永远优先（见下方 resolveModelProfileReasoningMapping）。这里是**兜底**：
// 头部厂商不断出新模型（gpt-6.1-sol、claude-opus-5-5…），逐个手写条目既跟不上也不需要——
// 适配器其实是按 provider + 模型家族聚集的。新增一个家族只需在下表加一行，
// 不必理解下游的 effort 映射、协议判定或 UI 展示逻辑。

/** 与同类精确条目**逐字一致**的映射常量：家族规则只引用它们，不另行定义取值。 */
const REASONING_MAPPING_OPENAI_EFFORT: VerifiedReasoningMapping = {
  adapter: 'openai-reasoning-effort',
  supportedEfforts: ['low', 'medium', 'high'],
  providerValues: { low: 'low', medium: 'medium', high: 'high' },
}
/** 与 gemini-3 系条目逐字一致（数字 thinkingBudget）。 */
const REASONING_MAPPING_GEMINI_BUDGET: VerifiedReasoningMapping = {
  adapter: 'gemini-thinking-budget',
  supportedEfforts: ['off', 'low', 'medium', 'high'],
  providerValues: { off: 0, low: 2048, medium: 16384, high: 49152 },
}
/** 与 deepseek-flash / deepseek-v4-pro 条目逐字一致。 */
const REASONING_MAPPING_DEEPSEEK_THINKING: VerifiedReasoningMapping = {
  adapter: 'deepseek-v4-thinking',
  supportedEfforts: ['off', 'low', 'high', 'max'],
  providerValues: { off: 'disabled', low: 'low', high: 'high', max: 'max' },
  requestAliases: { medium: 'high' },
}
/** 与 qwen3-max 等条目逐字一致（注意与 deepseek 家族的取值并不相同）。 */
const REASONING_MAPPING_QWEN_THINKING: VerifiedReasoningMapping = {
  adapter: 'deepseek-v4-thinking',
  supportedEfforts: ['off', 'high', 'max'],
  providerValues: { off: 'disabled', high: 'high', max: 'max' },
  requestAliases: { low: 'high', medium: 'high' },
}
/**
 * 与 glm-5.3 条目逐字一致：GLM-5.3 强制思考、**不接受 thinking.type=disabled**，
 * 因此家族兜底刻意不含 off —— 对尚不清楚是否支持关闭思考的新代次，宁可少一档，
 * 也不盲发 disabled 把用户的请求打报错（用户选 off 时 closestEffectiveEffort 会降到 low）。
 */
const REASONING_MAPPING_GLM_EFFORT: VerifiedReasoningMapping = {
  adapter: 'glm-thinking',
  supportedEfforts: ['low', 'medium', 'high', 'max'],
  providerValues: { low: 'low', medium: 'medium', high: 'high', max: 'max' },
}
/** 与 claude-sonnet-4.5 等条目逐字一致（thinking.type 开关）。 */
const REASONING_MAPPING_ANTHROPIC_THINKING: VerifiedReasoningMapping = {
  adapter: 'glm-thinking',
  supportedEfforts: ['off', 'high'],
  providerValues: { off: 'disabled', high: 'enabled' },
  requestAliases: { low: 'high', medium: 'high' },
}

/** 一条家族规则：provider（+协议）与归一化模型名前缀命中时，复用给定的映射。 */
export interface ReasoningFamilyRule {
  /** 规则归属的 provider；provider 命中时只在该 provider 内匹配。 */
  readonly provider: string
  /** 该家族要求的调用协议（参数格式由协议决定，缺省不限制）。 */
  readonly protocol: 'openai' | 'gemini'
  /** 归一化（大小写/分隔符折叠）后的模型名前缀；必须取**该家族从该版本起确定为推理模型**的下限。 */
  readonly prefixes: readonly string[]
  /** 人类可读的家族说明。 */
  readonly family: string
  readonly mapping: VerifiedReasoningMapping
}

/**
 * 家族规则表（数据驱动、可被测试直接导入）。
 *
 * 收录门槛是**「该家族从该版本起，全部型号都确定支持该 adapter」**，而不是"看起来像"：
 * 只要家族内部支持面不一致，就宁可让新模型显示"不支持"，也绝不盲发参数把用户的 API 打报错。
 * 目录里已有的精确条目永远优先，这里的下限只负责"目录尚未收录的新代次"。
 *
 * 已知被刻意排除的家族（都有实证）：
 * - **mistral**：large/small/medium/codestral 参数集不同（mistral-medium-2505 不支持 reasoning_effort）。
 * - **moonshot moonshot-v1-***：目录条目 reasoning=false 且无 reasoningMapping。
 * - **GLM 家族**：同族对 off 的支持面不一致（4.5 系与 5.2 含 off；5.3 强制思考、无 off），
 *   故家族兜底统一采用**不含 off** 的最保守取值。
 * - **DeepSeek R 系**：官方 API 不通过 reasoning_effort 暴露思考强度，拿不准故不推断。
 * - **OpenAI o1 / o2**：o1-preview / o1-mini 不接受 reasoning_effort，故从 o3 起。
 * - **claude-2 及更早**：无 thinking 参数，故从 claude-3 起（两套命名都覆盖）。
 */
export const REASONING_FAMILY_RULES: readonly ReasoningFamilyRule[] = Object.freeze([
  {
    provider: 'openai',
    protocol: 'openai',
    family: 'OpenAI gpt-5+ / o3 及以后',
    prefixes: ['gpt-5', 'gpt-6', 'gpt-7', 'gpt-8', 'gpt-9', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9'],
    mapping: REASONING_MAPPING_OPENAI_EFFORT,
  },
  {
    provider: 'xai',
    protocol: 'openai',
    family: 'xAI Grok 4+',
    prefixes: ['grok-4', 'grok-5', 'grok-6', 'grok-7', 'grok-8', 'grok-9'],
    mapping: REASONING_MAPPING_OPENAI_EFFORT,
  },
  {
    provider: 'moonshot',
    protocol: 'openai',
    family: 'Moonshot Kimi K2+',
    prefixes: ['kimi-k2', 'kimi-k3', 'kimi-k4', 'kimi-k5', 'kimi-k6', 'kimi-k7', 'kimi-k8', 'kimi-k9'],
    mapping: REASONING_MAPPING_OPENAI_EFFORT,
  },
  {
    provider: 'gemini',
    protocol: 'gemini',
    family: 'Gemini 2.5+ 思考预算（同一参数，仅预算数值随代次不同）',
    prefixes: ['gemini-2.5', 'gemini-3', 'gemini-4', 'gemini-5', 'gemini-6', 'gemini-7', 'gemini-8', 'gemini-9'],
    mapping: REASONING_MAPPING_GEMINI_BUDGET,
  },
  {
    provider: 'deepseek',
    protocol: 'openai',
    family: 'DeepSeek V4+',
    prefixes: ['deepseek-v4', 'deepseek-v5', 'deepseek-v6', 'deepseek-v7', 'deepseek-v8', 'deepseek-v9'],
    mapping: REASONING_MAPPING_DEEPSEEK_THINKING,
  },
  {
    provider: 'qwen',
    protocol: 'openai',
    family: 'Qwen 3+（qwen2.5 及更早不推断）',
    prefixes: ['qwen3', 'qwen4', 'qwen5', 'qwen6', 'qwen7', 'qwen8', 'qwen9'],
    mapping: REASONING_MAPPING_QWEN_THINKING,
  },
  {
    provider: 'bigmodel',
    protocol: 'openai',
    family: 'GLM 4.5+ / 5+ / 6+（不含 off，见上方常量的说明）',
    prefixes: ['glm-4.5', 'glm-5', 'glm-6', 'glm-7', 'glm-8', 'glm-9'],
    mapping: REASONING_MAPPING_GLM_EFFORT,
  },
  {
    provider: 'anthropic',
    protocol: 'openai',
    family: 'Claude 3+（thinking.type 开关；含 claude-opus/sonnet/haiku-N 两种命名）',
    prefixes: [
      'claude-3', 'claude-4', 'claude-5', 'claude-6', 'claude-7', 'claude-8', 'claude-9',
      'claude-opus-4', 'claude-opus-5', 'claude-opus-6', 'claude-opus-7', 'claude-opus-8', 'claude-opus-9',
      'claude-sonnet-4', 'claude-sonnet-5', 'claude-sonnet-6', 'claude-sonnet-7', 'claude-sonnet-8', 'claude-sonnet-9',
      'claude-haiku-4', 'claude-haiku-5', 'claude-haiku-6', 'claude-haiku-7', 'claude-haiku-8', 'claude-haiku-9',
    ],
    mapping: REASONING_MAPPING_ANTHROPIC_THINKING,
  },
])

/**
 * 明确不参与家族推断的 provider：本地推理与聚合网关的参数透传行为不可预期，
 * 盲发推理参数的风险高于收益。
 */
export const REASONING_FAMILY_EXCLUDED_PROVIDERS: readonly string[] = Object.freeze([
  'ollama',
  'siliconflow',
  'novelai',
])

function cloneReasoningMapping(mapping: VerifiedReasoningMapping): VerifiedReasoningMapping {
  return {
    adapter: mapping.adapter,
    supportedEfforts: [...mapping.supportedEfforts],
    providerValues: { ...mapping.providerValues },
    ...(mapping.requestAliases ? { requestAliases: { ...mapping.requestAliases } } : {}),
  }
}

/**
 * 家族推断：精确条目未命中时的兜底。
 *
 * - provider 命中规则表时，只在该 provider 的规则里按前缀匹配；
 * - provider 为 custom 或不在规则表内（自建网关）时，仅按模型名匹配——模型名是用户自己填写的，
 *   gpt/claude/gemini 这类名字本身就携带了参数格式信息；
 * - ollama / siliconflow / novelai 与协议不匹配的情形一律返回 undefined（不猜）。
 */
function resolveReasoningFamilyMapping(
  provider: string,
  protocol: string,
  modelName: string,
): VerifiedReasoningMapping | undefined {
  if (REASONING_FAMILY_EXCLUDED_PROVIDERS.includes(provider)) return undefined
  const normalizedKey = presetModelKey(normalizeModelNameForPreset(modelName))
  if (!normalizedKey) return undefined
  // 必须先分清两类 provider，否则"内置但没有家族规则"的会被别的 provider 的前缀规则串台
  // （例如收紧后被删掉规则的 mistral-large-3 曾被按模型名跨 family 命中）：
  // - 目录里**本来就有模型条目**的内置 provider：没有自己的家族规则就不猜；
  // - 真正的自建网关（custom、或目录里没有模型条目的 provider）：按模型名匹配。
  const preset = BUILTIN_PRESETS.find(candidate => candidate.provider === provider)
  const isCuratedProvider = preset !== undefined && preset.protocol === protocol && preset.models.length > 0
  const providerHasRules = REASONING_FAMILY_RULES.some(rule => rule.provider === provider)
  if (isCuratedProvider && !providerHasRules) return undefined
  for (const rule of REASONING_FAMILY_RULES) {
    if (isCuratedProvider && rule.provider !== provider) continue
    if (rule.protocol !== protocol) continue
    if (rule.prefixes.some(prefix => normalizedKey.startsWith(presetModelKey(prefix)))) return rule.mapping
  }
  return undefined
}

/**
 * Resolve only provider request mappings whose provider, protocol, and model id
 * match an app-maintained preset or vetted alias. User-entered capability flags
 * are operational hints and never become protocol evidence.
 */
export function resolveModelProfileReasoningMapping(
  profile: ModelCapabilityProfile,
): VerifiedReasoningMapping | undefined {
  if (
    typeof profile.provider !== 'string'
    || typeof profile.protocol !== 'string'
    || typeof profile.modelName !== 'string'
  ) return undefined

  const provider = profile.provider
  const protocol = profile.protocol
  const modelName = profile.modelName.trim()
  const preset = BUILTIN_PRESETS.find(candidate => candidate.provider === provider)
  // 自建 provider 没有内置预设，交给家族规则按模型名判断；内置 provider 仍要求协议一致。
  if (preset && preset.protocol !== protocol) return undefined

  // 推理参数格式由 协议 + 模型名 决定，与网关地址无关。
  // 第三方中转站/代理使用同名主流模型时，也应采用官方预设的推理映射；
  // 前提是 provider 与协议一致、且模型名精确命中官方预设目录。
  const mapping = preset ? findPresetModel(preset, modelName)?.reasoningMapping : undefined
  if (mapping) return cloneReasoningMapping(mapping)
  // 精确未命中：按模型家族兜底（新模型无需逐个登记）。返回的取值与同类精确条目逐字一致。
  const family = resolveReasoningFamilyMapping(provider, protocol, modelName)
  return family ? cloneReasoningMapping(family) : undefined
}
