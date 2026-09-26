import { afterEach, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/Dialog'
import '../../../index.css'

let root: Root | undefined
let host: HTMLDivElement | undefined
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

it('keeps a long dialog inside the viewport and lets its final action be reached', async () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root?.render(
    <Dialog open>
      <DialogContent>
        <DialogHeader><DialogTitle>Long dialog</DialogTitle></DialogHeader>
        <div>{Array.from({ length: 40 }, (_, index) => <p key={index} style={{ height: 40 }}>Finding {index + 1}</p>)}</div>
        <DialogFooter><button type="button">Continue</button></DialogFooter>
      </DialogContent>
    </Dialog>,
  ))

  const dialog = document.querySelector('[role="dialog"]') as HTMLElement
  const button = dialog.querySelector('button') as HTMLButtonElement
  expect(dialog.getBoundingClientRect().top).toBeGreaterThanOrEqual(0)
  expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
  expect(dialog.scrollHeight).toBeGreaterThan(dialog.clientHeight)
  dialog.scrollTop = dialog.scrollHeight
  expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
})
