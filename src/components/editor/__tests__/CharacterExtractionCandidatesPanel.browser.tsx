import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import CharacterExtractionCandidatesPanel from '../CharacterExtractionCandidatesPanel'
import type { CharacterExtractionCandidate } from '../../../shared/character-extraction'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

const candidate: CharacterExtractionCandidate = {
  candidateId: 'candidate-ui-1',
  source: { sourceId: 'chapter-1', sourceHash: 'a'.repeat(64), kind: 'chapter', chapterNumbers: [1] },
  name: '沈月',
  aliases: ['月儿'],
  disposition: 'new',
  status: 'pending',
  fields: { personality: '谨慎' },
  fieldEvidence: [{ field: 'personality', value: '谨慎', excerpt: '沈月没有立刻回答。' }],
}

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('CharacterExtractionCandidatesPanel', () => {
  it('shows evidence and sends an author status decision', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const onStatus = vi.fn(async () => {})
    const text = (zh: string, _en: string) => zh

    await act(async () => root.render(
      <CharacterExtractionCandidatesPanel
        candidates={[candidate]}
        onRefresh={vi.fn()}
        onStatus={onStatus}
        onApply={vi.fn(async () => {})}
        text={text}
      />,
    ))

    expect(container.textContent).toContain('沈月')
    expect(container.textContent).toContain('沈月没有立刻回答')
    const button = Array.from(container.querySelectorAll('button'))
      .find(node => node.textContent?.includes('接受'))
    expect(button).toBeTruthy()
    await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onStatus).toHaveBeenCalledWith('candidate-ui-1', 'accepted')
  })

  it('requires an explicit target for an ambiguous same-name candidate before apply', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const onApply = vi.fn(async () => {})
    const text = (zh: string, _en: string) => zh
    await act(async () => root.render(
      <CharacterExtractionCandidatesPanel
        candidates={[{ ...candidate, candidateId: 'ambiguous-ui-1', name: '林舟', disposition: 'ambiguous', status: 'accepted' }]}
        onRefresh={vi.fn()}
        onStatus={vi.fn(async () => {})}
        onApply={onApply}
        text={text}
      />
    ))
    expect(container.textContent).toContain('同名角色需要作者明确选择')
    const apply = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('合并已接受'))
    expect(apply?.hasAttribute('disabled')).toBe(true)
    const target = container.querySelector<HTMLInputElement>('input[aria-label*="选择现有角色"]')
    expect(target).not.toBeNull()
    if (target) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(target, '沈月')
        target.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const enabledApply = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent?.includes('合并已接受'))
    await act(async () => enabledApply?.click())
    expect(onApply).toHaveBeenCalledWith(expect.anything(), { 'ambiguous-ui-1': '沈月' })
  })

  it('shows a dedicated growth-arc and current-state review section', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const text = (zh: string, _en: string) => zh
    await act(async () => root.render(
      <CharacterExtractionCandidatesPanel
        candidates={[{
          ...candidate,
          candidateId: 'growth-arc-ui-1',
          status: 'accepted',
          fields: { arc: '从回避真相转向主动追查' },
          currentState: { mentalState: '谨慎但坚定', recentEvents: '发现旧钥匙与信件有关' },
        }]}
        onRefresh={vi.fn()}
        onStatus={vi.fn(async () => {})}
        onApply={vi.fn(async () => {})}
        text={text}
      />,
    ))
    const growth = container.querySelector('[data-character-growth-arc="true"]')
    expect(growth).not.toBeNull()
    expect(growth?.textContent).toContain('人物成长弧与状态')
    expect(growth?.textContent).toContain('从回避真相转向主动追查')
    expect(growth?.textContent).toContain('谨慎但坚定')
  })
})
