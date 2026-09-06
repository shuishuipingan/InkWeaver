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
})
