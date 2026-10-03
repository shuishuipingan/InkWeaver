/**
 * analyze_change_impact — 改动影响分析（只读）
 *
 * 作者说明想改什么之后，先给出基于真实项目状态的影响清单：哪些人物档案、
 * 人物状态、章节蓝图、线索、规划资料、定稿事实会被牵涉，哪些已经定稿不能
 * 自动改写。模型据此再决定改动计划，而不是凭感觉猜。
 */
import { buildAgentTool } from '../tool-registry'
import { formatChangeImpactReport } from '../../../shared/change-impact'
import { analyzeProjectChangeImpact } from '../../change-impact'

const MAX_FOCUS_ITEMS = 24

function textList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, max)
}

function chapterList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map(entry => Number(entry))
    .filter(entry => Number.isSafeInteger(entry) && entry > 0)
    .slice(0, 50)
}

export const analyzeChangeImpactTool = buildAgentTool({
  name: 'analyze_change_impact',
  description: '分析一处改动会牵涉小说的哪些方面：人物档案、人物状态、章节蓝图、叙事线索、规划资料与已定稿事实。凡是"想改设定/人物/剧情"的请求都应先调用它，再据此提出多实体改动计划。只读，不修改任何内容。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      change: {
        type: 'string',
        description: '用作者的原话描述打算做的改动，例如"把玄真改成隐藏的反派"或"世界观从东方玄幻改成赛博朋克"',
      },
      focus_characters: {
        type: 'array',
        description: '可选的明确对象：涉及的角色名（不填则从 change 文本中识别）',
      },
      focus_chapters: {
        type: 'array',
        description: '可选的明确对象：涉及的章节号',
      },
    },
    required: ['change'],
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const change = typeof args.change === 'string' ? args.change.trim() : ''
    if (!change) {
      return { success: false, content: '', error: '缺少 change：请用一句话说明打算改什么' }
    }
    const report = await analyzeProjectChangeImpact(context, {
      change,
      focusCharacters: textList(args.focus_characters, MAX_FOCUS_ITEMS),
      focusChapters: chapterList(args.focus_chapters),
    })
    const guidance = report.targets.length === 0
      ? '未定位到受影响对象：请补充角色名或章节号后重试；若这是一个全新的方向，可以直接与作者确认目标范围。'
      : '下一步：按"必须修改 → 需要复核"的顺序整理出改动计划，用 propose_change_plan 提交；标记为"已定稿"或"仅作者可改"的对象不要放进计划，改为向作者说明需要在哪里处理。'
    return {
      success: true,
      content: `${formatChangeImpactReport(report)}\n\n${guidance}`,
    }
  },
})
