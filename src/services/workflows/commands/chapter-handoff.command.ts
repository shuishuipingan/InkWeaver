import { createHash } from 'node:crypto'

import { BaseWorkflowCommand, type CommandExecuteParams } from './base-command'
import { ipc } from '../../ipc-client'
import { requireIpcSuccess } from '../../ipc-result'
import {
  normalizeChapterHandoffCandidate,
  type ChapterHandoffSourceIdentity,
} from '../../../shared/chapter-handoff'
import type { ChapterHandoffRecord } from '../../../shared/chapter-handoff'
import type { WritingLanguage } from '../../../shared/writing-language'
import { requireWorkflowProjectSession, workflowWritingLanguage } from '../workflow-project-session'

const HANDOFF_CONTEXT_MAX_CHARS = 16_000

export interface ChapterHandoffPromptInput {
  chapterNumber: number
  chapterTitle: string
  content: string
  chapterEntities: readonly string[]
  writingLanguage: WritingLanguage
}

export interface GenerateChapterHandoffParams extends ChapterHandoffPromptInput {
  projectPath: string
  draftId: number
}

function boundedContent(content: string): string {
  if (content.length <= HANDOFF_CONTEXT_MAX_CHARS) return content
  const head = content.slice(0, 2_000)
  const tail = content.slice(-14_000)
  return `${head}\n\n[...中间正文已省略，仅用于控制提取输入... ]\n\n${tail}`
}

export function buildChapterHandoffPrompt(input: ChapterHandoffPromptInput): string {
  const entities = input.chapterEntities.length > 0
    ? input.chapterEntities.join('、')
    : input.writingLanguage === 'en-US' ? '(none)' : '（无）'
  const content = boundedContent(input.content)
  if (input.writingLanguage === 'en-US') {
    return [
      '[Complete chapter handoff record]',
      `Chapter: ${input.chapterNumber} — ${input.chapterTitle}`,
      `Known chapter characters: ${entities}`,
      'Read the ending scene and return exactly one JSON object with these fields:',
      'sceneLocation, viewpoint, presentCharacters, unfinishedActions, immediateGoal, emotionalState, constraints, openQuestions, transition, evidence.',
      'transition must be one of: continue-scene, time-jump, location-change, viewpoint-change, flashback, parallel-event.',
      'Every evidence item must be copied word-for-word from the chapter. Do not invent facts that do not appear in the text.',
      'The record must describe where the story stops, not summarize the whole chapter. Keep unresolved actions and emotional consequences concrete.',
      'Chapter text:',
      content,
    ].join('\n\n')
  }
  return [
    '【完整章节交接记录】',
    `章节：第${input.chapterNumber}章《${input.chapterTitle}》`,
    `本章已知角色：${entities}`,
    '阅读章节结尾，严格只返回一个 JSON 对象，字段必须完整包含：',
    'sceneLocation、viewpoint、presentCharacters、unfinishedActions、immediateGoal、emotionalState、constraints、openQuestions、transition、evidence。',
    'transition 只能是：continue-scene、time-jump、location-change、viewpoint-change、flashback、parallel-event。',
    '必须逐字摘录正文证据。不得编造正文没有出现的事实。',
    '记录故事停在哪里，不要概括整章；未完成动作和情绪后果必须具体。',
    '章节正文：',
    content,
  ].join('\n\n')
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/```json?\s*/giu, '').replace(/```/gu, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('章节交接模型输出不是 JSON 对象')
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown
}

export function parseChapterHandoffCompletion(
  text: string,
  source: ChapterHandoffSourceIdentity,
) {
  return normalizeChapterHandoffCandidate(parseJsonObject(text), source)
}

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export class GenerateChapterHandoffCommand extends BaseWorkflowCommand<string> {
  constructor(private readonly params: GenerateChapterHandoffParams) {
    super()
  }

  async execute({ context, callbacks }: CommandExecuteParams): Promise<string> {
    const projectSession = requireWorkflowProjectSession(context)
    const writingLanguage = workflowWritingLanguage(context)
    const source: ChapterHandoffSourceIdentity = {
      handoffId: `chapter-handoff-${context.runId}-${this.params.chapterNumber}`,
      draftId: this.params.draftId,
      chapterNumber: this.params.chapterNumber,
      sourceContentHash: contentHash(this.params.content),
    }
    const raw = await this.callLLM(
      buildChapterHandoffPrompt({ ...this.params, writingLanguage }),
      writingLanguage === 'en-US'
        ? 'You extract evidence-backed chapter handoffs for a long-form fiction editor. Return only the requested JSON object.'
        : '你负责为长篇小说编辑器提取有正文证据的章节交接记录。只返回要求的 JSON 对象。',
      callbacks,
      {
        purpose: 'chapter-handoff',
        reasoningStage: 'review',
        responseFormat: { type: 'json_object' },
      },
      context,
    )
    const candidate = parseChapterHandoffCompletion(raw, source)
    const result = await ipc.invokeWithProjectSession(
      projectSession,
      'db:chapter-handoff-save-candidate',
      candidate,
      this.params.projectPath,
    )
    requireIpcSuccess(result, '保存章节交接候选')
    const handoff = result.handoff as ChapterHandoffRecord | undefined
    context.data.chapterHandoff = handoff ?? candidate
    callbacks.log(writingLanguage === 'en-US'
      ? 'Chapter handoff candidate saved for author confirmation.'
      : '章节交接候选已保存，等待作者确认。')
    return writingLanguage === 'en-US'
      ? 'Chapter handoff candidate saved.'
      : '章节交接候选已保存。'
  }
}
