/* eslint-disable react-refresh/only-export-components */
/**
 * DraftRevisionPreview — propose_draft_revision 的确认预览
 *
 * 作者批准前必须看得见「当前正文 → 建议正文」到底改了什么，所以这里给的是行级 diff
 * （diff-match-patch，项目既有依赖）+ 段落统计 + 可滚动限高，而不是把整篇正文贴进卡片。
 * 数据来源：工具参数里的 content（建议正文）与当前草稿正文（异步读取，带会话校验）。
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'

import type { ToolCallInfo } from '../../../services/agent/agent-engine'
import { ipc } from '../../../services/ipc-client'
import { countDraftUnits } from '../../../shared/draft-units'
import { projectSessionContextFromProject, sameProjectSessionContext } from '../../../shared/project-session-context'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'

export interface RevisionDiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}

export interface RevisionDiffStats {
  addedLines: number
  removedLines: number
  beforeUnits: number
  afterUnits: number
  hiddenChanges: number
}

export type DraftRevisionPreviewState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'stale' }
  | { kind: 'invalid'; error: string }
  | { kind: 'same' }
  | {
      kind: 'valid'
      chapterNumber: number
      baseDraftId: number
      lines: RevisionDiffLine[]
      stats: RevisionDiffStats
    }

/** 预览里最多渲染的改动行；超出的只计数，避免长章节把卡片撑爆。 */
export const DRAFT_REVISION_MAX_RENDERED_LINES = 80

/** 行级 diff：未改动的连续段折叠成占位行，只保留真正变化的部分。 */
export function computeRevisionDiff(current: string, proposed: string): { lines: RevisionDiffLine[]; stats: RevisionDiffStats } {
  const dmp = new DiffMatchPatch()
  const encoded = dmp.diff_linesToChars_(current, proposed)
  const diffs = dmp.diff_main(encoded.chars1, encoded.chars2, false)
  dmp.diff_charsToLines_(diffs, encoded.lineArray)

  const lines: RevisionDiffLine[] = []
  let addedLines = 0
  let removedLines = 0
  let hiddenChanges = 0
  let pendingSame = 0

  const pushSame = () => {
    if (pendingSame <= 0) return
    lines.push({ type: 'same', text: String(pendingSame) })
    pendingSame = 0
  }

  for (const [op, raw] of diffs) {
    const chunks = String(raw).split('\n').filter(chunk => chunk.length > 0)
    if (op === 0) {
      pendingSame += chunks.length
      continue
    }
    pushSame()
    for (const chunk of chunks) {
      const isAdd = op === 1
      if (isAdd) addedLines += 1
      else removedLines += 1
      if (addedLines + removedLines <= DRAFT_REVISION_MAX_RENDERED_LINES) {
        lines.push({ type: isAdd ? 'add' : 'remove', text: chunk })
      } else {
        hiddenChanges += 1
      }
    }
  }
  pushSame()

  return {
    lines,
    stats: {
      addedLines,
      removedLines,
      beforeUnits: countDraftUnits(current),
      afterUnits: countDraftUnits(proposed),
      hiddenChanges,
    },
  }
}

export function useDraftRevisionPreview(toolCall: ToolCallInfo): DraftRevisionPreviewState {
  const currentProject = useProjectStore(s => s.currentProject)
  const [asyncState, setAsyncState] = useState<DraftRevisionPreviewState>({ kind: 'loading' })

  const isDraftRevision = toolCall.toolName === 'propose_draft_revision'
  const projectSession = toolCall.projectSession
  const chapterNumber = Number(toolCall.arguments.chapter_number)
  const proposed = typeof toolCall.arguments.content === 'string' ? toolCall.arguments.content.trim() : ''
  const sessionCurrent = !!projectSession && sameProjectSessionContext(
    projectSession,
    projectSessionContextFromProject(currentProject),
  )

  const immediate = useMemo<DraftRevisionPreviewState | null>(() => {
    if (!isDraftRevision) return { kind: 'none' }
    if (!projectSession || !currentProject || !sessionCurrent) return { kind: 'stale' }
    if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) {
      return { kind: 'invalid', error: 'chapter_number' }
    }
    if (!proposed) return { kind: 'invalid', error: 'empty-content' }
    return null
  }, [chapterNumber, currentProject, isDraftRevision, projectSession, proposed, sessionCurrent])

  useEffect(() => {
    if (immediate || !projectSession || !currentProject) return
    let disposed = false
    void (async () => {
      try {
        const meta = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-latest', chapterNumber, currentProject.path)
        if (disposed) return
        const baseDraftId = Number((meta as { id?: unknown } | null)?.id ?? 0)
        if (baseDraftId <= 0) {
          setAsyncState({ kind: 'invalid', error: 'missing-draft' })
          return
        }
        const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', baseDraftId, currentProject.path)
        if (disposed) return
        if (!sameProjectSessionContext(projectSession, projectSessionContextFromProject(useProjectStore.getState().currentProject))) {
          setAsyncState({ kind: 'stale' })
          return
        }
        const current = (full as { content?: unknown } | null)?.content
        const currentText = typeof current === 'string' ? current : ''
        if (!currentText.trim()) {
          setAsyncState({ kind: 'invalid', error: 'empty-draft' })
          return
        }
        if (currentText.trim() === proposed) {
          setAsyncState({ kind: 'same' })
          return
        }
        const { lines, stats } = computeRevisionDiff(currentText, proposed)
        setAsyncState({ kind: 'valid', chapterNumber, baseDraftId, lines, stats })
      } catch (error) {
        if (!disposed) setAsyncState({ kind: 'invalid', error: String(error) })
      }
    })()
    return () => { disposed = true }
  }, [chapterNumber, currentProject, immediate, projectSession, proposed])

  return immediate ?? asyncState
}

interface Props {
  preview: DraftRevisionPreviewState
}

const hintStyle: CSSProperties = {
  marginTop: 6,
  fontSize: '0.7rem',
  color: 'var(--color-text-secondary)',
}

export default function DraftRevisionPreview({ preview }: Props) {
  const text = useLocaleStore(s => s.text)

  if (preview.kind === 'none') return null
  if (preview.kind === 'loading') {
    return <div style={hintStyle}>{text('正在读取当前草稿并比对修订正文…', 'Reading the current draft and comparing the revision…')}</div>
  }
  if (preview.kind === 'stale') {
    return (
      <div style={{ ...hintStyle, color: 'var(--color-warning-text)' }} data-draft-revision-stale>
        {text('项目会话已变化，请重新发起这次改稿。', 'The project session changed; please start this revision again.')}
      </div>
    )
  }
  if (preview.kind === 'invalid') {
    const detail = preview.error === 'chapter_number'
      ? text('章节号无效，无法预览这次改稿。', 'The chapter number is invalid, so this revision cannot be previewed.')
      : preview.error === 'empty-content'
        ? text('工具参数里没有修订正文，无法预览。', 'The tool call has no revision content to preview.')
        : preview.error === 'missing-draft'
          ? text('这一章还没有草稿，无法对比修订。', 'This chapter has no draft to compare against.')
          : preview.error === 'empty-draft'
            ? text('当前草稿正文为空，无法对比修订。', 'The current draft is empty, so a comparison is not possible.')
            : text('无法预览修订：' + preview.error, 'Cannot preview this revision: ' + preview.error)
    return (
      <div style={{ ...hintStyle, color: 'var(--color-error, #dc2626)' }} data-draft-revision-invalid>
        {detail}
      </div>
    )
  }
  if (preview.kind === 'same') {
    return (
      <div style={hintStyle} data-draft-revision-same>
        {text('修订正文与当前草稿完全相同，没有可合并的改动。', 'The revision is identical to the current draft, so there is nothing to merge.')}
      </div>
    )
  }

  const delta = preview.stats.afterUnits - preview.stats.beforeUnits
  return (
    <div
      data-draft-revision-preview
      style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}
    >
      <div
        style={{
          padding: '5px 8px',
          fontSize: '0.7rem',
          color: 'var(--color-text-secondary)',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-panel)',
        }}
      >
        {text(
          '修订预览：第 ' + preview.chapterNumber + ' 章（新增 ' + preview.stats.addedLines + ' 段 / 删除 ' + preview.stats.removedLines
            + ' 段；字数 ' + preview.stats.beforeUnits + ' → ' + preview.stats.afterUnits
            + '，' + (delta >= 0 ? '+' : '') + delta + '）',
          'Revision preview: chapter ' + preview.chapterNumber + ' (+' + preview.stats.addedLines + ' / -' + preview.stats.removedLines
            + ' paragraphs; ' + preview.stats.beforeUnits + ' → ' + preview.stats.afterUnits + ' words, ' + (delta >= 0 ? '+' : '') + delta + ')',
        )}
      </div>
      <div
        data-draft-revision-lines
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.68rem',
          lineHeight: 1.5,
          padding: '4px 0',
        }}
      >
        {preview.lines.map((line, index) => {
          if (line.type === 'same') {
            return (
              <div key={index} style={{ padding: '0 8px', color: 'var(--color-text-muted)' }}>
                {text('…（未改动 ' + line.text + ' 段）', '… (' + line.text + ' unchanged paragraphs)')}
              </div>
            )
          }
          const isAdd = line.type === 'add'
          return (
            <div
              key={index}
              data-draft-revision-line={line.type}
              style={{
                padding: '1px 8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: isAdd
                  ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
                  : 'color-mix(in srgb, var(--color-error) 12%, transparent)',
                color: isAdd ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              {(isAdd ? '+ ' : '- ') + line.text}
            </div>
          )
        })}
      </div>
      {preview.stats.hiddenChanges > 0 && (
        <div style={{ padding: '4px 8px', fontSize: '0.68rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
          {text(
            '…还有 ' + preview.stats.hiddenChanges + ' 行改动未显示，请在编辑器里查看完整 diff。',
            '… ' + preview.stats.hiddenChanges + ' more changed lines are hidden; open the editor for the full diff.',
          )}
        </div>
      )}
    </div>
  )
}
