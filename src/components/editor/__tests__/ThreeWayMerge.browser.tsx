import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ThreeWayMerge from '../ThreeWayMerge'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('ThreeWayMerge', () => {
  it('locks a segment so the revision cannot replace author-preserved text', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root.render(
      <ThreeWayMerge
        originalContent={'第一段保留。\n\n原结尾。'}
        modifiedContent={'第一段保留。\n\n新结尾。'}
        onComplete={() => {}}
      />,
    ))

    const lock = container.querySelector<HTMLButtonElement>('.twm-lock-toggle')
    const adopt = container.querySelector<HTMLButtonElement>('.twm-adopt')
    expect(lock).not.toBeNull()
    expect(adopt).not.toBeNull()
    await act(async () => lock?.click())
    expect(container.querySelector<HTMLElement>('.twm-editable')?.getAttribute('contenteditable')).toBe('false')
    await act(async () => adopt?.click())
    expect(adopt?.classList.contains('adopted')).toBe(false)

    await act(async () => lock?.click())
    await act(async () => adopt?.click())
    expect(adopt?.classList.contains('adopted')).toBe(true)
  })
})
