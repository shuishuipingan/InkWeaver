import type {
  LLMFinishReason,
  LLMResponse as SharedLLMResponse,
  ModelProfile,
  TokenUsage,
} from '../../src/shared/ipc-channels'
import type { ProviderReasoningDirective } from '../../src/shared/reasoning-types'

/** A provider may report success only with explicit semantic stop evidence. */
export type LLMResponse = SharedLLMResponse

export interface LLMGenerateOptions {
  /** `undefined` means the provider must omit temperature from its payload. */
  temperature: number | undefined
  maxTokens: number
  responseFormat?: { type: string }
  reasoning?: ProviderReasoningDirective
  /** Main-process-only cancellation signal; never crosses IPC. */
  signal?: AbortSignal
}

export interface LLMStreamDiagnostics {
  provider: 'gemini-native'
  normalizedFinishReason: LLMFinishReason
  frameCount: number
  candidateCount: number
  finishReasonFieldSeen: boolean
  rawFinishReason: string | null
  usageMetadataPresent: boolean
  promptBlockReason: string | null
  fallbackAttempted?: boolean
  streamFinishReason?: LLMFinishReason
  streamOutputChars?: number
  fallbackFinishReason?: LLMFinishReason
  fallbackOutputChars?: number
  fallbackUsageMetadataPresent?: boolean
  fallbackJsonObjectValid?: boolean
}

export interface LLMStreamOptions extends LLMGenerateOptions {
  signal: AbortSignal
  onChunk: (chunk: string) => void
  /**
   * Signals transport termination and always carries provider-normalized model
   * completion evidence. `unknown` keeps text inspectable but is never proof
   * that a creative workflow may commit it.
   */
  onDone: (fullText: string, usage: TokenUsage | undefined, finishReason: LLMFinishReason) => void
  onError: (error: string) => void
  /** Safe provider metadata only; never includes prompt or response text. */
  onDiagnostics?: (diagnostics: LLMStreamDiagnostics) => void
}

export interface ILLMProvider {
  /** 非流式生成 */
  generate(
    model: ModelProfile,
    messages: Array<{ role: string; content: string }>,
    opts: LLMGenerateOptions
  ): Promise<LLMResponse>

  /** 流式生成 */
  generateStream(
    model: ModelProfile,
    messages: Array<{ role: string; content: string }>,
    opts: LLMStreamOptions
  ): Promise<void>
}
