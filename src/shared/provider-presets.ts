/**
 * 服务商预设配置 — 共享类型定义
 * 渲染进程与主进程共同使用，持久化在 ~/.vela/provider-presets.json
 */

import type { VerifiedReasoningMapping } from './reasoning-types'

/** 单个模型的预设 — name + 该模型的输出 token 上限 */
export interface ModelPreset {
  name: string
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
        name: 'deepseek-chat',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 8192, reasoning: false, structuredOutput: true, usage: true },
      },
      {
        name: 'deepseek-reasoner',
        maxTokens: 8192,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 8192, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'deepseek-v3',
        maxTokens: 65536,
        capabilities: { contextWindowTokens: 131072, maxOutputTokens: 65536, reasoning: true, structuredOutput: true, usage: true },
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'deepseek-v4-flash',
        maxTokens: 384_000,
        capabilities: {
          contextWindowTokens: 1_000_000,
          maxOutputTokens: 384_000,
          reasoning: true,
          structuredOutput: true,
          usage: true,
        },
        // https://api-docs.deepseek.com/guides/thinking_mode/
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
        },
      },
      {
        name: 'deepseek-v4-pro',
        maxTokens: 384_000,
        capabilities: {
          contextWindowTokens: 1_000_000,
          maxOutputTokens: 384_000,
          reasoning: true,
          structuredOutput: true,
          usage: true,
        },
        // https://api-docs.deepseek.com/guides/thinking_mode/
        reasoningMapping: {
          adapter: 'deepseek-v4-thinking',
          supportedEfforts: ['off', 'high', 'max'],
          providerValues: { off: 'disabled', high: 'high', max: 'max' },
          requestAliases: { low: 'high', medium: 'high' },
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
 * 归一化模型名：去掉日期/版本/修订后缀，回退到基础型号。
 * 第三方中转站常用 "模型名-YYYYMMDD" / "模型名-0731" / "模型名-vN" 命名，
 * 使其能继承官方预设的推理映射与能力。
 */
function normalizeModelNameForPreset(modelName: string): string {
  const name = modelName.trim()
  // 去掉常见日期/版本后缀：
  //   -0731 (MMDD) / -20250831 (YYYYMMDD) / -2025-08-31 (ISO) /
  //   -v2 / -beta / -latest / -turbo-preview 等
  const base = name
    .replace(/-(?:\d{4}|\d{6}|\d{8}|\d{4}-\d{2}-\d{2})$/u, '')
    .replace(/-(?:v|r|rc|beta|stable|latest)(\d*)$/iu, '')
    .replace(/-turbo-preview$/iu, '')
    .trim()
  return base
}

/**
 * Resolve verified built-in provider facts without mutating persisted data.
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

  const model = preset.models.find(candidate => candidate.name === modelName)
    ?? preset.models.find(candidate => candidate.name === normalizeModelNameForPreset(modelName))
  return validatedCapabilities(model?.capabilities)
}

/**
 * Resolve only provider request mappings whose endpoint and exact model slug
 * match an app-maintained built-in preset. User-entered capability flags are
 * operational hints and never become protocol evidence.
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
  if (!preset || preset.protocol !== protocol) return undefined

  // 推理参数格式由 协议 + 模型名 决定，与网关地址无关。
  // 第三方中转站/代理使用同名主流模型时，也应采用官方预设的推理映射；
  // 前提是 provider 与协议一致、且模型名精确命中官方预设目录。
  const mapping = preset.models.find(candidate => candidate.name === modelName)
    ?.reasoningMapping
    ?? preset.models.find(candidate => candidate.name === normalizeModelNameForPreset(modelName))
      ?.reasoningMapping
  if (!mapping) return undefined
  return {
    adapter: mapping.adapter,
    supportedEfforts: [...mapping.supportedEfforts],
    providerValues: { ...mapping.providerValues },
    ...(mapping.requestAliases ? { requestAliases: { ...mapping.requestAliases } } : {}),
  }
}
