import { describe, expect, it } from 'vitest'

import {
  buildBlueprintTitleBatchPrompt,
  chunkBlueprintTitleTargets,
  parseBlueprintTitleSuggestions,
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
