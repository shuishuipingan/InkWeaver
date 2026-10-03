/* eslint-disable react-refresh/only-export-components */
/**
 * ChangePlanPreview — 多实体改动计划的确认预览
 *
 * 逐项展示：目标、为什么必须改、字段的当前值与建议值，以及校验结果
 * （可执行 / 需要修正 / 已跳过）。作者看清楚整条改动链之后再批准。
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ToolCallInfo } from '../../../services/agent/agent-engine'
import { buildChangePlanProposal } from '../../../services/agent/tools/propose-change-plan.tool'
import { loadChangePlanPreview } from '../../../services/change-impact'
import type { ChangeImpactSnapshot } from '../../../shared/change-impact'
import type { ChangePlan, ChangePlanValidation } from '../../../shared/change-plan'
import { changePlanDiffLines, changePlanFieldLabel } from '../../../shared/change-plan-diff'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { projectSessionContextFromProject, sameProjectSessionContext } from '../../../shared/project-session-context'

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export type ChangePlanPreviewState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'stale' }
  | { kind: 'invalid'; error: string; plan?: ChangePlan }
  | { kind: 'valid'; plan: ChangePlan; validation: ChangePlanValidation; snapshot: ChangeImpactSnapshot }

export type { ChangePlanDiffLine } from '../../../shared/change-plan-diff'

export function useChangePlanPreview(toolCall: ToolCallInfo): ChangePlanPreviewState {
  const currentProject = useProjectStore(s => s.currentProject)
  const [asyncState, setAsyncState] = useState<ChangePlanPreviewState>({ kind: 'loading' })
  const sessionCurrent = !!toolCall.projectSession && sameProjectSessionContext(
    toolCall.projectSession,
    projectSessionContextFromProject(currentProject),
  )
  const isChangePlan = toolCall.toolName === 'propose_change_plan'

  // 立即判定的情况（不适用 / 会话已变）不进入异步校验，避免在 effect 里同步 setState。
  const immediate = useMemo<ChangePlanPreviewState | null>(() => {
    if (!isChangePlan) return { kind: 'none' }
    if (!toolCall.projectSession || !currentProject || !sessionCurrent) return { kind: 'stale' }
    return null
  }, [currentProject, isChangePlan, sessionCurrent, toolCall.projectSession])

  useEffect(() => {
    if (immediate || !toolCall.projectSession || !currentProject) return
    let disposed = false
    void loadChangePlanPreview({
      projectSession: toolCall.projectSession,
      projectPath: currentProject.path,
      projectName: currentProject.name,
    }).then(({ context, snapshot }) => {
      if (disposed) return
      const now = useProjectStore.getState().currentProject
      if (!toolCall.projectSession || !sameProjectSessionContext(toolCall.projectSession, projectSessionContextFromProject(now))) {
        setAsyncState({ kind: 'stale' })
        return
      }
      const proposal = buildChangePlanProposal(toolCall.arguments, context)
      setAsyncState(proposal.valid
        ? { kind: 'valid', plan: proposal.plan, validation: proposal.validation, snapshot }
        : { kind: 'invalid', error: proposal.error, ...(proposal.plan ? { plan: proposal.plan } : {}) })
    }).catch((error) => {
      if (!disposed) setAsyncState({ kind: 'invalid', error: String(error) })
    })
    return () => { disposed = true }
  }, [currentProject, immediate, toolCall.arguments, toolCall.projectSession])

  return immediate ?? asyncState
}

interface Props {
  preview: ChangePlanPreviewState
}

export default function ChangePlanPreview({ preview }: Props) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)

  if (preview.kind === 'none' || preview.kind === 'loading') {
    if (preview.kind === 'loading') {
      return <div style={hintStyle}>{text('正在按当前项目校验改动计划…', 'Validating the change plan against the current project…')}</div>
    }
    return null
  }
  if (preview.kind === 'stale') {
    return <div style={{ ...hintStyle, color: 'var(--color-warning, #d97706)' }}>{text('项目会话已变化，请重新发起改动计划。', 'The project session changed; please start the change plan again.')}</div>
  }
  if (preview.kind === 'invalid') {
    return (
      <div style={{ ...hintStyle, color: 'var(--color-error, #dc2626)', whiteSpace: 'pre-wrap' }}>
        {text('改动计划无法执行：', 'This change plan cannot run:')}
        {'\n'}{preview.error}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
        {text('改动计划：', 'Change plan: ')}{preview.plan.summary}
      </div>
      {preview.plan.items.map((item, index) => {
        const itemValidation = preview.validation.items[index]
        const ok = itemValidation?.ok !== false && !itemValidation?.blocked
        return (
          <div
            key={`${item.kind}-${index}`}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: '0.7rem',
              opacity: ok ? 1 : 0.7,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{itemValidation?.label ?? item.kind}</span>
              <span style={{ color: ok ? 'var(--color-success, #16a34a)' : 'var(--color-error, #dc2626)' }}>
                {ok ? text('可执行', 'Ready') : text('不可执行', 'Blocked')}
              </span>
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>{item.reason}</div>
            {changePlanDiffLines(item, preview.snapshot).map(line => (
              <div key={line.field} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {changePlanFieldLabel(line.field, locale)}：{truncate(line.current, 60)} → {truncate(line.proposed, 160)}
              </div>
            ))}
            {itemValidation?.errors.map(error => (
              <div key={error} style={{ color: 'var(--color-error, #dc2626)' }}>{error}</div>
            ))}
            {itemValidation?.warnings.map(warning => (
              <div key={warning} style={{ color: 'var(--color-warning, #d97706)' }}>{warning}</div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const hintStyle: CSSProperties = {
  marginTop: 6,
  fontSize: '0.7rem',
  color: 'var(--color-text-secondary)',
}
