import { describe, expect, it, vi } from 'vitest'

import type { ModelProfile } from '../../../shared/ipc-channels'
import { createModelExecutionLeaseReceipt } from '../../../../electron/services/model-execution-lease'
import {
  createGenerationHarness,
  type CompletionPort,
  type DefaultModelSnapshot,
  type PromptBudgetReport,
} from '../generation-harness'

function model(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'model-a',
    name: 'Model A',
    provider: 'custom',
    protocol: 'openai',
    modelName: 'model-a-v1',
    apiKey: 'test-only-key',
    baseUrl: 'https://provider-a.example/v1',
    temperature: 0.6,
    maxTokens: 4096,
    purposes: ['generation'],
    ...overrides,
  }
}

function task() {
  return {
    purpose: 'chapter-draft',
    output: 'visible-text' as const,
    messages: [
      { role: 'system' as const, content: 'Write a complete chapter.' },
      { role: 'user' as const, content: 'Begin.' },
    ],
  }
}

describe('GenerationHarness', () => {
  it('uses an extractive fallback for optional detail without deleting core cast', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({ content: 'done', finishReason: 'stop' })
    const session = createGenerationHarness({ modelSource: { snapshotDefaultModel: () => ({ revision: 'summary', model: model() }) },
      completionPort: { complete }, policy: { maxAttempts: 1, maxRequestedOutputTokens: 4_096, maxRequestedOutputTokensPerAttempt: 4_096, deadlineMs: 60_000 } }).openSession()
    const details = 'x'.repeat(100)
    await session.complete({ purpose: 'chapter-draft', output: 'visible-text', messages: [{ role: 'user', content: `CAST\n${details}` }],
      promptBudget: { limitUtf8Bytes: 40, sections: [
        { sectionName: 'core-cast', messageIndex: 0, finalText: 'CAST' },
        { sectionName: 'cast-details', messageIndex: 0, finalText: details, degradation: { priority: 10, strategy: 'summary', fallbackText: 'summary' } },
      ] } })
    expect(complete.mock.calls[0]![0].messages[0]!.content).toBe('CAST\nsummary')
  })
  it('retains large protected drafting context under authoritative adaptive capacity', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({ content: 'done', finishReason: 'stop' })
    const harness = createGenerationHarness({
      modelSource: { snapshotDefaultModel: () => ({ revision: 'adaptive', modelExecutionLeaseId: 'adaptive-test-lease', model: model(), resolvedCapabilities: {
        contextWindowTokens: 1_000_000, maxOutputTokens: 4_096, reasoning: false, structuredOutput: true, usage: true,
        source: { contextWindowTokens: 'verified-provider-preset', maxOutputTokens: 'user-operational-cap', featureFlags: 'verified-provider-preset' },
      } }) },
      completionPort: { complete },
      policy: { maxAttempts: 1, maxRequestedOutputTokens: 4_096, maxRequestedOutputTokensPerAttempt: 4_096, deadlineMs: 60_000 },
    })
    const core = 'x'.repeat(80_000)
    const preflight = vi.fn()
    const result = await harness.openSession().complete({
      purpose: 'chapter-draft', output: 'visible-text', messages: [{ role: 'user', content: core }],
      promptBudget: { limitUtf8Bytes: 65_536, adaptive: { maxInputTokens: 96_000, unknownInputTokens: 16_384 },
        sections: [{ sectionName: 'core-cast', messageIndex: 0, finalText: core }] },
    }, { onPromptBudgetPreflight: preflight })
    expect(result.receipt.promptBudget).toMatchObject({ errorCode: 'OK', estimatedInputTokens: 40_016, capacityKnown: true })
    expect(complete.mock.calls[0]![0].messages[0]!.content).toBe(core)
    expect(preflight).toHaveBeenCalledOnce()
  })
  it('freezes the default model id, configuration revision, and endpoint for the whole session', async () => {
    let current: DefaultModelSnapshot = {
      revision: 'revision-a',
      model: model(),
    }
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'complete chapter',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: { snapshotDefaultModel: () => current },
      completionPort: { complete },
      policy: {
        maxAttempts: 4,
        maxRequestedOutputTokens: 20_000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const session = harness.openSession()

    current.model.modelName = 'mutated-same-id'
    current.model.baseUrl = 'https://mutated.example/v1'
    current = {
      revision: 'revision-b',
      model: model({ id: 'model-b', modelName: 'model-b-v1' }),
    }

    const outcome = await session.complete(task())

    expect(outcome.status).toBe('completed')
    expect(outcome.receipt.model).toEqual({
      id: 'model-a',
      configurationRevision: 'revision-a',
      endpointFingerprint: 'openai|custom|https://provider-a.example/v1|model-a-v1',
    })
    expect(complete).toHaveBeenCalledOnce()
    expect(complete.mock.calls[0]?.[0]).not.toHaveProperty('model')
    expect(complete.mock.calls[0]?.[0].modelExecutionLeaseId).toBeNull()
  })

  it('does not independently resolve provider facts in the renderer fallback', async () => {
    let current: DefaultModelSnapshot = {
      revision: 'official',
      model: model({
        provider: 'xai',
        protocol: 'openai',
        modelName: 'grok-4.5',
        baseUrl: 'https://api.x.ai/v1',
        maxTokens: 8192,
      }),
    }
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'complete',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: { snapshotDefaultModel: () => current },
      completionPort: { complete },
      policy: {
        maxAttempts: 8,
        maxRequestedOutputTokens: 80_000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    const official = await harness.openSession().complete(task())
    expect(official.receipt.capabilities).toMatchObject({
      contextWindowTokens: null,
      maxOutputTokens: 8192,
      source: {
        contextWindowTokens: 'unknown',
        maxOutputTokens: 'legacy-profile',
        featureFlags: 'unknown',
      },
    })

    for (const changedIdentity of [
      { baseUrl: 'https://proxy.example/v1' },
      { baseUrl: 'https://api.x.ai/v1?tenant=other' },
      { modelName: 'grok-4.5-latest' },
      { protocol: 'gemini' as const },
    ]) {
      current = {
        revision: JSON.stringify(changedIdentity),
        model: model({
          provider: 'xai',
          protocol: 'openai',
          modelName: 'grok-4.5',
          baseUrl: 'https://api.x.ai/v1',
          maxTokens: 8192,
          ...changedIdentity,
        }),
      }
      const outcome = await harness.openSession().complete(task())
      expect(outcome.receipt.capabilities).toMatchObject({
        contextWindowTokens: null,
        source: { contextWindowTokens: 'unknown' },
      })
    }
  })

  it('does not trust persisted renderer capabilities without main-process lease evidence', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'complete',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'explicit-unknown-context',
          model: model({
            maxTokens: 99_999,
            capabilities: {
              contextWindowTokens: null,
              maxOutputTokens: 2048,
              reasoning: false,
              structuredOutput: false,
              usage: true,
            },
          }),
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 10_000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    const outcome = await harness.openSession().complete({
      ...task(),
      messages: [
        { role: 'system', content: 'Write.' },
        { role: 'user', content: 'x'.repeat(12_000) },
      ],
    })

    expect(outcome.status).toBe('completed')
    expect(outcome.receipt.capabilities).toMatchObject({
      contextWindowTokens: null,
      maxOutputTokens: 99_999,
      reasoning: null,
      structuredOutput: null,
      usage: null,
      source: {
        contextWindowTokens: 'unknown',
        maxOutputTokens: 'legacy-profile',
        featureFlags: 'unknown',
      },
    })
    expect(complete.mock.calls[0]?.[0].plan).toMatchObject({
      contextWindowTokens: null,
      maxOutputTokens: 99_999,
    })
  })

  it('requests Gemini JSON mode for structured tasks while keeping unverified capability evidence unknown', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: '{"blueprints":[]}',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'gemini-protocol-json',
          model: model({
            provider: 'gemini',
            protocol: 'gemini',
            modelName: 'gemini-3.8-flash-high',
            baseUrl: 'http://127.0.0.1:8045',
          }),
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 2048,
        deadlineMs: 60_000,
      },
    })

    const outcome = await harness.openSession().complete({
      ...task(),
      output: 'structured-data',
    })

    expect(outcome.receipt.capabilities.structuredOutput).toBeNull()
    expect(complete.mock.calls[0]?.[0].plan.responseFormat).toEqual({ type: 'json_object' })
  })

  it('requests JSON mode for DeepSeek V4.1 Flash using its verified execution-lease capabilities', async () => {
    const profile = model({
      provider: 'deepseek',
      protocol: 'openai',
      modelName: 'deepseek-v4.1-flash',
      baseUrl: 'https://api.deepseek.com',
      maxTokens: 393_216,
    })
    const lease = createModelExecutionLeaseReceipt(profile, {
      leaseId: 'deepseek-v4.1-flash-json-lease',
      createdAt: 1,
      expiresAt: 60_001,
    })
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: '{"blueprints":[]}',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'deepseek-v4.1-flash-revision',
          model: profile,
          modelExecutionLeaseId: lease.leaseId,
          resolvedCapabilities: lease.capabilityEvidence,
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    await harness.openSession().complete({
      ...task(),
      output: 'structured-data',
      messages: [
        { role: 'system', content: 'Return JSON only.' },
        { role: 'user', content: 'Return {"blueprints":[]}.' },
      ],
    })

    expect(complete.mock.calls[0]?.[0].plan.responseFormat).toEqual({ type: 'json_object' })
  })

  it('does not override verified Gemini evidence that structured output is unsupported', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'plain text',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'gemini-verified-no-json',
          model: model({ provider: 'gemini', protocol: 'gemini' }),
          modelExecutionLeaseId: 'lease-gemini',
          resolvedCapabilities: {
            contextWindowTokens: 16_384,
            maxOutputTokens: 4096,
            reasoning: null,
            structuredOutput: false,
            usage: null,
            source: {
              contextWindowTokens: 'user-operational-cap',
              maxOutputTokens: 'user-operational-cap',
              featureFlags: 'verified-provider-preset',
            },
          },
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 2048,
        deadlineMs: 60_000,
      },
    })

    await harness.openSession().complete({ ...task(), output: 'structured-data' })

    expect(complete.mock.calls[0]?.[0].plan.responseFormat).toBeUndefined()
  })

  it('rejects claimed resolved capabilities that are not paired with a main-process lease', () => {
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'forged-capability-revision',
          model: model(),
          resolvedCapabilities: {
            contextWindowTokens: 1_000_000,
            maxOutputTokens: 384_000,
            reasoning: true,
            structuredOutput: true,
            usage: true,
            source: {
              contextWindowTokens: 'verified-provider-preset',
              maxOutputTokens: 'verified-provider-preset',
              featureFlags: 'verified-provider-preset',
            },
          },
        }),
      },
      completionPort: { complete: vi.fn() },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    expect(() => harness.openSession()).toThrow(expect.objectContaining({
      code: 'UNTRUSTED_CAPABILITY_EVIDENCE',
    }))
  })

  it('lets a capable model request its full output cap per attempt and exhausts the token budget afterwards', async () => {
    const complete = vi.fn<CompletionPort['complete']>()
      .mockResolvedValueOnce({ content: 'first batch', finishReason: 'length' })
      .mockResolvedValueOnce({ content: 'continued batch', finishReason: 'stop' })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'large-context-model',
          model: model({
            maxTokens: 128_000,
            capabilities: {
              contextWindowTokens: 384_000,
              maxOutputTokens: 128_000,
              reasoning: false,
              structuredOutput: true,
              usage: true,
            },
          }),
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 4,
        maxRequestedOutputTokens: 16_384,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const session = harness.openSession()
    const fiveChapterDirectoryTask = {
      ...task(),
      purpose: 'five-chapter-directory',
      messages: [{ role: 'user' as const, content: 'Generate a structured directory for chapters 1 through 5.' }],
    }

    const first = await session.complete(fiveChapterDirectoryTask)

    expect(first).toMatchObject({
      status: 'incomplete',
      finishReason: 'length',
      receipt: {
        purpose: 'five-chapter-directory',
        budget: {
          requestedOutputTokens: 128_000,
          cumulativeRequestedOutputTokens: 128_000,
          maxRequestedOutputTokens: 128_000,
          maxRequestedOutputTokensPerAttempt: 128_000,
        },
      },
    })
    expect(complete.mock.calls.map(([request]) => request.plan.maxOutputTokens)).toEqual([128_000])
    expect(session.budget.maxRequestedOutputTokensPerAttempt).toBe(128_000)
    await expect(session.complete(fiveChapterDirectoryTask)).rejects.toMatchObject({
      code: 'REQUESTED_TOKEN_BUDGET_EXHAUSTED',
    })
  })

  it('respects an opt-in intent cap across several post-process requests', async () => {
    const complete = vi.fn<CompletionPort['complete']>()
      .mockResolvedValue({ content: 'done', finishReason: 'stop' })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'post-process-model',
          model: model({ maxTokens: 384_000, capabilities: {
            contextWindowTokens: 1_048_576,
            maxOutputTokens: 384_000,
            reasoning: true,
            structuredOutput: true,
            usage: true,
          } }),
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 6,
        maxRequestedOutputTokens: 96_000,
        maxRequestedOutputTokensPerAttempt: 16_000,
        deadlineMs: 60_000,
        respectIntentOutputCaps: true,
      },
    })
    const session = harness.openSession()
    await session.complete({ ...task(), purpose: 'chapter-notes' })
    await session.complete({ ...task(), purpose: 'chapter-handoff' })
    await session.complete({ ...task(), purpose: 'character-cards' })
    expect(complete).toHaveBeenCalledTimes(3)
    expect(complete.mock.calls.map(([request]) => request.plan.maxOutputTokens)).toEqual([16_000, 16_000, 16_000])
  })

  it('counts a known mixed-language sample as UTF-8 bytes and rejects it before a fake provider attempt', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'unused',
      finishReason: 'stop',
    })
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => {})
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 8192,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const session = harness.openSession()
    const mixedText = 'A中🙂'

    await expect(session.complete({
      purpose: 'known-utf8-preflight',
      output: 'structured-data',
      messages: [{ role: 'user', content: mixedText }],
      promptBudget: {
        limitUtf8Bytes: 7,
        sections: [{ sectionName: 'step-guidance', messageIndex: 0, finalText: mixedText }],
      },
    })).rejects.toMatchObject({
      name: 'PromptBudgetExceededError',
      code: 'PROMPT_BUDGET_EXHAUSTED',
      report: {
        totalUtf8Bytes: 8,
        limitUtf8Bytes: 7,
        reservedOutputTokens: 4096,
        sections: [{ sectionName: 'step-guidance', utf8Bytes: 8 }],
        modelId: 'model-a',
        errorCode: 'PROMPT_BUDGET_EXHAUSTED',
      },
    })
    expect(complete).not.toHaveBeenCalled()
    expect(diagnostic).toHaveBeenCalledWith('[GenerationPromptBudget]', {
      totalUtf8Bytes: 8,
      limitUtf8Bytes: 7,
      reservedOutputTokens: 4096,
      sections: [{ sectionName: 'step-guidance', utf8Bytes: 8 }],
      modelId: 'model-a',
      errorCode: 'PROMPT_BUDGET_EXHAUSTED',
    })

    const recovered = await session.complete(task())
    expect(recovered.receipt.budget).toMatchObject({
      attempt: 1,
      cumulativeRequestedOutputTokens: 4096,
    })
    expect(complete).toHaveBeenCalledOnce()
    diagnostic.mockRestore()
  })

  it.each([
    ['repair-contract', 'c'.repeat(32_769), 'candidate'],
    ['repair-candidate', 'contract', 'd'.repeat(32_769)],
  ] as const)('enforces the protected %s byte limit before a provider attempt', async (
    oversizedSection,
    repairContract,
    repairCandidate,
  ) => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: '{"ok":true}',
      finishReason: 'stop',
    })
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'section-limit', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const userMessage = `${repairContract}\n${repairCandidate}`

    let failure: unknown
    try {
      await harness.openSession().complete({
        purpose: 'section-limit-preflight',
        output: 'structured-data',
        messages: [{ role: 'user', content: userMessage }],
        promptBudget: {
          limitUtf8Bytes: 70_000,
          sections: [
            {
              sectionName: 'repair-contract',
              messageIndex: 0,
              finalText: repairContract,
              limitUtf8Bytes: 32_768,
            },
            {
              sectionName: 'repair-candidate',
              messageIndex: 0,
              finalText: repairCandidate,
              limitUtf8Bytes: 32_768,
            },
          ],
        },
      })
    } catch (error) {
      failure = error
    } finally {
      diagnostic.mockRestore()
    }

    expect(failure).toMatchObject({
      name: 'PromptBudgetExceededError',
      code: 'PROMPT_BUDGET_EXHAUSTED',
      report: {
        errorCode: 'PROMPT_BUDGET_EXHAUSTED',
        sections: expect.arrayContaining([
          { sectionName: oversizedSection, utf8Bytes: 32_769 },
        ]),
      },
    })
    expect(complete).not.toHaveBeenCalled()
    expect(failure).not.toHaveProperty('receipt')
  })

  it('degrades lower-priority sections first and reports exact UTF-8 byte changes', async () => {
    const events: string[] = []
    const system = 'OUTPUT CONTRACT'
    const premise = 'PREMISE'
    const linked = 'LINK'
    const secondary = 'SEC'
    const distant = 'FAR'
    const user = `${premise}|${linked}|${secondary}|${distant}`
    const fullRequestBytes = new TextEncoder().encode(system).byteLength
      + new TextEncoder().encode(user).byteLength
    const complete = vi.fn<CompletionPort['complete']>().mockImplementation(async () => {
      events.push('provider')
      return { content: 'done', finishReason: 'stop' }
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'priority-compaction', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    const outcome = await harness.openSession().complete({
      purpose: 'priority-compaction',
      output: 'visible-text',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      promptBudget: {
        limitUtf8Bytes: fullRequestBytes - 6,
        sections: [
          { sectionName: 'system-instructions', messageIndex: 0, finalText: system },
          { sectionName: 'story-premise', messageIndex: 1, finalText: premise, degradation: { priority: 40, strategy: 'utf8-prefix' } },
          { sectionName: 'linked-cast', messageIndex: 1, finalText: linked, degradation: { priority: 30, strategy: 'utf8-prefix' } },
          { sectionName: 'secondary-cast', messageIndex: 1, finalText: secondary, degradation: { priority: 20, strategy: 'utf8-prefix' } },
          { sectionName: 'distant-blueprints', messageIndex: 1, finalText: distant, degradation: { priority: 10, strategy: 'utf8-prefix' } },
        ],
      },
    }, {
      onPromptBudgetPreflight: report => {
        expect(report.compaction?.removedUtf8Bytes).toBe(6)
        events.push('preflight')
      },
    })

    const physicalMessages = complete.mock.calls[0]?.[0].messages ?? []
    expect(events).toEqual(['preflight', 'provider'])
    expect(physicalMessages[0]?.content).toBe(system)
    expect(physicalMessages[1]?.content).toBe(`${premise}|${linked}||`)
    expect(outcome.receipt.promptBudget).toMatchObject({
      totalUtf8Bytes: fullRequestBytes - 6,
      compaction: {
        originalTotalUtf8Bytes: fullRequestBytes,
        removedUtf8Bytes: 6,
        sections: [
          { sectionName: 'secondary-cast', originalUtf8Bytes: 3, retainedUtf8Bytes: 0, removedUtf8Bytes: 3 },
          { sectionName: 'distant-blueprints', originalUtf8Bytes: 3, retainedUtf8Bytes: 0, removedUtf8Bytes: 3 },
        ],
      },
    })
  })

  it('locates protected chapter evidence when policy sections are declared out of prompt order', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'done',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'out-of-order-sections', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    await harness.openSession().complete({
      purpose: 'out-of-order-sections',
      output: 'visible-text',
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'ARCHITECTURE\nCHAPTER EVIDENCE' },
      ],
      promptBudget: {
        limitUtf8Bytes: 1024,
        sections: [
          { sectionName: 'system-instructions', messageIndex: 0, finalText: 'SYSTEM' },
          { sectionName: 'target-chapter', messageIndex: 1, finalText: 'CHAPTER EVIDENCE' },
          { sectionName: 'story-premise', messageIndex: 1, finalText: 'ARCHITECTURE', degradation: { priority: 40, strategy: 'utf8-prefix' } },
        ],
      },
    })

    expect(complete).toHaveBeenCalledOnce()
    expect(complete.mock.calls[0]?.[0].messages[1]?.content).toBe('ARCHITECTURE\nCHAPTER EVIDENCE')
  })

  it('fails before provider use when protected material alone exceeds the limit after compaction', async () => {
    const complete = vi.fn<CompletionPort['complete']>()
    const onPreflight = vi.fn()
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'protected-compaction', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    await expect(harness.openSession().complete({
      purpose: 'protected-overflow',
      output: 'structured-data',
      messages: [
        { role: 'system', content: 'IMMUTABLE SYSTEM CONTRACT' },
        { role: 'user', content: 'TARGET evidence|degradable context' },
      ],
      promptBudget: {
        limitUtf8Bytes: 10,
        sections: [
          { sectionName: 'system-instructions', messageIndex: 0, finalText: 'IMMUTABLE SYSTEM CONTRACT' },
          { sectionName: 'target-chapter', messageIndex: 1, finalText: 'TARGET evidence' },
          { sectionName: 'distant-blueprints', messageIndex: 1, finalText: 'degradable context', degradation: { priority: 0, strategy: 'utf8-prefix' } },
        ],
      },
    }, { onPromptBudgetPreflight: onPreflight })).rejects.toMatchObject({
      name: 'PromptBudgetExceededError',
      report: {
        errorCode: 'PROMPT_BUDGET_EXHAUSTED',
        compaction: { removedUtf8Bytes: 18 },
      },
    })

    expect(onPreflight).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
  })

  it('never splits a multibyte code point while compacting a UTF-8 prefix', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'done',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'utf8-compaction', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    const outcome = await harness.openSession().complete({
      purpose: 'utf8-compaction',
      output: 'visible-text',
      messages: [{ role: 'user', content: 'AéB' }],
      promptBudget: {
        limitUtf8Bytes: 2,
        sections: [{
          sectionName: 'distant-blueprints',
          messageIndex: 0,
          finalText: 'AéB',
          degradation: { priority: 0, strategy: 'utf8-prefix' },
        }],
      },
    })

    expect(complete.mock.calls[0]?.[0].messages[0]?.content).toBe('A')
    expect(outcome.receipt.promptBudget).toMatchObject({
      totalUtf8Bytes: 1,
      compaction: {
        removedUtf8Bytes: 3,
        sections: [{
          sectionName: 'distant-blueprints',
          originalUtf8Bytes: 4,
          retainedUtf8Bytes: 1,
          removedUtf8Bytes: 3,
        }],
      },
    })
  })

  it('keeps complete context records when a degradable section uses line boundaries', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'done',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'line-compaction', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    await harness.openSession().complete({
      purpose: 'line-compaction',
      output: 'visible-text',
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'LINK\nEXTRA\n' },
      ],
      promptBudget: {
        limitUtf8Bytes: 6,
        sections: [{
          sectionName: 'linked-cast',
          messageIndex: 1,
          finalText: 'LINK\nEXTRA\n',
          degradation: { priority: 20, strategy: 'complete-lines' },
        }],
      },
    })

    expect(complete.mock.calls[0]?.[0].messages[1]?.content).toBe('LINK\n')
  })

  it('drops an entire confirmed planning material instead of keeping partial paragraphs', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'done',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'block-compaction', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const material = '[Confirmed planning material: premise]\n第一段完整正文\n\n第二段完整正文'
    const fullUserPrompt = `TARGET chapter evidence\n\n${material}`
    const expectedUserPrompt = 'TARGET chapter evidence\n\n'
    const partialMaterialBytes = new TextEncoder().encode(
      `S${expectedUserPrompt}[Confirmed planning material: premise]\n第一段完整正文`,
    ).byteLength

    const outcome = await harness.openSession().complete({
      purpose: 'block-compaction',
      output: 'visible-text',
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: fullUserPrompt },
      ],
      promptBudget: {
        limitUtf8Bytes: partialMaterialBytes,
        sections: [
          { sectionName: 'system-instructions', messageIndex: 0, finalText: 'S' },
          { sectionName: 'target-chapter', messageIndex: 1, finalText: 'TARGET chapter evidence' },
          { sectionName: 'confirmed-planning-material-1', messageIndex: 1, finalText: material,
            degradation: { priority: 0, strategy: 'whole-section' } },
        ],
      },
    })

    expect(complete.mock.calls[0]?.[0].messages[1]?.content).toBe(expectedUserPrompt)
    expect(outcome.receipt.promptBudget?.compaction?.sections).toEqual([{
      sectionName: 'confirmed-planning-material-1',
      originalUtf8Bytes: new TextEncoder().encode(material).byteLength,
      retainedUtf8Bytes: 0,
      removedUtf8Bytes: new TextEncoder().encode(material).byteLength,
    }])
  })

  it('keeps JSON string sections valid when compacting author configuration values', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'done',
      finishReason: 'stop',
    })
    const source = '{"coreOutline":"AéB"}'
    const fullBytes = new TextEncoder().encode(source).byteLength
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'json-string-compaction', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    const outcome = await harness.openSession().complete({
      purpose: 'json-string-compaction',
      output: 'visible-text',
      messages: [{ role: 'user', content: source }],
      promptBudget: {
        limitUtf8Bytes: fullBytes - 1,
        sections: [{
          sectionName: 'core-outline',
          messageIndex: 0,
          finalText: '"AéB"',
          degradation: { priority: 40, strategy: 'json-string' },
        }],
      },
    })

    const compacted = complete.mock.calls[0]?.[0].messages[0]?.content ?? ''
    expect(JSON.parse(compacted)).toEqual({ coreOutline: 'Aé' })
    expect(outcome.receipt.promptBudget).toMatchObject({
      totalUtf8Bytes: fullBytes - 1,
      compaction: {
        sections: [{
          sectionName: 'core-outline',
          originalUtf8Bytes: 6,
          retainedUtf8Bytes: 5,
          removedUtf8Bytes: 1,
        }],
      },
    })
  })

  it('reports a protected byte overflow before the generic context-window failure', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'recovered',
      finishReason: 'stop',
    })
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'small-context',
          model: model({ maxTokens: 100 }),
          modelExecutionLeaseId: 'lease-small-context',
          endpointFingerprint: 'small-context-endpoint',
          resolvedCapabilities: {
            contextWindowTokens: 600,
            maxOutputTokens: 100,
            reasoning: false,
            structuredOutput: true,
            usage: true,
            source: {
              contextWindowTokens: 'verified-provider-preset',
              maxOutputTokens: 'verified-provider-preset',
              featureFlags: 'verified-provider-preset',
            },
          },
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 200,
        maxRequestedOutputTokensPerAttempt: 100,
        deadlineMs: 60_000,
      },
    })
    const session = harness.openSession()
    const oversized = 'x'.repeat(100)

    await expect(session.complete({
      purpose: 'double-budget-overflow',
      output: 'structured-data',
      messages: [{ role: 'user', content: oversized }],
      promptBudget: {
        limitUtf8Bytes: 99,
        sections: [{ sectionName: 'global-guidance', messageIndex: 0, finalText: oversized }],
      },
    })).rejects.toMatchObject({
      name: 'PromptBudgetExceededError',
      code: 'PROMPT_BUDGET_EXHAUSTED',
      report: {
        totalUtf8Bytes: 100,
        limitUtf8Bytes: 99,
        reservedOutputTokens: 0,
        sections: [{ sectionName: 'global-guidance', utf8Bytes: 100 }],
      },
    })
    expect(complete).not.toHaveBeenCalled()

    const recovered = await session.complete({
      purpose: 'after-double-overflow',
      output: 'visible-text',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(recovered.receipt.budget).toMatchObject({ attempt: 1, cumulativeRequestedOutputTokens: 87 })
    diagnostic.mockRestore()
  })

  it('sends an in-budget protected author section unchanged and records only its size in the receipt', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: '{"ok":true}',
      finishReason: 'stop',
    })
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => {})
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const authorGuidance = 'Keep this 完整 guidance unchanged.'

    const outcome = await harness.openSession().complete({
      purpose: 'protected-guidance',
      output: 'structured-data',
      messages: [{ role: 'user', content: authorGuidance }],
      promptBudget: {
        limitUtf8Bytes: 128,
        sections: [{ sectionName: 'global-guidance', messageIndex: 0, finalText: authorGuidance }],
      },
    })

    expect(complete.mock.calls[0]?.[0].messages[0]?.content).toBe(authorGuidance)
    expect(outcome.receipt.promptBudget).toEqual({
      totalUtf8Bytes: 36,
      limitUtf8Bytes: 128,
      reservedOutputTokens: 4096,
      sections: [{ sectionName: 'global-guidance', utf8Bytes: 36 }],
      modelId: 'model-a',
      errorCode: 'OK',
    })
    expect(JSON.stringify(outcome.receipt)).not.toContain(authorGuidance)
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(authorGuidance)
    diagnostic.mockRestore()
  })

  it('reports the context-window-clamped output reservation in the compaction preflight', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'done',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'compaction-output-clamp',
          model: model({ maxTokens: 4096 }),
          modelExecutionLeaseId: 'compaction-output-lease',
          endpointFingerprint: 'compaction-output-endpoint',
          resolvedCapabilities: {
            contextWindowTokens: 1_200,
            maxOutputTokens: 4096,
            reasoning: false,
            structuredOutput: true,
            usage: true,
            source: {
              contextWindowTokens: 'verified-provider-preset',
              maxOutputTokens: 'verified-provider-preset',
              featureFlags: 'verified-provider-preset',
            },
          },
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const targetEvidence = 'TARGET evidence'
    const optionalContext = 'optional context '.repeat(8)
    const userPrompt = `${targetEvidence}|${optionalContext}`
    let preflightReport: PromptBudgetReport | undefined

    const outcome = await harness.openSession().complete({
      purpose: 'compaction-output-clamp',
      output: 'visible-text',
      messages: [
        { role: 'system', content: 'system policy' },
        { role: 'user', content: userPrompt },
      ],
      promptBudget: {
        limitUtf8Bytes: new TextEncoder().encode('system policy').length
          + new TextEncoder().encode(userPrompt).length - 2,
        sections: [
          { sectionName: 'system-instructions', messageIndex: 0, finalText: 'system policy' },
          { sectionName: 'target-chapter', messageIndex: 1, finalText: targetEvidence },
          { sectionName: 'distant-blueprints', messageIndex: 1, finalText: optionalContext, degradation: { priority: 0, strategy: 'utf8-prefix' } },
        ],
      },
    }, {
      onPromptBudgetPreflight: report => { preflightReport = report },
    })

    const physicalOutputReservation = complete.mock.calls[0]?.[0].plan.maxOutputTokens
    expect(physicalOutputReservation).toBeLessThan(4096)
    expect(preflightReport?.reservedOutputTokens).toBe(physicalOutputReservation)
    expect(outcome.receipt.promptBudget?.reservedOutputTokens).toBe(physicalOutputReservation)
  })

  it('rejects an invalid per-attempt requested-token cap before opening a session', () => {
    expect(() => createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete: vi.fn() },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 16_384,
        maxRequestedOutputTokensPerAttempt: 0,
        deadlineMs: 60_000,
      },
    })).toThrow(expect.objectContaining({ code: 'INVALID_POLICY' }))
  })

  it('does not classify a creative response without finishReason as completed', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'looks complete but has no provider terminal evidence',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 10_000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    const outcome = await harness.openSession().complete(task())

    expect(outcome).toMatchObject({
      status: 'incomplete',
      finishReason: 'unknown',
      receipt: { finishReason: 'unknown' },
    })
  })

  it('does not let a caller override the physical plan after the session resolves it', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'complete',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 10_000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const taskWithPhysicalOverride = {
      ...task(),
      maxTokens: 1,
      plan: { maxOutputTokens: 1 },
    }

    // @ts-expect-error Generation callers may describe intent, never physical request controls.
    const outcome = await harness.openSession().complete(taskWithPhysicalOverride)

    expect(outcome.status).toBe('completed')
    expect(complete.mock.calls[0]?.[0].plan).toMatchObject({ maxOutputTokens: 4096 })
    expect(Object.isFrozen(complete.mock.calls[0]?.[0].plan)).toBe(true)
  })

  it('charges failed physical requests to the global session budget and exposes a redacted attempt receipt', async () => {
    const complete = vi.fn<CompletionPort['complete']>()
      .mockRejectedValueOnce(new Error('provider unavailable: test-only-key'))
      .mockResolvedValueOnce({ content: 'complete', finishReason: 'stop' })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 5000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const session = harness.openSession()

    let failure: unknown
    try {
      await session.complete(task())
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({
      name: 'GenerationAttemptError',
      code: 'PROVIDER_REQUEST_FAILED',
      receipt: {
        finishReason: 'error',
        budget: {
          attempt: 1,
          requestedOutputTokens: 4096,
          cumulativeRequestedOutputTokens: 4096,
          maxRequestedOutputTokens: 5000,
          maxRequestedOutputTokensPerAttempt: 4096,
        },
      },
    })
    expect((failure as Error).cause).toBeUndefined()
    expect(String(failure)).not.toContain('test-only-key')

    const recovered = await session.complete(task())
    expect(recovered.receipt.budget).toMatchObject({
      attempt: 2,
      requestedOutputTokens: 904,
      cumulativeRequestedOutputTokens: 5000,
    })
    expect(complete.mock.calls[1]?.[0].plan.maxOutputTokens).toBe(904)
    expect(JSON.stringify(recovered.receipt)).not.toContain('test-only-key')
  })

  it('releases an unused per-attempt hold when the provider reports completion usage', async () => {
    // An interactive agent turn runs several rounds under one frozen session.
    // Charging every round its full worst-case reservation would exhaust the
    // session after two rounds even though the real output was tiny.
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'round',
      finishReason: 'stop',
      usage: {
        promptTokens: 1200,
        completionTokens: 700,
        totalTokens: 1900,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null,
      },
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'agent-model', model: model({ maxTokens: 128_000 }) }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 8,
        maxRequestedOutputTokens: 262_144,
        maxRequestedOutputTokensPerAttempt: 131_072,
        deadlineMs: 60_000,
      },
    })
    const session = harness.openSession()

    for (let round = 1; round <= 8; round += 1) {
      const outcome = await session.complete({ ...task(), purpose: `agent-round-${round}` })
      expect(outcome.status).toBe('completed')
      expect(outcome.receipt.budget).toMatchObject({
        attempt: round,
        requestedOutputTokens: 128_000,
        cumulativeRequestedOutputTokens: round * 700,
      })
    }
    expect(complete).toHaveBeenCalledTimes(8)
    expect(session.budget.maxRequestedOutputTokens).toBe(262_144)
  })

  it('keeps the reservation when the provider reports no completion usage', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'round',
      finishReason: 'stop',
      usage: {
        promptTokens: 1200,
        completionTokens: null,
        totalTokens: null,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null,
      },
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'agent-model', model: model({ maxTokens: 128_000 }) }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 8,
        maxRequestedOutputTokens: 262_144,
        maxRequestedOutputTokensPerAttempt: 131_072,
        deadlineMs: 60_000,
      },
    })
    const session = harness.openSession()

    const first = await session.complete(task())
    expect(first.receipt.budget.cumulativeRequestedOutputTokens).toBe(128_000)
    await session.complete(task())
    await session.complete(task())
    await expect(session.complete(task())).rejects.toMatchObject({
      code: 'REQUESTED_TOKEN_BUDGET_EXHAUSTED',
    })
  })

  it('never charges more than the reserved hold when usage over-reports', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'round',
      finishReason: 'stop',
      usage: {
        promptTokens: 10,
        completionTokens: 999_999,
        totalTokens: 1_000_009,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null,
      },
    })
    const session = createGenerationHarness({
      modelSource: { snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }) },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 5_000,
        maxRequestedOutputTokensPerAttempt: 4_096,
        deadlineMs: 60_000,
      },
    }).openSession()

    const outcome = await session.complete(task())
    expect(outcome.receipt.budget.cumulativeRequestedOutputTokens).toBe(4_096)
  })

  it('bounds a model capability above the application per-attempt ceiling', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'complete',
      finishReason: 'stop',
    })
    const session = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'huge-model', model: model({ maxTokens: 1_000_000 }) }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 4,
        maxRequestedOutputTokens: 16_384,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    }).openSession()

    expect(session.budget.maxRequestedOutputTokensPerAttempt).toBe(131_072)
    expect(session.budget.maxRequestedOutputTokens).toBe(393_216)
    await session.complete(task())
    expect(complete.mock.calls[0]?.[0].plan.maxOutputTokens).toBe(131_072)
  })

  it('freezes the global attempt, requested-token, and deadline budget against caller mutation', async () => {
    let currentTime = 1000
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'complete',
      finishReason: 'stop',
    })
    const policy = {
      maxAttempts: 2,
      maxRequestedOutputTokens: 5000,
      maxRequestedOutputTokensPerAttempt: 4096,
      deadlineMs: 60_000,
    }
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy,
      now: () => currentTime,
    })
    const session = harness.openSession()

    policy.maxAttempts = 99
    policy.maxRequestedOutputTokens = 99_999
    policy.maxRequestedOutputTokensPerAttempt = 99_999
    policy.deadlineMs = 999_999

    await session.complete(task())
    const second = await session.complete(task())
    expect(second.receipt.budget).toMatchObject({
      maxAttempts: 2,
      requestedOutputTokens: 904,
      cumulativeRequestedOutputTokens: 5000,
      maxRequestedOutputTokens: 5000,
      maxRequestedOutputTokensPerAttempt: 4096,
      deadlineAt: 61_000,
    })
    await expect(session.complete(task())).rejects.toMatchObject({
      code: 'ATTEMPT_BUDGET_EXHAUSTED',
    })

    const expired = harness.openSession()
    currentTime = 61_001
    await expect(expired.complete(task())).rejects.toMatchObject({
      code: 'DEADLINE_EXHAUSTED',
    })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('cancels an in-flight physical request while preserving its charged attempt receipt', async () => {
    let providerSignal: AbortSignal | undefined
    const complete = vi.fn<CompletionPort['complete']>().mockImplementation(request => {
      providerSignal = request.signal
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(new Error('adapter aborted')), { once: true })
      })
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 10_000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const cancellation = new AbortController()

    const pending = harness.openSession().complete(task(), { signal: cancellation.signal })
    cancellation.abort()

    await expect(pending).rejects.toMatchObject({
      name: 'GenerationAttemptError',
      code: 'CANCELLED',
      receipt: {
        finishReason: 'cancelled',
        budget: {
          attempt: 1,
          requestedOutputTokens: 4096,
          cumulativeRequestedOutputTokens: 4096,
        },
      },
    })
    expect(providerSignal?.aborted).toBe(true)
  })

  it('does not charge a physical attempt when cancellation already exists before planning', async () => {
    const complete = vi.fn<CompletionPort['complete']>()
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({ revision: 'revision-a', model: model() }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 2,
        maxRequestedOutputTokens: 10_000,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })
    const cancellation = new AbortController()
    cancellation.abort()

    await expect(harness.openSession().complete(task(), { signal: cancellation.signal }))
      .rejects.toMatchObject({ code: 'CANCELLED' })
    expect(complete).not.toHaveBeenCalled()
  })

  it('never copies endpoint credentials into the observable model fingerprint', async () => {
    const complete = vi.fn<CompletionPort['complete']>().mockResolvedValue({
      content: 'complete',
      finishReason: 'stop',
    })
    const harness = createGenerationHarness({
      modelSource: {
        snapshotDefaultModel: () => ({
          revision: 'revision-a',
          model: model({
            baseUrl: 'https://account:base-url-secret@provider-a.example/v1?api_key=query-secret',
          }),
        }),
      },
      completionPort: { complete },
      policy: {
        maxAttempts: 1,
        maxRequestedOutputTokens: 4096,
        maxRequestedOutputTokensPerAttempt: 4096,
        deadlineMs: 60_000,
      },
    })

    const outcome = await harness.openSession().complete(task())
    const fingerprint = outcome.receipt.model.endpointFingerprint

    expect(fingerprint).not.toContain('base-url-secret')
    expect(fingerprint).not.toContain('query-secret')
    expect(fingerprint).toContain('provider-a.example/v1')
  })
})
