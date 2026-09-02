/**
 * StatsView — 数据统计面板
 *
 * 展示 LLM 调用统计：调用次数趋势（折线图）、按模型/按用途占比（环形图）、
 * 缓存命中率、KPI 卡片、最近调用历史。
 *
 * 图表全部使用纯 SVG 手绘（零依赖），并附带绘制动画；
 * 风格完全跟随应用 CSS 变量主题（--color-*）。
 */

import { useMemo, useState, useEffect } from 'react'
import { useProjectStore } from '../../stores/project-store'
import { useLocaleStore } from '../../stores/locale-store'
import {
  projectSessionContextFromProject,
  sameProjectSessionContext,
} from '../../shared/project-session-context'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { LLMDataRequestGate } from './llm-data-request-gate'
import { PanelHeader } from '../ui/PanelHeader'
import { loadLLMData, type LLMStats, type LLMCallRecord } from '../../services/stats-service'
import {
  Activity, CheckCircle2, XCircle, Zap, Database, Gauge, Clock, BarChart3, RefreshCw, Tag,
} from 'lucide-react'

function formatTokens(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso.replace(' ', 'T'))
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}


/** KPI 统计卡片 */
function KpiCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Activity; label: string; value: string; sub?: string; tone?: 'success' | 'danger' | 'accent'
}) {
  const valueColor = tone === 'success' ? 'text-[var(--color-success-text)]'
    : tone === 'danger' ? 'text-[var(--color-error-text)]'
    : tone === 'accent' ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-text)]'
  return (
    <div
      className="rounded-lg px-3 py-2.5 flex flex-col gap-1 min-w-[110px] flex-1 anim-pop-in"
      style={{ backgroundColor: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-1.5 text-[0.68rem] uppercase tracking-wider text-[var(--color-text-muted)]">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <div className={`text-base font-bold leading-tight ${valueColor}`}>{value}</div>
      {sub && <div className="text-[0.65rem] text-[var(--color-text-muted)]">{sub}</div>}
    </div>
  )
}

/** 缓存命中率进度条 */
function CacheRateBar({ hit, miss }: { hit: number; miss: number }) {
  const total = hit + miss
  const rate = total > 0 ? Math.round((hit / total) * 100) : null
  const pct = rate ?? 0
  const good = rate !== null && rate >= 80
  return (
    <div className="rounded-lg px-3 py-2.5 anim-pop-in" style={{ backgroundColor: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[0.68rem] uppercase tracking-wider text-[var(--color-text-muted)]">
          <Gauge size={12} />
          <span>缓存命中率</span>
        </div>
        <span className={`text-sm font-bold ${good ? 'text-[var(--color-success-text)]' : 'text-[var(--color-text)]'}`}>
          {rate === null ? '—' : rate + '%'}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: pct + '%', backgroundColor: good ? 'var(--color-success-text)' : 'var(--color-accent)' }} />
      </div>
      <div className="flex justify-between mt-1 text-[0.62rem] text-[var(--color-text-muted)]">
        <span>命中 {formatTokens(hit)}</span>
        <span>未命中 {formatTokens(miss)}</span>
      </div>
    </div>
  )
}


function DonutChart({ title, icon: Icon, rows }: {
  title: string
  icon: typeof Database
  rows: Array<[string, { calls: number; tokens: number }]>
}) {
  const SIZE = 116
  const R = 40
  const CX = SIZE / 2
  const CY = SIZE / 2
  const STROKE = 15
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const total = useMemo(() => rows.reduce((s, [, v]) => s + v.tokens, 0), [rows])
  const segments = useMemo(() => {
    if (total <= 0) return []
    let acc = 0
    return rows.slice(0, 5).map(([name, v], i) => {
      const startAngle = (acc / total) * 360 - 90
      acc += v.tokens
      const endAngle = (acc / total) * 360 - 90
      const largeArc = (endAngle - startAngle) > 180 ? 1 : 0
      const x1 = CX + R * Math.cos((startAngle * Math.PI) / 180)
      const y1 = CY + R * Math.sin((startAngle * Math.PI) / 180)
      const x2 = CX + R * Math.cos((endAngle * Math.PI) / 180)
      const y2 = CY + R * Math.sin((endAngle * Math.PI) / 180)
      const pct = (v.tokens / total) * 100
      return { name, value: v, startAngle, endAngle, x1, y1, x2, y2, largeArc, pct, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }
    })
  }, [rows, total])

  if (total <= 0 || segments.length === 0) {
    return (
      <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
        <div className="text-[0.68rem] uppercase tracking-wider mb-1 flex items-center gap-1 text-[var(--color-text-muted)]">
          <Icon size={12} />
          {title}
        </div>
        <div className="text-[0.7rem] opacity-60 text-[var(--color-text-muted)] py-3 text-center">暂无数据</div>
      </div>
    )
  }

  const hovered = hoverIdx !== null ? segments[hoverIdx] : null

  return (
    <div className="rounded-lg p-2.5 anim-pop-in" style={{ backgroundColor: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
      <div className="text-[0.68rem] uppercase tracking-wider mb-1.5 flex items-center gap-1 text-[var(--color-text-muted)]">
        <Icon size={12} />
        {title}
      </div>
      <div className="flex items-center gap-3">
        {/* 环形图 — 更大 + hover 高亮 */}
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="anim-ring-in flex-shrink-0">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-border)" strokeWidth={STROKE} />
          {segments.map((s, i) => (
            <path
              key={i}
              d={`M ${s.x1.toFixed(1)} ${s.y1.toFixed(1)} A ${R} ${R} 0 ${s.largeArc} 1 ${s.x2.toFixed(1)} ${s.y2.toFixed(1)}`}
              fill="none"
              stroke={hoverIdx === i ? s.color : s.color}
              strokeWidth={hoverIdx === i ? STROKE + 3 : STROKE}
              strokeLinecap="butt"
              opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.35}
              style={{ transition: 'stroke-width 0.15s ease, opacity 0.15s ease', cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          ))}
          {/* 中心显示 hover 详情或总数 */}
          <text x={CX} y={CY - 2} textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--color-text)">
            {hovered ? Math.round(hovered.pct) + '%' : String(rows.length)}
          </text>
          <text x={CX} y={CY + 11} textAnchor="middle" fontSize="7" fill="var(--color-text-muted)">
            {hovered ? hovered.name.slice(0, 8) : '项'}
          </text>
        </svg>
        {/* 图例（hover 联动高亮） */}
        <div className="flex-1 min-w-0 space-y-1">
          {segments.map((s, i) => (
            <div key={i}
              className="flex items-center gap-1.5 rounded px-1 py-0.5"
              style={{ backgroundColor: hoverIdx === i ? 'var(--color-active)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s ease' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[0.68rem] truncate flex-1 text-[var(--color-text)]">{s.name}</span>
              <span className="text-[0.62rem] text-[var(--color-text-muted)] flex-shrink-0">
                {formatTokens(s.value.tokens)}
              </span>
              <span className="text-[0.62rem] text-[var(--color-text-secondary)] flex-shrink-0 w-8 text-right">
                {Math.round(s.pct)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 环形图配色（跟随主题的强调色系） */
const SEGMENT_COLORS = [
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-gold)',
  'var(--color-warning)',
  'var(--color-success-text)',
]

export default function StatsView() {
  const currentProject = useProjectStore(s => s.currentProject)
  const projectSession = useMemo(() => projectSessionContextFromProject(currentProject), [currentProject])
  const [requestGate] = useState(() => new LLMDataRequestGate())
  const [data, setData] = useState<{ projectSession: ProjectSessionContext; stats: LLMStats; history: LLMCallRecord[] } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const text = useLocaleStore(s => s.text)

  const visibleData = data && sameProjectSessionContext(data.projectSession, projectSession) ? data : null
  const stats = visibleData?.stats ?? null
  const history = visibleData?.history ?? []

  const load = useMemo(() => () => {
    if (!projectSession) { requestGate.invalidate(); return }
    const ticket = requestGate.begin(projectSession)
    void loadLLMData(projectSession, 200)
      .then(({ stats: s, history: h }) => {
        const current = projectSessionContextFromProject(useProjectStore.getState().currentProject)
        if (!requestGate.isCurrent(ticket, current)) return
        setData({ projectSession: ticket.projectSession, stats: s, history: h })
      })
      .catch(() => {})
  }, [projectSession, requestGate])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 3000)
    return () => { window.clearInterval(timer); requestGate.invalidate() }
  }, [load, requestGate])

  const handleRefresh = () => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 600) }

  const byModel = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number }>()
    for (const r of history) {
      const key = r.modelName || '未知模型'
      const cur = map.get(key) ?? { calls: 0, tokens: 0 }
      cur.calls += 1; cur.tokens += r.totalTokens ?? 0
      map.set(key, cur)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].tokens - a[1].tokens)
  }, [history])

  const byPurpose = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number }>()
    for (const r of history) {
      const key = r.purpose || 'generation'
      const cur = map.get(key) ?? { calls: 0, tokens: 0 }
      cur.calls += 1; cur.tokens += r.totalTokens ?? 0
      map.set(key, cur)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].tokens - a[1].tokens)
  }, [history])

  const totalCalls = stats?.totalCalls ?? 0
  const successRate = totalCalls > 0 ? Math.round(((stats?.successfulCalls ?? 0) / totalCalls) * 100) : null

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 面板标题头 */}
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart3 size={13} />
            {text('数据统计', 'Data statistics')}
            {!currentProject && (
              <span className="text-[0.65rem] opacity-60">
                {text('未打开项目', 'No project open')}
              </span>
            )}
          </span>
        }
        actions={
          <button onClick={handleRefresh} title={text('刷新', 'Refresh')} className="tool-btn p-1 rounded micro-hover">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!currentProject ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-text-muted)]">
            <Database size={28} style={{ opacity: 0.4 }} />
            <span className="text-xs">{text('打开项目后显示 LLM 调用统计', 'Open a project to see LLM call statistics')}</span>
          </div>
        ) : (
          <>
            {/* KPI 卡片组 */}
            <div className="flex flex-wrap gap-2">
              <KpiCard icon={Activity} label={text('调用次数', 'Calls')} value={String(totalCalls)} sub={text('累计', 'total')} />
              <KpiCard icon={CheckCircle2} label={text('成功率', 'Success')} value={successRate === null ? '—' : successRate + '%'} sub={(stats?.successfulCalls ?? 0) + ' 成功'} tone="success" />
              <KpiCard icon={XCircle} label={text('失败', 'Failed')} value={String(stats?.failedCalls ?? 0)} tone="danger" />
              <KpiCard icon={Zap} label={text('总消耗', 'Tokens')} value={formatTokens(stats?.totalTokens ?? null)} sub={formatTokens(stats?.totalPromptTokens ?? null) + ' 输入 / ' + formatTokens(stats?.totalCompletionTokens ?? null) + ' 输出'} tone="accent" />
            </div>
{/* 缓存命中率 */}
            <CacheRateBar hit={stats?.totalCacheHitTokens ?? 0} miss={stats?.totalCacheMissTokens ?? 0} />

            {/* 环形图：按模型 + 按用途 */}
            <div className="grid grid-cols-2 gap-2">
              <DonutChart title={text('按模型', 'By model')} icon={Database} rows={byModel} />
              <DonutChart title={text('按用途', 'By purpose')} icon={Tag} rows={byPurpose} />
            </div>

            {/* 最近调用历史 */}
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              <div className="px-2.5 py-1.5 flex items-center gap-1 text-[0.68rem] uppercase tracking-wider bg-[var(--color-hover)] text-[var(--color-text-muted)]">
                <Clock size={12} />
                {text('最近调用', 'Recent calls')}
              </div>
              {history.length === 0 ? (
                <div className="px-3 py-4 text-center text-[0.7rem] opacity-60 text-[var(--color-text-muted)]">
                  {text('暂无 LLM 调用记录', 'No LLM call records yet')}
                </div>
              ) : (
                <div className="max-h-[220px] overflow-y-auto">
                  <table className="w-full text-[0.7rem]" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="text-[var(--color-text-muted)]">
                        <th className="text-left font-medium px-2.5 py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>{text('时间', 'Time')}</th>
                        <th className="text-left font-medium px-2 py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>{text('模型', 'Model')}</th>
                        <th className="text-left font-medium px-2 py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>{text('用途', 'Purpose')}</th>
                        <th className="text-right font-medium px-2 py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>{text('Tokens', 'Tokens')}</th>
                        <th className="text-right font-medium px-2 py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>{text('缓存', 'Cache')}</th>
                        <th className="text-right font-medium px-2 py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>{text('耗时', 'Time')}</th>
                        <th className="text-center font-medium px-2 py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>{text('状态', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 50).map((r) => {
                        const hit = r.cacheHitTokens ?? 0
                        const miss = r.cacheMissTokens ?? 0
                        const cachePct = (hit + miss) > 0 ? Math.round((hit / (hit + miss)) * 100) : null
                        return (
                          <tr key={r.id} className="row-slide-hover" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                            <td className="px-2.5 py-1 whitespace-nowrap text-[var(--color-text-muted)]">{formatTime(r.createdAt)}</td>
                            <td className="px-2 py-1 max-w-[120px] truncate">{r.modelName || '—'}</td>
                            <td className="px-2 py-1 max-w-[90px] truncate text-[var(--color-text-muted)]">{r.purpose || 'generation'}</td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">{formatTokens(r.totalTokens)}</td>
                            <td className={`px-2 py-1 text-right whitespace-nowrap ${cachePct !== null && cachePct >= 80 ? 'text-[var(--color-success-text)]' : 'text-[var(--color-text-muted)]'}`}>
                              {cachePct === null ? '—' : cachePct + '%'}
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap text-[var(--color-text-muted)]">{formatDuration(r.durationMs)}</td>
                            <td className="px-2 py-1 text-center">
                              {r.success
                                ? <CheckCircle2 size={12} style={{ color: 'var(--color-success-text)' }} />
                                : <XCircle size={12} style={{ color: 'var(--color-error-text)' }} />}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
