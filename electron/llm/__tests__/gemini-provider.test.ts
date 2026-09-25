import { afterEach, describe, expect, it, vi } from 'vitest'

import { GeminiProvider } from '../gemini-provider'
import { resolveGenerationParameters } from '../generation-parameter-policy'
import type { ModelProfile } from '../../../src/shared/ipc-channels'

const model: ModelProfile = {
  id: 'gemini-test',
  name: 'Gemini Test',
  provider: 'gemini',
  protocol: 'gemini',
  modelName: 'gemini-2.5-flash',
  apiKey: 'test-key',
  baseUrl: 'https://generativelanguage.googleapis.com',
  temperature: 0.7,
  maxTokens: 4096,
  purposes: ['generation'],
}

const reasoningModel: ModelProfile = {
  ...model,
  modelName: 'gemini-2.5-flash-lite',
  maxTokens: 65_536,
  reasoningOverride: 'high',
}

function sseReader(...messages: string[]) {
  const encoder = new TextEncoder()
  const reads: Array<{ done: boolean; value?: Uint8Array }> = messages.map(message => ({
    done: false,
    value: encoder.encode(message),
  }))
  reads.push({ done: true, value: undefined })
  return { read: vi.fn(async () => reads.shift()) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GeminiProvider', () => {
  it('returns only answer parts when a non-streaming Gemini response includes thought text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [
            { thought: true, text: 'I should explain the result.' },
            { text: '{"blueprints":' },
            { text: '[]}' },
          ] },
          finishReason: 'STOP',
        }],
      }),
    }))

    const result = await new GeminiProvider().generate(model, [{ role: 'user', content: '返回 JSON' }], {
      temperature: 0.2,
      maxTokens: 512,
    })

    expect(result).toMatchObject({ success: true, content: '{"blueprints":[]}' })
  })

  it('streams every answer part but never forwards thought parts as generated text', async () => {
    const frame = (parts: Array<{ text: string; thought?: boolean }>, finishReason?: string) =>
      `data: ${JSON.stringify({ candidates: [{ content: { parts }, ...(finishReason ? { finishReason } : {}) }] })}\n`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => sseReader(
        frame([{ thought: true, text: 'Thinking aloud.' }, { text: '{"blueprints":' }]),
        frame([{ text: '[]}' }], 'STOP'),
      ) },
    }))
    const onChunk = vi.fn()
    const onDone = vi.fn()

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '返回 JSON' }], {
      temperature: 0.2,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk,
      onDone,
      onError: vi.fn(),
    })

    expect(onChunk.mock.calls.map(([chunk]) => chunk)).toEqual(['{"blueprints":', '[]}'])
    expect(onDone).toHaveBeenCalledWith('{"blueprints":[]}', undefined, 'stop')
  })

  it('applies the same verified thinking budget to normal and streaming requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '正文' }] } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => ({ read: vi.fn().mockResolvedValue({ done: true }) }) },
      })
    vi.stubGlobal('fetch', fetchMock)
    const resolved = resolveGenerationParameters(reasoningModel, {
      maxTokens: 512,
      creativeStrategy: 'fluent-drafting',
      reasoningStage: 'drafting',
    })

    await new GeminiProvider().generate(reasoningModel, [{ role: 'user', content: '写正文' }], resolved)
    await new GeminiProvider().generateStream(reasoningModel, [{ role: 'user', content: '写正文' }], {
      ...resolved,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    })

    for (const [, request] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(JSON.parse(String(request.body)).generationConfig.thinkingConfig).toEqual({
        thinkingBudget: 24_576,
      })
    }
  })
  it('sends the resolved generic profile temperature in both payload forms', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '正文' }] } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => ({ read: vi.fn().mockResolvedValue({ done: true }) }) },
      })
    vi.stubGlobal('fetch', fetchMock)
    const resolved = resolveGenerationParameters(model, { maxTokens: 512 })

    await new GeminiProvider().generate(model, [{ role: 'user', content: '写正文' }], resolved)
    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      ...resolved,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    })

    for (const [, request] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(JSON.parse(String(request.body)).generationConfig.temperature).toBe(model.temperature)
    }
  })

  it('omits temperature from both payload forms when the resolved policy leaves it undefined', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '正文' }] } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => ({ read: vi.fn().mockResolvedValue({ done: true }) }) },
      })
    vi.stubGlobal('fetch', fetchMock)

    await new GeminiProvider().generate(model, [{ role: 'user', content: '写正文' }], {
      temperature: undefined,
      maxTokens: 512,
    })
    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      temperature: undefined,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    })

    for (const [, request] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(JSON.parse(String(request.body)).generationConfig).not.toHaveProperty('temperature')
    }
  })

  it('requests application JSON when the caller requires a JSON object', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await new GeminiProvider().generate(model, [{ role: 'user', content: '返回 JSON' }], {
      temperature: 0.2,
      maxTokens: 512,
      responseFormat: { type: 'json_object' },
    })

    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({
      generationConfig: { responseMimeType: 'application/json' },
    })
  })

  it('requests application JSON for streamed JSON generation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: vi.fn().mockResolvedValue({ done: true }) }) },
    })
    vi.stubGlobal('fetch', fetchMock)

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '返回 JSON' }], {
      temperature: 0.2,
      maxTokens: 512,
      responseFormat: { type: 'json_object' },
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    })

    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({
      generationConfig: { responseMimeType: 'application/json' },
    })
  })

  it('maps Gemini MAX_TOKENS to a structured length completion state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '被截断' }] }, finishReason: 'MAX_TOKENS' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(new GeminiProvider().generate(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
    })).resolves.toMatchObject({
      success: false,
      content: '被截断',
      finishReason: 'length',
    })
  })

  it('does not treat a Gemini HTTP response without finishReason as a completed generation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '传输已结束但完成原因未知' }] } }],
      }),
    }))

    await expect(new GeminiProvider().generate(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
    })).resolves.toMatchObject({
      success: false,
      content: '传输已结束但完成原因未知',
      finishReason: 'unknown',
    })
  })

  it('keeps omitted Gemini usage fields unknown instead of inventing zeros', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '完成' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10 },
      }),
    }))

    await expect(new GeminiProvider().generate(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
    })).resolves.toMatchObject({
      success: true,
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: null, totalTokens: null },
    })
  })

  it('forwards an explicit Gemini stream STOP as completed evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => sseReader(
          'data: {"candidates":[{"content":{"parts":[{"text":"正文"}]},"finishReason":"STOP"}]}\n',
        ),
      },
    }))
    const onDone = vi.fn()

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn(),
    })

    expect(onDone).toHaveBeenCalledWith('正文', undefined, 'stop')
  })

  it('accepts OpenAI-style finish_reason casing returned by Gemini compatible gateways', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => sseReader(
          'data: {"candidates":[{"content":{"parts":[{"text":"正文"}]},"finish_reason":"STOP"}]}' + '\n',
        ),
      },
    }))
    const onDone = vi.fn()

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn(),
    })

    expect(onDone).toHaveBeenCalledWith('正文', undefined, 'stop')
  })

  it('forwards Gemini stream MAX_TOKENS as a length completion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => sseReader(
          'data: {"candidates":[{"content":{"parts":[{"text":"正文"}]}}]}\n',
          'data: {"candidates":[{"finishReason":"MAX_TOKENS"}]}\n',
        ),
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    const onDone = vi.fn()

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn(),
    })

    expect(onDone).toHaveBeenCalledWith('正文', undefined, 'length')
  })

  it('reports unknown when a Gemini stream ends without a final finishReason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => sseReader('data: {"candidates":[{"content":{"parts":[{"text":"完整"}]}}]}\n') },
    }))
    const onDone = vi.fn()

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn(),
    })

    expect(onDone).toHaveBeenCalledWith('完整', undefined, 'unknown')
  })

  it('reports safe envelope metadata when a Gemini stream ends without terminal evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => sseReader(
          'data: {"candidates":[{"content":{"parts":[{"text":"private response text"}]}}]}\n',
        ),
      },
    }))
    const onDiagnostics = vi.fn()

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onDiagnostics,
    })

    expect(onDiagnostics).toHaveBeenCalledWith({
      provider: 'gemini-native',
      normalizedFinishReason: 'unknown',
      frameCount: 1,
      candidateCount: 1,
      finishReasonFieldSeen: false,
      rawFinishReason: null,
      usageMetadataPresent: false,
      promptBlockReason: null,
    })
    expect(JSON.stringify(onDiagnostics.mock.calls)).not.toContain('private response text')
  })

  it('maps a Gemini prompt block reason to a safety completion failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => sseReader('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n'),
      },
    }))
    const onDone = vi.fn()
    const onDiagnostics = vi.fn()

    await new GeminiProvider().generateStream(model, [{ role: 'user', content: '写正文' }], {
      temperature: 0.2,
      maxTokens: 512,
      signal: new AbortController().signal,
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn(),
      onDiagnostics,
    })

    expect(onDone).toHaveBeenCalledWith('', undefined, 'content_filter')
    expect(onDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      normalizedFinishReason: 'content_filter',
      promptBlockReason: 'SAFETY',
    }))
  })
})
