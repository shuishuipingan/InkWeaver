import { useState } from 'react'
import { Check, RefreshCw, Sparkles, X } from 'lucide-react'

import type { CharacterExtractionCandidate } from '../../shared/character-extraction'
import type { CharacterCandidateFieldSelection } from '../../services/character-extraction-merge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

interface CharacterExtractionCandidatesPanelProps {
  candidates: readonly CharacterExtractionCandidate[]
  loading?: boolean
  updatingId?: string | null
  onRefresh: () => void
  onStatus: (candidateId: string, status: 'accepted' | 'rejected') => Promise<void>
  onApply: (fieldSelection?: CharacterCandidateFieldSelection, matchSelection?: Readonly<Record<string, string>>) => Promise<void>
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
  const [fieldSelection, setFieldSelection] = useState<Record<string, Set<string>>>({})
  const [matchSelection, setMatchSelection] = useState<Record<string, string>>({})
  const visible = candidates.filter(candidate => candidate.status !== 'stale')
  const accepted = visible.filter(candidate => candidate.status === 'accepted')
  const unresolvedAmbiguity = accepted.some(candidate => candidate.disposition === 'ambiguous' && !matchSelection[candidate.candidateId]?.trim())
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
            {candidate.disposition === 'ambiguous' && <div className="mt-1 rounded border px-2 py-1.5" style={{ borderColor: 'var(--color-warning)' }}>
              <div className="mb-1" style={{ color: 'var(--color-warning-text)' }}>{text('同名角色需要作者明确选择，未选择前不会合并。', 'This name matches multiple characters. Choose the exact target before applying; it will not merge automatically.')}</div>
              <Input
                aria-label={text(`为${candidate.name}选择现有角色`, `Choose existing character for ${candidate.name}`)}
                value={matchSelection[candidate.candidateId] ?? ''}
                onChange={event => setMatchSelection(current => ({ ...current, [candidate.candidateId]: event.target.value }))}
                placeholder={text('输入现有角色的完整姓名', 'Type the exact existing character name')}
              />
            </div>}
            <div className="mt-1 space-y-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {Object.entries(candidate.fields).map(([field, value]) => {
                const selected = fieldSelection[candidate.candidateId]?.has(field) ?? true
                return <label key={field} className="flex items-start gap-1.5"><input type="checkbox" checked={selected} onChange={() => setFieldSelection(current => { const next = new Set(current[candidate.candidateId] ?? Object.keys(candidate.fields)); if (next.has(field)) next.delete(field); else next.add(field); return { ...current, [candidate.candidateId]: next } })} /><span><strong>{field}：</strong>{value}</span></label>
              })}
              {candidate.aliases.length > 0 && <label className="flex items-start gap-1.5"><input type="checkbox" checked={fieldSelection[candidate.candidateId]?.has('aliases') ?? true} onChange={() => setFieldSelection(current => { const next = new Set(current[candidate.candidateId] ?? [...Object.keys(candidate.fields), 'aliases']); if (next.has('aliases')) next.delete('aliases'); else next.add('aliases'); return { ...current, [candidate.candidateId]: next } })} /><span><strong>{text('别名：', 'Aliases:')}</strong>{candidate.aliases.join('、')}</span></label>}
              {candidate.currentState && <label className="flex items-start gap-1.5"><input type="checkbox" checked={fieldSelection[candidate.candidateId]?.has('currentState') ?? true} onChange={() => setFieldSelection(current => { const next = new Set(current[candidate.candidateId] ?? [...Object.keys(candidate.fields), 'currentState']); if (next.has('currentState')) next.delete('currentState'); else next.add('currentState'); return { ...current, [candidate.candidateId]: next } })} /><span><strong>{text('当前状态：', 'Current state:')}</strong>{Object.values(candidate.currentState).filter(Boolean).join(' / ')}</span></label>}
              {candidate.relationships?.map((relationship, index) => (
                <label key={`relationship-${relationship.target}-${index}`} className="flex items-start gap-1.5"><input type="checkbox" checked={fieldSelection[candidate.candidateId]?.has('relationships') ?? true} onChange={() => setFieldSelection(current => { const next = new Set(current[candidate.candidateId] ?? [...Object.keys(candidate.fields), 'relationships']); if (next.has('relationships')) next.delete('relationships'); else next.add('relationships'); return { ...current, [candidate.candidateId]: next } })} /><span>
                  <strong>{text('关系：', 'Relationship:')}</strong>
                  {relationship.target}（{relationship.relation}）
                </span></label>
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
      {accepted.length > 0 && (
        <div className="mt-2 flex justify-end">
          <Button variant="success" size="sm" disabled={unresolvedAmbiguity} onClick={() => onApply(
            Object.fromEntries(Object.entries(fieldSelection).map(([candidateId, fields]) => [candidateId, [...fields]])),
            matchSelection,
          )}>
            <Check size={12} aria-hidden="true" />
            {text('合并已接受候选到角色卡', 'Apply accepted candidates to character cards')}
          </Button>
        </div>
      )}
    </section>
  )
}
