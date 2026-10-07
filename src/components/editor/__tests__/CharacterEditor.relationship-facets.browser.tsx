import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { ProjectData } from '../../../shared/ipc-channels'
import { useCharacterStore, type CharacterCard } from '../../../stores/character-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import CharacterEditor from '../CharacterEditor'

const PROJECT_PATH = 'C:\\novels\\relationship-facets'
const originalCharacterState = useCharacterStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

function project(): ProjectData {
  return {
    id: 'relationship-facets',
    sessionLease: 'relationship-facets-lease',
    name: '关系多面性测试项目',
    path: PROJECT_PATH,
    novelConfig: {
      genre: '玄幻', subGenre: '', targetAudience: '全龄', totalChapters: 10, wordsPerChapter: 3000,
      plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '', worldSetting: '',
      goldenFinger: '', protagonistProfile: '', globalGuidance: '',
    },
    characterStates: '',
    createdAt: '',
    updatedAt: '',
  }
}

function character(name: string, relationships = ''): CharacterCard {
  return {
    name, role: 'supporting', gender: '', age: '', appearance: '', personality: '',
    background: '', abilities: '', motivation: '', relationships, arc: '', notes: '',
  }
}

function relationshipField(): HTMLTextAreaElement | undefined {
  return Array.from(container?.querySelectorAll('textarea') ?? [])
    .find((field) => field.placeholder.includes('每行一位角色'))
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

function setSelectedCard(card: CharacterCard) {
  useCharacterStore.setState({
    characters: [card, character('鹿鸣')],
    selectedName: card.name,
    dataProjectKey: PROJECT_PATH,
    loadingProjectKey: null,
    lastError: null,
    saving: false,
    identityBusy: false,
    rosterRevision: 1,
    dataProjectSession: {
      projectId: 'relationship-facets',
      leaseId: 'relationship-facets-lease',
      projectPath: PROJECT_PATH,
    },
  })
}

describe('CharacterEditor multi-facet relationships', () => {
  it('shows every facet as its own labelled line', async () => {
    setSelectedCard(character('沈瑶光', JSON.stringify([
      {
        target: '鹿鸣',
        relation: '师妹',
        facets: [
          { kind: 'stance', text: '名义同门，实为彼此钳制' },
          { kind: 'emotion', text: '上一世目睹其死亡，愧疚未消' },
        ],
      },
    ])))

    await act(async () => {
      root?.render(<CharacterEditor projectKey={PROJECT_PATH} />)
    })

    const field = relationshipField()
    expect(field?.value).toContain('鹿鸣：师妹')
    expect(field?.value).toContain('· [立场] 名义同门，实为彼此钳制')
    expect(field?.value).toContain('· [情感] 上一世目睹其死亡，愧疚未消')
    expect(field?.value).not.toContain('[{')
  })

  it('adds no facet UI for legacy data without facets', async () => {
    setSelectedCard(character('沈瑶光', JSON.stringify([
      { target: '鹿鸣', relation: '师妹' },
    ])))

    await act(async () => {
      root?.render(<CharacterEditor projectKey={PROJECT_PATH} />)
    })

    const field = relationshipField()
    expect(field?.value).toBe('鹿鸣：师妹')
    expect(field?.value).not.toContain('·')
    expect(field?.value).not.toContain('[')
  })
})
