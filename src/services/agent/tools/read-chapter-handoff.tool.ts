/**
 * read_chapter_handoff — 读取章节交接（只读）
 *
 * 回答「上一章结尾是什么状态」「下一章该从哪里接」。来源是已记录的交接单
 * （db:chapter-handoff-*），含来源定稿指纹，便于判断交接是否已经过期。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import { fingerprint, itemLine, readRecord, readStringArray, readText } from './read-record.helpers'

function formatHandoff(record: Record<string, unknown>): string {
  const lines = [
    '🔗 第 ' + (Number(record.chapterNumber) || '?') + ' 章交接到下一章'
      + '（状态：' + (typeof record.status === 'string' ? record.status : '未知')
      + (typeof record.confirmedAt === 'string' ? '，确认于 ' + record.confirmedAt : '') + '）',
    '  交接 ID：' + (typeof record.handoffId === 'string' ? record.handoffId : '未知')
      + '；来源定稿：draftId ' + (Number(record.draftId) || '未知') + '，指纹 ' + fingerprint(record.sourceContentHash),
    '  场景 / 视角：' + (readText(record.sceneLocation, 120) || '（未记录）') + ' @ ' + (readText(record.viewpoint, 80) || '（未记录）'),
    '  上场人物：' + itemLine(readStringArray(record.presentCharacters)),
    '  即时目标：' + (readText(record.immediateGoal, 200) || '（未记录）'),
    '  情绪状态：' + (readText(record.emotionalState, 160) || '（未记录）'),
    '  未完成动作：' + itemLine(readStringArray(record.unfinishedActions)),
    '  待回应问题：' + itemLine(readStringArray(record.openQuestions)),
    '  约束：' + itemLine(readStringArray(record.constraints)),
    '  过渡类型：' + (typeof record.transition === 'string' ? record.transition : '（未记录）'),
    '  证据：' + itemLine(readStringArray(record.evidence), 3),
  ]
  return lines.join('\n')
}

export const readChapterHandoffTool = buildAgentTool({
  name: 'read_chapter_handoff',
  description: '读取章节交接单：来源章、场景、视角、上场人物、未完成动作、即时目标、情绪、待回应问题与来源定稿指纹。用于回答「上一章结尾是什么状态」「下一章从哪里接」。缺省取最近一章的交接，可用 before_chapter 读取某章之前的最新交接。只读已记录的交接，不生成新交接。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: { type: 'number', description: '来源章节号；缺省=最近一章有交接的章节' },
      before_chapter: { type: 'number', description: '读取该章之前最近的一张交接单（与 chapter_number 二选一）' },
      handoff_id: { type: 'string', description: '直接读取某张交接单（与上面两个参数互斥）' },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    try {
      const directId = typeof args.handoff_id === 'string' ? args.handoff_id.trim() : ''
      if (directId) {
        const record = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:chapter-handoff-get', directId, project.path))
        assertAgentProjectCurrent(context)
        if (Object.keys(record).length === 0) {
          return { success: true, content: '没有找到交接单 ' + directId + '（可能已被取代或不属于当前项目）。' }
        }
        return { success: true, content: formatHandoff(record) }
      }

      const beforeChapter = Number(args.before_chapter)
      if (Number.isFinite(beforeChapter) && beforeChapter > 0) {
        const record = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:chapter-handoff-latest-before', Math.trunc(beforeChapter), project.path))
        assertAgentProjectCurrent(context)
        if (Object.keys(record).length === 0) {
          return { success: true, content: '第 ' + Math.trunc(beforeChapter) + ' 章之前还没有交接单。' }
        }
        return { success: true, content: formatHandoff(record) }
      }

      const records = (await ipc.invokeWithProjectSession(projectSession, 'db:chapter-handoff-list-all', project.path))
      assertAgentProjectCurrent(context)
      const all = (Array.isArray(records) ? records : []).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
      if (all.length === 0) {
        return { success: true, content: '当前项目还没有任何章节交接单。' }
      }

      const explicitChapter = Number(args.chapter_number)
      if (Number.isFinite(explicitChapter) && explicitChapter > 0) {
        const forChapter = (await ipc.invokeWithProjectSession(projectSession, 'db:chapter-handoff-list-for-chapter', Math.trunc(explicitChapter), project.path))
        assertAgentProjectCurrent(context)
        const entries = (Array.isArray(forChapter) ? forChapter : []).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
        if (entries.length === 0) {
          return { success: true, content: '第 ' + Math.trunc(explicitChapter) + ' 章还没有交接单。' }
        }
        const confirmedFirst = entries.slice().sort((left, right) => {
          const leftRank = left.status === 'confirmed' ? 0 : 1
          const rightRank = right.status === 'confirmed' ? 0 : 1
          if (leftRank !== rightRank) return leftRank - rightRank
          return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''))
        })
        return { success: true, content: formatHandoff(confirmedFirst[0])
          + '\n\n（第 ' + Math.trunc(explicitChapter) + ' 章共有 ' + entries.length + ' 张交接单，上面是其中最新的一张）' }
      }

      const latestChapter = all.reduce((max, entry) => Math.max(max, Number(entry.chapterNumber) || 0), 0)
      const latest = all
        .filter(entry => (Number(entry.chapterNumber) || 0) === latestChapter)
        .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0]
      return { success: true, content: formatHandoff(latest ?? all[0])
        + '\n\n（缺省展示最近一章的交接：第 ' + latestChapter + ' 章；项目内共 ' + all.length + ' 张交接单）' }
    } catch (error) {
      return { success: false, content: '', error: '读取章节交接失败：' + String(error) }
    }
  },
})
