import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { ProjectData } from '../../../shared/ipc-channels'
import { useCharacterStore, type CharacterCard } from '../../../stores/character-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import CharacterEditor from '../CharacterEditor'

const PROJECT_PATH = 'C:\\novels\\faction-edges'
const originalCharacterState = useCharacterStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

function project(): ProjectData {
  return {
    id: 'faction-edges', sessionLease: 'faction-edges-lease', name: '势力立场测试项目', path: PROJECT_PATH,
    novelConfig: {
      genre: '玄幻', subGenre: '', targetAudience: '全龄', totalChapters: 10, wordsPerChapter: 3000,
      plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '', worldSetting: '',
      goldenFinger: '', protagonistProfile: '', globalGuidance: '',
    },
    characterStates: '', createdAt: '', updatedAt: '',
  }
}

function card(name: string, overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    name, role: 'supporting', gender: '', age: '', appearance: '', personality: '',
    background: '', abilities: '', motivation: '', relationships: '', arc: '', notes: '',
    ...overrides,
  }
}

/** 势力立场字段：用 placeholder 定位（与关系网字段的既有测试同构）。 */
function factionField(): HTMLTextAreaElement | undefined {
  return Array.from(container?.querySelectorAll('textarea') ?? [])
    .find((field) => field.placeholder.includes('每行一条'))
}

function setSelected(selected: CharacterCard) {
  useCharacterStore.setState({
    characters: [selected, card('鹿鸣')],
    selectedName: selected.name,
    dataProjectKey: PROJECT_PATH,
    loadingProjectKey: null,
    lastError: null,
    saving: false,
    identityBusy: false,
    rosterRevision: 1,
    dataProjectSession: {
      projectId: 'faction-edges',
      leaseId: 'faction-edges-lease',
      projectPath: PROJECT_PATH,
    },
  })
}

beforeEach(() => {
  useCharacterStore.setState(originalCharacterState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  useLocaleStore.setState({ locale: 'zh-CN' })
  useProjectStore.setState({ currentProject: project(), fileTree: [], loading: false })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  useCharacterStore.setState(originalCharacterState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
})

async function render() {
  await act(async () => { root?.render(<CharacterEditor projectKey={PROJECT_PATH} />) })
}

/** React 受控 textarea 必须走原生 setter 再派发 input，直接赋值不会触发 onChange。 */
async function typeInto(field: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function storedEdges(): Array<{ faction: string; stance: string }> | undefined {
  const selected = useCharacterStore.getState().characters.find(character => character.name === '沈瑶光')
  return selected?.factionEdges as Array<{ faction: string; stance: string }> | undefined
}

describe('CharacterEditor faction stance field', () => {
  it('lists every faction stance of the selected character', async () => {
    setSelected(card('沈瑶光', {
      factionEdges: [
        { faction: '仙盟', stance: '名义归属，暗中怀疑' },
        { faction: '魔庭', stance: '被其利用' },
      ],
    }))
    await render()

    const field = factionField()
    expect(field?.value).toBe('仙盟 — 名义归属，暗中怀疑\n魔庭 — 被其利用')
  })

  it('adds no faction UI for legacy characters without faction edges', async () => {
    setSelected(card('沈瑶光'))
    await render()

    const field = factionField()
    expect(field?.value).toBe('')
    // 占位提示说明怎么填，且不出现任何已填条目。
    expect(field?.placeholder).toContain('仙盟 — 名义归属')
  })

  it('writes edits back to the store and re-renders the same text', async () => {
    setSelected(card('沈瑶光', { factionEdges: [{ faction: '仙盟', stance: '名义归属' }] }))
    await render()

    await typeInto(factionField()!, '仙盟 — 名义归属，暗中怀疑\n太虚宫: 幼年受教')

    expect(storedEdges()).toEqual([
      { faction: '仙盟', stance: '名义归属，暗中怀疑' },
      { faction: '太虚宫', stance: '幼年受教' },
    ])
    // 往返：重新渲染出来的文本与规范化后的输入一致。
    await render()
    expect(factionField()?.value).toBe('仙盟 — 名义归属，暗中怀疑\n太虚宫 — 幼年受教')
  })

  it('removes an entry when its line is deleted', async () => {
    setSelected(card('沈瑶光', {
      factionEdges: [
        { faction: '仙盟', stance: '名义归属' },
        { faction: '魔庭', stance: '被其利用' },
      ],
    }))
    await render()

    await typeInto(factionField()!, '魔庭 — 被其利用')

    expect(storedEdges()).toEqual([{ faction: '魔庭', stance: '被其利用' }])
  })
})
