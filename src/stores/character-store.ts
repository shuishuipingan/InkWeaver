import { create } from 'zustand'
import { ipc } from '../services/ipc-client'
import type { ProjectSessionContext } from '../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../shared/project-session-context'
import type {
  CharacterData,
  CharacterStateData,
} from '../../electron/repositories/character-repository'
import type { CharacterStateProvenance } from '../shared/character-roster'
import { normalizeCharacterRole } from '../shared/character-role'
import {
  characterCardFromRosterEntry,
  characterRosterEntriesFromCards,
} from '../services/character-roster-client'
import { randomUUID } from '../utils/id'
import { useEditorStore } from './editor-store'
import { useProjectStore } from './project-store'
import {
  CHARACTER_DRAFT_TAB,
  discardProjectEditorDraft,
  getProjectEditorDraft,
  mergeNamedRecordDraftWithRemote,
  parseProjectEditorDraftLedger,
  persistProjectEditorDraftLedger,
  rebaseProjectEditorDraft,
  recordProjectEditorEdit,
  settleProjectEditorSave,
} from './project-editor-draft-ledger'
import {
  applyCharacterRenameBatch,
  getCharacterDraftRenames,
  mergeCharacterDraftWithRemote,
  rebuildCharacterRenamesAfterSave,
  renameCharacterCardsSimultaneously,
  setCharacterDraftRenames,
  updateCharacterRename,
} from './character-rename-ledger'

export type CharacterCurrentState = CharacterStateData
export type CharacterCard = CharacterData

export const EMPTY_CARD: CharacterCard = {
  name: '', role: 'supporting', gender: '', age: '',
  appearance: '', personality: '', background: '', abilities: '',
  motivation: '', relationships: '', arc: '', notes: '',
}

export const EMPTY_STATE: CharacterCurrentState = {
  location: '', powerLevel: '', physicalState: '', mentalState: '',
  keyItems: '', recentEvents: '', updatedAtChapter: 0,
}

function textField(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key] : ''
}

function normalizeCharacterState(value: unknown): CharacterCurrentState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const state = value as Record<string, unknown>
  const rawProvenance = state.provenance
  const provenance: CharacterStateProvenance | undefined = rawProvenance && typeof rawProvenance === 'object' && !Array.isArray(rawProvenance)
    ? (() => {
        const candidate = rawProvenance as Record<string, unknown>
        if (candidate.source === 'author' || candidate.source === 'legacy-unknown') return { source: candidate.source }
        if (candidate.source === 'model' && Number.isSafeInteger(candidate.sourceDraftId) && typeof candidate.sourceContentHash === 'string' && typeof candidate.evidence === 'string') {
          return {
            source: 'model' as const,
            sourceDraftId: Number(candidate.sourceDraftId),
            sourceContentHash: candidate.sourceContentHash,
            evidence: candidate.evidence,
          }
        }
        return undefined
      })()
    : undefined
  return {
    location: textField(state, 'location'),
    powerLevel: textField(state, 'powerLevel'),
    physicalState: textField(state, 'physicalState'),
    mentalState: textField(state, 'mentalState'),
    keyItems: textField(state, 'keyItems'),
    recentEvents: textField(state, 'recentEvents'),
    updatedAtChapter: Number.isInteger(state.updatedAtChapter) && Number(state.updatedAtChapter) >= 0
      ? Number(state.updatedAtChapter)
      : 0,
    ...(provenance ? { provenance } : {}),
  }
}

function readCharacterDraftLedger(projectKey: string) {
  const ledger = parseProjectEditorDraftLedger<unknown>(
    useEditorStore.getState().draftLedgers[CHARACTER_DRAFT_TAB.id],
  )
  return {
    version: 1 as const,
    projects: ledger.projects.map(project => (
      project.projectKey === projectKey
        ? {
            ...project,
            baseValue: normalizeCharacterCards(project.baseValue),
            draftValue: normalizeCharacterCards(project.draftValue),
          }
        : project
    )),
    // The ledger is heterogeneous on disk. Only the requested project is ever
    // read through the typed editor helpers; foreign payloads stay opaque and
    // are carried through byte-for-byte at the value level.
  } as ReturnType<typeof parseProjectEditorDraftLedger<CharacterCard[]>>
}

function normalizeCharacterCards(value: unknown): CharacterCard[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (
      !candidate
      || typeof candidate !== 'object'
      || typeof (candidate as { name?: unknown }).name !== 'string'
    ) return []
    const card = candidate as Record<string, unknown>
    const currentState = normalizeCharacterState(card.currentState)
    const normalizedCard = {
      ...card,
      name: card.name as string,
      role: normalizeCharacterRole(card.role),
      gender: textField(card, 'gender'),
      age: textField(card, 'age'),
      appearance: textField(card, 'appearance'),
      personality: textField(card, 'personality'),
      background: textField(card, 'background'),
      abilities: textField(card, 'abilities'),
      motivation: textField(card, 'motivation'),
      relationships: textField(card, 'relationships'),
      arc: textField(card, 'arc'),
      notes: textField(card, 'notes'),
    } as CharacterCard
    if (currentState) normalizedCard.currentState = currentState
    else delete normalizedCard.currentState
    return [normalizedCard]
  })
}

function persistCharacterDraftLedger(ledger: ReturnType<typeof readCharacterDraftLedger>) {
  persistProjectEditorDraftLedger(useEditorStore.getState(), CHARACTER_DRAFT_TAB, ledger)
}

function currentCharacterProjectSession(
  expectedProjectPath?: string,
  expectedProjectSession?: ProjectSessionContext,
): ProjectSessionContext | null {
  const project = useProjectStore.getState().currentProject
  const projectSession = projectSessionContextFromProject(project)
  if (
    !project
    || !projectSession
    || (expectedProjectPath && !sameProjectPathKey(project.path, expectedProjectPath))
    || (expectedProjectSession && !sameProjectSessionContext(expectedProjectSession, projectSession))
  ) return null
  return projectSession
}

/**
 * 把用户的**实际改动**合并到最新名册上（三方合并：基线 / 用户当前 / 最新）。
 *
 * 为什么不能直接重放用户快照：manual_edit 提交的是完整名单，请求里没有的角色**等于被删除**
 * （主进程 resolveManualEntries 就是这么用的）。用户界面持有的是旧快照（例：8 张），
 * 后台工作流可能已经把它推到 56 张 —— 直接重放会删掉那 48 张新角色。
 *
 * 规则：
 *  · 用户**新增**（基线里没有）→ 追加到最新名册（名字撞车时按"修改"处理）；
 *  · 用户**修改**（与基线不同）→ 在最新名册里按名字替换；若该角色在最新名册里已不存在 → **不安全**，不提交；
 *  · 用户**删除**（基线里有、当前没有）→ 从最新名册移除；
 *  · 用户**没碰过**的 → 保留最新名册的版本（后台的新增与改动都不动）。
 */
export type CharacterMergeResult =
  | { ok: true; cards: CharacterCard[] }
  | { ok: false; reason: 'no-baseline' | 'edited-character-missing'; message: string }

export function mergeCharacterChangesOntoLatest(
  baseline: readonly CharacterCard[] | null,
  current: readonly CharacterCard[],
  latest: readonly CharacterCard[],
): CharacterMergeResult {
  if (baseline === null) {
    return { ok: false, reason: 'no-baseline', message: '角色名单已被后台更新，请刷新后重试' }
  }
  const baselineByName = new Map(baseline.map(card => [card.name, card]))
  const currentByName = new Map(current.map(card => [card.name, card]))
  const latestByName = new Map(latest.map(card => [card.name, card]))
  const merged = new Map(latestByName)

  // 新增与修改
  for (const [name, card] of currentByName) {
    const base = baselineByName.get(name)
    if (!base) {
      merged.set(name, card)
      continue
    }
    if (JSON.stringify(base) === JSON.stringify(card)) continue // 未触碰 → 保留最新的
    if (!latestByName.has(name)) {
      return {
        ok: false,
        reason: 'edited-character-missing',
        message: `角色「${name}」已被后台更新或改名，请刷新后重试`,
      }
    }
    merged.set(name, card)
  }

  // 用户明确删除的（基线里有、当前没有）
  for (const name of baselineByName.keys()) {
    if (!currentByName.has(name)) merged.delete(name)
  }

  return { ok: true, cards: [...merged.values()] }
}

/** 角色增删改的失败分类：组件按它渲染准确文案，而不是一句"项目可能已切换"。 */
export type CharacterMutationFailureCode = 'revision-conflict' | 'project-session-invalid' | 'other'

export type CharacterMutationResult =
  | { ok: true }
  | { ok: false; code: CharacterMutationFailureCode; message: string }

export class CharacterMutationError extends Error {
  constructor(readonly code: CharacterMutationFailureCode, message: string) {
    super(message)
    this.name = 'CharacterMutationError'
  }
}

/**
 * 把主进程的真实原因归类。
 *
 * 注意：主进程仓储的冲突判定（"revision 已过期，已拒绝覆盖"）是**正确的防线**，
 * 这里只识别它的文案，绝不改判定语义。
 */
export function characterMutationFailureCode(error: unknown): CharacterMutationFailureCode {
  if (error instanceof CharacterMutationError) return error.code
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '')
  if (/revision\s*已过期/u.test(message)) return 'revision-conflict'
  if (/项目会话|项目已切换|租约/u.test(message)) return 'project-session-invalid'
  return 'other'
}

function isRevisionConflict(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '')
  return /revision\s*已过期/u.test(message)
}

function isCharacterProjectSessionCurrent(projectSession: ProjectSessionContext): boolean {
  return sameProjectSessionContext(
    projectSession,
    projectSessionContextFromProject(useProjectStore.getState().currentProject),
  )
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function removeFirstCharacterNamed(
  characters: readonly CharacterCard[],
  name: string,
): CharacterCard[] {
  const targetIndex = characters.findIndex(character => character.name === name)
  return targetIndex < 0
    ? [...characters]
    : characters.filter((_, index) => index !== targetIndex)
}

interface SessionOperation<T> {
  projectSession: ProjectSessionContext
  promise: Promise<T>
  kind: 'save' | 'rename' | 'delete'
}

let characterSaveInFlight: SessionOperation<void> | null = null
let characterIdentityMutationInFlight: SessionOperation<unknown> | null = null
let characterLoadSequence = 0

interface CharacterState {
  characters: CharacterCard[]
  selectedName: string | null
  saving: boolean
  identityBusy: boolean
  loaded: boolean
  /** 当前 characters 数组实际归属的项目；为空时禁止任何角色写操作。 */
  dataProjectKey: string | null
  /** Exact lease whose character data is currently mounted. */
  dataProjectSession: ProjectSessionContext | null
  /** 当前角色卡来自的 roster revision；所有保存都必须带回这一乐观并发令牌。 */
  rosterRevision: number | null
  /** 上次成功读取/保存时的名册快照：冲突自愈做三方合并要用它算"用户到底改了什么"。 */
  rosterBaseline: CharacterCard[] | null
  loadingProjectKey: string | null
  loadingProjectSession: ProjectSessionContext | null
  lastError: string | null

  load: (projectPath?: string, expectedProjectSession?: ProjectSessionContext) => Promise<void>
  beginProjectLoad: (projectPath: string) => void
  reset: () => void
  setSelectedName: (name: string | null) => void
  addCharacter: () => void
  deleteCharacter: (
    name: string,
    projectPath?: string,
    expectedProjectSession?: ProjectSessionContext,
  ) => Promise<boolean>
  /** 与 deleteCharacter 同一逻辑，但返回可判别的失败原因（组件据此渲染准确文案）。 */
  deleteCharacterWithReason: (
    name: string,
    projectPath?: string,
    expectedProjectSession?: ProjectSessionContext,
  ) => Promise<CharacterMutationResult>
  clearAllCharacters: (
    projectPath?: string,
    expectedProjectSession?: ProjectSessionContext,
  ) => Promise<boolean>
  renameCharacter: (name: string, newName: string) => boolean
  /**
   * 整份名单一次性改名（AI 一键替换角色名）。同批内的互换与链式改名必须
   * 同时生效，不能因为目标名已存在或先后顺序而失败。
   */
  renameCharactersBatch: (pairs: Array<{ from: string; to: string }>) => boolean
  discardDraft: (projectPath: string, expectedProjectSession?: ProjectSessionContext) => void
  hasUnsavedCharacterDraft: (projectPath: string) => boolean
  updateField: <K extends Exclude<keyof CharacterCard, 'name'>>(
    name: string,
    key: K,
    value: CharacterCard[K],
  ) => void
  saveAll: (
    projectPath?: string,
    expectedProjectSession?: ProjectSessionContext,
    operationKind?: 'delete',
    options?: { fullIdentityRename?: boolean },
  ) => Promise<void>

  // 兼容旧接口
  loadCharacters: (projectPath: string, expectedProjectSession?: ProjectSessionContext) => Promise<void>
}

export const useCharacterStore = create<CharacterState>()((set, get) => ({
  characters: [],
  selectedName: null,
  saving: false,
  identityBusy: false,
  loaded: false,
  dataProjectKey: null,
  dataProjectSession: null,
  rosterRevision: null,
  rosterBaseline: null,
  loadingProjectKey: null,
  loadingProjectSession: null,
  lastError: null,

  load: async (projectPath, expectedProjectSession) => {
    const projectSession = currentCharacterProjectSession(projectPath, expectedProjectSession)
    if (!projectSession) return
    const requestedProjectKey = projectSession.projectPath
    const requestSequence = ++characterLoadSequence
    if (!sameProjectSessionContext(get().dataProjectSession, projectSession)) {
      set({
        characters: [],
        selectedName: null,
        loaded: false,
        dataProjectKey: null,
        dataProjectSession: null,
        rosterRevision: null,
  rosterBaseline: null,
        loadingProjectKey: requestedProjectKey,
        loadingProjectSession: projectSession,
        lastError: null,
      })
    } else {
      set({
        loadingProjectKey: requestedProjectKey,
        loadingProjectSession: projectSession,
        lastError: null,
      })
    }
    const pendingIdentityMutation = characterIdentityMutationInFlight
    if (
      pendingIdentityMutation
      && sameProjectSessionContext(pendingIdentityMutation.projectSession, projectSession)
    ) {
      try {
        await pendingIdentityMutation.promise
      } catch {
        // 身份操作失败不应永久阻断后续项目加载。
      }
      if (
        !isCharacterProjectSessionCurrent(projectSession)
        || requestSequence !== characterLoadSequence
      ) return
    }
    try {
      const roster = await ipc.invokeBackgroundWithProjectSession(
        projectSession,
        'db:character-roster-read',
        requestedProjectKey,
      )
      if (!roster) return
      if (
        !isCharacterProjectSessionCurrent(projectSession)
        || requestSequence !== characterLoadSequence
      ) return

      const draftLedger = readCharacterDraftLedger(requestedProjectKey)
      const cards = normalizeCharacterCards(roster.entries.map(characterCardFromRosterEntry))
      const renames = requestedProjectKey
        ? getCharacterDraftRenames(draftLedger, requestedProjectKey)
        : []
      const restored = requestedProjectKey
        ? rebaseProjectEditorDraft(
            draftLedger,
            requestedProjectKey,
            cards,
            (base, draft, remote) => (
              renames.length > 0
                ? mergeCharacterDraftWithRemote(base, draft, remote, renames)
                : mergeNamedRecordDraftWithRemote(base, draft, remote)
            ),
          )
        : { ledger: draftLedger, value: cards }
      if (requestedProjectKey && getProjectEditorDraft(draftLedger, requestedProjectKey)) {
        persistCharacterDraftLedger(restored.ledger)
      }
      if (
        !isCharacterProjectSessionCurrent(projectSession)
        || requestSequence !== characterLoadSequence
      ) return
      const visibleCards = normalizeCharacterCards(restored.value)

      const { selectedName } = get()
      set({
        characters: visibleCards,
        loaded: true,
        dataProjectKey: requestedProjectKey,
        dataProjectSession: projectSession,
        rosterRevision: roster.revision,
        // 基线用"用户看到的卡"，这样"改没改过"的对比和他看到的完全一致。
        rosterBaseline: visibleCards,
        loadingProjectKey: null,
        loadingProjectSession: null,
        lastError: null,
        selectedName: visibleCards.find(c => c.name === selectedName)
          ? selectedName
          : (visibleCards.length > 0 ? visibleCards[0].name : null),
      })
    } catch (error) {
      if (
        !isCharacterProjectSessionCurrent(projectSession)
        || requestSequence !== characterLoadSequence
      ) return
      set({
        characters: [],
        selectedName: null,
        loaded: false,
        dataProjectKey: requestedProjectKey,
        dataProjectSession: projectSession,
        rosterRevision: null,
  rosterBaseline: null,
        loadingProjectKey: null,
        loadingProjectSession: null,
        lastError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  loadCharacters: async (projectPath, expectedProjectSession) => {
    await get().load(projectPath, expectedProjectSession)
  },

  beginProjectLoad: (projectPath) => {
    characterLoadSequence += 1
    set({
      characters: [],
      selectedName: null,
      saving: false,
      identityBusy: false,
      loaded: false,
      dataProjectKey: null,
      dataProjectSession: null,
      rosterRevision: null,
  rosterBaseline: null,
      loadingProjectKey: projectPath,
      loadingProjectSession: null,
      lastError: null,
    })
  },

  reset: () => {
    characterLoadSequence += 1
    set({
      characters: [],
      selectedName: null,
      saving: false,
      identityBusy: false,
      loaded: false,
      dataProjectKey: null,
      dataProjectSession: null,
      rosterRevision: null,
  rosterBaseline: null,
      loadingProjectKey: null,
      loadingProjectSession: null,
      lastError: null,
    })
  },

  setSelectedName: (name) => {
    const projectSession = currentCharacterProjectSession()
    const state = get()
    if (
      !projectSession
      || !sameProjectSessionContext(state.dataProjectSession, projectSession)
      || state.loadingProjectSession !== null
      || state.lastError !== null
    ) return
    set({ selectedName: name })
  },

  addCharacter: () => {
    const projectSession = currentCharacterProjectSession()
    if (!projectSession) return
    if (
      characterIdentityMutationInFlight
      && sameProjectSessionContext(characterIdentityMutationInFlight.projectSession, projectSession)
    ) return
    const projectKey = projectSession.projectPath
    const state = get()
    if (
      !sameProjectSessionContext(state.dataProjectSession, projectSession)
      || state.loadingProjectSession !== null
      || state.lastError !== null
    ) return
    const before = get().characters
    const newCard: CharacterCard = {
      ...EMPTY_CARD,
      name: `新角色_${Math.random().toString(36).slice(2, 6)}`,
    }
    set((s) => ({
      characters: [...s.characters, newCard],
      selectedName: newCard.name,
    }))
    persistCharacterDraftLedger(recordProjectEditorEdit(
      readCharacterDraftLedger(projectKey),
      projectKey,
      before,
      get().characters,
    ))
  },

  deleteCharacter: async (name, projectPath, expectedProjectSession) => (
    (await get().deleteCharacterWithReason(name, projectPath, expectedProjectSession)).ok
  ),

  deleteCharacterWithReason: async (name, projectPath, expectedProjectSession) => {
    const projectSession = currentCharacterProjectSession(projectPath, expectedProjectSession)
    if (!projectSession) return { ok: false, code: 'project-session-invalid', message: '项目已切换，已取消删除' }
    if (
      characterIdentityMutationInFlight
      && sameProjectSessionContext(characterIdentityMutationInFlight.projectSession, projectSession)
    ) return { ok: false, code: 'other', message: '角色身份操作正在进行，请稍后再删除' }
    const projectKey = projectSession.projectPath
    if (
      !sameProjectSessionContext(get().dataProjectSession, projectSession)
      || get().loadingProjectSession !== null
      || get().lastError !== null
    ) return { ok: false, code: 'project-session-invalid', message: '项目已切换，已取消删除' }
    const { characters } = get()
    if (!characters.some(card => card.name === name)) {
      return { ok: false, code: 'other', message: '角色不存在，可能已被删除，请刷新后重试' }
    }
    const ledger = readCharacterDraftLedger(projectKey)
    const renames = getCharacterDraftRenames(ledger, projectKey)
    const remaining = removeFirstCharacterNamed(characters, name)
    const pendingRename = renames.find(rename => rename.newName === name)
    const nextRenames = pendingRename
      ? renames.filter(rename => rename !== pendingRename)
      : renames
    set({
      characters: remaining,
      selectedName: remaining.some(character => character.name === get().selectedName)
        ? get().selectedName
        : (remaining[0]?.name ?? null),
    })
    let nextLedger = recordProjectEditorEdit(ledger, projectKey, characters, remaining)
    nextLedger = setCharacterDraftRenames(nextLedger, projectKey, nextRenames)
    persistCharacterDraftLedger(nextLedger)

    // 删除同样是完整手工名单保存：由 roster seam 在一次事务中清理关系、
    // 蓝图引用、投影、revision 与 receipt。失败时草稿仍在本地可重试；
    // 版本冲突的自愈（重载版本 + 重试一次）在 saveAll 里统一处理。
    try {
      await get().saveAll(projectKey, projectSession, 'delete')
    } catch (error) {
      return {
        ok: false,
        code: characterMutationFailureCode(error),
        message: String((error as { message?: string } | undefined)?.message ?? error ?? '角色删除失败'),
      }
    }
    if (!isCharacterProjectSessionCurrent(projectSession)) {
      return { ok: false, code: 'project-session-invalid', message: '项目已切换，删除结果未确认' }
    }
    return { ok: true }
  },

  clearAllCharacters: (projectPath, expectedProjectSession) => {
    const projectSession = currentCharacterProjectSession(projectPath, expectedProjectSession)
    if (!projectSession) return Promise.resolve(false)
    if (
      characterIdentityMutationInFlight
      && sameProjectSessionContext(characterIdentityMutationInFlight.projectSession, projectSession)
    ) return Promise.resolve(false)
    const projectKey = projectSession.projectPath
    const state = get()
    if (
      !sameProjectSessionContext(state.dataProjectSession, projectSession)
      || state.loadingProjectSession !== null
      || state.lastError !== null
    ) return Promise.resolve(false)
    const characters = state.characters
    if (characters.length === 0) return Promise.resolve(true)

    const ledger = readCharacterDraftLedger(projectKey)
    set({ characters: [], selectedName: null })
    let nextLedger = recordProjectEditorEdit(ledger, projectKey, characters, [])
    nextLedger = setCharacterDraftRenames(nextLedger, projectKey, [])
    persistCharacterDraftLedger(nextLedger)

    // 空名单仍通过既有 roster 原子提交；主进程据此同步删除角色、关系和投影。
    return get().saveAll(projectKey, projectSession, 'delete')
      .then(() => isCharacterProjectSessionCurrent(projectSession))
      .catch(() => false)
  },

  renameCharacter: (name, newName) => {
    const projectSession = currentCharacterProjectSession()
    if (!projectSession) return false
    if (
      characterIdentityMutationInFlight
      && sameProjectSessionContext(characterIdentityMutationInFlight.projectSession, projectSession)
    ) return false
    const projectKey = projectSession.projectPath
    const state = get()
    if (
      !sameProjectSessionContext(state.dataProjectSession, projectSession)
      || state.loadingProjectSession !== null
      || state.lastError !== null
    ) return false
    const before = get().characters
    const targetIndex = before.findIndex(character => character.name === name)
    if (targetIndex < 0) return false
    if (before.some((character, index) => index !== targetIndex && character.name === newName)) {
      return false
    }

    const ledger = readCharacterDraftLedger(projectKey)
    const existing = getProjectEditorDraft(ledger, projectKey)
    const renames = getCharacterDraftRenames(ledger, projectKey)
    const persistedNames = new Set((existing?.baseValue ?? before).map(character => character.name))
    const nextRenames = updateCharacterRename(renames, name, newName, persistedNames)

    const characters = before.map((character, index) => (
      index === targetIndex ? { ...character, name: newName } : character
    ))
    set({
      characters,
      selectedName: get().selectedName === name ? newName : get().selectedName,
    })

    let nextLedger = recordProjectEditorEdit(ledger, projectKey, before, characters)
    nextLedger = setCharacterDraftRenames(nextLedger, projectKey, nextRenames)
    persistCharacterDraftLedger(nextLedger)
    return true
  },

  renameCharactersBatch: (pairs) => {
    const projectSession = currentCharacterProjectSession()
    if (!projectSession) return false
    if (
      characterIdentityMutationInFlight
      && sameProjectSessionContext(characterIdentityMutationInFlight.projectSession, projectSession)
    ) return false
    const projectKey = projectSession.projectPath
    const state = get()
    if (
      !sameProjectSessionContext(state.dataProjectSession, projectSession)
      || state.loadingProjectSession !== null
      || state.lastError !== null
    ) return false
    const normalized = pairs
      .map(pair => ({ originalName: pair.from.trim(), newName: pair.to.trim() }))
      .filter(pair => pair.originalName && pair.newName && pair.originalName !== pair.newName)
    const before = get().characters
    if (normalized.length === 0) return true
    const knownNames = new Set(before.map(character => character.name))
    if (normalized.some(pair => !knownNames.has(pair.originalName))) return false

    const characters = renameCharacterCardsSimultaneously(before, normalized)
    const names = characters.map(character => character.name)
    if (names.some(name => !name) || new Set(names).size !== names.length) return false

    const ledger = readCharacterDraftLedger(projectKey)
    const existing = getProjectEditorDraft(ledger, projectKey)
    const renames = getCharacterDraftRenames(ledger, projectKey)
    const persistedNames = new Set((existing?.baseValue ?? before).map(character => character.name))
    const nextRenames = applyCharacterRenameBatch(renames, normalized, persistedNames)

    const selectedName = get().selectedName
    set({
      characters,
      selectedName: selectedName === null
        ? selectedName
        : (renameCharacterCardsSimultaneously([{ name: selectedName }], normalized)[0]?.name ?? selectedName),
    })

    let nextLedger = recordProjectEditorEdit(ledger, projectKey, before, characters)
    nextLedger = setCharacterDraftRenames(nextLedger, projectKey, nextRenames)
    persistCharacterDraftLedger(nextLedger)
    return true
  },

  discardDraft: (projectPath, expectedProjectSession) => {
    const ledger = readCharacterDraftLedger(projectPath)
    const projectDraft = getProjectEditorDraft(ledger, projectPath)
    if (!projectDraft) return
    const projectSession = currentCharacterProjectSession(projectPath, expectedProjectSession)

    if (
      projectSession
      && (
        !sameProjectSessionContext(get().dataProjectSession, projectSession)
        || get().loadingProjectSession !== null
        || get().lastError !== null
      )
    ) {
      return
    }
    if (
      projectSession
      && sameProjectSessionContext(get().dataProjectSession, projectSession)
    ) {
      const restored = projectDraft.baseValue
      const selectedName = get().selectedName
      const renames = getCharacterDraftRenames(ledger, projectPath)
      const selectedRename = renames.find(rename => rename.newName === selectedName)
      const restoredSelection = selectedRename?.originalName ?? selectedName
      set({
        characters: restored,
        selectedName: restored.some(character => character.name === restoredSelection)
          ? restoredSelection
          : (restored[0]?.name ?? null),
      })
    }

    persistCharacterDraftLedger(discardProjectEditorDraft(ledger, projectPath))
  },

  hasUnsavedCharacterDraft: (projectPath) => !!getProjectEditorDraft(readCharacterDraftLedger(projectPath), projectPath),

  updateField: (name, key, value) => {
    const projectSession = currentCharacterProjectSession()
    if (!projectSession) return
    const projectKey = projectSession.projectPath
    const state = get()
    if (
      !sameProjectSessionContext(state.dataProjectSession, projectSession)
      || state.lastError !== null
    ) return
    const before = get().characters
    set((s) => {
      const newChars = s.characters.map(c =>
        c.name === name ? { ...c, [key]: value } : c
      )

      return { characters: newChars }
    })
    persistCharacterDraftLedger(recordProjectEditorEdit(
      readCharacterDraftLedger(projectKey),
      projectKey,
      before,
      get().characters,
    ))
  },

  saveAll: (projectPath, expectedProjectSession, operationKind, options) => {
    const projectSession = currentCharacterProjectSession(projectPath, expectedProjectSession)
    const projectKey = projectSession?.projectPath
    if (
      !projectSession
      || !projectKey
      || !sameProjectSessionContext(get().dataProjectSession, projectSession)
      || get().loadingProjectSession !== null
      || get().lastError !== null
      || get().rosterRevision === null
    ) {
      return Promise.reject(new Error('角色数据仍在切换项目，已拒绝跨项目保存'))
    }
    if (
      characterSaveInFlight
      && sameProjectSessionContext(characterSaveInFlight.projectSession, projectSession)
    ) {
      if (characterSaveInFlight.kind === 'delete') {
        return Promise.reject(new Error('角色身份操作正在进行（删除中），请等待完成后再保存'))
      }
      return characterSaveInFlight.promise
    }
    if (
      characterIdentityMutationInFlight
      && sameProjectSessionContext(characterIdentityMutationInFlight.projectSession, projectSession)
    ) {
      return Promise.reject(new Error('角色身份操作正在进行，请稍后再保存'))
    }
    set({ saving: true, identityBusy: true })
    const { characters } = get()
    const expectedRevision = get().rosterRevision
    if (expectedRevision === null) {
      return Promise.reject(new Error('角色名单尚未完成安全读取，已拒绝保存'))
    }
    const saveLedger = readCharacterDraftLedger(projectKey)
    const renames = getCharacterDraftRenames(saveLedger, projectKey)
    const savedCharacters = characters.map(character => ({
      ...character,
      name: character.name.trim(),
    }))
    const savedRenames = renames.map(rename => ({
      originalName: rename.originalName,
      newName: rename.newName.trim(),
    }))
    const saveKind: SessionOperation<void>['kind'] = operationKind
      ?? (savedRenames.length > 0 ? 'rename' : 'save')

    let mergedCards: CharacterCard[] | null = null
    const commitOnce = (expected: number) => ipc.invokeWithProjectSession(
      projectSession,
      'db:character-roster-commit',
      {
        operationId: `manual-character-save-${randomUUID()}`,
        expectedRevision: expected,
        schemaVersion: 1,
        intent: 'manual_edit',
        entries: characterRosterEntriesFromCards(mergedCards ?? savedCharacters),
        ...(savedRenames.length > 0 ? { renames: savedRenames } : {}),
        // 拆书仿写式整体改名：备注、动态状态、关系证据与知情事件也要换名。
        ...(options?.fullIdentityRename ? { fullIdentityRename: true } : {}),
      },
      projectKey,
    )
    // 主进程按这份 name→id 映射把"作者手写的自由文本关系"保持在原位。

    const save = async () => {
      // 角色主键改名、删除、蓝图结构化引用、角色图谱、revision 和 receipt
      // 都由主进程 roster seam 在同一事务内完成。
      let result = await commitOnce(expectedRevision)
      if (!result.success && isRevisionConflict(result.error)) {
        // 名册已被后台工作流（蓝图同步/架构生成/定稿推进）推到新版本 —— 界面手上的
        // 乐观锁必然过期，导致"每一次"手动保存都被拒。这里自愈：**只读一次真实版本**
        // （不调用 loadCharacters，避免覆盖用户正在编辑的内容），用同一份意图重试**一次**。
        if (!isCharacterProjectSessionCurrent(projectSession)) {
          throw new CharacterMutationError('project-session-invalid', '项目已切换，已取消保存')
        }
        const latest = await ipc.invokeWithProjectSession(
          projectSession,
          'db:character-roster-read',
          projectKey,
        )
        const refreshedRevision = typeof latest?.revision === 'number' ? latest.revision : null
        if (refreshedRevision === null) {
          throw new CharacterMutationError('revision-conflict', '角色名单已被后台更新，请重试')
        }
        // **三方合并**再提交：只把用户真正改过的三类改动（新增/修改/删除）应用到最新名册上。
        // 直接重放旧快照会把后台新增的角色删掉（manual_edit 的语义是"请求里没有的即删除"）。
        const latestCards = Array.isArray(latest?.entries)
          ? (latest.entries as Parameters<typeof characterCardFromRosterEntry>[0][]).map(characterCardFromRosterEntry)
          : []
        const mergeResult = mergeCharacterChangesOntoLatest(
          get().rosterBaseline,
          savedCharacters,
          latestCards,
        )
        if (!mergeResult.ok) {
          throw new CharacterMutationError('revision-conflict', mergeResult.message)
        }
        mergedCards = mergeResult.cards
        result = await commitOnce(refreshedRevision)
      }
      if (!result.success || !result.receipt) {
        const message = String(result.error ?? '角色卡保存失败')
        throw new CharacterMutationError(characterMutationFailureCode(new Error(message)), message)
      }
      if (!isCharacterProjectSessionCurrent(projectSession)) return
      const savedRosterCards = result.receipt.snapshot.entries.map(characterCardFromRosterEntry)
      const ledger = readCharacterDraftLedger(projectKey)
      const currentProjectDraft = getProjectEditorDraft(ledger, projectKey)
      const projectSaveInputStillCurrent = (
        !currentProjectDraft || valuesMatch(currentProjectDraft.draftValue, characters)
      )
      const currentValue = projectSaveInputStillCurrent
        ? savedRosterCards
        : currentProjectDraft.draftValue
      const currentRenames = getCharacterDraftRenames(ledger, projectKey)
      const remainingRenames = rebuildCharacterRenamesAfterSave(
        savedRosterCards,
        currentValue,
        savedRenames,
        currentRenames,
      )
      let settledLedger = settleProjectEditorSave(
        ledger,
        projectKey,
        savedRosterCards,
        currentValue,
      )
      settledLedger = setCharacterDraftRenames(settledLedger, projectKey, remainingRenames)
      if (!isCharacterProjectSessionCurrent(projectSession)) return
      persistCharacterDraftLedger(settledLedger)

      if (
        projectSaveInputStillCurrent
        && valuesMatch(get().characters, characters)
      ) {
        const selectedIndex = savedRosterCards.findIndex(character => character.name === get().selectedName)
        set({
          characters: savedRosterCards,
          rosterRevision: result.receipt.revision,
          selectedName: selectedIndex >= 0
            ? savedRosterCards[selectedIndex].name
            : get().selectedName,
        })
      } else if (isCharacterProjectSessionCurrent(projectSession)) {
        set({ rosterRevision: result.receipt.revision })
      }
    }
    const trackedSave = save().finally(() => {
      if (characterSaveInFlight?.promise === trackedSave) {
        characterSaveInFlight = null
      }
      if (characterIdentityMutationInFlight?.promise === trackedSave) {
        characterIdentityMutationInFlight = null
      }
      if (isCharacterProjectSessionCurrent(projectSession)) {
        set({ saving: false, identityBusy: false })
      }
    })
    characterSaveInFlight = { projectSession, promise: trackedSave, kind: saveKind }
    characterIdentityMutationInFlight = { projectSession, promise: trackedSave, kind: saveKind }
    return trackedSave
  },
}))
