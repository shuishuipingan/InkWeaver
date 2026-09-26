import { describe, expect, it, vi } from 'vitest'

import type { ModelProfile } from '../../../src/shared/ipc-channels'
import { ModelCapabilityProbe } from '../model-capability-probe'

function modelProfile(modelName: string): ModelProfile {
  return {
    id: modelName,
    name: modelName,
    provider: 'deepseek',
    protocol: 'openai',
    modelName,
    apiKey: 'probe-test-key',
    baseUrl: 'https://deepseek.example/v1',
    temperature: 0.7,
    maxTokens: 4096,
    purposes: ['generation'],
  }
}

describe('ModelCapabilityProbe DeepSeek catalog facts', () => {
  it.each(['deepseek-flash', 'deepseek-v4-flash'])(
    'uses verified provider capabilities for V4.1 Flash id %s',
    async (modelName) => {
      const fetchImpl = vi.fn<typeof fetch>()
      const result = await new ModelCapabilityProbe({ fetchImpl }).probe(modelProfile(modelName))

      expect(result).toMatchObject({
        modelVerified: true,
        source: 'provider-preset',
        contextWindowTokens: 1_048_576,
        maxOutputTokens: 393_216,
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it('probes the configured endpoint before verifying the V4.1 display-name alias', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ id: 'deepseek-v4.1-flash', context_window: 1_048_576 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const result = await new ModelCapabilityProbe({ fetchImpl })
      .probe(modelProfile('deepseek-v4.1-flash'))

    expect(result).toMatchObject({
      modelVerified: true,
      source: 'models-api',
      contextWindowTokens: 1_048_576,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does not verify the V4.1 display-name alias when the configured endpoint rejects it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', { status: 404 }),
    )
    const result = await new ModelCapabilityProbe({ fetchImpl })
      .probe(modelProfile('deepseek-v4.1-flash'))

    expect(result.modelVerified).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it.each(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3', 'deepseek-r1'])(
    'does not treat retired model id %s as verified without provider evidence',
    async (modelName) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{}', { status: 404 }),
      )
      const result = await new ModelCapabilityProbe({ fetchImpl }).probe(modelProfile(modelName))

      expect(result.modelVerified).toBe(false)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    },
  )
})
