import { describe, expect, it } from 'vitest'

import { formatChapterHandoff } from '../chapter-handoff-context'
import type { ChapterHandoffRecord } from '../../shared/chapter-handoff'

const handoff: ChapterHandoffRecord = {
  handoffId: 'handoff-1',
  draftId: 7,
  chapterNumber: 3,
  sourceContentHash: 'a'.repeat(64),
  sceneLocation: '旧码头的仓库',
  viewpoint: '林舟',
  presentCharacters: ['林舟', '沈月'],
  unfinishedActions: ['林舟尚未打开暗锁'],
  immediateGoal: '确认门后是否有人',
  emotionalState: '警惕，因为门后有人叫出他的名字',
  constraints: ['不能遗失染血的钥匙'],
  openQuestions: ['门后的人是谁？'],
  transition: 'continue-scene',
  evidence: ['他握着钥匙，听见门后有人叫出了他的名字。'],
  status: 'confirmed',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
  confirmedAt: '2026-09-06T00:00:00.000Z',
}

describe('formatChapterHandoff', () => {
  it('renders the immediate scene handoff with evidence and continuation instruction', () => {
    const result = formatChapterHandoff(handoff, 'zh-CN')

    expect(result).toContain('旧码头的仓库')
    expect(result).toContain('林舟尚未打开暗锁')
    expect(result).toContain('门后的人是谁？')
    expect(result).toContain('他握着钥匙')
    expect(result).toContain('不得重置')
  })

  it('uses English labels when the project writing language is English', () => {
    const result = formatChapterHandoff(handoff, 'en-US')

    expect(result).toContain('Scene location')
    expect(result).toContain('Unfinished actions')
    expect(result).toContain('Do not reset')
  })
})
