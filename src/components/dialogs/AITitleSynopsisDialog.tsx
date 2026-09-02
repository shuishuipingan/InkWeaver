import { useCallback, useMemo, useState } from 'react'
import { BookOpen, FileText, Loader2, Check, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/Dialog'
import { useProjectStore } from '../../stores/project-store'
import { useLLMStore } from '../../stores/llm-store'
import { ipc } from '../../services/ipc-client'
import {
  captureProjectSession,
  isProjectSessionCurrent,
} from '../project-session-gate'
import { useLocaleStore } from '../../stores/locale-store'
import {
  type PlatformStyle,
  PLATFORM_LABELS,
  detectAudience,
  buildSynopsisRules,
  buildTitleRules,
} from '../../services/novel-copywriting'

type Mode = 'title' | 'synopsis'
type SourceMode = 'read' | 'digest' | 'imitate'

interface TitleCandidate {
  name: string
  reason: string
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = cleaned.search(/[{[]/)
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  if (start < 0 || end <= start) throw new Error('AI 返回内容中未找到 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function clip(text: string, head: number, tail = 0): string {
  if (text.length <= head + tail) return text
  const headPart = text.slice(0, head)
  const tailPart = tail > 0 ? `\n……（中略）……\n${text.slice(-tail)}` : ''
  return headPart + tailPart
}

export default function AITitleSynopsisDialog({
  mode,
  onClose,
}: {
  mode: Mode
  onClose: () => void
}) {
  const text = useLocaleStore(s => s.text)
  const currentProject = useProjectStore(s => s.currentProject)
  const projectSession = useMemo(() => captureProjectSession(currentProject), [currentProject])

  const [sourceMode, setSourceMode] = useState<SourceMode>('digest')
  const [platform, setPlatform] = useState<PlatformStyle>('fanqie')
  const [originalTitle, setOriginalTitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [titles, setTitles] = useState<TitleCandidate[]>([])
  const [synopsis, setSynopsis] = useState('')
  const [applied, setApplied] = useState(false)

  const isTitle = mode === 'title'
  // 自动检测男女频（依据受众/类型字段）
  const audience = useMemo(
    () => detectAudience(currentProject?.novelConfig.targetAudience, currentProject?.novelConfig.genre),
    [currentProject],
  )

  const gatherContext = useCallback(async (): Promise<string> => {
    if (!currentProject || !projectSession) return ''
    const config = currentProject.novelConfig
    const core = await ipc.invokeWithProjectSession(
      projectSession, 'db:project-core-get', currentProject.path,
    )
    const setting = [
      config.genre && `${text('类型', 'Genre')}: ${config.genre}`,
      config.subGenre && `${text('细分', 'Subgenre')}: ${config.subGenre}`,
      config.targetAudience && `${text('受众', 'Audience')}: ${config.targetAudience}`,
      core?.premise && `${text('故事前提', 'Premise')}: ${clip(core.premise, 400)}`,
      core?.worldbuilding && `${text('世界观/初始设定', 'World/initial setting')}: ${clip(core.worldbuilding, 400)}`,
      core?.goldenFinger && `${text('金手指/核心卖点', 'Golden finger / core selling point')}: ${clip(core.goldenFinger, 300)}`,
      core?.protagonistProfile && `${text('主角人设', 'Protagonist profile')}: ${clip(core.protagonistProfile, 300)}`,
      core?.coreOutline && `${text('核心大纲', 'Core outline')}: ${clip(core.coreOutline, 600)}`,
      core?.synopsis && `${text('现有简介', 'Current synopsis')}: ${clip(core.synopsis, 200)}`,
    ].filter(Boolean).join('\n')

    if (sourceMode === 'digest' || !core) {
      return setting || text('（暂无设定信息）', '(no settings)')
    }

    // read：首章 + 最新已定稿章正文节选
    const maxChapter = await ipc.invokeWithProjectSession(
      projectSession, 'db:draft-get-max-finalized-chapter', currentProject.path,
    )
    const picks: Array<{ label: string; content: string }> = []
    for (const chapter of [1, maxChapter].filter(n => n > 0)) {
      const meta = await ipc.invokeWithProjectSession(
        projectSession, 'db:draft-get-finalized', chapter, currentProject.path,
      )
      if (!meta) continue
      const full = await ipc.invokeWithProjectSession(
        projectSession, 'db:draft-get-full', meta.id, currentProject.path,
      )
      if (full?.content) {
        picks.push({
          label: text(`第${chapter}章${full.chapterTitle ? `《${full.chapterTitle}》` : ''}`,
            `Chapter ${chapter}${full.chapterTitle ? ` "${full.chapterTitle}"` : ''}`),
          content: clip(full.content, 1600, 800),
        })
      }
    }
    const proseBlock = picks.length > 0
      ? picks.map(p => `【${p.label}】\n${p.content}`).join('\n\n')
      : text('（尚无定稿正文，仅依据设定生成）', '(no finalized prose yet; using settings only)')
    return `${setting}\n\n${text('正文节选', 'Prose excerpts')}:\n${proseBlock}`
  }, [currentProject, projectSession, sourceMode, text])

  const generate = useCallback(async () => {
    if (!currentProject || !projectSession) return
    setGenerating(true)
    setError(null)
    setApplied(false)
    try {
      const context = await gatherContext()
      if (!isProjectSessionCurrent(projectSession)) return
      const langNote = currentProject.novelConfig.writingLanguage === 'en-US'
        ? 'Write names and copy in English.'
        : '书名与简介一律使用简体中文。'
      const platformLabel = PLATFORM_LABELS[platform]

      let system: string
      let user: string
      if (isTitle) {
        system = text(
          `你是畅销书书名策划，精通${platformLabel.zh}的命名套路。\n${buildTitleRules(platform, audience)}`,
          `You are a bestselling title strategist expert in ${platformLabel.en} naming conventions.\n${buildTitleRules(platform, audience)}`,
        )
        const imitate = sourceMode === 'imitate' && originalTitle.trim()
          ? text(`请模仿原书名《${originalTitle.trim()}》的句式与气质（长度、结构、氛围），但内容完全原创，不得使用原书名中的独特词汇。`, `Imitate the style of "${originalTitle.trim()}" (length, structure, mood) but stay fully original; do not reuse distinctive words from the original title.`)
          : ''
        user = [
          context,
          imitate,
          text(
            `请按上面的规则生成 8 个候选书名，输出 JSON：{"titles":[{"name":"书名","reason":"一句话理由（说明用哪种结构/为何符合本项目）"}]}。${langNote}`,
            `Generate 8 candidate titles per the rules above as JSON {"titles":[{"name":"...","reason":"one line"}]}. ${langNote}`,
          ),
        ].filter(Boolean).join('\n\n')
      } else {
        system = text(
          `你是资深网文平台简介写手，精通${platformLabel.zh}（字数：${platformLabel.wordRange}）。\n${buildSynopsisRules(audience, platform)}`,
          `You are a veteran web-novel blurb writer expert in ${platformLabel.en} (length: ${platformLabel.wordRange}).\n${buildSynopsisRules(audience, platform)}`,
        )
        user = [
          context,
          text(
            `请严格按上面的规范，结合项目设定与正文节选，写一段${platformLabel.zh}简介。\n\n⚠️ 排版要求：简介必须分成至少 3 个段落，段与段之间用 \\n\\n 分隔（即空行）。排比句每句独占一行。台词独占一段。【标签】独占第一段。输出的 synopsis 字段必须包含换行符 \\n，不能是纯单行文本。\n\n输出 JSON：{"synopsis":"简介正文（含换行）"}。${langNote}`,
            `Write a ${platformLabel.en} synopsis strictly per the rules. \\n\\n FORMATTING: The synopsis must have at least 3 paragraphs separated by \\n\\n (blank lines). Each parallel sentence on its own line. Dialogue on its own paragraph. Tags on the first paragraph. The synopsis field MUST contain \\n line breaks, NOT a single-line text.\\n\\nOutput JSON: {"synopsis":"...with line breaks..."}. ${langNote}`,
          ),
        ].filter(Boolean).join('\n\n')
      }

      const res = await useLLMStore.getState().generate(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        undefined,
        {
          responseFormat: { type: 'json_object' },
          purpose: isTitle ? 'book-title-generation' : 'book-synopsis-generation',
          maxTokens: isTitle ? 8192 : 4096,
        },
      )
      if (!isProjectSessionCurrent(projectSession)) return
      if (!res.success) throw new Error(res.error ?? text('AI 生成失败', 'Generation failed'))
      const parsed = extractJson(res.content) as {
        titles?: Array<{ name?: unknown; reason?: unknown }>
        synopsis?: unknown
      }
      if (isTitle) {
        const rows: TitleCandidate[] = (parsed.titles ?? [])
          .map(t => ({ name: String(t.name ?? '').trim(), reason: String(t.reason ?? '') }))
          .filter(t => t.name)
        if (rows.length === 0) throw new Error(text('AI 未返回候选书名，请重试。', 'No titles returned. Please retry.'))
        setTitles(rows)
      } else {
        const s = String(parsed.synopsis ?? '').trim()
        if (!s) throw new Error(text('AI 未返回简介，请重试。', 'No synopsis returned. Please retry.'))
        setSynopsis(s)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }, [currentProject, projectSession, gatherContext, isTitle, originalTitle, sourceMode, platform, audience, text])

  const apply = useCallback(async (value: string) => {
    if (!currentProject || !projectSession || !value.trim()) return
    const payload = isTitle ? { projectName: value.trim() } : { synopsis: value.trim() }
    const result = await ipc.invokeWithProjectSession(
      projectSession, 'db:project-core-update', payload, currentProject.path,
    )
    if (!result.success) {
      setError(result.error ?? text('保存失败', 'Save failed'))
      return
    }
    if (isTitle) {
      useProjectStore.setState(state => ({
        currentProject: state.currentProject
          ? { ...state.currentProject, name: value.trim() }
          : state.currentProject,
      }))
    }
    setApplied(true)
  }, [currentProject, projectSession, isTitle, text])

  if (!currentProject || !projectSession) return null

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !generating) onClose() }}>
      <DialogContent
        hideCloseButton
        className="flex flex-col p-0 overflow-hidden"
        style={{ width: 'min(94vw, 620px)', maxHeight: '80vh' }}
        onPointerDownOutside={(e) => { if (generating) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (generating) e.preventDefault() }}
      >
        <DialogTitle className="sr-only">
          {isTitle ? text('AI 生成书名', 'AI Title Generator') : text('AI 生成全书简介', 'AI Synopsis Generator')}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {text('根据项目设定与正文生成书名或简介', 'Generate a title or synopsis from project settings and prose')}
        </DialogDescription>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          {isTitle ? <BookOpen size={16} style={{ color: 'var(--color-accent)' }} /> : <FileText size={16} style={{ color: 'var(--color-accent)' }} />}
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {isTitle ? text('AI 生成书名', 'AI Title Generator') : text('AI 生成全书简介', 'AI Synopsis Generator')}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {([
              ['digest', text('设定摘要', 'From settings')],
              ['read', text('读正文', 'Read prose')],
              ['imitate', text('仿写原名', 'Imitate a title')],
            ] as Array<[SourceMode, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSourceMode(key)}
                className="px-2.5 py-1 rounded-full text-xs transition-all"
                style={{
                  backgroundColor: sourceMode === key ? 'var(--color-accent)' : 'var(--color-raised)',
                  color: sourceMode === key ? '#fff' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 平台风格选择（基于真实平台调研的写作规范） */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
              {text('平台风格', 'Platform style')}：
            </span>
            {([
              ['fanqie', '番茄/七猫'],
              ['jinjiang', '晋江'],
              ['yanxuan', '知乎盐选'],
              ['qidian', '起点'],
            ] as Array<[PlatformStyle, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPlatform(key)}
                className="px-2.5 py-1 rounded-full text-xs transition-all"
                style={{
                  backgroundColor: platform === key ? 'var(--color-accent)' : 'var(--color-raised)',
                  color: platform === key ? '#fff' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {label}
              </button>
            ))}
            <span className="text-[0.68rem] ml-1" style={{ color: 'var(--color-text-muted)' }}>
              {audience === 'male'
                ? text('（男频）', '(male-focused)')
                : audience === 'female'
                  ? text('（女频）', '(female-focused)')
                  : text('（男女频自适应）', '(auto audience)')}
            </span>
          </div>
          <p className="text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
            {PLATFORM_LABELS[platform].zh}：{PLATFORM_LABELS[platform].wordRange}
          </p>

          {sourceMode === 'imitate' && (
            <input
              value={originalTitle}
              onChange={e => setOriginalTitle(e.target.value)}
              placeholder={text('输入原书名，AI 将仿其风格生成新名', 'Original title to imitate')}
              className="w-full rounded-md px-2.5 py-2 text-xs outline-none"
              style={{
                backgroundColor: 'var(--color-raised)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          )}

          {generating && (
            <div className="flex items-center gap-2 py-6 justify-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <Loader2 size={16} className="animate-spin" />
              {text('AI 正在创作……', 'AI is creating…')}
            </div>
          )}

          {!generating && isTitle && titles.length > 0 && (
            <div className="space-y-1.5">
              {titles.map(t => (
                <div
                  key={t.name}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs group"
                  style={{ backgroundColor: 'var(--color-raised)', border: '1px solid var(--color-border)' }}
                >
                  <span className="font-semibold text-sm shrink-0" style={{ color: 'var(--color-text)' }}>{t.name}</span>
                  <span className="flex-1 truncate text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }} title={t.reason}>{t.reason}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 shrink-0"
                    onClick={() => apply(t.name)}
                    disabled={applied && currentProject?.name === t.name}
                  >
                    {applied && currentProject?.name === t.name ? <Check size={12} /> : text('采用', 'Use')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!generating && !isTitle && synopsis && (
            <div className="space-y-2">
              <textarea
                value={synopsis}
                onChange={e => { setSynopsis(e.target.value); setApplied(false) }}
                rows={9}
                className="w-full rounded-md px-3 py-2.5 text-xs leading-relaxed outline-none resize-none"
                style={{
                  backgroundColor: 'var(--color-raised)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
                  {text('可直接编辑后再保存', 'Editable before saving')}
                </span>
                <Button size="sm" onClick={() => apply(synopsis)} disabled={!synopsis.trim()}>
                  {applied ? <><Check size={12} /> {text('已保存', 'Saved')}</> : text('保存为本书简介', 'Save as synopsis')}
                </Button>
              </div>
            </div>
          )}

          {applied && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-accent)' }}>
              <Check size={13} /> {text('已写入项目信息。', 'Saved to project info.')}
            </p>
          )}

          {error && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--color-accent)' }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
          <Button variant="ghost" onClick={onClose} disabled={generating}>{text('关闭', 'Close')}</Button>
          <Button onClick={generate} disabled={generating || (sourceMode === 'imitate' && !originalTitle.trim())}>
            {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {titles.length > 0 || synopsis ? text('重新生成', 'Regenerate') : text('AI 生成', 'Generate')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
