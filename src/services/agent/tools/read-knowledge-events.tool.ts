/**
 * read_knowledge_events — 读取知情边界（只读）
 *
 * 回答「谁在第 N 章知道了这个秘密」「某个角色现在知道什么」。默认只返回作者已确认的知情记录；
 * include_pending=true 时才附上待确认候选，并在正文里明确标注，不与已确认事实混在一处。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import {
  readDrafts,
  readInteger,
  readList,
  readRecord,
  readText,
  resolveChapterNumber,
  truncationNotice,
} from './read-record.helpers'

function formatEvent(event: Record<string, unknown>, pending: boolean): string {
  const range = [
    Number(event.validFromChapter) > 0 ? '自第 ' + Number(event.validFromChapter) + ' 章' : '',
    Number(event.validUntilChapter) > 0 ? '至第 ' + Number(event.validUntilChapter) + ' 章' : '',
  ].filter(part => part.length > 0).join('')
  const lines = [
    '  · ' + (readText(event.information, 200) || '（事实内容为空）')
      + (pending ? '［候选·未确认］' : ''),
    '    类型：' + (typeof event.certainty === 'string' ? event.certainty : '未知')
      + (event.falseBelief === true ? '（误信）' : '')
      + '；获知方式：' + (readText(event.learnedBy, 80) || '未记录')
      + '；来源章：第 ' + (Number(event.sourceChapter) || '?') + ' 章'
      + (range ? '；有效范围：' + range : ''),
  ]
  if (event.status === 'candidate' || event.status === 'rejected') {
    lines.push('    记录状态：' + String(event.status))
  }
  const evidence = readText(event.evidence, 160)
  if (evidence) lines.push('    证据：' + evidence)
  return lines.join('\n')
}

export const readKnowledgeEventsTool = buildAgentTool({
  name: 'read_knowledge_events',
  description: '读取某个章节时点的知情边界：每个角色已知的事实、信念、传闻或误信，含获知方式、来源章节与有效范围。用于回答「谁在第 N 章知道了这个秘密」「这个角色现在知道什么」。默认只返回作者已确认的记录；include_pending=true 时附上未确认候选中并标注。只读，不新增或确认事件。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: { type: 'number', description: '章节时点；缺省=最近一章' },
      character: { type: 'string', description: '只看某个角色的知情记录' },
      include_pending: { type: 'boolean', description: '是否附带未确认的候选（默认 false，只返回已确认）' },
      limit: { type: 'number', description: '最多列出多少条（1-30，默认 10）' },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    const limit = readInteger(args.limit, 10, 1, 30)
    const includePending = args.include_pending === true
    try {
      const characters = readList(await ipc.invokeWithProjectSession(projectSession, 'db:character-get-all', project.path))
      assertAgentProjectCurrent(context)
      const wanted = typeof args.character === 'string' ? args.character.trim() : ''
      const names = characters
        .map(entry => readRecord(entry))
        .map(entry => (typeof entry.name === 'string' ? entry.name.trim() : ''))
        .filter(name => name.length > 0 && (!wanted || name === wanted))
      if (names.length === 0) {
        return {
          success: true,
          content: wanted
            ? '当前项目里没有叫「' + wanted + '」的角色，因此没有知情记录可读。'
            : '当前项目还没有角色档案，因此没有知情记录可读。',
        }
      }

      const drafts = readDrafts(await ipc.invokeWithProjectSession(projectSession, 'db:draft-list-all', project.path))
      assertAgentProjectCurrent(context)
      const resolved = resolveChapterNumber(args.chapter_number, drafts)
      if (resolved.chapterNumber === null) {
        return { success: true, content: '当前项目还没有任何草稿，因此没有可读的知情记录。' }
      }
      const chapterNumber = resolved.chapterNumber

      const confirmedRaw = await ipc.invokeWithProjectSession(projectSession, 'db:knowledge-event-list-for-chapter', names, chapterNumber, project.path)
      assertAgentProjectCurrent(context)
      const confirmed = readList(confirmedRaw).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)

      let pending: Array<Record<string, unknown>> = []
      if (includePending) {
        const reviewRaw = await ipc.invokeWithProjectSession(projectSession, 'db:knowledge-event-list-review', names, chapterNumber, project.path)
        assertAgentProjectCurrent(context)
        const confirmedIds = new Set(confirmed.map(entry => String(entry.eventId ?? '')))
        pending = readList(reviewRaw)
          .map(entry => readRecord(entry))
          .filter(entry => Object.keys(entry).length > 0 && !confirmedIds.has(String(entry.eventId ?? '')))
      }

      if (confirmed.length === 0 && pending.length === 0) {
        return {
          success: true,
          content: '第 ' + chapterNumber + ' 章为止，' + (wanted ? '「' + wanted + '」' : '这些角色')
            + '还没有已记录的知情事件' + (includePending ? '，也没有待确认候选。' : '（如需候选用 include_pending=true 查询）。'),
        }
      }

      const byCharacter = new Map<string, { confirmed: Array<Record<string, unknown>>; pending: Array<Record<string, unknown>> }>()
      for (const name of names) byCharacter.set(name, { confirmed: [], pending: [] })
      for (const event of confirmed) {
        const name = typeof event.character === 'string' ? event.character : '未知角色'
        if (!byCharacter.has(name)) byCharacter.set(name, { confirmed: [], pending: [] })
        byCharacter.get(name)!.confirmed.push(event)
      }
      for (const event of pending) {
        const name = typeof event.character === 'string' ? event.character : '未知角色'
        if (!byCharacter.has(name)) byCharacter.set(name, { confirmed: [], pending: [] })
        byCharacter.get(name)!.pending.push(event)
      }

      const total = confirmed.length + pending.length
      const lines = [
        '🔐 第 ' + chapterNumber + ' 章的知情边界'
          + '（已确认 ' + confirmed.length + ' 条'
          + (includePending ? '，待确认候选 ' + pending.length + ' 条' : '')
          + '；本次最多列出 ' + limit + ' 条）',
      ]
      let shownCount = 0
      for (const [name, bucket] of byCharacter) {
        const remaining = limit - shownCount
        if (remaining <= 0) break
        const takeConfirmed = bucket.confirmed.slice(0, remaining)
        shownCount += takeConfirmed.length
        const takePending = includePending ? bucket.pending.slice(0, Math.max(0, limit - shownCount)) : []
        shownCount += takePending.length
        if (takeConfirmed.length === 0 && takePending.length === 0) continue
        lines.push('')
        lines.push('【' + name + '】')
        for (const event of takeConfirmed) lines.push(formatEvent(event, false))
        for (const event of takePending) lines.push(formatEvent(event, true))
      }
      lines.push(truncationNotice(total, shownCount, '条知情记录'))
      return { success: true, content: lines.join('\n') }
    } catch (error) {
      return { success: false, content: '', error: '读取知情边界失败：' + String(error) }
    }
  },
})
