/**
 * read_narrative_threads — 读取伏笔与叙事线索（只读）
 *
 * 回答「伏笔进度如何」「哪些线索逾期 / 休眠」。给定章节号时优先用与该章进度相关的列表
 * （db:narrative-thread-list-relevant，需要该章蓝图作为上下文），拿不到蓝图就退回全量列表。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import {
  READ_TOOL_MAX_ITEMS,
  readInteger,
  readList,
  readRecord,
  readStringArray,
  readText,
  truncationNotice,
} from './read-record.helpers'

/** 可过滤的状态：五个真实状态 + 两个投影（dormant / overdue，来自休眠章数与逾期标记）。 */
const THREAD_FILTERS = ['planned', 'planted', 'progressing', 'resolved', 'abandoned', 'dormant', 'overdue'] as const

function matchesFilter(entry: Record<string, unknown>, filter: string): boolean {
  if (filter === 'overdue') return entry.overdue === true
  if (filter === 'dormant') return (Number(entry.dormantChapters) || 0) > 0
  return String(entry.status ?? '') === filter
}

function formatThread(thread: Record<string, unknown>): string {
  const events = readList(thread.events).map(entry => readRecord(entry))
  const recent = events.slice(-2).reverse()
  const lines = [
    '· [线索 ' + (Number(thread.id) || '?') + '] ' + (readText(thread.title, 120) || '（未命名）')
      + ' — ' + (typeof thread.status === 'string' ? thread.status : '未知状态')
      + (thread.overdue === true ? '（已逾期）' : ''),
    '  目标区间：第 ' + (Number(thread.targetStartChapter) || '?') + '–' + (Number(thread.targetEndChapter) || '?') + ' 章'
      + '；休眠 ' + (Number(thread.dormantChapters) || 0) + ' 章'
      + '；已记录事件 ' + events.length + ' 个',
    '  作者意图：' + (readText(thread.authorIntent, 160) || '（未记录）'),
  ]
  if (recent.length === 0) {
    lines.push('  近况：暂无已确认事件')
    return lines.join('\n')
  }
  for (const event of recent) {
    lines.push('  近况：第 ' + (Number(event.chapterNumber) || '?') + ' 章 · '
      + (readText(event.evidence, 160) || '（无证据摘要）')
      + '（' + (typeof event.type === 'string' ? event.type : '?')
      + '，指纹 ' + (typeof event.evidenceContentHash === 'string' ? event.evidenceContentHash.slice(0, 12) : '无') + '）')
  }
  return lines.join('\n')
}

export const readNarrativeThreadsTool = buildAgentTool({
  name: 'read_narrative_threads',
  description: '读取叙事线索与伏笔的当前状态：状态投影、目标章节区间、休眠与逾期、最近已确认事件及其来源章节与来源指纹。用于回答「伏笔进度如何」「哪些线索该回收了」。给定 chapter_number 时优先返回与当前进度相关的线索。只读取已记录的事件，不判断新伏笔。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: { type: 'number', description: '参考章节号；给定后优先返回与该章进度相关的线索' },
      status: { type: 'string', description: '按状态过滤', enum: [...THREAD_FILTERS] },
      limit: { type: 'number', description: '最多列出多少条（1-20，默认 8）' },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    const limit = readInteger(args.limit, READ_TOOL_MAX_ITEMS, 1, 20)
    const requested = typeof args.status === 'string' ? args.status.trim() : ''
    if (requested && !THREAD_FILTERS.includes(requested as typeof THREAD_FILTERS[number])) {
      return {
        success: false,
        content: '',
        error: '不支持的状态过滤「' + requested + '」。可用值：' + THREAD_FILTERS.join(' / ') + '。',
      }
    }

    try {
      let threads: unknown[] = []
      const chapterNumber = Number(args.chapter_number)
      if (Number.isFinite(chapterNumber) && chapterNumber > 0) {
        const blueprint = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:blueprint-get', Math.trunc(chapterNumber), project.path))
        assertAgentProjectCurrent(context)
        if (Object.keys(blueprint).length > 0) {
          threads = readList(await ipc.invokeWithProjectSession(projectSession, 'db:narrative-thread-list-relevant', {
            chapterNumber: Math.trunc(chapterNumber),
            title: readText(blueprint.title, 120),
            keyEvents: readText(blueprint.keyEvents, 600),
            characters: readStringArray(blueprint.characters),
          }, project.path))
          assertAgentProjectCurrent(context)
        }
      }
      if (threads.length === 0) {
        threads = readList(await ipc.invokeWithProjectSession(projectSession, 'db:narrative-thread-list', project.path))
        assertAgentProjectCurrent(context)
      }
      const records = threads.map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
      if (records.length === 0) {
        return { success: true, content: '当前项目还没有记录任何叙事线索（伏笔）。' }
      }

      const pool = requested ? records.filter(entry => matchesFilter(entry, requested)) : records
      const shown = pool.slice(0, limit)
      const overdueCount = records.filter(entry => entry.overdue === true).length
      const lines = [
        '🧵 叙事线索（共 ' + records.length + ' 条'
          + (requested ? '，筛选「' + requested + '」后 ' + pool.length + ' 条' : '')
          + '，逾期 ' + overdueCount + ' 条；本次列出 ' + shown.length + ' 条）',
      ]
      for (const thread of shown) {
        lines.push('')
        lines.push(formatThread(thread))
      }
      if (shown.length === 0) lines.push('没有符合筛选条件的线索。')
      lines.push(truncationNotice(pool.length, shown.length, '条线索'))
      return { success: true, content: lines.join('\n') }
    } catch (error) {
      return { success: false, content: '', error: '读取叙事线索失败：' + String(error) }
    }
  },
})
