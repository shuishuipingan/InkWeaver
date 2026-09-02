import { useCallback, useMemo, useState } from 'react'
import { Wand2, Loader2, Check, AlertTriangle, ArrowRight, Replace } from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/Dialog'
import { useCharacterStore } from '../../stores/character-store'
import { useProjectStore } from '../../stores/project-store'
import { useLLMStore } from '../../stores/llm-store'
import { ipc } from '../../services/ipc-client'
import { globalEventBus } from '../../shared/event-bus'
import { countDraftUnits } from '../../shared/draft-units'
import {
  captureProjectSession,
  isProjectSessionCurrent,
} from '../project-session-gate'
import { useLocaleStore } from '../../stores/locale-store'

interface RenameRow {
  from: string
  to: string
  reason: string
}

interface ApplySummary {
  renamedCards: number
  proseChapters: number
  finalizedSkipped: number
}

/** 最长优先替换，避免"林岚"误吃"林岚儿"的前缀。 */
function replaceNamesInText(text: string, renames: Array<{ from: string; to: string }>): string {
  let out = text
  const sorted = [...renames].sort((a, b) => b.from.length - a.from.length)
  for (const r of sorted) {
    if (r.from && r.to && r.from !== r.to) {
      out = out.split(r.from).join(r.to)
    }
  }
  return out
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = cleaned.search(/[{[]/)
  const endObj = cleaned.lastIndexOf('}')
  const endArr = cleaned.lastIndexOf(']')
  const end = Math.max(endObj, endArr)
  if (start < 0 || end <= start) throw new Error('AI 返回内容中未找到 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export default function AIRenameCharactersDialog({ onClose }: { onClose: () => void }) {
  const text = useLocaleStore(s => s.text)
  const currentProject = useProjectStore(s => s.currentProject)
  const characters = useCharacterStore(s => s.characters)
  const identityBusy = useCharacterStore(s => s.identityBusy)

  const [step, setStep] = useState<'input' | 'generating' | 'preview' | 'applying' | 'done'>('input')
  const [styleHint, setStyleHint] = useState('')
  const [replaceProse, setReplaceProse] = useState(true)
  const [renames, setRenames] = useState<RenameRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ApplySummary | null>(null)

  const projectSession = useMemo(() => captureProjectSession(currentProject), [currentProject])
  const currentNames = useMemo(
    () => new Set(characters.map(c => c.name)),
    [characters],
  )

  const generate = useCallback(async () => {
    if (!currentProject || !projectSession) return
    if (characters.length === 0) {
      setError(text('当前项目还没有角色卡，请先创建角色。', 'No character cards yet.'))
      return
    }
    setStep('generating')
    setError(null)
    const config = currentProject.novelConfig
    const rosterLines = characters.slice(0, 40).map(c => {
      const brief = [c.gender, c.age, c.role, c.personality?.slice(0, 40)]
        .filter(Boolean).join(' / ')
      return `- ${c.name}${brief ? `（${brief}）` : ''}`
    }).join('\n')
    const settingBrief = [
      config.genre && `类型：${config.genre}`,
      config.subGenre && `细分：${config.subGenre}`,
    ].filter(Boolean).join('；')

    const system = text(
      '你是资深小说编辑。用户正在进行"拆书仿写"：需要把一本书里的全部角色名替换成全新原创名字，使作品看不出与原著的关联，同时新名字必须符合剧情与设定。',
      'You are a senior fiction editor. The user is adapting a book: replace ALL character names with fresh original names so the result no longer resembles the source, while every new name fits the plot and setting.',
    )
    const user = [
      text(`作品设定：${settingBrief || '未提供'}`, `Setting: ${settingBrief || 'not provided'}`),
      styleHint ? text(`风格要求：${styleHint}`, `Style requests: ${styleHint}`) : '',
      text('现有角色名单：', 'Current characters:'),
      rosterLines,
      '',
      text(
        '请为上面每个角色生成一个全新的名字，并输出 JSON：{"renames":[{"from":"原名","to":"新名","reason":"一句话理由"}]}。',
        'Generate a new name for EVERY character above and output JSON: {"renames":[{"from":"old","to":"new","reason":"one line"}]}.',
      ),
      text(
        '规则：1) 名字符合世界观、时代与角色性别身份；2) 主角名好听好记有辨识度，配角名不与主角撞名；3) 不使用原名中的任何单字，读音也不要与原名相近；4) 新名字彼此不重名；5) reason 用中文一句话说明起名思路。',
        'Rules: 1) fit the world, era, and gender identity; 2) protagonist names memorable, no collisions; 3) share no character with the old name and avoid similar sounds; 4) all new names distinct; 5) reason is one sentence.',
      ),
    ].filter(Boolean).join('\n')

    try {
      const res = await useLLMStore.getState().generate(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        undefined,
        {
          responseFormat: { type: 'json_object' },
          purpose: 'character-rename-mapping',
          maxTokens: 8192,
        },
      )
      if (!res.success) throw new Error(res.error ?? text('AI 生成失败', 'Generation failed'))
      const parsed = extractJson(res.content) as { renames?: Array<{ from?: unknown; to?: unknown; reason?: unknown }> }
      const rows: RenameRow[] = (parsed.renames ?? [])
        .map(r => ({
          from: String(r.from ?? ''),
          to: String(r.to ?? '').trim(),
          reason: String(r.reason ?? ''),
        }))
        .filter(r => r.from && currentNames.has(r.from))
    if (rows.length === 0) throw new Error(text('AI 未返回有效的改名映射，请重试。', 'AI returned no valid mapping. Please retry.'))
      setRenames(rows)
      setStep('preview')
    } catch (e) {
      setError(String(e))
      setStep('input')
    }
  }, [characters, currentProject, projectSession, styleHint, text, currentNames])

  const apply = useCallback(async () => {
    if (!currentProject || !projectSession) return
    const valid = renames.filter(r => r.to.trim() && r.to.trim() !== r.from)
    if (valid.length === 0) return
    setStep('applying')
    setError(null)
    try {
      // 1) 走角色卡本地改名 + 草稿账本（链式改名已由 store 处理）
      for (const r of valid) {
        const ok = useCharacterStore.getState().renameCharacter(r.from, r.to.trim())
        if (!ok) throw new Error(text(`改名失败：${r.from} → ${r.to}`, `Rename failed: ${r.from} → ${r.to}`))
      }
      // 2) 经 roster seam 原子提交：角色主键、关系、蓝图结构化引用、图谱投影
      await useCharacterStore.getState().saveAll(currentProject.path, projectSession)
      if (!isProjectSessionCurrent(projectSession)) return

      // 3) 正文中的角色名替换（仅未定稿草稿；已定稿正文为不可变事实）
      let proseChapters = 0
      let finalizedSkipped = 0
      if (replaceProse) {
        const drafts = await ipc.invokeWithProjectSession(
          projectSession, 'db:draft-list-all', currentProject.path,
        )
        for (const meta of drafts) {
          if (!isProjectSessionCurrent(projectSession)) return
          if (meta.status === 'finalized') { finalizedSkipped += 1; continue }
          const full = await ipc.invokeWithProjectSession(
            projectSession, 'db:draft-get-full', meta.id, currentProject.path,
          )
          if (!full) continue
          const next = replaceNamesInText(full.content, valid)
          if (next === full.content) continue
          const updated = await ipc.invokeWithProjectSession(
            projectSession, 'db:draft-update-content',
            meta.id, next, countDraftUnits(next), currentProject.path,
          )
          if (updated.success) proseChapters += 1
        }
      }

      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['characterCards', 'drafts'],
        projectPath: currentProject.path,
        projectSession,
      })
      setSummary({
        renamedCards: valid.length,
        proseChapters,
        finalizedSkipped,
      })
      setStep('done')
    } catch (e) {
      setError(String(e))
      setStep('preview')
    }
  }, [currentProject, projectSession, renames, replaceProse, text])

  if (!currentProject || !projectSession) return null

  // 处理中（生成/应用）时禁止关闭，防止中断原子操作
  const busy = step === 'generating' || step === 'applying'

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose() }}>
      <DialogContent
        hideCloseButton
        className="flex flex-col p-0 overflow-hidden"
        style={{ width: 'min(94vw, 640px)', maxHeight: '80vh' }}
        onPointerDownOutside={(e) => { if (busy) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault() }}
      >
        <DialogTitle className="sr-only">
          {text('AI 一键替换角色名（拆书仿写）', 'AI Bulk Character Rename (Adaptation)')}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {text('AI 为全部角色生成符合剧情与设定的新名字，并同步替换角色卡、关系、蓝图引用与未定稿正文。', 'AI generates fresh names and rewrites cards, relationships, blueprint references, and non-finalized prose.')}
        </DialogDescription>

        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Wand2 size={16} style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {text('AI 一键替换角色名（拆书仿写）', 'AI Bulk Character Rename (Adaptation)')}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {step === 'input' && (
            <>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {text(
                  'AI 会为全部角色生成符合剧情与设定的新名字（不与原名同字近音），并同步替换角色卡、人物关系、蓝图引用与未定稿正文中的名字。已定稿章节为不可变事实，不会被改动。',
                  'AI generates fresh names fitting your plot and setting, then rewrites cards, relationships, blueprint references, and non-finalized prose. Finalized chapters stay immutable.',
                )}
              </p>
              <label className="block text-xs" style={{ color: 'var(--color-text)' }}>
                {text('风格提示（可选）', 'Style hints (optional)')}
                <textarea
                  value={styleHint}
                  onChange={e => setStyleHint(e.target.value)}
                  rows={2}
                  placeholder={text(
                    '例如：古代仙侠，名字要有门派气质；现代都市，用常见中文姓名',
                    'e.g. xianxia names with sect flavor; modern common names',
                  )}
                  className="mt-1 w-full rounded-md px-2.5 py-2 text-xs outline-none resize-none"
                  style={{
                    backgroundColor: 'var(--color-raised)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text)' }}>
                <input type="checkbox" checked={replaceProse} onChange={e => setReplaceProse(e.target.checked)} />
                {text('同时替换未定稿正文中的角色名', 'Also replace names in non-finalized prose')}
              </label>
            </>
          )}

          {step === 'generating' && (
            <div className="flex items-center gap-2 py-8 justify-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <Loader2 size={16} className="animate-spin" />
              {text('AI 正在为新角色们起名……', 'AI is naming your characters…')}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-1.5">
              {renames.map((r, i) => {
                const collision = characters.some(c => c.name === r.to.trim() && c.name !== r.from)
                const invalid = !r.to.trim() || r.to.trim() === r.from || collision
                return (
                  <div key={r.from} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate" style={{ color: 'var(--color-text)' }} title={r.from}>{r.from}</span>
                    <ArrowRight size={13} style={{ color: 'var(--color-text-muted)' }} />
                    <input
                      value={r.to}
                      onChange={e => setRenames(rows => rows.map((row, j) => j === i ? { ...row, to: e.target.value } : row))}
                      className="flex-1 rounded-md px-2 py-1.5 outline-none"
                      style={{
                        backgroundColor: 'var(--color-raised)',
                        border: `1px solid ${invalid ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        color: 'var(--color-text)',
                      }}
                    />
                    <span className="w-40 shrink-0 truncate text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }} title={r.reason}>{r.reason}</span>
                  </div>
                )
              })}
              {renames.some(r => !r.to.trim() || r.to.trim() === r.from || characters.some(c => c.name === r.to.trim() && c.name !== r.from)) && (
                <p className="text-[0.7rem] flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                  <AlertTriangle size={12} />
                  {text('存在空名字、与原名相同或与其他角色重名的新名字，请修改后再应用。', 'Some names are empty, unchanged, or collide with existing characters.')}
                </p>
              )}
            </div>
          )}

          {step === 'applying' && (
            <div className="flex items-center gap-2 py-8 justify-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <Loader2 size={16} className="animate-spin" />
              {text('正在原子应用改名并替换正文……', 'Applying renames atomically…')}
            </div>
          )}

          {step === 'done' && summary && (
            <div className="space-y-2 py-2 text-xs" style={{ color: 'var(--color-text)' }}>
              <p className="flex items-center gap-1.5" style={{ color: 'var(--color-accent)' }}>
                <Check size={14} /> {text('改名完成！', 'Renames applied!')}
              </p>
              <p>{text(`角色卡与关联引用：${summary.renamedCards} 个`, `Cards and references renamed: ${summary.renamedCards}`)}</p>
              <p>{text(`已替换正文章节：${summary.proseChapters} 章`, `Prose chapters rewritten: ${summary.proseChapters}`)}</p>
              {summary.finalizedSkipped > 0 && (
                <p style={{ color: 'var(--color-text-muted)' }}>
                  {text(`已定稿章节 ${summary.finalizedSkipped} 章保持不变（不可变事实）。`, `${summary.finalizedSkipped} finalized chapter(s) untouched (immutable).`)}
                </p>
              )}
              <p style={{ color: 'var(--color-text-muted)' }}>
                {text('知识库中已导入的原文不会被改写（保护向量一致性）；其后的仿写生成建议基于新正文进行。', 'Imported knowledge-base text is untouched to protect embedding consistency.')}
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--color-accent)' }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)]">
          {step === 'input' && (
            <>
              <Button variant="ghost" onClick={onClose}>{text('取消', 'Cancel')}</Button>
              <Button onClick={generate} disabled={identityBusy || characters.length === 0}>
                <Wand2 size={13} /> {text('AI 生成新名字', 'Generate names')}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => setStep('input')}>{text('上一步', 'Back')}</Button>
              <Button
                onClick={apply}
                disabled={renames.some(r => !r.to.trim() || r.to.trim() === r.from || characters.some(c => c.name === r.to.trim() && c.name !== r.from))}
              >
                <Replace size={13} /> {text('应用改名', 'Apply renames')}
              </Button>
            </>
          )}
          {(step === 'generating' || step === 'applying') && (
            <Button variant="ghost" disabled>{text('处理中…', 'Working…')}</Button>
          )}
          {step === 'done' && (
            <Button onClick={onClose}>{text('完成', 'Done')}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
