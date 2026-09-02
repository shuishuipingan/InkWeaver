/**
 * ModelCapabilityProbe — 自定义模型能力自动探测
 *
 * 模仿 DeepSeek Harness 的模型发现机制，对用户自定义接入的模型
 * （包括第三方中转站）自动识别：
 *   1. 上下文窗口（contextWindowTokens）
 *   2. 最大输出（maxOutputTokens）
 *   3. 模型名是否真实有效（modelVerified）
 *
 * 探测策略（按优先级）：
 *   A. 内置预设匹配 — 模型名在 provider-presets 官方目录中，直接采用预设能力（最可靠）
 *   B. /models 列表 — OpenAI 兼容端点返回的模型元数据中解析能力字段
 *   C. 极简 chat 探测 — 发一个 max_tokens:1 的请求验证模型存在并观察响应
 */

import type { ModelProfile } from '../../src/shared/ipc-channels'
import type { ModelCapabilityProbeResult } from '../../src/shared/ipc-channels'
import { resolveModelProfileCapabilities } from '../../src/shared/provider-presets'

const PROBE_TIMEOUT_MS = 15_000
const PROBE_MAX_TOKENS = 1

/**
 * 内置主流模型能力表（借鉴 Hermes model_metadata 与 opencode-model-scout）。
 * 第三方中转站（如各类 API 聚合平台）提供的模型绝大多数是主流模型，
 * 按模型名家族前缀即可匹配到准确的上下文窗口与输出上限，无需网络探测。
 * 匹配采用"最长前缀优先"，避免 'gpt-4' 误匹配 'gpt-4o-mini'。
 */
interface BuiltinModelCap {
  /** 模型名前缀（小写）。 */
  prefixes: string[]
  contextWindowTokens: number | null
  maxOutputTokens: number | null
}

const BUILTIN_MODEL_CAPABILITIES: BuiltinModelCap[] = [
  // OpenAI
  { prefixes: ['gpt-5.2', 'gpt-5.1', 'gpt-5'], contextWindowTokens: 400_000, maxOutputTokens: 128_000 },
  { prefixes: ['gpt-4.1'], contextWindowTokens: 1_000_000, maxOutputTokens: 32_768 },
  { prefixes: ['gpt-4o'], contextWindowTokens: 128_000, maxOutputTokens: 16_384 },
  { prefixes: ['gpt-4-turbo'], contextWindowTokens: 128_000, maxOutputTokens: 4_096 },
  { prefixes: ['gpt-4'], contextWindowTokens: 128_000, maxOutputTokens: 8_192 },
  { prefixes: ['gpt-3.5'], contextWindowTokens: 16_385, maxOutputTokens: 4_096 },
  { prefixes: ['o4-mini', 'o3-mini', 'o3', 'o1'], contextWindowTokens: 200_000, maxOutputTokens: 100_000 },
  // Anthropic Claude
  { prefixes: ['claude-opus-4', 'claude-sonnet-4', 'claude-3-7', 'claude-3-5', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'], contextWindowTokens: 200_000, maxOutputTokens: 64_000 },
  { prefixes: ['claude-2'], contextWindowTokens: 100_000, maxOutputTokens: 4_096 },
  // Google Gemini
  { prefixes: ['gemini-3', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0', 'gemini-1.5-pro', 'gemini-1.5-flash'], contextWindowTokens: 1_000_000, maxOutputTokens: 65_536 },
  { prefixes: ['gemini-1.0'], contextWindowTokens: 32_768, maxOutputTokens: 2_048 },
  // DeepSeek
  { prefixes: ['deepseek-v4', 'deepseek-v3', 'deepseek-reasoner', 'deepseek-chat'], contextWindowTokens: 1_000_000, maxOutputTokens: 64_000 },
  { prefixes: ['deepseek-r1'], contextWindowTokens: 64_000, maxOutputTokens: 8_192 },
  // Qwen / 通义
  { prefixes: ['qwen3-max', 'qwen3-coder'], contextWindowTokens: 128_000, maxOutputTokens: 16_384 },
  { prefixes: ['qwen2.5-max'], contextWindowTokens: 32_768, maxOutputTokens: 8_192 },
  { prefixes: ['qwen2.5-72b', 'qwen2.5-32b', 'qwen2.5-14b', 'qwen2.5-7b'], contextWindowTokens: 131_072, maxOutputTokens: 8_192 },
  { prefixes: ['qwen2.5'], contextWindowTokens: 32_768, maxOutputTokens: 8_192 },
  { prefixes: ['qwen2'], contextWindowTokens: 32_768, maxOutputTokens: 8_192 },
  // GLM / 智谱
  { prefixes: ['glm-5', 'glm-4.6', 'glm-4.5', 'glm-4-plus'], contextWindowTokens: 200_000, maxOutputTokens: 32_768 },
  { prefixes: ['glm-4'], contextWindowTokens: 128_000, maxOutputTokens: 16_384 },
  // Kimi / Moonshot
  { prefixes: ['kimi-k3', 'kimi-k2.7', 'kimi-k2.6', 'kimi-k2.5', 'kimi-k2'], contextWindowTokens: 256_000, maxOutputTokens: 16_384 },
  { prefixes: ['moonshot-v1'], contextWindowTokens: 128_000, maxOutputTokens: 8_192 },
  // Meta Llama
  { prefixes: ['llama-4', 'llama-3.3', 'llama-3.1', 'llama-3'], contextWindowTokens: 131_072, maxOutputTokens: 8_192 },
  { prefixes: ['llama-2'], contextWindowTokens: 4_096, maxOutputTokens: 4_096 },
  // Mistral
  { prefixes: ['mistral-large', 'mistral-small'], contextWindowTokens: 128_000, maxOutputTokens: 32_768 },
  { prefixes: ['mistral-medium'], contextWindowTokens: 32_768, maxOutputTokens: 8_192 },
  // Grok / xAI
  { prefixes: ['grok-4', 'grok-3'], contextWindowTokens: 500_000, maxOutputTokens: 8_192 },
  // 其他常见
  { prefixes: ['yi-large', 'yi-medium'], contextWindowTokens: 32_768, maxOutputTokens: 4_096 },
  { prefixes: ['minimax'], contextWindowTokens: 245_760, maxOutputTokens: 32_768 },
  { prefixes: ['moonshot'], contextWindowTokens: 128_000, maxOutputTokens: 8_192 },
]

/** 按模型名匹配内置能力表（最长前缀优先）。 */
function matchBuiltinCapability(modelName: string): BuiltinModelCap | null {
  const name = modelName.trim().toLowerCase()
  if (!name) return null
  let best: BuiltinModelCap | null = null
  let bestLength = 0
  for (const cap of BUILTIN_MODEL_CAPABILITIES) {
    for (const prefix of cap.prefixes) {
      if (name === prefix || name.startsWith(prefix + '-') || name.startsWith(prefix + ':')) {
        if (prefix.length > bestLength) {
          best = cap
          bestLength = prefix.length
        }
      }
    }
  }
  return best
}

interface CapabilityProbeDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

/** 从 OpenAI 兼容 /models 响应中解析模型条目（含可选能力字段）。 */
function parseModelsEndpoint(payload: unknown): Array<{
  id: string
  contextWindow?: number
  maxOutputTokens?: number
}> {
  if (!payload || typeof payload !== 'object') return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const entries: Array<{ id: string; contextWindow?: number; maxOutputTokens?: number }> = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const id = (item as { id?: unknown }).id
    if (typeof id !== 'string' || !id) continue
    const contextWindow = positiveInteger(
      (item as Record<string, unknown>).context_window
      ?? (item as Record<string, unknown>).contextWindow
      ?? (item as Record<string, unknown>).contextWindowTokens,
    )
    const maxOutputTokens = positiveInteger(
      (item as Record<string, unknown>).max_output_tokens
      ?? (item as Record<string, unknown>).maxOutputTokens,
    )
    entries.push({ id, contextWindow: contextWindow ?? undefined, maxOutputTokens: maxOutputTokens ?? undefined })
  }
  return entries
}

function resolveModelsUrl(baseUrl: string): string | null {
  try {
    const endpoint = new URL(baseUrl.trim())
    let configuredPath = endpoint.pathname.replace(/\/+$/u, '')
    if (configuredPath.endsWith('/chat/completions')) {
      configuredPath = configuredPath.slice(0, -'/chat/completions'.length)
    } else if (configuredPath.endsWith('/chat')) {
      configuredPath = configuredPath.slice(0, -'/chat'.length)
    }
    if (!configuredPath) configuredPath = '/v1'
    endpoint.pathname = `${configuredPath}/models`
    endpoint.search = ''
    endpoint.hash = ''
    endpoint.username = ''
    endpoint.password = ''
    return endpoint.toString()
  } catch {
    return null
  }
}

export class ModelCapabilityProbe {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(deps: CapabilityProbeDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.timeoutMs = deps.timeoutMs ?? PROBE_TIMEOUT_MS
  }

  async probe(model: ModelProfile): Promise<ModelCapabilityProbeResult> {
    const startedAt = Date.now()

    // 策略 A1：内置预设匹配（官方模型，最可靠，无需网络）
    const presetCapabilities = resolveModelProfileCapabilities(model)
    if (presetCapabilities?.maxOutputTokens) {
      return {
        contextWindowTokens: presetCapabilities.contextWindowTokens ?? null,
        maxOutputTokens: presetCapabilities.maxOutputTokens,
        modelVerified: true,
        source: 'provider-preset',
        elapsedMs: Date.now() - startedAt,
      }
    }

    // 策略 A2：内置主流模型能力表（覆盖第三方中转站的常见模型）
    const builtin = matchBuiltinCapability(model.modelName)
    if (builtin?.contextWindowTokens) {
      return {
        contextWindowTokens: builtin.contextWindowTokens,
        maxOutputTokens: builtin.maxOutputTokens,
        modelVerified: true,
        source: 'provider-preset',
        elapsedMs: Date.now() - startedAt,
      }
    }

    // 策略 B：/models 列表（部分中转站返回能力字段）
    const modelsUrl = resolveModelsUrl(model.baseUrl)
    if (modelsUrl) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
          const res = await this.fetchImpl(modelsUrl, {
            headers: { Authorization: `Bearer ${model.apiKey}` },
            signal: controller.signal,
          })
          if (res.ok) {
            const payload = await res.json().catch(() => null)
            const entries = parseModelsEndpoint(payload)
            const self = entries.find((entry) => entry.id === model.modelName)
              ?? entries.find((entry) => entry.id.toLowerCase() === model.modelName.toLowerCase())
            if (self && (self.contextWindow !== undefined || self.maxOutputTokens !== undefined)) {
              return {
                contextWindowTokens: self.contextWindow ?? null,
                maxOutputTokens: self.maxOutputTokens ?? null,
                modelVerified: true,
                source: 'models-api',
                elapsedMs: Date.now() - startedAt,
              }
            }
            // 列表能拉到但该模型无能力字段：至少验证模型名存在于列表
            if (self) {
              return {
                contextWindowTokens: null,
                maxOutputTokens: null,
                modelVerified: true,
                source: 'models-api',
                elapsedMs: Date.now() - startedAt,
              }
            }
          }
        } finally {
          clearTimeout(timeout)
        }
      } catch { /* 网络失败继续尝试策略 C */ }
    }

    // 策略 C：极简 chat 探测验证模型存在
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const url = new URL(model.baseUrl.trim())
        if (!url.pathname.endsWith('/chat/completions')) {
          url.pathname = url.pathname.replace(/\/+$/u, '') + '/chat/completions'
        }
        const res = await this.fetchImpl(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.modelName,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: PROBE_MAX_TOKENS,
            stream: false,
          }),
          signal: controller.signal,
        })
        const verified = res.ok
        // 部分服务在响应体或错误信息中给出能力提示；尽力解析
        let contextWindowTokens: number | null = null
        let maxOutputTokens: number | null = null
        if (res.ok) {
          const payload = await res.json().catch(() => null)
          const usage = payload && typeof payload === 'object'
            ? (payload as { usage?: unknown }).usage
            : null
          const promptTokens = usage && typeof usage === 'object'
            ? positiveInteger((usage as { prompt_tokens?: unknown }).prompt_tokens)
            : null
          if (promptTokens) {
            maxOutputTokens = Math.max(PROBE_MAX_TOKENS, promptTokens * 10)
          }
        }
        return {
          contextWindowTokens,
          maxOutputTokens,
          modelVerified: verified,
          source: verified ? 'probe-request' : 'unknown',
          elapsedMs: Date.now() - startedAt,
        }
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      return {
        contextWindowTokens: null,
        maxOutputTokens: null,
        modelVerified: false,
        source: 'unknown',
        elapsedMs: Date.now() - startedAt,
      }
    }
  }
}
