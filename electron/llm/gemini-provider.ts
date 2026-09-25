import { ILLMProvider, LLMGenerateOptions, LLMResponse, LLMStreamOptions } from './provider.interface'
import type { LLMFinishReason, ModelProfile, TokenUsage } from '../../src/shared/ipc-channels'

interface GeminiTextPart {
  text?: string
  thought?: boolean
}

interface GeminiCandidate {
  content?: { parts?: GeminiTextPart[] }
  finishReason?: string | null
  finish_reason?: string | null
}

function answerTextParts(parts: readonly GeminiTextPart[] | undefined): string[] {
  return (parts ?? [])
    .filter(part => part.thought !== true && typeof part.text === 'string' && part.text.length > 0)
    .map(part => part.text!)
}

export class GeminiProvider implements ILLMProvider {
  private applyReasoning(
    generationConfig: Record<string, unknown>,
    opts: LLMGenerateOptions,
  ): void {
    if (opts.reasoning?.adapter !== 'gemini-thinking-budget') return
    generationConfig.thinkingConfig = { thinkingBudget: opts.reasoning.thinkingBudget }
  }

  private normalizeFinishReason(reason: string | null | undefined): LLMFinishReason {
    const normalized = reason?.trim().toUpperCase()
    if (normalized === 'STOP') return 'stop'
    if (normalized === 'MAX_TOKENS') return 'length'
    if (normalized && ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(normalized)) {
      return 'content_filter'
    }
    return 'unknown'
  }

  private toGeminiContents(messages: Array<{ role: string; content: string }>) {
    let systemInstruction: string | undefined
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content
        continue
      }
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })
    }
    return { contents, systemInstruction }
  }
  async generate(model: ModelProfile, messages: Array<{ role: string; content: string }>, opts: LLMGenerateOptions): Promise<LLMResponse> {
    try {
      const baseUrl = model.baseUrl.replace(/\/$/, '')
      const url = `${baseUrl}/v1beta/models/${model.modelName}:generateContent`

      const { contents, systemInstruction } = this.toGeminiContents(messages)

      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: opts.maxTokens ?? model.maxTokens,
      }
      if (opts.temperature !== undefined) {
        generationConfig.temperature = opts.temperature
      }
      if (opts.responseFormat?.type === 'json_object') {
        generationConfig.responseMimeType = 'application/json'
      }
      this.applyReasoning(generationConfig, opts)

      const body: Record<string, unknown> = {
        contents,
        generationConfig,
      }
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': model.apiKey,
        },
        body: JSON.stringify(body),
        // 非流式请求没有外部取消信号，必须自带超时兜底。
        signal: AbortSignal.timeout(120_000),
      })

      if (!res.ok) {
        const text = await res.text()
        return { success: false, content: '', finishReason: 'error', error: `Gemini API 调用失败 (${res.status}): ${text}` }
      }

      const data = await res.json() as {
        candidates?: Array<{
          content?: { parts?: GeminiTextPart[] }
          finishReason?: string | null
          finish_reason?: string | null
        }>
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
      }

      const text = answerTextParts(data.candidates?.[0]?.content?.parts).join('')
      const firstCandidate = data.candidates?.[0]
      const finishReason = this.normalizeFinishReason(firstCandidate?.finishReason ?? firstCandidate?.finish_reason)
      const usage = data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount ?? null,
        completionTokens: data.usageMetadata.candidatesTokenCount ?? null,
        totalTokens: data.usageMetadata.totalTokenCount ?? null,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null,
      } : undefined

      if (finishReason === 'stop') {
        return {
          success: true,
          content: text,
          usage,
          finishReason,
        }
      }

      return {
        success: false,
        content: text,
        usage,
        finishReason,
        error: 'Gemini API 返回的文本未正常完成',
      }
    } catch (error) {
      return { success: false, content: '', finishReason: 'error', error: String(error) }
    }
  }

  async generateStream(model: ModelProfile, messages: Array<{ role: string; content: string }>, opts: LLMStreamOptions): Promise<void> {
    try {
      const baseUrl = model.baseUrl.replace(/\/$/, '')
      const url = `${baseUrl}/v1beta/models/${model.modelName}:streamGenerateContent?alt=sse`

      const { contents, systemInstruction } = this.toGeminiContents(messages)

      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: opts.maxTokens ?? model.maxTokens,
      }
      if (opts.temperature !== undefined) {
        generationConfig.temperature = opts.temperature
      }
      if (opts.responseFormat?.type === 'json_object') {
        generationConfig.responseMimeType = 'application/json'
      }
      this.applyReasoning(generationConfig, opts)

      const body: Record<string, unknown> = {
        contents,
        generationConfig,
      }
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': model.apiKey,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        opts.onError(`Gemini API 调用失败 (${res.status}): ${text}`)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        opts.onError('无法读取 Gemini 响应流')
        return
      }

      const decoder = new TextDecoder()
      let fullText = ''
      let usage: TokenUsage | undefined
      let buffer = ''
      let finishReason: LLMFinishReason = 'unknown'
      let frameCount = 0
      let candidateCount = 0
      let finishReasonFieldSeen = false
      let rawFinishReason: string | null = null
      let promptBlockReason: string | null = null

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        const json = line.slice(6).trim()
        if (!json) return
        try {
          const parsed = JSON.parse(json) as {
            candidates?: GeminiCandidate[]
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
            promptFeedback?: { blockReason?: string | null }
          }
          frameCount += 1
          candidateCount += parsed.candidates?.length ?? 0
          const blockReason = parsed.promptFeedback?.blockReason
          if (typeof blockReason === 'string' && blockReason.trim()) {
            promptBlockReason = blockReason.slice(0, 80)
            if (finishReason === 'unknown') finishReason = this.normalizeFinishReason(blockReason)
          }
          const candidate = parsed.candidates?.[0]
          if (candidate && ('finishReason' in candidate || 'finish_reason' in candidate)) {
            const candidateFinishReason = candidate.finishReason ?? candidate.finish_reason ?? null
            finishReasonFieldSeen = true
            rawFinishReason = typeof candidateFinishReason === 'string' ? candidateFinishReason.slice(0, 80) : null
            if (typeof candidateFinishReason === 'string') {
              finishReason = this.normalizeFinishReason(candidateFinishReason)
            }
          }
          for (const chunk of answerTextParts(candidate?.content?.parts)) {
            fullText += chunk
            opts.onChunk(chunk)
          }
          if (parsed.usageMetadata) {
            usage = {
              promptTokens: parsed.usageMetadata.promptTokenCount ?? null,
              completionTokens: parsed.usageMetadata.candidatesTokenCount ?? null,
              totalTokens: parsed.usageMetadata.totalTokenCount ?? null,
              promptCacheHitTokens: null,
              promptCacheMissTokens: null,
            }
          }
        } catch {
          // Ignore non-data SSE lines and malformed keepalives.
        }
      }

      let streamEnded = false
      while (!streamEnded) {
        const { done, value } = await reader.read()
        streamEnded = done
        if (done) continue

        buffer += decoder.decode(value, { stream: true })
        const segments = buffer.split('\n')
        buffer = segments.pop() ?? ''
        for (const line of segments) processLine(line)
      }

      buffer += decoder.decode()
      if (buffer.trim()) processLine(buffer)

      try {
        opts.onDiagnostics?.({
          provider: 'gemini-native',
          normalizedFinishReason: finishReason,
          frameCount,
          candidateCount,
          finishReasonFieldSeen,
          rawFinishReason,
          usageMetadataPresent: usage !== undefined,
          promptBlockReason,
        })
      } catch { /* diagnostics must never change a generation outcome */ }
      opts.onDone(fullText, usage, finishReason)
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        opts.onError('已取消生成')
      } else {
        opts.onError(String(error))
      }
    }
  }
}
