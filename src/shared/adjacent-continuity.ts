import type { ChapterHandoffRecord } from './chapter-handoff'

export type AdjacentContinuityCategory =
  | 'scene-jump'
  | 'emotion-reset'
  | 'dialogue-break'
  | 'forgotten-hook'
  | 'repeated-background'

export type AdjacentContinuitySeverity = 'warning' | 'info'
export type LocalRevisionScope = 'opening' | 'transition' | 'ending'

export interface AdjacentContinuityFinding {
  id: string
  category: AdjacentContinuityCategory
  severity: AdjacentContinuitySeverity
  previousEvidence: string
  currentEvidence: string
  explanation: { zhCN: string; enUS: string }
  suggestedScope: LocalRevisionScope
}

export interface AdjacentContinuityInput {
  chapterNumber: number
  currentDraft: string
  previousEnding?: string
  previousHandoff?: Pick<ChapterHandoffRecord,
    'chapterNumber' | 'sceneLocation' | 'viewpoint' | 'unfinishedActions' | 'emotionalState' | 'evidence' | 'transition'>
}

export interface LocalRevisionProposal {
  proposalId: string
  baseDraftId: number
  baseContentHash: string
  scope: LocalRevisionScope
  replacementText: string
  findingIds: string[]
  createdAt: string
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function displayEvidence(value: string, limit = 240): string {
  const trimmed = value.trim()
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`
}

function hasExplicitLocation(text: string, location: string): boolean {
  const candidate = normalize(location)
  if (!candidate) return true
  return normalize(text).includes(candidate)
}

function actionAcknowledged(opening: string, action: string): boolean {
  const normalizedOpening = normalize(opening)
  const normalizedAction = normalize(action)
  if (normalizedAction.length < 3 || normalizedOpening.includes(normalizedAction)) return true
  // Handoff actions often use a lemma (“打开暗锁”) while prose uses an
  // inflected/continued form (“握住暗锁” or “回答了门后的声音”). Keep the
  // concrete object and drop only common action glue words before deciding it
  // was acknowledged.
  const anchor = normalizedAction
    .replace(/(?:打开|开启|回答|回应|继续|完成|处理|寻找|查看|拿起|走向|进入|离开|等待|尝试|告诉|询问|说出|听见|发现|open|answer|continue|finish|find|enter|leave|wait|tell|ask)/giu, '')
  return anchor.length >= 2 && normalizedOpening.includes(anchor)
}

function fingerprint(value: string): string {
  // Browser-safe, non-cryptographic identity. The main process still binds
  // any persisted proposal to its authoritative draft revision.
  let hash = 0xcbf29ce484222325n
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

function firstVisibleText(value: string, limit = 1200): string {
  return value.trim().slice(0, limit)
}

function makeFinding(
  category: AdjacentContinuityCategory,
  previousEvidence: string,
  currentEvidence: string,
  explanation: AdjacentContinuityFinding['explanation'],
  suggestedScope: LocalRevisionScope,
  index: number,
): AdjacentContinuityFinding {
  return {
    id: `adjacent:${category}:${index + 1}`,
    category,
    severity: 'warning',
    previousEvidence: displayEvidence(previousEvidence),
    currentEvidence: displayEvidence(currentEvidence),
    explanation,
    suggestedScope,
  }
}

/**
 * Low-cost adjacent-chapter inspection. It only raises a finding when both
 * sides have concrete evidence; an absent handoff remains an informational
 * “not enough evidence” state rather than a false continuity violation.
 */
export function inspectAdjacentContinuity(input: AdjacentContinuityInput): AdjacentContinuityFinding[] {
  if (!Number.isSafeInteger(input.chapterNumber) || input.chapterNumber < 2) return []
  const opening = firstVisibleText(input.currentDraft)
  if (!opening) return []
  const handoff = input.previousHandoff
  const findings: AdjacentContinuityFinding[] = []

  if (handoff) {
    if (
      handoff.transition === 'continue-scene'
      && handoff.sceneLocation.trim()
      && !hasExplicitLocation(opening, handoff.sceneLocation)
    ) {
      findings.push(makeFinding(
        'scene-jump',
        `第${handoff.chapterNumber}章场景：${handoff.sceneLocation}`,
        opening,
        {
          zhCN: `前章选择“紧接现场”，但本章开头没有承接地点“${handoff.sceneLocation}”的证据。`,
          enUS: `The previous chapter selected an immediate continuation, but the opening does not evidence the handoff location “${handoff.sceneLocation}”.`,
        },
        'opening',
        findings.length,
      ))
    }

    for (const action of handoff.unfinishedActions) {
      if (actionAcknowledged(opening, action)) continue
      findings.push(makeFinding(
        'forgotten-hook',
        action,
        opening,
        {
          zhCN: `前章留下的未完成动作“${action}”尚未在本章开头回应；如要刻意悬置，应给出切线或延后的理由。`,
          enUS: `The unfinished action “${action}” is not acknowledged near this chapter's opening; add a justified cutaway or delay if that is intentional.`,
        },
        'opening',
        findings.length,
      ))
      if (findings.length >= 8) break
    }

    const resetEmotion = /(?:平静下来|毫无波澜|完全忘记|轻松地笑|恢复如常|calm again|without a care|back to normal)/iu
    if (handoff.emotionalState.trim() && resetEmotion.test(opening)) {
      findings.push(makeFinding(
        'emotion-reset',
        `前章情绪：${handoff.emotionalState}`,
        opening,
        {
          zhCN: `本章开头出现快速情绪归零迹象，但前章情绪余波是“${handoff.emotionalState}”。`,
          enUS: `The opening appears to reset the emotional state even though the handoff records “${handoff.emotionalState}”.`,
        },
        'opening',
        findings.length,
      ))
    }

    if (
      handoff.viewpoint.trim()
      && /(?:视角|viewpoint|point of view)/iu.test(handoff.viewpoint)
      && /(?:另一边|与此同时|meanwhile|elsewhere)/iu.test(opening)
      && handoff.unfinishedActions.length > 0
    ) {
      findings.push(makeFinding(
        'dialogue-break',
        `前章视角：${handoff.viewpoint}；未完成动作：${handoff.unfinishedActions[0] ?? ''}`,
        opening,
        {
          zhCN: '本章直接切换视角，但前章对话/动作没有落点；请补充切线锚点或保留原视角的回应。',
          enUS: 'The chapter switches viewpoint before the prior dialogue/action lands; add a cutaway anchor or resolve the original viewpoint first.',
        },
        'transition',
        findings.length,
      ))
    }
  }

  const previousEnding = input.previousEnding?.trim()
  if (previousEnding) {
    const previousFirstSentence = previousEnding.split(/[。！？.!?]/u)[0]?.trim() ?? ''
    if (previousFirstSentence.length >= 18 && normalize(opening).includes(normalize(previousFirstSentence))) {
      findings.push(makeFinding(
        'repeated-background',
        previousFirstSentence,
        opening,
        {
          zhCN: '本章开头重复了前章结尾的完整背景句，可能让连读停顿；保留有意复沓时可标记为作者安排。',
          enUS: 'The opening repeats a complete background sentence from the previous ending, which may interrupt serial reading; keep it only when the repetition is intentional.',
        },
        'opening',
        findings.length,
      ))
    }
  }

  return findings
}

export function createLocalRevisionProposal(input: {
  proposalId: string
  baseDraftId: number
  baseContent: string
  scope: LocalRevisionScope
  replacementText: string
  findingIds: readonly string[]
  createdAt?: string
}): LocalRevisionProposal {
  if (!Number.isSafeInteger(input.baseDraftId) || input.baseDraftId < 1) {
    throw new Error('局部修稿基准草稿无效')
  }
  if (!input.proposalId.trim() || !input.replacementText.trim()) {
    throw new Error('局部修稿 Proposal 不能为空')
  }
  return {
    proposalId: input.proposalId.trim(),
    baseDraftId: input.baseDraftId,
    baseContentHash: fingerprint(input.baseContent),
    scope: input.scope,
    replacementText: input.replacementText.trim(),
    findingIds: [...new Set(input.findingIds.map(id => id.trim()).filter(Boolean))],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export function canApplyLocalRevision(proposal: LocalRevisionProposal, currentContent: string): boolean {
  return fingerprint(currentContent) === proposal.baseContentHash
}

export function localRevisionContentHash(content: string): string {
  return fingerprint(content)
}

export function adjacentFindingsAsReviewItems(
  findings: readonly AdjacentContinuityFinding[],
  locale: 'zh-CN' | 'en-US',
): Array<Record<string, unknown>> {
  return findings.map(finding => ({
    category: locale === 'en-US' ? `Adjacent continuity · ${finding.category}` : `相邻章节衔接 · ${finding.category}`,
    severity: finding.severity,
    stableFactKey: finding.id,
    description: locale === 'en-US' ? finding.explanation.enUS : finding.explanation.zhCN,
    previousEvidence: finding.previousEvidence,
    currentEvidence: finding.currentEvidence,
    suggestedScope: finding.suggestedScope,
  }))
}
