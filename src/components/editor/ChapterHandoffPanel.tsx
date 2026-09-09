import { Check, CircleAlert, MapPin, MessageCircle, Sparkles } from 'lucide-react'

import type { ChapterHandoffRecord } from '../../shared/chapter-handoff'
import { Button } from '../ui/Button'

interface ChapterHandoffPanelProps {
  records: readonly ChapterHandoffRecord[]
  loading?: boolean
  confirmingId?: string | null
  onConfirm: (handoffId: string) => Promise<void>
  text: (zhCNText: string, enUSText: string) => string
}

function statusText(
  status: ChapterHandoffRecord['status'],
  text: ChapterHandoffPanelProps['text'],
): string {
  if (status === 'confirmed') return text('已确认', 'Confirmed')
  if (status === 'candidate') return text('待作者确认', 'Needs author confirmation')
  if (status === 'superseded') return text('已被新记录替代', 'Superseded')
  return text('来源已过期', 'Source is stale')
}

function transitionText(
  transition: ChapterHandoffRecord['transition'],
  text: ChapterHandoffPanelProps['text'],
): string {
  const labels: Record<ChapterHandoffRecord['transition'], [string, string]> = {
    'continue-scene': ['紧接现场', 'Continue the scene'],
    'time-jump': ['跨时段', 'Time jump'],
    'location-change': ['换地点', 'Location change'],
    'viewpoint-change': ['换视角', 'Viewpoint change'],
    flashback: ['倒叙', 'Flashback'],
    'parallel-event': ['并行事件', 'Parallel event'],
  }
  const label = labels[transition]
  return label ? text(...label) : transition
}

export default function ChapterHandoffPanel({ records, loading = false, confirmingId = null, onConfirm, text }: ChapterHandoffPanelProps) {
  const record = records.find(candidate => candidate.status === 'candidate')
    ?? records.find(candidate => candidate.status === 'confirmed')
  if (loading || !record) return null

  return (
    <section
      className="mx-3 my-2 rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}
      aria-label={text('章节交接记录', 'Chapter handoff')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--color-text)' }}>
          <Sparkles size={13} aria-hidden="true" />
          {text('章节交接记录', 'Chapter handoff')}
          <span className="rounded px-1.5 py-0.5 font-normal" style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-hover)' }}>
            {statusText(record.status, text)}
          </span>
        </div>
        {record.status === 'candidate' && (
          <Button size="sm" variant="outline" disabled={confirmingId === record.handoffId} onClick={() => onConfirm(record.handoffId)}>
            <Check size={12} aria-hidden="true" />
            {text('确认并用于下一章', 'Confirm for next chapter')}
          </Button>
        )}
      </div>

      <div className="mt-2 grid gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
        <div className="flex gap-1.5">
          <MapPin size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{record.sceneLocation} · {record.viewpoint}</span>
        </div>
        <div><strong>{text('即时目标：', 'Immediate goal:')}</strong>{record.immediateGoal}</div>
        <div><strong>{text('情绪：', 'Emotion:')}</strong>{record.emotionalState}</div>
        <div><strong>{text('承接方式：', 'Transition:')}</strong>{transitionText(record.transition, text)}</div>
        {record.unfinishedActions.length > 0 && (
          <div><strong>{text('未完成动作：', 'Unfinished actions:')}</strong>{record.unfinishedActions.join('；')}</div>
        )}
        {record.openQuestions.length > 0 && (
          <div className="flex gap-1.5">
            <MessageCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{record.openQuestions.join('；')}</span>
          </div>
        )}
        {record.evidence.length > 0 && (
          <div className="flex gap-1.5 rounded border-l-2 pl-2" style={{ borderColor: 'var(--color-accent)' }}>
            <CircleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{record.evidence[0]}</span>
          </div>
        )}
      </div>
    </section>
  )
}
