/**
 * read_story_continuity — 读取连续性工作单（只读）
 *
 * 回答「这章的场景因果是什么」「上一章的情绪余波」「读者的悬念进度」。数据来自
 * db:story-continuity-read（作者维护的连续性文档）与 db:continuity-list-before（定稿事实投影）。
 */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'
import {
  READ_TOOL_MAX_ITEMS,
  itemLine,
  readList,
  readRecord,
  readStringArray,
  readText,
  truncationNotice,
} from './read-record.helpers'

function sceneBlock(beat: Record<string, unknown>): string {
  return [
    '· 场景 ' + (Number(beat.sceneNumber) || '?') + '（' + (typeof beat.status === 'string' ? beat.status : '未标注') + '）',
    '  进入状态：' + (readText(beat.entryState, 160) || '（未记录）'),
    '  目标 / 阻碍：' + (readText(beat.goal, 120) || '（未记录）') + ' / ' + (readText(beat.obstacle, 120) || '（未记录）'),
    '  选择 → 后果：' + (readText(beat.choice, 120) || '（未记录）') + ' → ' + (readText(beat.consequence, 120) || '（未记录）'),
    '  离开状态：' + (readText(beat.exitState, 160) || '（未记录）'),
    '  证据：' + itemLine(readStringArray(beat.evidence), 3),
  ].join('\n')
}

export const readStoryContinuityTool = buildAgentTool({
  name: 'read_story_continuity',
  description: '读取某一章的连续性工作单：每个场景的进入/离开状态、目标、阻碍、选择与后果，以及卷级贡献、人物情绪余波、读者期待进度和视角落点。用于回答「这章的场景因果是否闭环」「上一章留下的情绪与悬念」。章节号缺省时取最近一章有连续性记录的章节。只读，不修改工作单。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      chapter_number: { type: 'number', description: '章节号；缺省=最近一章有连续性记录的章节' },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    try {
      let chapterNumber = Number(args.chapter_number)
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
        const all = readList(await ipc.invokeWithProjectSession(projectSession, 'db:continuity-list-all', project.path))
        assertAgentProjectCurrent(context)
        const chapters = all
          .map(entry => readRecord(entry))
          .map(entry => Number(entry.chapterNumber) || 0)
          .filter(value => value > 0)
        if (chapters.length === 0) {
          return { success: true, content: '当前项目还没有定稿连续性记录，也没有可读的连续性工作单。' }
        }
        chapterNumber = Math.max(...chapters)
      }
      chapterNumber = Math.trunc(chapterNumber)

      const document = readRecord(await ipc.invokeWithProjectSession(projectSession, 'db:story-continuity-read', chapterNumber, project.path))
      assertAgentProjectCurrent(context)
      const before = readList(await ipc.invokeWithProjectSession(projectSession, 'db:continuity-list-before', chapterNumber, project.path))
      assertAgentProjectCurrent(context)

      const beats = readList(document.sceneBeats).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
      const carryOver = readList(document.emotionalCarryOver).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
      const expectations = readList(document.readerExpectations).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
      const viewpoints = readList(document.viewpointThreads).map(entry => readRecord(entry)).filter(entry => Object.keys(entry).length > 0)
      const arc = readRecord(document.arcContribution)

      if (beats.length === 0 && carryOver.length === 0 && expectations.length === 0 && Object.keys(arc).length === 0) {
        return {
          success: true,
          content: '第 ' + chapterNumber + ' 章还没有连续性工作单'
            + '（该章之前的定稿连续性记录 ' + before.length + ' 条）。可以从「连续性」面板开始填写。',
        }
      }

      const lines = [
        '🧭 第 ' + chapterNumber + ' 章连续性工作单'
          + (Number(document.revision) > 0 ? '（revision ' + Number(document.revision) + '）' : '')
          + '；该章之前的定稿连续性记录 ' + before.length + ' 条',
      ]
      if (beats.length > 0) {
        lines.push('')
        lines.push('场景（共 ' + beats.length + ' 个，列出 ' + Math.min(beats.length, READ_TOOL_MAX_ITEMS) + ' 个）：')
        for (const beat of beats.slice(0, READ_TOOL_MAX_ITEMS)) lines.push(sceneBlock(beat))
        lines.push(truncationNotice(beats.length, Math.min(beats.length, READ_TOOL_MAX_ITEMS), '个场景'))
      }
      if (Object.keys(arc).length > 0) {
        lines.push('')
        lines.push('卷级贡献：' + (readText(arc.volume, 60) || '（未标注卷）')
          + '；主线：' + (readText(arc.mainline, 200) || '（未记录）'))
        lines.push('  支线：' + itemLine(readStringArray(arc.subplots))
          + '；人物弧：' + itemLine(readStringArray(arc.characterArcs))
          + '；转折点：' + (readText(arc.turningPoint, 160) || '（未记录）')
          + '；代价：' + (readText(arc.cost, 160) || '（未记录）'))
        lines.push('  未解问题：' + itemLine(readStringArray(arc.unresolvedQuestions)))
      }
      if (carryOver.length > 0) {
        lines.push('')
        lines.push('情绪余波（' + carryOver.length + ' 条）：')
        for (const entry of carryOver.slice(0, 5)) {
          lines.push('· ' + (readText(entry.character, 40) || '?') + '：'
            + (readText(entry.previousState, 80) || '?') + ' → ' + (readText(entry.nextState, 80) || '?')
            + '（触发：' + (readText(entry.trigger, 80) || '?') + '；代价：' + (readText(entry.cost, 80) || '?') + '）')
        }
      }
      if (expectations.length > 0) {
        const open = expectations.filter(entry => String(entry.status) === 'open' || String(entry.status) === 'progressing')
        lines.push('')
        lines.push('读者期待（' + expectations.length + ' 条，未结 ' + open.length + ' 条）：')
        for (const entry of expectations.slice(0, READ_TOOL_MAX_ITEMS)) {
          lines.push('· [' + (typeof entry.status === 'string' ? entry.status : '?') + '] '
            + (readText(entry.question, 160) || '（未记录）')
            + '（引入第 ' + (Number(entry.introducedChapter) || '?') + ' 章'
            + (Number(entry.dueChapter) > 0 ? '，预期第 ' + Number(entry.dueChapter) + ' 章回收' : '')
            + (readText(entry.delayReason, 80) ? '，延期原因：' + readText(entry.delayReason, 80) : '') + '）')
        }
        lines.push(truncationNotice(expectations.length, Math.min(expectations.length, READ_TOOL_MAX_ITEMS), '条期待'))
      }
      if (viewpoints.length > 0) {
        lines.push('')
        lines.push('视角落点（' + viewpoints.length + ' 条）：')
        for (const entry of viewpoints.slice(0, 5)) {
          lines.push('· ' + (readText(entry.viewpoint, 40) || '?')
            + '（最近第 ' + (Number(entry.lastChapter) || '?') + ' 章；下次落点：' + (readText(entry.nextLanding, 120) || '（未记录）') + '）')
        }
      }
      return { success: true, content: lines.join('\n') }
    } catch (error) {
      return { success: false, content: '', error: '读取连续性工作单失败：' + String(error) }
    }
  },
})
