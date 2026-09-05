import { describe, expect, it, vi } from 'vitest'

import {
  isPreV1LayoutPreference,
  isPreV1ThemePreference,
  migrateUnambiguousPreV1Preference,
} from '../pre-v1-preference-migration'

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

const theme = JSON.stringify({ state: { theme: 'galaxy', zoom: 1.1, writingFont: 'lxgw-wenkai', uiFont: 'noto-sans-sc' }, version: 0 })
const layout = JSON.stringify({ state: { bottomPanelFloating: true, floatingBounds: { x: 12, y: 24, width: 640, height: 400 } }, version: 0 })

describe('neutral pre-v1 preference migration', () => {
  it('moves one unambiguous schema-valid theme candidate to the current key', () => {
    const storage = new MemoryStorage()
    const oldKey = ['retired', 'desktop', 'theme'].join('-')
    storage.setItem(oldKey, theme)
    expect(migrateUnambiguousPreV1Preference(storage, { targetKey: 'inkweaver-theme', suffix: '-theme', validate: isPreV1ThemePreference })).toBe(true)
    expect(storage.getItem('inkweaver-theme')).toBe(theme)
    expect(storage.getItem(oldKey)).toBeNull()
  })

  it('moves one unambiguous schema-valid layout candidate to the current key', () => {
    const storage = new MemoryStorage()
    const oldKey = ['retired', 'desktop', 'layout'].join('-')
    storage.setItem(oldKey, layout)
    expect(migrateUnambiguousPreV1Preference(storage, { targetKey: 'inkweaver-layout', suffix: '-layout', validate: isPreV1LayoutPreference })).toBe(true)
    expect(storage.getItem('inkweaver-layout')).toBe(layout)
    expect(storage.getItem(oldKey)).toBeNull()
  })

  it.each([
    ['corrupt candidate', [['retired-desktop-theme', '{bad json']]],
    ['ambiguous candidates', [['retired-one-theme', theme], ['retired-two-theme', theme]]],
    ['unrelated schema', [['retired-desktop-theme', JSON.stringify({ state: { color: 'blue' }, version: 0 })]]],
  ])('fails safely for %s', (_label, entries) => {
    const storage = new MemoryStorage()
    for (const [key, value] of entries) storage.setItem(key, value)
    expect(migrateUnambiguousPreV1Preference(storage, { targetKey: 'inkweaver-theme', suffix: '-theme', validate: isPreV1ThemePreference })).toBe(false)
    expect(storage.getItem('inkweaver-theme')).toBeNull()
    for (const [key, value] of entries) expect(storage.getItem(key)).toBe(value)
  })

  it('does not overwrite an existing current preference', () => {
    const storage = new MemoryStorage()
    storage.setItem('inkweaver-theme', JSON.stringify({ state: { theme: 'paper' }, version: 1 }))
    storage.setItem('retired-desktop-theme', theme)
    expect(migrateUnambiguousPreV1Preference(storage, { targetKey: 'inkweaver-theme', suffix: '-theme', validate: isPreV1ThemePreference })).toBe(false)
    expect(storage.getItem('retired-desktop-theme')).toBe(theme)
  })

  it('hydrates the layout store from the migrated preference', async () => {
    vi.resetModules()
    const storage = new MemoryStorage()
    const oldKey = ['retired', 'desktop', 'layout'].join('-')
    storage.setItem(oldKey, layout)
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })

    const { useLayoutStore } = await import('../layout-store')
    await useLayoutStore.persist.rehydrate()

    expect(useLayoutStore.getState()).toMatchObject({
      bottomPanelFloating: true,
      floatingBounds: { x: 12, y: 24, width: 640, height: 400 },
    })
    expect(storage.getItem('inkweaver-layout')).toBe(layout)
    expect(storage.getItem(oldKey)).toBeNull()
  })
})
