import type { ProjectSessionContext } from '../../shared/ipc-channels'
import type { WritingLanguage } from '../../shared/writing-language'
import {
  mergeCharacterExtractionCandidates,
  parseCharacterExtractionResponse,
  type CharacterExtractionCandidate,
  type CharacterExtractionChunk,
  type CharacterExtractionSource,
  planCharacterExtractionChunks,
  textFingerprint,
} from '../../shared/character-extraction'
import { BaseWorkflowCommand, type CommandExecuteParams, type WorkflowGenerationRuntimeDependencies } from './commands/base-command'
import { ipc } from '../ipc-client'
import { requireIpcSuccess } from '../ipc-result'
import { requireWorkflowProjectSession, workflowWritingLanguage } from './workflow-project-session'
import { workflowResourceKey, type WorkflowContext, type WorkflowDefinition, type StepCallbacks } from '../../stores/workflow-store'
import { canResumeWorkflowCheckpoint, type WorkflowRecoveryCheckpoint } from '../../shared/workflow-recovery'

export interface CharacterExtractionWorkflowParams {
  projectPath: string
  projectSession: ProjectSessionContext
  source: CharacterExtractionSource
  chunks: readonly CharacterExtractionChunk[]
  existingNames: readonly string[]
  persistCandidates?: boolean
}

/** Rebuild a chapter-bound extraction from the finalized draft authority. */
export async function resumeCharacterExtractionWorkflowFromCheckpoint(
  checkpoint: WorkflowRecoveryCheckpoint,
  currentSession: ProjectSessionContext,
): Promise<WorkflowDefinition> {
  if (checkpoint.type !== 'character_extraction' || checkpoint.resumeMetadata?.kind !== 'character-extraction') {
    throw new Error('该恢复收据不是人物提取工作流，不能由人物提取恢复入口处理')
  }
  if (!canResumeWorkflowCheckpoint(checkpoint, currentSession)) {
    throw new Error('恢复收据所属项目会话已变化，已拒绝继续人物提取')
  }
  const metadata = checkpoint.resumeMetadata
  if (metadata.sourceKind !== 'chapter' || typeof metadata.sourceId !== 'string' || typeof metadata.sourceHash !== 'string') {
    throw new Error('人物提取恢复收据缺少章节来源指纹')
  }
  const match = /^chapter:(\d+):draft:(\d+)$/u.exec(metadata.sourceId)
  const chapterNumber = Number(match?.[1])
  const draftId = Number(match?.[2])
  if (!match || !Number.isSafeInteger(chapterNumber) || !Number.isSafeInteger(draftId)) {
    throw new Error('人物提取恢复收据来源 ID 无效')
  }
  const chapterNumbers = parseNumberArray(metadata.chapterNumbersJson)
  const existingNames = parseStringArray(metadata.existingNamesJson)
  if (chapterNumbers.length !== 1 || chapterNumbers[0] !== chapterNumber) {
    throw new Error('人物提取恢复收据章节范围无效')
  }
  const finalized = await ipc.invokeWithProjectSession(
    currentSession, 'db:draft-get-finalized', chapterNumber, currentSession.projectPath,
  )
  if (!finalized || finalized.id !== draftId) throw new Error('人物提取来源定稿已变化，不能恢复')
  const full = await ipc.invokeWithProjectSession(
    currentSession, 'db:draft-get-full', draftId, currentSession.projectPath,
  ) as { content?: string } | null
  if (!full?.content || textFingerprint(full.content) !== metadata.sourceHash) {
    throw new Error('人物提取来源正文指纹已变化，不能恢复')
  }
  const source: CharacterExtractionSource = {
    sourceId: metadata.sourceId,
    sourceHash: metadata.sourceHash,
    kind: 'chapter',
    chapterNumbers,
  }
  return createCharacterExtractionWorkflow({
    projectPath: currentSession.projectPath,
    projectSession: currentSession,
    source,
    chunks: planCharacterExtractionChunks(full.content, {
      sourceId: source.sourceId,
      kind: source.kind,
      chapterNumbers: source.chapterNumbers,
    }),
    existingNames,
    persistCandidates: metadata.persistCandidates === true,
  })
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string') throw new Error('人物提取恢复收据列表参数缺失')
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) throw new Error('invalid list')
    return parsed
  } catch {
    throw new Error('人物提取恢复收据列表参数无效')
  }
}

function parseNumberArray(value: unknown): number[] {
  if (typeof value !== 'string') throw new Error('人物提取恢复收据章节列表缺失')
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed) || !parsed.every(item => Number.isSafeInteger(item) && item >= 1)) throw new Error('invalid chapters')
    return parsed
  } catch {
    throw new Error('人物提取恢复收据章节列表无效')
  }
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
      '只返回 {"characters":[...]}。每个角色包含 name、aliases、role、fields、currentState、relationships、evidence。fields、currentState 和 relationships 只填写正文明确支持的内容；每个填写的字段或关系必须在 evidence 中有逐字证据。未知字段留空，不要推测，不要把传闻、梦境或回忆当成已确认事实。',
      'Return only {"characters":[...]}. Each character contains name, aliases, role, fields, currentState, relationships, and evidence. Fill stable fields, currentState, and relationships only when the text explicitly supports them; every filled field or relationship must have a verbatim evidence item. Leave unknown fields empty, do not infer, and do not treat rumors, dreams, or flashbacks as confirmed facts.',
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

export function createCharacterExtractionWorkflow(
  params: CharacterExtractionWorkflowParams,
): WorkflowDefinition {
  return {
    type: 'character_extraction',
    projectPath: params.projectPath,
    projectSession: params.projectSession,
    resumeMetadata: {
      kind: 'character-extraction',
      sourceId: params.source.sourceId,
      sourceHash: params.source.sourceHash,
      sourceKind: params.source.kind,
      chapterNumbersJson: JSON.stringify(params.source.chapterNumbers),
      existingNamesJson: JSON.stringify(params.existingNames),
      persistCandidates: params.persistCandidates === true,
    },
    resourceKeys: [],
    readResourceKeys: [
      workflowResourceKey('character-roster'),
      ...params.source.chapterNumbers.map(chapter => workflowResourceKey('chapter', chapter)),
    ],
    title: '从正文提取人物候选',
    steps: [{
      name: '提取人物候选',
      description: '逐块读取正文并生成带证据的人物资料候选',
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        const candidates = await new CharacterExtractionWorkflowCommand(params).execute({ step, context, callbacks })
        return `已生成 ${candidates.length} 个待审核人物候选`
      },
    }],
  }
}
