import { Check, RefreshCw, Sparkles, X } from 'lucide-react'

import type { CharacterExtractionCandidate } from '../../shared/character-extraction'
import { Button } from '../ui/Button'

interface CharacterExtractionCandidatesPanelProps {
  candidates: readonly CharacterExtractionCandidate[]
  loading?: boolean
  updatingId?: string | null
  onRefresh: () => void
  onStatus: (candidateId: string, status: 'accepted' | 'rejected') => Promise<void>
  onApply: () => Promise<void>
  text: (zhCNText: string, enUSText: string) => string
}

export default function CharacterExtractionCandidatesPanel({
  candidates,
  loading = false,
  updatingId = null,
  onRefresh,
  onStatus,
  onApply,
  text,
}: CharacterExtractionCandidatesPanelProps) {
  const visible = candidates.filter(candidate => candidate.status !== 'stale')
  if (!loading && visible.length === 0) return null

  return (
    <section className="mx-3 my-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--color-text)' }}>
          <Sparkles size={13} aria-hidden="true" />
          {text('人物提取候选', 'Character extraction candidates')}
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} title={text('刷新候选', 'Refresh candidates')}>
          <RefreshCw size={12} aria-hidden="true" />
        </Button>
      </div>
      {loading && <div className="py-2" style={{ color: 'var(--color-text-muted)' }}>{text('正在读取候选…', 'Loading candidates…')}</div>}
      <div className="mt-2 space-y-2">
        {visible.map(candidate => (
          <div key={candidate.candidateId} className="rounded border p-2" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium" style={{ color: 'var(--color-text)' }}>
                {candidate.name}
                {candidate.aliases.length > 0 && (
                  <span className="ml-1 font-normal" style={{ color: 'var(--color-text-muted)' }}>
                    ({candidate.aliases.join('、')})
                  </span>
                )}
              </div>
              {candidate.status === 'pending' ? (
                <div className="flex gap-1">
                  <Button variant="success" size="sm" disabled={updatingId === candidate.candidateId} onClick={() => onStatus(candidate.candidateId, 'accepted')}>
                    <Check size={11} aria-hidden="true" />
                    {text('接受', 'Accept')}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={updatingId === candidate.candidateId} onClick={() => onStatus(candidate.candidateId, 'rejected')}>
                    <X size={11} aria-hidden="true" />
                    {text('拒绝', 'Reject')}
                  </Button>
                </div>
              ) : (
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {candidate.status === 'accepted'
                    ? text('已接受', 'Accepted')
                    : candidate.status === 'applied'
                      ? text('已合并到角色卡', 'Applied to roster')
                      : text('已拒绝', 'Rejected')}
                </span>
              )}
            </div>
            <div className="mt-1 space-y-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {Object.entries(candidate.fields).map(([field, value]) => (
                <div key={field}><strong>{field}：</strong>{value}</div>
              ))}
              {candidate.relationships?.map((relationship, index) => (
                <div key={`relationship-${relationship.target}-${index}`}>
                  <strong>{text('关系：', 'Relationship:')}</strong>
                  {relationship.target}（{relationship.relation}）
                </div>
              ))}
              {candidate.fieldEvidence.map((evidence, index) => (
                <div key={`${evidence.field}-${index}`} className="border-l-2 pl-2" style={{ borderColor: 'var(--color-accent)' }}>
                  {evidence.excerpt}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {visible.some(candidate => candidate.status === 'accepted') && (
        <div className="mt-2 flex justify-end">
          <Button variant="success" size="sm" onClick={onApply}>
            <Check size={12} aria-hidden="true" />
            {text('合并已接受候选到角色卡', 'Apply accepted candidates to character cards')}
          </Button>
        </div>
      )}
    </section>
  )
}
