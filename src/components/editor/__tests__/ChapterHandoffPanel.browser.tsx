import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import ChapterHandoffPanel from '../ChapterHandoffPanel'
import type { ChapterHandoffRecord } from '../../../shared/chapter-handoff'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

const candidate: ChapterHandoffRecord = {
  handoffId: 'handoff-ui-1',
  draftId: 3,
  chapterNumber: 2,
  sourceContentHash: 'd'.repeat(64),
  sceneLocation: '旧码头',
  viewpoint: '林舟',
  presentCharacters: ['林舟'],
  unfinishedActions: ['打开暗锁'],
  immediateGoal: '确认门后是否有人',
  emotionalState: '警惕',
  constraints: ['不能遗失钥匙'],
  openQuestions: ['门后是谁？'],
  transition: 'continue-scene',
  evidence: ['林舟握着钥匙，听见门后有人叫出了他的名字。'],
  status: 'candidate',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
}

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('ChapterHandoffPanel', () => {
  it('shows candidate evidence and lets the author confirm it', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const onConfirm = vi.fn(async () => {})
    const text = (zh: string, _en: string) => zh

    await act(async () => root.render(
      <ChapterHandoffPanel records={[candidate]} onConfirm={onConfirm} text={text} />,
    ))

    expect(container.textContent).toContain('旧码头')
    expect(container.textContent).toContain('打开暗锁')
    expect(container.textContent).toContain('林舟握着钥匙')
    expect(container.textContent).toContain('紧接现场')
    expect(container.textContent).toContain('不能遗失钥匙')
    expect(container.textContent).toContain('在场人物：林舟')
    const button = Array.from(container.querySelectorAll('button'))
      .find(node => node.textContent?.includes('确认并用于下一章'))
    expect(button).toBeTruthy()

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onConfirm).toHaveBeenCalledWith('handoff-ui-1')
  })
})
