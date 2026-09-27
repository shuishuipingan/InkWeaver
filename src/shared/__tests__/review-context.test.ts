import { describe, expect, it } from 'vitest'
import { buildFinalizedReviewContext } from '../review-context'

describe('finalized-only review context', () => {
  it('uses only prior finalized projections and excludes later chapter evidence', () => {
    const context = buildFinalizedReviewContext([
      { draftId: 1, chapterNumber: 1, chapterTitle: '定稿过往', chapterNotes: '主角取得旧钥匙。', facts: [
        { category: 'plot', entities: ['主角'], statement: '主角获得旧钥匙。', sourceChapter: 1, evidence: '他把钥匙收进衣袋。' },
      ] },
      { draftId: 99, chapterNumber: 99, chapterTitle: '尚未到来的故事', chapterNotes: '知识库里后面的剧情。' },
    ], 2, ['主角'])
    expect(context).toContain('第1章 定稿过往')
    expect(context).toContain('主角获得旧钥匙')
    expect(context).not.toContain('尚未到来的故事')
    expect(context).toContain('知识库导入文档')
  })
})
