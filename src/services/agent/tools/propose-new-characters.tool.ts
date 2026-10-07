/**
 * propose_new_characters — 批量新增角色（提案，需作者批准）
 *
 * 与 propose_change_plan 的分工：**新增角色用本工具**；修改已有角色用 propose_change_plan。
 * 底层走 manual_edit：提交的是**完整快照**（现有 entries + 新增），带 expectedRevision 乐观锁；
 * 只创建提案，作者在确认卡片批准后才会写入角色名单。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { normalizeCharacterRole } from '../../../shared/character-role'
import {
  CHARACTER_ROSTER_SCHEMA_VERSION,
  type CharacterRosterEntry,
  type CharacterRosterRelationship,
} from '../../../shared/character-roster'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import { readList, readRecord } from './read-record.helpers'

/** 一次提案最多新增多少名角色。 */
export const NEW_CHARACTER_MAX = 12
/** 文本字段上限，避免把整章正文塞进一个人物档案。 */
const FIELD_MAX = 2_000
const NAME_MAX = 80


function readField(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text.length > FIELD_MAX ? text.slice(0, FIELD_MAX) : text
}

function readAliases(value: unknown): string[] {
  return readList(value)
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(entry => entry.length > 0 && entry.length <= NAME_MAX)
}

function readRelationships(value: unknown): CharacterRosterRelationship[] {
  return readList(value).flatMap(raw => {
    const record = readRecord(raw)
    const target = typeof record.target === 'string' ? record.target.trim() : ''
    const relation = typeof record.relation === 'string' ? record.relation.trim() : ''
    if (!target || !relation) return []
    const direction = record.direction === 'outgoing' || record.direction === 'incoming' || record.direction === 'mutual'
      ? record.direction
      : undefined
    const sourceChapter = Number(record.sourceChapter)
    const evidence = typeof record.evidence === 'string' ? record.evidence.trim().slice(0, 300) : ''
    return [{
      target,
      relation,
      ...(direction ? { direction } : {}),
      ...(Number.isSafeInteger(sourceChapter) && sourceChapter >= 1 ? { sourceChapter } : {}),
      ...(evidence ? { evidence } : {}),
    }]
  })
}

type ParsedCharacter = { ok: true; entry: CharacterRosterEntry } | { ok: false; error: string }

/** 只接收作者/模型给得出的档案字段；currentState 一律不接收（状态只能由定稿推进产生）。 */
export function parseNewCharacter(raw: unknown, index: number): ParsedCharacter {
  const record = readRecord(raw)
  const label = '第 ' + (index + 1) + ' 个角色'
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!name) return { ok: false, error: label + '缺少 name。' }
  if (name.length > NAME_MAX) return { ok: false, error: label + '的 name 过长（上限 ' + NAME_MAX + ' 字符）。' }
  if (typeof record.role !== 'string' || !record.role.trim()) {
    return { ok: false, error: label + '「' + name + '」缺少 role（可用：protagonist / antagonist / supporting / minor，或中文「主角/反派/配角/龙套」）。' }
  }
  const entry: CharacterRosterEntry = {
    name,
    role: normalizeCharacterRole(record.role),
    gender: readField(record.gender),
    age: readField(record.age),
    appearance: readField(record.appearance),
    personality: readField(record.personality),
    background: readField(record.background),
    abilities: readField(record.abilities),
    motivation: readField(record.motivation),
    relationships: readRelationships(record.relationships),
    arc: readField(record.arc),
    notes: readField(record.notes),
  }
  const aliases = readAliases(record.aliases)
  if (aliases.length > 0) entry.aliases = aliases
  return { ok: true, entry }
}

/** 名字身份键：与现有 name / aliases 比对用（大小写与首尾空白不敏感）。 */
function identityKey(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

/** 收集现有名单里所有已占用的名字（name + aliases）。 */
export function occupiedNames(entries: ReadonlyArray<Record<string, unknown>>): Map<string, string> {
  const occupied = new Map<string, string>()
  for (const entry of entries) {
    const display = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!display) continue
    occupied.set(identityKey(display), display)
    for (const alias of readList(entry.aliases)) {
      if (typeof alias === 'string' && alias.trim()) occupied.set(identityKey(alias), display)
    }
  }
  return occupied
}

export const proposeNewCharactersTool = buildAgentTool({
  name: 'propose_new_characters',
  description: '批量新增角色：提交 1-12 名新角色的档案，应用会合并进现有名单，必须由作者在确认卡片批准后才写入。**新增角色用本工具**；修改已有角色请改用 propose_change_plan（它明确不接受新角色）。提交的是完整快照（现有角色 + 新增），带乐观锁；不要臆造 currentState（当前位置/境界/状态由定稿推进产生），拿不准的字段留空。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      characters: {
        type: 'array',
        description: '要新增的角色数组（1-12 个）。每项至少给 name 与 role，其余字段按已有架构与人设补全，拿不准就留空。',
      },
      summary: { type: 'string', description: '一句话说明这批新增的用途（会随提案展示给作者）' },
    },
    required: ['characters'],
  },
  requiresConfirmation: true,
  isReadOnly: false,
  execute: async (args, context) => {
    const rawCharacters = readList(args.characters)
    if (rawCharacters.length === 0) {
      return { success: false, content: '', error: 'characters 不能为空：请给出至少一名角色的 name 与 role。' }
    }
    if (rawCharacters.length > NEW_CHARACTER_MAX) {
      return { success: false, content: '', error: '一次最多新增 ' + NEW_CHARACTER_MAX + ' 名角色（收到 ' + rawCharacters.length + ' 名），请分批提交。' }
    }
    const parsed: CharacterRosterEntry[] = []
    for (let index = 0; index < rawCharacters.length; index += 1) {
      const result = parseNewCharacter(rawCharacters[index], index)
      if (!result.ok) return { success: false, content: '', error: '参数校验失败：' + result.error }
      parsed.push(result.entry)
    }
    // 批内自检：同一批里不允许出现同一个名字。
    const inBatch = new Map<string, string>()
    for (const entry of parsed) {
      const key = identityKey(entry.name)
      const seen = inBatch.get(key)
      if (seen) return { success: false, content: '', error: '本批新增里「' + entry.name + '」重复出现，请合并为一条。' }
      inBatch.set(key, entry.name)
    }

    const { project, projectSession } = requireAgentProject(context)
    try {
      const snapshot = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:character-roster-read', project.path))
      assertAgentProjectCurrent(context)
      const existing = readList(snapshot.entries).map(entry => readRecord(entry))
      const revision = Number(snapshot.revision)
      if (!Number.isSafeInteger(revision) || revision < 0) {
        return { success: false, content: '', error: '读取角色名单失败：没有拿到有效的名单版本号。' }
      }

      const occupied = occupiedNames(existing)
      const conflicts: string[] = []
      for (const entry of parsed) {
        const hit = occupied.get(identityKey(entry.name))
        if (hit) conflicts.push('「' + entry.name + '」与现有角色「' + hit + '」重名')
        for (const alias of entry.aliases ?? []) {
          const aliasHit = occupied.get(identityKey(alias))
          if (aliasHit) conflicts.push('「' + entry.name + '」的别名「' + alias + '」已被「' + aliasHit + '」占用')
        }
      }
      if (conflicts.length > 0) {
        return {
          success: false,
          content: '',
          error: '新增角色与现有名单冲突：' + conflicts.join('；') + '。请改名后重试，或用 propose_change_plan 修改已有角色。',
        }
      }

      const summary = typeof args.summary === 'string' ? args.summary.trim().slice(0, 300) : ''
      const request = {
        operationId: crypto.randomUUID(),
        expectedRevision: revision,
        schemaVersion: CHARACTER_ROSTER_SCHEMA_VERSION,
        // 现有条目来自主进程快照，形状由角色名单契约保证；这里只把它们原样带回。
        entries: [...(existing as unknown as CharacterRosterEntry[]), ...parsed],
        intent: 'manual_edit' as const,
      }
      const result = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:character-roster-commit', request, project.path))
      assertAgentProjectCurrent(context)
      if (result.success !== true) {
        // 乐观锁冲突等失败一律如实上报：不自动重读重试，避免覆盖作者正在做的编辑。
        return {
          success: false,
          content: '',
          error: '提交角色名单失败：' + String(result.error ?? '未知原因')
            + '。若提示版本冲突，说明名单在提案期间被改过——请作者确认当前名单后重新发起，本工具不会自动重试。',
        }
      }

      const receipt = readRecord(result.receipt)
      const committed = readList(receipt.entries).length || (existing.length + parsed.length)
      const names = parsed.map(entry => entry.name).join('、')
      return {
        success: true,
        content: '已新增 ' + parsed.length + ' 名角色：' + names + '。'
          + '\n角色名单：' + existing.length + ' 人 → ' + committed + ' 人'
          + (Number(receipt.revision) >= 0 ? '（新版本号 ' + Number(receipt.revision) + '）' : '')
          + (summary ? '\n提案说明：' + summary : '')
          + '\n未提供的字段保持为空，未写入任何 currentState（位置/境界/状态由定稿推进产生）。',
      }
    } catch (error) {
      return { success: false, content: '', error: '新增角色失败：' + String(error) }
    }
  },
})
