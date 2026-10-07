/**
 * 六个「创作状态」只读工具（审稿 / 线索 / 交接 / 知情边界 / 连续性 / 修订）共用的取值与体积控制。
 *
 * 这些工具的输出直接进模型上下文，所以统一遵守三条：参数非法不抛裸异常、数组返回一律收敛、
 * 长列表只列前 N 条并明确「还有多少条未列出」，同时保留章节号与记录 ID 供作者复核。
 */
import type { DraftMeta } from '../../draft-index'

/** 单次最多列出的条目数。 */
export const READ_TOOL_MAX_ITEMS = 8
/** 单条正文摘要最多保留的字符数。 */
export const READ_TOOL_TEXT_LIMIT = 600

export function readInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/** 可选整数：缺省返回 null；给了但不是数字也返回 null（由调用方决定是否报错）。 */
export function optionalInteger(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

export function readText(value: unknown, max = READ_TOOL_TEXT_LIMIT): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function readStringArray(value: unknown): string[] {
  return readList(value).map(entry => (typeof entry === 'string' ? entry : '')).filter(entry => entry.length > 0)
}

/** draft-list / draft-list-all 的收敛：缺字段按 0/空串处理，不让脏数据把工具打崩。 */
export function readDrafts(value: unknown): DraftMeta[] {
  return readList(value).map(entry => {
    const record = readRecord(entry)
    return {
      id: Number(record.id) || 0,
      chapterNumber: Number(record.chapterNumber) || 0,
      version: Number(record.version) || 0,
      status: typeof record.status === 'string' ? record.status : '',
      chapterTitle: typeof record.chapterTitle === 'string' ? record.chapterTitle : '',
    } as DraftMeta
  })
}

export function latestDraftOf(drafts: DraftMeta[]): DraftMeta | null {
  let latest: DraftMeta | null = null
  for (const draft of drafts) {
    if (!latest || draft.chapterNumber > latest.chapterNumber
      || (draft.chapterNumber === latest.chapterNumber && draft.version > latest.version)) {
      latest = draft
    }
  }
  return latest
}

export function latestChapterOf(drafts: DraftMeta[]): number | null {
  const latest = latestDraftOf(drafts)
  return latest && latest.chapterNumber > 0 ? latest.chapterNumber : null
}

export type ChapterResolution = { chapterNumber: number | null; fromArgument: boolean }

/** 章节号缺省时的兜底：用「最近一章」；项目里还没有草稿就返回 null，由调用方给出可读空状态。 */
export function resolveChapterNumber(requested: unknown, drafts: DraftMeta[]): ChapterResolution {
  const explicit = optionalInteger(requested, 1, 9999)
  if (explicit !== null) return { chapterNumber: explicit, fromArgument: true }
  return { chapterNumber: latestChapterOf(drafts), fromArgument: false }
}

export function truncationNotice(total: number, shown: number, unit: string): string {
  if (total <= shown) return ''
  return '\n…（共 ' + total + ' ' + unit + '，还有 ' + (total - shown) + ' ' + unit + '未列出；可用更具体的章节号或筛选条件重试）'
}

export function itemLine(items: string[], max = 4): string {
  if (items.length === 0) return '（无）'
  const shown = items.slice(0, max)
  return shown.join('；') + (items.length > shown.length ? '；…还有 ' + (items.length - shown.length) + ' 项' : '')
}

export function fingerprint(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, 12) : '（无指纹）'
}
