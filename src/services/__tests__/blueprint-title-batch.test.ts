import { describe, expect, it, vi } from 'vitest'

import {
  buildBlueprintTitleBatchPrompt,
  chunkBlueprintTitleTargets,
  parseBlueprintTitleSuggestions,
  generateBlueprintTitleSuggestions,
  type BlueprintTitleSource,
} from '../blueprint-title-batch'

const target = (chapterNumber: number): BlueprintTitleSource => ({
  chapterNumber,
  title: `旧标题${chapterNumber}`,
  role: '发展',
  purpose: `让第${chapterNumber}章的主角作出选择`,
  keyEvents: `主角在第${chapterNumber}章发现新的线索并当面追问。`,
  suspenseHook: '追问尚未得到回答。',
})

describe('blueprint title batch', () => {
  it('splits a length-truncated batch and never accepts its incomplete candidates', async () => {
    const request = vi.fn(async (targets: readonly BlueprintTitleSource[], maxTokens: number) => {
      expect(maxTokens).toBe(16_384)
      return targets.length > 1
      ? { success: false, finishReason: 'length', content: '{"titles":[{"chapterNumber":1,"title":"坏候选"}]}' }
      : { success: true, finishReason: 'stop', content: JSON.stringify({ titles: targets.map(item => ({ chapterNumber: item.chapterNumber, title: `夜信${item.chapterNumber}` })) }) }
    })
    const result = await generateBlueprintTitleSuggestions({ targets: [target(1), target(2)], writingLanguage: 'zh-CN', request })
    expect(result.suggestions.map(item => item.title)).toEqual(['夜信1', '夜信2'])
    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls[0]?.[1]).toBe(16_384)
  })

  it('preserves completed sub-batches when a later request fails and honors model limits', async () => {
    const onSuggestions = vi.fn()
    const request = vi.fn(async (targets: readonly BlueprintTitleSource[], maxTokens: number) => {
      expect(maxTokens).toBe(2_048)
      return targets.length > 1
      ? { success: false, finishReason: 'length', content: '' }
      : targets[0]!.chapterNumber === 1
        ? { success: true, finishReason: 'stop', content: '{"titles":[{"chapterNumber":1,"title":"雨夜来信"}]}' }
        : { success: false, finishReason: 'error', content: '', error: 'HTTP 402' }
    })
    await expect(generateBlueprintTitleSuggestions({ targets: [target(1), target(2)], writingLanguage: 'zh-CN', configuredMaxTokens: 2_048, request, onSuggestions }))
      .rejects.toThrow(/402/)
    expect(onSuggestions).toHaveBeenCalledWith([{ chapterNumber: 1, title: '雨夜来信' }])
    expect(request.mock.calls.every(call => call[1] === 2_048)).toBe(true)
  })

  it('repairs summary-like titles once, using concise novel-title constraints', async () => {
    const prompt = buildBlueprintTitleBatchPrompt({ writingLanguage: 'zh-CN', core: {}, targets: [target(1)], adjacent: [] })
    expect(prompt).toContain('不要剧情梗概')
    const request = vi.fn()
      .mockResolvedValueOnce({ success: true, finishReason: 'stop', content: JSON.stringify({ titles: [{ chapterNumber: 1, title: '主角在夜晚发现了隐藏很久的线索并且当面追问陌生人' }] }) })
      .mockResolvedValueOnce({ success: true, finishReason: 'stop', content: '{"titles":[{"chapterNumber":1,"title":"夜信藏锋"}]}' })
    const result = await generateBlueprintTitleSuggestions({ targets: [target(1)], writingLanguage: 'zh-CN', request })
    expect(result.suggestions).toEqual([{ chapterNumber: 1, title: '夜信藏锋' }])
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('repairs duplicate titles across recovered sub-batches', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ success: false, finishReason: 'length', content: '' })
      .mockResolvedValueOnce({ success: true, finishReason: 'stop', content: '{"titles":[{"chapterNumber":1,"title":"雨夜来信"}]}' })
      .mockResolvedValueOnce({ success: true, finishReason: 'stop', content: '{"titles":[{"chapterNumber":2,"title":"雨夜来信"}]}' })
      .mockResolvedValueOnce({ success: true, finishReason: 'stop', content: '{"titles":[{"chapterNumber":2,"title":"门后回声"}]}' })
    const result = await generateBlueprintTitleSuggestions({ targets: [target(1), target(2)], writingLanguage: 'zh-CN', request })
    expect(result.suggestions.map(item => item.title)).toEqual(['雨夜来信', '门后回声'])
  })
  it('chunks every requested chapter without dropping or reordering titles', () => {
    const sources = Array.from({ length: 21 }, (_, index) => target(index + 1))

    expect(chunkBlueprintTitleTargets(sources).map(batch => batch.map(item => item.chapterNumber)))
      .toEqual([
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        [21],
      ])
  })

  it('builds prompts from chapter facts and project direction', () => {
    const prompt = buildBlueprintTitleBatchPrompt({
      writingLanguage: 'zh-CN',
      core: { genre: '都市悬疑', premise: '林舟追查一封旧信' },
      targets: [target(4)],
      adjacent: [target(3)],
    })

    expect(prompt).toContain('都市悬疑')
    expect(prompt).toContain('让第4章的主角作出选择')
    expect(prompt).toContain('主角在第4章发现新的线索并当面追问。')
    expect(prompt).toContain('旧标题3')
  })

  it('requires one bounded, non-empty title for every requested chapter', () => {
    expect(parseBlueprintTitleSuggestions(
      JSON.stringify({ titles: [{ chapterNumber: 2, title: '雨夜来信' }, { chapterNumber: 1, title: '门后的回声' }] }),
      [1, 2],
    )).toEqual([
      { chapterNumber: 1, title: '门后的回声' },
      { chapterNumber: 2, title: '雨夜来信' },
    ])
    expect(() => parseBlueprintTitleSuggestions(
      JSON.stringify({ titles: [{ chapterNumber: 1, title: '题'.repeat(61) }] }),
      [1],
    )).toThrow(/标题/u)
  })

  it.each([
    ['missing chapter', { titles: [{ chapterNumber: 1, title: '门后的回声' }] }, [1, 2]],
    ['duplicate chapter', { titles: [{ chapterNumber: 1, title: '门后的回声' }, { chapterNumber: 1, title: '雨夜来信' }] }, [1]],
    ['empty title', { titles: [{ chapterNumber: 1, title: '   ' }] }, [1]],
  ])('rejects a %s in the model response', (_label, response, expected) => {
    expect(() => parseBlueprintTitleSuggestions(JSON.stringify(response), expected as number[])).toThrow()
  })
})
