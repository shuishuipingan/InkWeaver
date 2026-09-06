import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import '../../../index.css'
import { classifyRelation, relationShortLabel } from '../../../shared/relationship-presentation'
import RelationshipGraph from '../RelationshipGraph'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface FillTextCall {
  text: string
  fillStyle: string
}

let root: Root
let container: HTMLDivElement
let fillTextCalls: FillTextCall[]
let strokeStyleCalls: string[]
let dashCalls: number[][]
let saveCalls: ReturnType<typeof vi.fn>
let restoreCalls: ReturnType<typeof vi.fn>
let translateCalls: ReturnType<typeof vi.fn>
let scaleCalls: ReturnType<typeof vi.fn>

async function waitForAnimationFrames(count: number) {
  for (let index = 0; index < count; index++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

beforeEach(() => {
  fillTextCalls = []
  strokeStyleCalls = []
  dashCalls = []
  saveCalls = vi.fn()
  restoreCalls = vi.fn()
  translateCalls = vi.fn()
  scaleCalls = vi.fn()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      clearRect: vi.fn(),
      save: saveCalls,
      restore: restoreCalls,
      translate: translateCalls,
      scale: scaleCalls,
      setTransform: vi.fn(),
      setLineDash(dash: number[]) {
        dashCalls.push([...dash])
      },
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke() {
        strokeStyleCalls.push(String(this.strokeStyle))
      },
      arc: vi.fn(),
      fill: vi.fn(),
      measureText(text: string) {
        return { width: String(text).length * 6 }
      },
      fillText(text: string) {
        fillTextCalls.push({ text, fillStyle: String(this.fillStyle) })
      },
      strokeText() {},
      globalAlpha: 1,
      lineJoin: 'miter',
    }
    return context as unknown as CanvasRenderingContext2D
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.documentElement.classList.remove('paper', 'galaxy', 'dark')
  vi.restoreAllMocks()
})

describe('RelationshipGraph readable theme text', () => {
  it.each([
    ['light', 'rgb(43, 42, 38)'],
    ['paper', 'rgb(43, 42, 38)'],
    ['galaxy', 'rgb(224, 236, 244)'],
    ['dark', 'rgb(212, 212, 212)'],
  ])('renders character names with the %s theme text semantic', async (theme, expectedTextColor) => {
    container.className = theme

    await act(async () => root.render(
      <RelationshipGraph characters={[{
        name: '林墨',
        // 修复前该角色姓名固定使用 #54666E，在 galaxy 和 dark 面板上
        // 测得的对比度都低于 3:1。
        role: 'antagonist',
        relationships: '',
      }]} />,
    ))

    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(getComputedStyle(canvas!).color).toBe(expectedTextColor)
    expect(fillTextCalls.find((call) => call.text === '林墨')?.fillStyle).toBe(expectedTextColor)
    expect(saveCalls).toHaveBeenCalled()
    expect(translateCalls).toHaveBeenCalledWith(0, 0)
    expect(scaleCalls).toHaveBeenCalledWith(1, 1)
    expect(restoreCalls).toHaveBeenCalledTimes(saveCalls.mock.calls.length)
  })

  it.each([
    ['light', '#6E6A5F'],
    ['paper', '#6E6A5F'],
    ['galaxy', '#8BA4BE'],
    ['dark', '#A0A0A0'],
  ])('renders relationship labels with the readable %s secondary-text semantic', async (theme, expectedTextColor) => {
    container.className = theme

    await act(async () => root.render(
      <RelationshipGraph characters={[
        {
          name: '林墨',
          role: 'protagonist',
          relationships: JSON.stringify([{ target: '周砧', relation: '共同追查' }]),
        },
        { name: '周砧', role: 'supporting', relationships: '' },
      ]} />,
    ))

    expect(fillTextCalls.find((call) => call.text === '共同追查')?.fillStyle)
      .toBe(expectedTextColor)
  })

  it.each([
    ['light', '#34435C'],
    ['paper', '#4B3E2C'],
    ['galaxy', '#E2EDF7'],
    ['dark', '#E2E2E2'],
  ])('maps %s image-skin relationship labels to its high-contrast secondary text semantic', async (theme, expectedTextColor) => {
    container.className = `app-skin-root ${theme}`
    container.dataset.theme = theme
    container.dataset.skinReadability = 'high-contrast'

    await act(async () => root.render(
      <RelationshipGraph characters={[
        {
          name: '林墨',
          role: 'protagonist',
          relationships: JSON.stringify([{ target: '周砧', relation: '共同追查' }]),
        },
        { name: '周砧', role: 'supporting', relationships: '' },
      ]} />,
    ))

    expect(fillTextCalls.find((call) => call.text === '共同追查')?.fillStyle)
      .toBe(expectedTextColor)
  })

  it('redraws the mounted canvas when the document theme changes', async () => {
    document.documentElement.classList.add('paper')

    await act(async () => root.render(
      <RelationshipGraph characters={[{
        name: '林墨',
        role: 'antagonist',
        relationships: '',
      }]} />,
    ))

    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(fillTextCalls.filter((call) => call.text === '林墨').at(-1)?.fillStyle)
      .toBe('rgb(43, 42, 38)')

    fillTextCalls = []
    document.documentElement.classList.remove('paper')
    document.documentElement.classList.add('dark')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(container.querySelector('canvas')).toBe(canvas)
    expect(fillTextCalls.filter((call) => call.text === '林墨').at(-1)?.fillStyle)
      .toBe('rgb(212, 212, 212)')
  })

  it('redraws the mounted canvas when the resident image skin changes', async () => {
    container.className = 'app-skin-root paper'
    container.dataset.theme = 'paper'
    container.dataset.skin = 'classic'
    container.dataset.skinReadability = 'theme-default'

    await act(async () => root.render(
      <RelationshipGraph characters={[
        {
          name: '林墨',
          role: 'protagonist',
          relationships: JSON.stringify([{ target: '周砧', relation: '共同追查' }]),
        },
        { name: '周砧', role: 'supporting', relationships: '' },
      ]} />,
    ))

    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(fillTextCalls.find((call) => call.text === '林墨')?.fillStyle)
      .toBe('rgb(43, 42, 38)')
    expect(fillTextCalls.find((call) => call.text === '共同追查')?.fillStyle)
      .toBe('#6E6A5F')

    await waitForAnimationFrames(125)
    fillTextCalls = []
    container.dataset.skin = 'anime'
    container.dataset.skinReadability = 'high-contrast'
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(container.querySelector('canvas')).toBe(canvas)
    expect(fillTextCalls.find((call) => call.text === '林墨')?.fillStyle)
      .toBe('rgb(34, 29, 23)')
    expect(fillTextCalls.find((call) => call.text === '共同追查')?.fillStyle)
      .toBe('#4B3E2C')

    fillTextCalls = []
    container.dataset.skin = 'custom'
    container.style.setProperty('--skin-text-primary', '#123456')
    container.style.setProperty('--skin-text-secondary', '#654321')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(container.querySelector('canvas')).toBe(canvas)
    expect(fillTextCalls.find((call) => call.text === '林墨')?.fillStyle)
      .toBe('rgb(18, 52, 86)')
    expect(fillTextCalls.find((call) => call.text === '共同追查')?.fillStyle)
      .toBe('#654321')
  })

  it('reads role decoration colors from runtime CSS semantics', async () => {
    container.style.setProperty('--color-role-protagonist', '#112233')
    container.style.setProperty('--color-role-antagonist', '#223344')
    container.style.setProperty('--color-role-supporting', '#334455')
    container.style.setProperty('--color-role-minor', '#445566')

    await act(async () => root.render(
      <RelationshipGraph characters={[
        { name: '主角', role: 'protagonist', relationships: '' },
        { name: '反派', role: 'antagonist', relationships: '' },
        { name: '配角', role: 'supporting', relationships: '' },
        { name: '路人', role: 'minor', relationships: '' },
      ]} />,
    ))

    expect(new Set(strokeStyleCalls)).toEqual(new Set([
      '#112233',
      '#223344',
      '#334455',
      '#445566',
    ]))
  })
})

describe('RelationshipGraph relation kinds', () => {
  it('provides character search and relationship-kind filtering controls', async () => {
    await act(async () => root.render(
      <RelationshipGraph characters={[
        { name: '林墨', role: 'protagonist', relationships: '周砧——杀父之仇' },
        { name: '周砧', role: 'supporting', relationships: '' },
        { name: '苏晚', role: 'supporting', relationships: '林墨——挚友' },
      ]} />,
    ))

    const search = container.querySelector('input[aria-label="搜索角色"]')
    const filter = container.querySelector('select[aria-label="按关系类型筛选"]')
    expect(search).not.toBeNull()
    expect(filter).not.toBeNull()
    if (!search || !filter) throw new Error('graph filter controls not found')
    expect((filter as HTMLSelectElement).value).toBe('all')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(search, '林墨')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toContain('3')
  })

  it('classifies free-text relations into graph kinds by keywords', () => {
    expect(classifyRelation('杀父之仇')).toBe('hostile')
    expect(classifyRelation('竞争对手')).toBe('hostile')
    expect(classifyRelation('未婚妻')).toBe('romance')
    expect(classifyRelation('师父')).toBe('mentor')
    expect(classifyRelation('亲生妹妹')).toBe('family')
    expect(classifyRelation('挚友')).toBe('ally')
    expect(classifyRelation('生死之交')).toBe('ally')
    expect(classifyRelation('共同追查真相')).toBe('neutral')
    expect(classifyRelation('')).toBe('neutral')
  })

  it('extracts short edge labels from storage-style and annotated relations', () => {
    expect(relationShortLabel('关系：搭档；矛盾张力：争抢灵脉')).toBe('搭档')
    expect(relationShortLabel('挚友（生死之交）')).toBe('挚友')
    expect(relationShortLabel('——搭档')).toBe('搭档')
    expect(relationShortLabel('共同追查真相')).toBe('共同追查真相')
    expect(relationShortLabel('一个特别特别长的关系描述文字')).toBe('一个特别特别长的关…')
  })

  it('draws each relation kind with its theme color and line dash', async () => {
    container.style.setProperty('--color-rel-hostile', '#AA0000')
    container.style.setProperty('--color-rel-ally', '#00AA00')
    container.style.setProperty('--color-rel-romance', '#AA00AA')

    await act(async () => root.render(
      <RelationshipGraph characters={[
        {
          name: '林墨',
          role: 'protagonist',
          relationships: '周砧——杀父之仇\n苏晚——未婚妻\n陈锋——挚友\n老祖——共同追查真相',
        },
        { name: '周砧', role: 'supporting', relationships: '' },
        { name: '苏晚', role: 'supporting', relationships: '' },
        { name: '陈锋', role: 'supporting', relationships: '' },
        { name: '老祖', role: 'supporting', relationships: '' },
      ]} />,
    ))

    // 每条关系按类型着色（低透明度的常驻态 + 命中态同色系）
    expect(strokeStyleCalls.filter((style) => style.startsWith('#AA0000'))).not.toHaveLength(0)
    expect(strokeStyleCalls.filter((style) => style.startsWith('#AA00AA'))).not.toHaveLength(0)
    expect(strokeStyleCalls.filter((style) => style.startsWith('#00AA00'))).not.toHaveLength(0)
    // 敌对长虚线、恋情点线；亲情/友好/相识走实线（空 dash）
    expect(dashCalls).toContainEqual([7, 4])
    expect(dashCalls).toContainEqual([2, 4])
  })

  it('renders a legend for the kinds present and hides it when there are no edges', async () => {
    await act(async () => root.render(
      <RelationshipGraph characters={[
        { name: '林墨', role: 'protagonist', relationships: '周砧——杀父之仇\n陈锋——挚友' },
        { name: '周砧', role: 'supporting', relationships: '' },
        { name: '陈锋', role: 'supporting', relationships: '' },
      ]} />,
    ))
    const legend = container.querySelector('[data-relationship-legend="true"]')
    expect(legend?.textContent).toContain('敌对')
    expect(legend?.textContent).toContain('友好')
    expect(legend?.textContent).not.toContain('恋情')

    await act(async () => root.unmount())
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root.render(
      <RelationshipGraph characters={[
        { name: '林墨', role: 'protagonist', relationships: '' },
        { name: '周砧', role: 'supporting', relationships: '' },
      ]} />,
    ))
    expect(container.querySelector('[data-relationship-legend="true"]')).toBeNull()
  })

  it('merges duplicate pair edges into one line and keeps labels short', async () => {
    await act(async () => root.render(
      <RelationshipGraph characters={[
        {
          name: '林墨',
          role: 'protagonist',
          relationships: '周砧——关系：搭档；矛盾张力：争抢灵脉\n周砧——搭档',
        },
        { name: '周砧', role: 'supporting', relationships: '' },
      ]} />,
    ))

    // 同一对角色的重复描述合并为一条连线，标签只显示一次
    const labelCalls = fillTextCalls.filter((call) => call.text.includes('搭档'))
    expect(new Set(labelCalls.map(call => call.text))).toEqual(new Set(['关系：搭档 / 搭档']))
  })
})
