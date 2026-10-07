/**
 * ConfirmCard — 操作确认卡片
 *
 * 当 Agent 调用需要确认的 Tool 时显示此卡片。用户可以批准或拒绝操作。
 * 三种状态都必须看得见：
 *   · 活跃   —— 该 toolCallId 仍在 pendingConfirmations 里等待响应；
 *   · 过期   —— 生成已结束、超时或被取消，三个按钮一律禁用并说明原因；
 *   · 受阻   —— 确认仍有效但校验未通过（如改动计划字段类型不对），显示原因并给出「请助手修正此计划」。
 */
import { useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import type { ToolCallInfo } from '../../../services/agent/agent-engine'
import { useAgentStore } from '../../../stores/agent-store'
import { useLocaleStore } from '../../../stores/locale-store'
import ConfigImpactPreview, { useConfigImpactPreview } from './ConfigImpactPreview'
import DomainProposalDiff, { useDomainProposalPreview } from './DomainProposalDiff'
import ChangePlanPreview, { useChangePlanPreview } from './ChangePlanPreview'
import DraftRevisionPreview, { useDraftRevisionPreview } from './DraftRevisionPreview'

interface Props {
  toolCall: ToolCallInfo
}

export default function ConfirmCard({ toolCall }: Props) {
  const resolveToolConfirmation = useAgentStore(state => state.resolveToolConfirmation)
  const cancelGeneration = useAgentStore(state => state.cancelGeneration)
  const requestPlanRevision = useAgentStore(state => state.requestPlanRevision)
  // pendingConfirmations 是模块级 Map（不在 state 里）：订阅 revision 再查询，
  // 才能让「这张卡是否还有效」成为可渲染的实时状态，而不是一次静默的点击。
  const isConfirmationPending = useAgentStore(state => (
    state.pendingConfirmationRevision >= 0 && state.hasPendingConfirmation(toolCall.id)
  ))
  const text = useLocaleStore(s => s.text)

  const { id, toolName, arguments: args } = toolCall
  const proposalPreview = useDomainProposalPreview(toolCall)
  const impactPreview = useConfigImpactPreview(toolCall, proposalPreview)
  const changePlanPreview = useChangePlanPreview(toolCall)
  const revisionPreview = useDraftRevisionPreview(toolCall)
  const [selectedImpactKeys, setSelectedImpactKeys] = useState<Set<string>>(() => new Set())
  const [revising, setRevising] = useState(false)
  const [revisionFailed, setRevisionFailed] = useState(false)

  const isDomainProposal = proposalPreview.kind !== 'none'
  const isChangePlan = changePlanPreview.kind !== 'none'
  const isDraftRevision = revisionPreview.kind !== 'none'
  const impactReady = impactPreview.kind === 'none' || impactPreview.kind === 'valid'
  const changePlanReady = !isChangePlan || changePlanPreview.kind === 'valid'
  const revisionReady = !isDraftRevision || revisionPreview.kind === 'valid'
  const canApprove = (!isDomainProposal || proposalPreview.kind === 'valid')
    && impactReady && changePlanReady && revisionReady

  // 生成操作描述
  const description = generateDescription(toolName, args, text)

  const expiredReason = text(
    '此确认已失效：生成已结束、超时或被取消，点击按钮不会再有任何反应。请重新发起这次操作。',
    'This confirmation is no longer active: the run finished, timed out, or was cancelled, so clicking will do nothing. Please start the request again.',
  )

  /** 说明「为什么现在不能批准」；校验进行中与校验失败必须是不同的话。 */
  const approvalBlockReason = (() => {
    if (isDraftRevision && revisionPreview.kind === 'loading') {
      return text('正在比对当前草稿与修订正文，请稍候…', 'Comparing the current draft with the revision, please wait…')
    }
    if (isDraftRevision && revisionPreview.kind === 'stale') {
      return text('项目会话已变化，这次改稿不能再批准。', 'The project session changed, so this revision can no longer be approved.')
    }
    if (isDraftRevision && revisionPreview.kind === 'same') {
      return text('这次改稿没有产生任何改动，批准已停用。', 'This revision produced no changes, so approval is disabled.')
    }
    if (isDraftRevision && revisionPreview.kind === 'invalid') {
      return text('这次改稿无法预览（详见上方提示），批准已停用。', 'This revision cannot be previewed (see the notice above), so approval is disabled.')
    }
    if (isChangePlan && changePlanPreview.kind === 'loading') {
      return text('正在校验改动计划，请稍候…', 'Validating the change plan, please wait…')
    }
    if (isChangePlan && changePlanPreview.kind === 'stale') {
      return text('项目会话已变化，这份改动计划不能再批准。', 'The project session changed, so this change plan can no longer be approved.')
    }
    if (isChangePlan && changePlanPreview.kind === 'invalid') {
      return text(
        '改动计划校验未通过，不能批准：' + changePlanPreview.error,
        'The change plan did not pass validation, so it cannot be approved: ' + changePlanPreview.error,
      )
    }
    if (isDomainProposal && proposalPreview.kind === 'loading') {
      return text('正在校验这项提案，请稍候…', 'Validating this proposal, please wait…')
    }
    if (isDomainProposal && proposalPreview.kind === 'stale') {
      return text('项目会话已变化，这项提案不能再批准。', 'The project session changed, so this proposal can no longer be approved.')
    }
    if (isDomainProposal && proposalPreview.kind === 'invalid') {
      return proposalPreview.error
        ? text('提案校验未通过，不能批准：' + proposalPreview.error, 'The proposal did not pass validation, so it cannot be approved: ' + proposalPreview.error)
        : text('提案校验未通过，不能批准。', 'The proposal did not pass validation, so it cannot be approved.')
    }
    if (!impactReady) {
      return impactPreview.kind === 'loading'
        ? text('正在校验改动影响，请稍候…', 'Checking the impact of this change, please wait…')
        : text('改动影响校验未通过，暂时不能批准。', 'The impact check did not pass, so approval is unavailable.')
    }
    if (!canApprove) {
      return text('当前状态不能批准。', 'Approval is not available in the current state.')
    }
    return null
  })()

  const approveLabel = text('批准执行', 'Approve')
  const approveTitle = !isConfirmationPending
    ? expiredReason
    : canApprove
      ? undefined
      : (approvalBlockReason ?? text('当前状态不能批准。', 'Approval is not available in the current state.'))
  const rejectTitle = !isConfirmationPending ? expiredReason : undefined

  const requestRevision = async () => {
    if (changePlanPreview.kind !== 'invalid') return
    setRevising(true)
    setRevisionFailed(false)
    const feedback = text(
      '你上一次的改动计划未通过校验：' + changePlanPreview.error + '。请修正后重新用 propose_change_plan 提交。',
      'Your previous change plan did not pass validation: ' + changePlanPreview.error + '. Please fix it and submit it again with propose_change_plan.',
    )
    // 这会先按拒绝结算悬挂的确认，再作为新的助手回合发送；不是对旧卡片的响应。
    const sent = await requestPlanRevision(id, feedback)
    setRevising(false)
    if (!sent) setRevisionFailed(true)
  }

  return (
    <div className="confirm-card" data-confirm-card-state={isConfirmationPending ? 'active' : 'expired'}>
      {/* 头部 */}
      <div className="confirm-card-header">
        {isConfirmationPending ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
        <span>
          {isConfirmationPending
            ? text('需要确认操作', 'Confirmation required')
            : text('此确认已失效', 'This confirmation has expired')}
        </span>
      </div>

      {/* 内容 */}
      <div className="confirm-card-body">
        <div>{description}</div>

        {!isConfirmationPending && (
          <div
            style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--color-warning-text)' }}
            data-confirm-card-expired-notice
          >
            {expiredReason}
          </div>
        )}

        <DomainProposalDiff toolCall={toolCall} preview={proposalPreview} />
        <ChangePlanPreview preview={changePlanPreview} />
        <DraftRevisionPreview preview={revisionPreview} />
        <ConfigImpactPreview
          preview={impactPreview}
          selectedKeys={selectedImpactKeys}
          onSelectionChange={(key, selected) => setSelectedImpactKeys(current => {
            const next = new Set(current)
            if (selected) next.add(key)
            else next.delete(key)
            return next
          })}
        />

        {isConfirmationPending && approvalBlockReason && (
          <div
            style={{ marginTop: 6, fontSize: '0.72rem', whiteSpace: 'pre-wrap', color: 'var(--color-warning-text)' }}
            data-confirm-card-approval-blocked
          >
            {approvalBlockReason}
          </div>
        )}

        {!isDomainProposal && !isChangePlan && !isDraftRevision && Object.keys(args).length > 0 && (
          <div
            style={{
              marginTop: 6,
              padding: '4px 8px',
              borderRadius: 4,
              backgroundColor: 'var(--color-hover)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.68rem',
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
              maxHeight: 120,
              overflowY: 'auto',
            }}
          >
            {JSON.stringify(args, null, 2)}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="confirm-card-actions">
        {(isDomainProposal || isChangePlan) && (
          <button
            className="confirm-card-btn reject"
            disabled={!isConfirmationPending}
            title={!isConfirmationPending ? expiredReason : undefined}
            onClick={() => void cancelGeneration()}
          >
            {text('取消本次助手任务', 'Cancel this Agent task')}
          </button>
        )}

        {isChangePlan && changePlanPreview.kind === 'invalid' && (
          <button
            className="confirm-card-btn revise"
            data-confirm-card-request-revision
            disabled={revising}
            title={text('把校验错误回注给助手，让它重新提交计划', 'Send the validation error back to the assistant so it can resubmit the plan')}
            onClick={() => void requestRevision()}
          >
            {revising
              ? text('正在请助手修正…', 'Asking the assistant to fix it…')
              : text('请助手修正此计划', 'Ask the assistant to fix this plan')}
          </button>
        )}

        <button
          className="confirm-card-btn reject"
          disabled={!isConfirmationPending}
          title={rejectTitle}
          onClick={() => resolveToolConfirmation(id, false)}
        >
          {text('拒绝', 'Reject')}
        </button>
        <button
          className="confirm-card-btn approve"
          disabled={!isConfirmationPending || !canApprove}
          title={approveTitle}
          onClick={() => {
            const blueprintProposals = impactPreview.kind === 'valid'
              ? impactPreview.blueprintProposals
                  .filter(proposal => selectedImpactKeys.has(proposal.key))
                  .map(proposal => ({ name: proposal.name, arguments: proposal.arguments }))
              : []
            if (blueprintProposals.length > 0) {
              resolveToolConfirmation(id, true, { blueprintProposals })
              return
            }
            resolveToolConfirmation(id, true)
          }}
        >
          {approveLabel}
        </button>
      </div>

      {revisionFailed && (
        <div
          style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--color-warning-text)' }}
          data-confirm-card-revision-failed
        >
          {text('助手仍在处理上一回合，稍后再试一次。', 'The assistant is still finishing the previous turn; try again in a moment.')}
        </div>
      )}
    </div>
  )
}

/** 根据 Tool 名称生成人类可读的操作描述 */
function generateDescription(
  toolName: string,
  args: Record<string, unknown>,
  text: ReturnType<typeof useLocaleStore.getState>['text'],
): string {
  switch (toolName) {
    case 'write_file':
      return text('将写入文件：' + String(args.file_path ?? '未知路径'), 'Will write file: ' + String(args.file_path ?? 'unknown path'))
    case 'open_editor':
      return text('将在编辑器中打开：' + String(args.file_path ?? '未知文件'), 'Will open in editor: ' + String(args.file_path ?? 'unknown file'))
    case 'start_workflow':
      return text(
        '将启动工作流：' + String(args.workflow ?? '未知工作流') + (args.chapter_number ? '（第 ' + String(args.chapter_number) + ' 章）' : ''),
        'Will start workflow: ' + String(args.workflow ?? 'unknown workflow') + (args.chapter_number ? ' (chapter ' + String(args.chapter_number) + ')' : ''),
      )
    case 'propose_novel_config':
      return text('小说配置变更提案', 'Novel configuration change proposal')
    case 'propose_chapter_blueprint':
      return text(
        '第 ' + String(args.chapter_number ?? '?') + ' 章蓝图变更提案',
        'Chapter ' + String(args.chapter_number ?? '?') + ' blueprint change proposal',
      )
    case 'propose_change_plan':
      return text('多实体改动计划', 'Multi-entity change plan')
    default:
      return text('将执行操作：' + toolName, 'Will run action: ' + toolName)
  }
}
