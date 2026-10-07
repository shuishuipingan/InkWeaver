/* eslint-disable react-refresh/only-export-components */
/**
 * NewCharactersPreview — propose_new_characters 的确认预览
 *
 * 一批角色档案直接贴 JSON 会糊成一团，所以这里逐条列出将新增的角色（姓名 + 定位 + 已填字段），
 * 并显示名单人数变化；重名等校验失败显示为不可批准 + 可见原因（由 ConfirmCard 的原因区统一呈现）。
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { ToolCallInfo } from '../../../services/agent/agent-engine'
import { NEW_CHARACTER_MAX, occupiedNames, parseNewCharacter } from '../../../services/agent/tools/propose-new-characters.tool'
import { ipc } from '../../../services/ipc-client'
import { CHARACTER_ROLE_LABELS, normalizeCharacterRole } from '../../../shared/character-role'
import { projectSessionContextFromProject, sameProjectSessionContext } from '../../../shared/project-session-context'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'

const FIELD_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  aliases: ['别名', 'Aliases'],
  gender: ['性别', 'Gender'],
  age: ['年龄', 'Age'],
  appearance: ['外貌', 'Appearance'],
  personality: ['性格', 'Personality'],
  background: ['背景', 'Background'],
  abilities: ['能力', 'Abilities'],
  motivation: ['动机', 'Motivation'],
  relationships: ['关系', 'Relationships'],
  arc: ['角色弧', 'Arc'],
  notes: ['备注', 'Notes'],
}

const FIELD_ORDER = ['aliases', 'gender', 'age', 'appearance', 'personality', 'background', 'abilities', 'motivation', 'relationships', 'arc', 'notes']

export interface PreviewNewCharacter {
  name: string
  roleLabel: string
  roleRaw: string
  filledFields: string[]
  conflict: string | null
}

export type NewCharactersPreviewState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'stale' }
  | { kind: 'invalid'; error: string }
  | { kind: 'valid'; currentCount: number; nextCount: number; characters: PreviewNewCharacter[] }

function filledFieldKeys(entry: Record<string, unknown>): string[] {
  return FIELD_ORDER.filter(key => {
    if (key === 'relationships') {
      return Array.isArray(entry.relationships) && entry.relationships.length > 0
    }
    if (key === 'aliases') {
      return Array.isArray(entry.aliases) && entry.aliases.length > 0
    }
    const value = entry[key]
    return typeof value === 'string' && value.trim().length > 0
  })
}

export function useNewCharactersPreview(toolCall: ToolCallInfo): NewCharactersPreviewState {
  const currentProject = useProjectStore(s => s.currentProject)
  const [asyncState, setAsyncState] = useState<NewCharactersPreviewState>({ kind: 'loading' })

  const isNewCharacters = toolCall.toolName === 'propose_new_characters'
  const projectSession = toolCall.projectSession
  const rawCharacters = Array.isArray(toolCall.arguments.characters) ? toolCall.arguments.characters : []
  const sessionCurrent = !!projectSession && sameProjectSessionContext(
    projectSession,
    projectSessionContextFromProject(currentProject),
  )

  // 本地先把参数校验跑一遍：缺 name/role、超量这类问题不必等主进程。
  const localIssue = useMemo<string | null>(() => {
    if (!isNewCharacters) return null
    if (rawCharacters.length === 0) return 'empty-list'
    if (rawCharacters.length > NEW_CHARACTER_MAX) return 'too-many'
    for (let index = 0; index < rawCharacters.length; index += 1) {
      const parsed = parseNewCharacter(rawCharacters[index], index)
      if (!parsed.ok) return parsed.error
    }
    return null
  }, [isNewCharacters, rawCharacters])

  const immediate = useMemo<NewCharactersPreviewState | null>(() => {
    if (!isNewCharacters) return { kind: 'none' }
    if (!projectSession || !currentProject || !sessionCurrent) return { kind: 'stale' }
    if (localIssue) return { kind: 'invalid', error: localIssue }
    return null
  }, [currentProject, isNewCharacters, localIssue, projectSession, sessionCurrent])

  useEffect(() => {
    if (immediate || !projectSession || !currentProject) return
    let disposed = false
    void (async () => {
      try {
        const snapshot = await ipc.invokeWithProjectSession(projectSession, 'db:character-roster-read', currentProject.path)
        if (disposed) return
        if (!sameProjectSessionContext(projectSession, projectSessionContextFromProject(useProjectStore.getState().currentProject))) {
          setAsyncState({ kind: 'stale' })
          return
        }
        const record = (snapshot ?? {}) as unknown as Record<string, unknown>
        const existing = Array.isArray(record.entries) ? record.entries as Array<Record<string, unknown>> : []
        const occupied = occupiedNames(existing)
        const characters: PreviewNewCharacter[] = rawCharacters.map((raw, index) => {
          const parsed = parseNewCharacter(raw, index)
          if (!parsed.ok) {
            return { name: '第 ' + (index + 1) + ' 个角色', roleLabel: '', roleRaw: '', filledFields: [], conflict: parsed.error }
          }
          const source = (raw ?? {}) as Record<string, unknown>
          const hit = occupied.get(parsed.entry.name.trim().toLocaleLowerCase('en-US'))
          return {
            name: parsed.entry.name,
            roleRaw: parsed.entry.role,
            roleLabel: '',
            filledFields: filledFieldKeys(source),
            conflict: hit ? hit : null,
          }
        })
        setAsyncState({
          kind: 'valid',
          currentCount: existing.length,
          nextCount: existing.length + characters.filter(character => !character.conflict).length,
          characters,
        })
      } catch (error) {
        if (!disposed) setAsyncState({ kind: 'invalid', error: String(error) })
      }
    })()
    return () => { disposed = true }
  }, [currentProject, immediate, projectSession, rawCharacters])

  return immediate ?? asyncState
}

interface Props {
  preview: NewCharactersPreviewState
}

const hintStyle: CSSProperties = {
  marginTop: 6,
  fontSize: '0.7rem',
  color: 'var(--color-text-secondary)',
}

export default function NewCharactersPreview({ preview }: Props) {
  const text = useLocaleStore(s => s.text)

  if (preview.kind === 'none') return null
  if (preview.kind === 'loading') {
    return <div style={hintStyle}>{text('正在读取当前角色名单…', 'Reading the current character roster…')}</div>
  }
  if (preview.kind === 'stale') {
    return (
      <div style={{ ...hintStyle, color: 'var(--color-warning-text)' }} data-new-characters-stale>
        {text('项目会话已变化，请重新发起这次批量建档。', 'The project session changed; please start this cast setup again.')}
      </div>
    )
  }
  if (preview.kind === 'invalid') {
    const detail = preview.error === 'empty-list'
      ? text('没有给出任何角色，无法建档。', 'No characters were provided, so nothing can be created.')
      : preview.error === 'too-many'
        ? text('一次最多新增 ' + NEW_CHARACTER_MAX + ' 名角色。', 'At most ' + NEW_CHARACTER_MAX + ' characters can be created at once.')
        : text('无法预览这批角色：' + preview.error, 'Cannot preview these characters: ' + preview.error)
    return (
      <div style={{ ...hintStyle, color: 'var(--color-error, #dc2626)' }} data-new-characters-invalid>
        {detail}
      </div>
    )
  }

  const conflicts = preview.characters.filter(character => character.conflict)
  return (
    <div
      data-new-characters-preview
      style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}
    >
      <div
        style={{
          padding: '5px 8px',
          fontSize: '0.7rem',
          color: 'var(--color-text-secondary)',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-panel)',
        }}
      >
        {text(
          '新增角色预览：' + preview.characters.length + ' 名（当前 ' + preview.currentCount + ' 人 → 提交后 ' + preview.nextCount + ' 人）',
          'New characters: ' + preview.characters.length + ' (roster ' + preview.currentCount + ' → ' + preview.nextCount + ')',
        )}
      </div>
      <div data-new-characters-list style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 0' }}>
        {preview.characters.map((character, index) => {
          const roleLabel = character.roleRaw ? CHARACTER_ROLE_LABELS[normalizeCharacterRole(character.roleRaw)].zhCN : ''
          const fields = character.filledFields
            .map(key => FIELD_LABELS[key]?.[0] ?? key)
          return (
            <div
              key={index}
              data-new-character-row
              style={{ padding: '3px 8px', fontSize: '0.7rem', color: 'var(--color-text)' }}
            >
              <span style={{ fontWeight: 600 }}>{character.name}</span>
              {roleLabel && <span style={{ color: 'var(--color-text-muted)' }}>{' · ' + roleLabel}</span>}
              {fields.length > 0 && (
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {' — ' + text('已填', 'filled') + '：' + fields.join('、')}
                </span>
              )}
              {character.conflict && (
                <span style={{ color: 'var(--color-error, #dc2626)' }}>
                  {' ⚠ ' + text('与现有角色「' + character.conflict + '」重名', 'name already used by ' + character.conflict)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {conflicts.length > 0 && (
        <div
          style={{ padding: '4px 8px', fontSize: '0.68rem', color: 'var(--color-error, #dc2626)', borderTop: '1px solid var(--color-border)' }}
          data-new-characters-conflicts
        >
          {text(
            '有 ' + conflicts.length + ' 个名字与现有角色冲突，请先改名；本卡片不会覆盖已有角色。',
            conflicts.length + ' name(s) collide with existing characters; rename them first — existing characters are never overwritten.',
          )}
        </div>
      )}
    </div>
  )
}
