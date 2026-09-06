import type { ProjectSessionContext } from '../../shared/ipc-channels'
import type { WritingLanguage } from '../../shared/writing-language'
import {
  mergeCharacterExtractionCandidates,
  parseCharacterExtractionResponse,
  type CharacterExtractionCandidate,
  type CharacterExtractionChunk,
  type CharacterExtractionSource,
} from '../../shared/character-extraction'
import { BaseWorkflowCommand, type CommandExecuteParams, type WorkflowGenerationRuntimeDependencies } from './commands/base-command'
import { ipc } from '../ipc-client'
import { requireIpcSuccess } from '../ipc-result'
import { requireWorkflowProjectSession, workflowWritingLanguage } from './workflow-project-session'

export interface CharacterExtractionWorkflowParams {
  projectPath: string
  projectSession: ProjectSessionContext
  source: CharacterExtractionSource
  chunks: readonly CharacterExtractionChunk[]
  existingNames: readonly string[]
  persistCandidates?: boolean
}

function promptLanguage(language: WritingLanguage, zh: string, en: string): string {
  return language === 'en-US' ? en : zh
}

export function buildCharacterExtractionPrompt(
  chunk: CharacterExtractionChunk,
  source: CharacterExtractionSource,
  existingNames: readonly string[],
  language: WritingLanguage,
): string {
  const existing = existingNames.length > 0 ? existingNames.join('、') : promptLanguage(language, '（暂无已知角色）', '(no known characters)')
  return [
    promptLanguage(language, '【结构化人物候选提取】', '[Structured character candidate extraction]'),
    promptLanguage(language, `来源 ${source.sourceId}，分块 ${chunk.index + 1}，已知角色：${existing}`, `Source ${source.sourceId}, chunk ${chunk.index + 1}, known characters: ${existing}`),
    promptLanguage(
      language,
      '只返回 {"characters":[...]}。每个角色包含 name、aliases、role、fields、currentState、evidence。fields 只填写正文明确支持的稳定资料；currentState 只填写正文明确支持的当前状态；每个填写的字段必须在 evidence 中有逐字证据。未知字段留空，不要推测，不要把传闻、梦境或回忆当成已确认事实。',
      'Return only {"characters":[...]}. Each character contains name, aliases, role, fields, currentState, and evidence. Fill stable fields and currentState only when the text explicitly supports them; every filled field must have a verbatim evidence item. Leave unknown fields empty, do not infer, and do not treat rumors, dreams, or flashbacks as confirmed facts.',
    ),
    promptLanguage(language, '章节正文分块：', 'Chapter text chunk:'),
    chunk.text,
  ].join('\n\n')
}

export class CharacterExtractionWorkflowCommand extends BaseWorkflowCommand<CharacterExtractionCandidate[]> {
  constructor(
    private readonly params: CharacterExtractionWorkflowParams,
    generationDependencies?: WorkflowGenerationRuntimeDependencies,
  ) {
    super(generationDependencies)
  }

  async execute({ context, callbacks }: CommandExecuteParams): Promise<CharacterExtractionCandidate[]> {
    return this.executeWithGenerationRuntime('structured', { step: {}, context, callbacks }, async () => {
      const session = requireWorkflowProjectSession(context)
      if (session.projectPath !== this.params.projectSession.projectPath || this.params.projectPath !== context.projectPath) {
        throw new Error('人物提取项目会话与来源不匹配')
      }
      const language = workflowWritingLanguage(context)
      const candidates: CharacterExtractionCandidate[] = []
      for (const [index, chunk] of this.params.chunks.entries()) {
        this.assertNotCancelled(context)
        callbacks.setProgress(Math.round((index / Math.max(this.params.chunks.length, 1)) * 90))
        const raw = await this.callLLM(
          buildCharacterExtractionPrompt(chunk, this.params.source, this.params.existingNames, language),
          promptLanguage(
            language,
            '你是长篇小说资料整理助手。只提取有正文证据的人物候选，不写入数据库。',
            'You extract evidence-backed fiction character candidates. Do not write to the database.',
          ),
          callbacks,
          {
            purpose: 'character-extraction',
            reasoningStage: 'review',
            responseFormat: { type: 'json_object' },
          },
          context,
        )
        candidates.push(...parseCharacterExtractionResponse(raw, this.params.source, this.params.existingNames))
      }
      const merged = mergeCharacterExtractionCandidates(candidates)
      if (this.params.persistCandidates && merged.length > 0) {
        const persisted = await ipc.invokeWithProjectSession(
          session,
          'db:character-extraction-candidates-save',
          merged,
          this.params.projectPath,
        )
        requireIpcSuccess(persisted, '保存人物提取候选')
      }
      callbacks.setProgress(100)
      context.data.characterExtractionCandidates = merged
      return merged
    })
  }
}
