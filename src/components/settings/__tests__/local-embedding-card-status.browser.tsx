import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useLocaleStore } from '../../../stores/locale-store'
import { LocalEmbeddingCard } from '../LocalEmbeddingCard'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const originalLocaleState = useLocaleStore.getState()

interface TestVelaApi {
  invoke: ReturnType<typeof vi.fn>
  on: () => () => void
  once: () => void
  send: () => void
  setZoomLevel: () => void
  setZoomFactor: () => void
  getZoomLevel: () => number
}

function catalogResponse(downloaded: boolean) {
  return {
    entries: [
      {
        modelId: 'bge-small-zh-v1.5',
        displayName: 'BGE Small ZH v1.5',
        dimension: 512,
        approxSizeText: '95 MB',
        license: 'MIT',
        descriptionZh: '轻量中文向量模型',
        descriptionEn: 'Lightweight Chinese embedding model',
        downloaded,
      },
    ],
    source: 'auto',
    selectedModelId: 'bge-small-zh-v1.5',
    downloadedModelIds: downloaded ? ['bge-small-zh-v1.5'] : [],
    cacheDir: 'C:/userData/models/embedding',
  }
}

let root: Root | undefined
let container: HTMLDivElement | undefined

async function renderCard(downloaded: boolean, locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  useLocaleStore.setState({ locale })
  const invoke = vi.fn(async (channel: string) => (
    channel === 'llm:local-embedding-catalog' ? catalogResponse(downloaded) : { success: true }
  ))
  ;(window as unknown as { velaAPI: TestVelaApi }).velaAPI = {
    invoke,
    on: () => () => {},
    once: () => {},
    send: () => {},
    setZoomLevel: () => {},
    setZoomFactor: () => {},
    getZoomLevel: () => 0,
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(<LocalEmbeddingCard />) })
  await vi.waitFor(() => {
    expect(container?.querySelector('[data-local-embedding-card]')).not.toBeNull()
  })
}

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  useLocaleStore.setState(originalLocaleState)
})

describe('local embedding card selected-model readiness', () => {
  it('warns instead of showing a ready check when the selected model is not downloaded', async () => {
    await renderCard(false)
    await expect.element(page.getByText(/已选中 bge-small-zh-v1\.5/)).toBeVisible()
    expect(container?.textContent).not.toContain('当前选中：bge-small-zh-v1.5')
    expect(container?.querySelector('[data-local-embedding-selected-not-ready]')).not.toBeNull()
  })

  it('keeps the ready check when the selected model is downloaded', async () => {
    await renderCard(true)
    await expect.element(page.getByText('当前选中：bge-small-zh-v1.5', { exact: true })).toBeVisible()
    expect(container?.querySelector('[data-local-embedding-selected-not-ready]')).toBeNull()
  })

  it('localizes the model metadata line through the locale store', async () => {
    await renderCard(true, 'en-US')
    await act(async () => {
      await page.getByRole('button', { name: 'Browse models' }).click()
    })
    await expect.element(page.getByText('512 dims · ~95 MB · MIT', { exact: true })).toBeVisible()
  })
})
