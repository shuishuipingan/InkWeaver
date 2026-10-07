/**
 * 章节交接的提示词与解析辅助。
 *
 * 这里原本还有一个 `GenerateChapterHandoffCommand` 命令类：它全仓零引用，且调
 * `this.callLLM` 却不进入 GenerationRuntime（被 task-106 的运行时入口契约抓到）。
 * 章节交接的生产路径其实在 finalize-chapter.command.ts（它正确调用
 * executeWithGenerationRuntime），所以那个类在 task-107 直接删除；
 * 本文件只保留 finalize 复用的纯辅助函数。
 */
import {
  normalizeChapterHandoffCandidate,
  type ChapterHandoffSourceIdentity,
} from '../../../shared/chapter-handoff'
import type { WritingLanguage } from '../../../shared/writing-language'

const HANDOFF_CONTEXT_MAX_CHARS = 16_000

export interface ChapterHandoffPromptInput {
  chapterNumber: number
  chapterTitle: string
  content: string
  chapterEntities: readonly string[]
  writingLanguage: WritingLanguage
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
      'presentCharacters, unfinishedActions, constraints and openQuestions must be string arrays (at most 12 items). evidence must be a nonempty string array of 1–8 exact quotations, each at most 500 characters. Other text fields are nonempty strings of at most 500 characters. Do not return evidence objects, explanations, or the omitted-text marker.',
      '{"sceneLocation":"...","viewpoint":"...","presentCharacters":[],"unfinishedActions":[],"immediateGoal":"...","emotionalState":"...","constraints":[],"openQuestions":[],"transition":"continue-scene","evidence":["exact quotation from the chapter"]}',
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
    'presentCharacters、unfinishedActions、constraints、openQuestions 必须是字符串数组，每项最多 12 条。evidence 必须是非空字符串数组，含 1–8 段逐字引文，每段不超过 500 字符；其他文本字段为非空字符串，最多 500 字符。证据不要使用对象或解释，也不要引用正文省略标记。',
    '{"sceneLocation":"地点","viewpoint":"视角人物","presentCharacters":[],"unfinishedActions":[],"immediateGoal":"当前目标","emotionalState":"当前情绪","constraints":[],"openQuestions":[],"transition":"continue-scene","evidence":["正文逐字引文"]}',
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
  const value = parseJsonObject(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return normalizeChapterHandoffCandidate(value, source)
  }
  const row = value as Record<string, unknown>
  const evidence = typeof row.evidence === 'string' ? [row.evidence] : row.evidence
  return normalizeChapterHandoffCandidate({
    ...row,
    evidence: Array.isArray(evidence) ? evidence.map(item => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        // Only an explicit quotation is admissible. A rationale is not evidence.
        return (item as Record<string, unknown>).quote
      }
      return item
    }) : evidence,
  }, source)
}

