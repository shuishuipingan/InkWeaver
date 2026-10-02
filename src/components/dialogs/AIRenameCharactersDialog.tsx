import { useCallback, useMemo, useState } from 'react'
import { Wand2, Loader2, Check, AlertTriangle, ArrowRight, Replace } from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/Dialog'
import { useCharacterStore } from '../../stores/character-store'
import { useEditorStore } from '../../stores/editor-store'
import { useProjectStore } from '../../stores/project-store'
import { useLLMStore } from '../../stores/llm-store'
import { ipc } from '../../services/ipc-client'
import { globalEventBus } from '../../shared/event-bus'
import { countDraftUnits } from '../../shared/draft-units'
import { replaceCharacterNamesSimultaneously } from '../../shared/character-rename-references'
import { CharacterRenameLengthError, chunkCharacterRenameRoster, findQuoteWrappedNameCollisions, generateUniqueCharacterRenameBatch, type CharacterRenameRow } from '../../services/character-rename-batches'
import {
  captureProjectSession,
  isProjectSessionCurrent,
} from '../project-session-gate'
import { useLocaleStore } from '../../stores/locale-store'
import { runtimeLog } from '../../services/runtime-log'

type RenameRow = CharacterRenameRow

interface ApplySummary {
  renamedCards: number
  proseChapters: number
  finalizedSkipped: number
}

function replaceNamesInText(
  text: string,
  renames: Array<{ from: string; to: string }>,
  protectedNames: string[] = [],
): string {
  return replaceCharacterNamesSimultaneously(text, renames.map(rename => ({
    originalName: rename.from,
    newName: rename.to,
  })), protectedNames)
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
  const [warning, setWarning] = useState<string | null>(null)
  const [summary, setSummary] = useState<ApplySummary | null>(null)
  /** 已写入本地名单、等待落盘的改名行；保存失败后仍可重试。 */
  const [appliedPairs, setAppliedPairs] = useState<Array<{ from: string; to: string }>>([])

  const projectSession = useMemo(() => captureProjectSession(currentProject), [currentProject])
  const currentNames = useMemo(
    () => new Set(characters.map(c => c.name)),
    [characters],
  )
  const quoteWrappedNameCollisions = useMemo(
    () => findQuoteWrappedNameCollisions(characters.map(character => character.name)),
    [characters],
  )
  /**
   * 只有“当前名单里还存在的原名”才算待改名行。已经应用过的行不能继续参与
   * 校验，否则应用成功后重新进入预览会把自己判成重名并卡死。
   */
  const pendingRows = useMemo(
    () => renames.filter(row => currentNames.has(row.from)),
    [renames, currentNames],
  )
  const previewHasInvalidNames = useMemo(() => {
    const targets = new Map(pendingRows.map(row => [row.from, row.to.trim()] as const))
    if ([...targets.values()].some(target => !target)) return true
    const resulting = characters.map(character => targets.get(character.name) ?? character.name)
    const seen = new Set<string>()
    for (const name of resulting) {
      if (!name || seen.has(name)) return true
      seen.add(name)
    }
    return false
  }, [characters, pendingRows])
  const hasRenameChanges = pendingRows.length > 0
  /** 名单已被本地改写但还没落盘：允许再次点击“应用改名”完成保存。 */
  const hasPendingSave = appliedPairs.length > 0

  const generate = useCallback(async () => {
    if (!currentProject || !projectSession) return
    if (characters.length === 0) {
      setError(text('当前项目还没有角色卡，请先创建角色。', 'No character cards yet.'))
      return
    }
    setStep('generating')
    setError(null)
    runtimeLog.info('character-rename', '全角色改名方案生成开始', {
      characterCount: characters.length,
      batchCount: chunkCharacterRenameRoster(characters).length,
      styleHintProvided: Boolean(styleHint.trim()),
      replaceDrafts: replaceProse,
    }, {
      projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
      operation: 'character-rename.generate', outcome: 'started',
    })
    const config = currentProject.novelConfig
    const settingBrief = [
      config.genre && `类型：${config.genre}`,
      config.subGenre && `细分：${config.subGenre}`,
    ].filter(Boolean).join('；')

    const system = text(
      '你是资深小说编辑。用户正在进行"拆书仿写"：需要把一本书里的全部角色名替换成全新原创名字，使作品看不出与原著的关联，同时新名字必须符合剧情与设定。',
      'You are a senior fiction editor. The user is adapting a book: replace ALL character names with fresh original names so the result no longer resembles the source, while every new name fits the plot and setting.',
    )
    try {
      const modelId = useLLMStore.getState().defaultModelId
      if (!modelId) throw new Error(text('请先配置默认创作模型', 'Configure a default writing model first'))
      const rows: RenameRow[] = []
      const generateBatch = async (batch: typeof characters, forbiddenNames: Set<string>): Promise<RenameRow[]> => {
        const rosterLines = batch.map((c, index) => {
          // 带上背景/能力/动机的短摘要，模型才能给出贴合世界观与人设的名字。
          const brief = [
            c.gender,
            c.age,
            c.role,
            c.personality?.slice(0, 40),
            c.background?.slice(0, 60),
            c.abilities?.slice(0, 40),
            c.motivation?.slice(0, 40),
          ].filter(Boolean).join(' / ')
          return `- [R${index + 1}] ${c.name}${brief ? `（${brief}）` : ''}`
        }).join('\n')
        const user = [
          text(`作品设定：${settingBrief || '未提供'}`, `Setting: ${settingBrief || 'not provided'}`),
          styleHint ? text(`风格要求：${styleHint}`, `Style requests: ${styleHint}`) : '',
          text('现有角色名单：', 'Current characters:'),
          rosterLines,
          forbiddenNames.size > 0
            ? text(`以下新名已被占用或本轮不可使用：${[...forbiddenNames].join('、')}`, `These new names are unavailable: ${[...forbiddenNames].join(', ')}`)
            : '',
          text('只为本批列出的角色生成名字，逐个完整返回。', 'Return one complete mapping for each character in this batch only.'),
          text('每个角色的 R 编号必须原样返回且不可重复；from 仅作回显。输出 JSON：{"renames":[{"slotId":"R1","from":"原名","to":"新名","reason":"一句话理由"}]}。',
            'Return each R slot ID unchanged and exactly once; from is only an echo. Output JSON: {"renames":[{"slotId":"R1","from":"old","to":"new","reason":"one line"}]}.'),
          text('新名符合设定，不含原名的字或近音，不与其他角色重名。',
            'New names must fit the setting, avoid old characters and similar sounds, and be unique.'),
        ].filter(Boolean).join('\n')
        const res = await ipc.invoke('llm:generate', {
          modelId,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          responseFormat: { type: 'json_object' },
          purpose: 'character-rename-mapping',
          maxTokens: 8192,
          projectSession,
          creativeStrategy: 'fluent-drafting',
          reasoningStage: 'general',
        })
        if (!res.success) {
          const message = text(
            `AI 改名未完成（结束原因：${res.finishReason}）。${res.error ?? ''}`,
            `Character renaming did not complete (finish reason: ${res.finishReason}). ${res.error ?? ''}`,
          )
          if (res.finishReason === 'length') throw new CharacterRenameLengthError(message)
          throw new Error(message)
        }
        const parsed = extractJson(res.content) as { renames?: Array<{ slotId?: unknown; from?: unknown; to?: unknown; reason?: unknown }> }
        if (!Array.isArray(parsed.renames)) throw new Error(text('AI 未返回改名列表', 'AI did not return a rename list'))
        return parsed.renames.map(r => ({
          from: String(r.from ?? ''), to: String(r.to ?? ''), reason: String(r.reason ?? ''),
          ...(r.slotId === undefined ? {} : { slotId: String(r.slotId) }),
        }))
      }
      const batches = chunkCharacterRenameRoster(characters)
      for (const [batchIndex, batch] of batches.entries()) {
        runtimeLog.info('character-rename', '改名映射批次请求开始', {
          batchIndex: batchIndex + 1, batchCount: batches.length, characterCount: batch.length,
        }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          operation: 'character-rename.generate-batch', outcome: 'started',
        })
        rows.push(...await generateUniqueCharacterRenameBatch(
          batch, currentNames, new Set(rows.map(row => row.to)), generateBatch,
        ))
        runtimeLog.info('character-rename', '改名映射批次请求完成', {
          batchIndex: batchIndex + 1, batchCount: batches.length, mappedCount: rows.length,
        }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          operation: 'character-rename.generate-batch', outcome: 'succeeded',
        })
      }
      if (!isProjectSessionCurrent(projectSession)) return
      setRenames(rows)
      setStep('preview')
      runtimeLog.info('character-rename', '全角色改名方案生成完成', {
        mappingCount: rows.length,
        unchangedCount: rows.filter(row => row.to.trim() === row.from).length,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.generate', outcome: 'succeeded',
      })
    } catch (e) {
      runtimeLog.error('character-rename', '全角色改名方案生成失败', {
        errorType: e instanceof Error ? e.name : 'UnknownError',
        characterCount: characters.length,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.generate', outcome: 'failed',
      })
      setError(String(e))
      setStep('input')
    }
  }, [characters, currentProject, projectSession, replaceProse, styleHint, text, currentNames])

  const apply = useCallback(async () => {
    if (!currentProject || !projectSession) return
    if (previewHasInvalidNames) {
      runtimeLog.warn('character-rename', '改名应用被预检拒绝', { reason: 'invalid-or-duplicate-name' }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.apply', outcome: 'rejected',
      })
      setError(text('新名字缺失或重复，请修改后再应用。', 'New names are missing or duplicated. Edit them before applying.'))
      return
    }
    // 只对"名单里仍然存在的原名"发起改名；已应用的行留给下面的保存步骤。
    const valid = pendingRows
      .map(row => ({ from: row.from, to: row.to.trim() }))
      .filter(pair => pair.to && pair.to !== pair.from)
    if (valid.length === 0 && appliedPairs.length === 0) {
      runtimeLog.warn('character-rename', '改名应用被预检拒绝', { reason: 'no-name-changes' }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.apply', outcome: 'rejected',
      })
      setError(text('至少更改一个角色名；单个角色可以保留原名。', 'Change at least one character name. Individual characters may keep their original names.'))
      return
    }
    if (useProjectStore.getState().hasUnsavedNovelConfig(currentProject.path)) {
      runtimeLog.warn('character-rename', '改名应用被未保存配置阻止', { dirtyConfig: true }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.apply', outcome: 'rejected',
      })
      setError(text('项目配置仍有未保存修改，请先保存后再替换角色名。', 'Save or discard pending project settings before replacing character names.'))
      return
    }
    const dirtyTabs = useEditorStore.getState().tabs.filter(tab => tab.projectKey === currentProject.path
      && tab.dirty && ['config', 'chapter-card', 'world-building', 'arch-file'].includes(tab.type))
    if (dirtyTabs.length > 0) {
      runtimeLog.warn('character-rename', '改名应用被未保存编辑阻止', { dirtyTabCount: dirtyTabs.length }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.apply', outcome: 'rejected',
      })
      setError(text('配置、蓝图或架构页仍有未保存修改，请先保存后再替换角色名。', 'Save or discard pending settings, blueprint, or architecture edits before replacing character names.'))
      return
    }
    setStep('applying')
    setError(null)
    setWarning(null)
    runtimeLog.info('character-rename', '应用角色名替换开始', {
      changedCharacterCount: valid.length, replaceDrafts: replaceProse,
    }, {
      projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
      operation: 'character-rename.apply', outcome: 'started',
    })
    // 1) 本地整份名单改名 + 草稿账本：一次提交，支持互换与链式改名。
    if (valid.length > 0) {
      const renamed = useCharacterStore.getState().renameCharactersBatch(valid)
      if (!renamed) {
        runtimeLog.error('character-rename', '本地批量改名失败', { changedCharacterCount: valid.length }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          operation: 'character-rename.apply', outcome: 'failed',
        })
        setError(text('改名未生效：角色名单已变化，请关闭后重新生成方案。',
          'Renaming did not apply: the roster changed. Close this dialog and generate a new mapping.'))
        setStep('preview')
        return
      }
    }
    const mergedPairs = [
      ...appliedPairs.filter(pair => !valid.some(candidate => candidate.from === pair.from)),
      ...valid,
    ]
    try {
      // 2) 经 roster seam 原子提交：角色主键、档案字段、关系、蓝图结构化引用、图谱投影
      await useCharacterStore.getState().saveAll(
        currentProject.path, projectSession, undefined, { fullIdentityRename: true },
      )
      if (!isProjectSessionCurrent(projectSession)) return
      setAppliedPairs([])

      // 名字已经写入名单，后面的同步步骤即使失败也不能把界面退回“确定名字”：
      // 那时预览里的原名已经不存在，重新校验只会把已应用的名字判成重名而卡死。
      let proseChapters = 0
      let finalizedSkipped = 0
      let postCommitWarning: string | null = null
      try {
        // The roster commit rewrites project_core in SQLite; refresh the open
        // configuration snapshot too, or the editor keeps showing old names.
        const currentNovelConfig = useProjectStore.getState().currentProject?.novelConfig
        if (currentNovelConfig) {
          const nextConfig = Object.fromEntries(Object.entries(currentNovelConfig).map(([key, value]) => [
            key,
            typeof value === 'string'
              ? replaceNamesInText(value,
                mergedPairs.map(rename => ({ from: rename.from, to: rename.to })),
                characters.map(character => character.name))
              : value,
          ])) as Partial<typeof currentNovelConfig>
          useProjectStore.getState().syncCommittedNovelConfig(nextConfig, projectSession)
        }
        const currentProjectName = useProjectStore.getState().currentProject?.name
        if (currentProjectName) {
          const nextProjectName = replaceNamesInText(
            currentProjectName,
            mergedPairs.map(rename => ({ from: rename.from, to: rename.to })),
            characters.map(character => character.name),
          )
          if (nextProjectName !== currentProjectName) {
            const recentProjectSaved = await useProjectStore.getState()
              .syncCommittedProjectName(nextProjectName, projectSession)
            if (!recentProjectSaved && isProjectSessionCurrent(projectSession)) {
              globalEventBus.emit('SYSTEM_NOTICE', {
                level: 'warn',
                message: text('角色名已替换，但最近项目名称同步失败。重新打开项目后会自动校正。',
                  'Character names were replaced, but the recent-project label did not sync. Reopening the project will refresh it.'),
              })
            }
          }
        }

        // 正文中的角色名替换（仅未定稿草稿；已定稿正文为不可变事实）
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
            const next = replaceNamesInText(full.content, mergedPairs, characters.map(character => character.name))
            if (next === full.content) continue
            const updated = await ipc.invokeWithProjectSession(
              projectSession, 'db:draft-update-content',
              meta.id, next, countDraftUnits(next), currentProject.path,
            )
            if (updated.success) proseChapters += 1
          }
        }
      } catch (postError) {
        postCommitWarning = text(
          `角色名已写入名单，但正文或设定的同步未完成：${String(postError)}。可再点一次“应用改名”重试同步，或在编辑器里检查相关章节。`,
          `The new names are saved, but syncing prose or settings did not finish: ${String(postError)}. Click "Apply renames" again to retry the sync, or check the affected chapters in the editor.`,
        )
        runtimeLog.warn('character-rename', '改名后同步未完成', {
          errorType: postError instanceof Error ? postError.name : 'UnknownError',
        }, {
          projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
          operation: 'character-rename.apply', outcome: 'failed',
        })
      }

      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['characterCards', 'drafts', 'blueprints', 'fileTree'],
        projectPath: currentProject.path,
        projectSession,
      })
      for (const fileName of ['premise.md', 'characters.md', 'worldbuilding.md', 'synopsis.md']) {
        globalEventBus.emit('ARCH_FILE_UPDATED', {
          fileName, projectPath: currentProject.path, projectSession,
          runId: `character-rename-${Date.now()}`,
        })
      }
      setSummary({
        renamedCards: mergedPairs.length,
        proseChapters,
        finalizedSkipped,
      })
      setWarning(postCommitWarning)
      setStep('done')
      runtimeLog.info('character-rename', '应用角色名替换完成', {
        renamedCharacterCount: mergedPairs.length, changedDraftCount: proseChapters,
        finalizedSkipped, postCommitWarning: Boolean(postCommitWarning),
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.apply', outcome: 'succeeded',
      })
    } catch (e) {
      runtimeLog.error('character-rename', '应用角色名替换失败', {
        errorType: e instanceof Error ? e.name : 'UnknownError', changedCharacterCount: valid.length,
      }, {
        projectId: projectSession.projectId, projectSessionId: projectSession.leaseId,
        operation: 'character-rename.apply', outcome: 'failed',
      })
      // 本地名单可能已经改名，只是尚未落盘：保留待保存行，让界面仍可重试。
      setAppliedPairs(mergedPairs)
      setError(text(
        `角色名未能写入项目：${String(e)}。已改名的部分会保留在草稿中，可再点一次“应用改名”重试。`,
        `The new names were not committed: ${String(e)}. Any locally applied renames are kept as a draft; click "Apply renames" again to retry.`,
      ))
      setStep('preview')
    }
  }, [
    characters, currentProject, projectSession, replaceProse, text,
    previewHasInvalidNames, pendingRows, appliedPairs,
  ])

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
          {quoteWrappedNameCollisions.length > 0 && (step === 'input' || step === 'preview') && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--color-warning-text)' }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {text(
                `角色卡中有 ${quoteWrappedNameCollisions.length} 个带引号的名字与未带引号的名字疑似指向同一角色。请核对角色卡；批量改名不会自动合并它们。`,
                `${quoteWrappedNameCollisions.length} quoted character name(s) also exist without quotes. Review those cards; bulk renaming will not merge them automatically.`,
              )}
            </p>
          )}
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
              {renames.map((r) => {
                // 已经应用的行：原名已不在名单里，但新名就是当前角色。它们只是
                // 展示结果，不能继续参与校验，也不能再被改回旧名。
                const applied = !currentNames.has(r.from) && currentNames.has(r.to.trim())
                const rowIsPending = !applied
                const duplicatedTarget = rowIsPending && renames.some(other => (
                  other !== r && currentNames.has(other.from) && other.to.trim() === r.to.trim()
                ))
                const collision = rowIsPending && (r.to.trim() !== r.from && currentNames.has(r.to.trim()))
                const invalid = rowIsPending && (!r.to.trim() || collision || duplicatedTarget)
                return (
                  <div key={`${r.from}→${r.to}`} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate" style={{ color: 'var(--color-text)' }} title={r.from}>{r.from}</span>
                    <ArrowRight size={13} style={{ color: 'var(--color-text-muted)' }} />
                    {applied ? (
                      <span className="flex-1 truncate text-[0.72rem] px-2 py-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        {r.to} · {text('已应用', 'applied')}
                      </span>
                    ) : (
                      <input
                        value={r.to}
                        onChange={e => setRenames(rows => rows.map((row) => row === r ? { ...row, to: e.target.value } : row))}
                        className="flex-1 rounded-md px-2 py-1.5 outline-none"
                        style={{
                          backgroundColor: 'var(--color-raised)',
                          border: `1px solid ${invalid ? 'var(--color-accent)' : 'var(--color-border)'}`,
                          color: 'var(--color-text)',
                        }}
                      />
                    )}
                    <span className="w-40 shrink-0 truncate text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }} title={r.reason}>{r.reason}</span>
                  </div>
                )
              })}
              {step === 'preview' && hasPendingSave && (
                <p className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
                  {text('名单已在本地更新，还有一步落盘未完成；再点一次“应用改名”即可补上。',
                    'The roster was updated locally but not yet committed; click "Apply renames" again to finish saving.')}
                </p>
              )}
              {previewHasInvalidNames && (
                <p className="text-[0.7rem] flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                  <AlertTriangle size={12} />
                  {text('存在空名字或与其他角色重名的新名字，请修改后再应用；个别角色可以保留原名。', 'Some names are empty or collide with existing characters. Individual characters may keep their original names.')}
                </p>
              )}
              {!previewHasInvalidNames && !hasRenameChanges && !hasPendingSave && (
                <p className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
                  {text('至少更改一个角色名；个别角色可以保留原名。', 'Change at least one name; individual characters can keep their original names.')}
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
              {warning && (
                <p className="flex items-start gap-1.5" style={{ color: 'var(--color-warning-text)' }}>
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {warning}
                </p>
              )}
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
                disabled={previewHasInvalidNames || (!hasRenameChanges && !hasPendingSave)}
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
