/**
 * propose_change_plan — 多实体改动计划提案
 *
 * 一次提交牵涉多个对象的协同修改（配置、架构、人物档案、人物状态、蓝图、
 * 线索、规划资料）。应用会在确认卡片里逐项展示改动目标与校验结果，作者批准
 * 后才按依赖顺序通过各自的受保护通道写入；已定稿章节与未建档角色一律拒绝。
 */
import { buildAgentTool } from '../tool-registry'
import { assertAgentProjectCurrent } from './project-context'
import {
  parseChangePlan,
  summarizeChangePlan,
  validateChangePlan,
  type ChangePlan,
  type ChangePlanContext,
  type ChangePlanValidation,
} from '../../../shared/change-plan'
import { changeImpactScopeFromContext, loadChangePlanContext } from '../../change-impact'
import { executeChangePlan } from '../../change-plan-executor'

export type ChangePlanProposal =
  | { valid: true; plan: ChangePlan; validation: ChangePlanValidation }
  | { valid: false; error: string; plan?: ChangePlan }

/** 纯函数：把工具参数解析并对照项目事实校验，供执行与确认卡片共用。 */
export function buildChangePlanProposal(
  args: Record<string, unknown>,
  context: ChangePlanContext,
): ChangePlanProposal {
  const parsed = parseChangePlan(args.plan ?? args)
  if (!parsed.ok) return { valid: false, error: parsed.error }
  const validation = validateChangePlan(parsed.plan, context)
  if (!validation.ok) {
    const failures = validation.items
      .filter(item => !item.ok || item.blocked)
      .map(item => `${item.label}：${item.errors.join('；') || '已定稿，不可自动改写'}`)
    return {
      valid: false,
      error: [...validation.errors, ...failures].join('\n'),
      plan: parsed.plan,
    }
  }
  return { valid: true, plan: parsed.plan, validation }
}

function formatExecutionSummary(
  plan: ChangePlan,
  receipt: Awaited<ReturnType<typeof executeChangePlan>>,
): string {
  const lines = [
    `改动计划已执行：${summarizeChangePlan(plan)}`,
    `结果：应用 ${receipt.applied} 项，跳过 ${receipt.skipped} 项，失败 ${receipt.failed} 项。`,
  ]
  for (const item of receipt.items) {
    const mark = item.status === 'applied' ? '✅' : item.status === 'skipped' ? '⏭️' : '❌'
    lines.push(`${mark} ${item.label}${item.detail ? `：${item.detail}` : ''}`)
  }
  if (receipt.skipped > 0 || receipt.failed > 0) {
    lines.push('未应用的项目可以调整后重新提交；已定稿内容请改用改稿流程。')
  }
  return lines.join('\n')
}

export const proposeChangePlanTool = buildAgentTool({
  name: 'propose_change_plan',
  description: '提交一份多实体改动计划（作品配置/架构设定/人物档案/人物状态/章节蓝图/叙事线索/规划资料）。确认卡片会逐项展示目标与校验结果，作者批准后按依赖顺序写入受保护通道。请先用 analyze_change_impact 取得影响清单，再据此组织 items。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      plan: {
        type: 'object',
        description: '改动计划：{ summary, items }。items 每项形如 { kind, reason, ...目标字段 }；kind 取值：config、architecture、character-profile、character-state、blueprint、narrative-thread、planning-material',
      },
    },
    required: ['plan'],
  },
  requiresConfirmation: true,
  isReadOnly: false,
  execute: async (args, context) => {
    const scope = changeImpactScopeFromContext(context)
    const planContext = await loadChangePlanContext(scope)
    assertAgentProjectCurrent(context)
    // 批准后仍按最新项目事实复核一次：预览与批准之间项目可能已经变化。
    const proposal = buildChangePlanProposal(args, planContext)
    if (!proposal.valid) {
      return { success: false, content: '', error: `改动计划校验失败：\n${proposal.error}` }
    }
    const receipt = await executeChangePlan(context, proposal.plan, proposal.validation)
    assertAgentProjectCurrent(context)
    return { success: true, content: formatExecutionSummary(proposal.plan, receipt) }
  },
})