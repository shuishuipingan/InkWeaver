export const STORY_CONTINUITY_SCHEMA_VERSION = 1 as const

export type StoryContinuityStatus = 'planned' | 'candidate' | 'confirmed' | 'observed'
export type ReaderExpectationStatus = 'open' | 'progressing' | 'resolved' | 'abandoned'

export interface SceneBeat {
  id: string
  sceneNumber: number
  status: StoryContinuityStatus
  entryState: string
  goal: string
  obstacle: string
  choice: string
  consequence: string
  exitState: string
  evidence: string[]
}

export interface SceneCausalityGap {
  sceneId: string
  sceneNumber: number
  missing: Array<'consequence' | 'exitState'>
}

export interface ArcContribution {
  volume: string
  mainline: string
  subplots: string[]
  characterArcs: string[]
  turningPoint: string
  cost: string
  unresolvedQuestions: string[]
}

export interface EmotionalCarryOver {
  character: string
  previousState: string
  trigger: string
  choice: string
  cost: string
  nextState: string
  evidence: string[]
}

export interface ReaderExpectation {
  id: string
  question: string
  introducedChapter: number
  expectedProgress: string
  dueChapter?: number
  status: ReaderExpectationStatus
  delayReason: string
  evidence: string[]
}

export interface ViewpointThread {
  viewpoint: string
  lastChapter: number
  unresolvedHooks: string[]
  readerKnowledge: string
  nextLanding: string
}

export interface StoryContinuityDocument {
  schemaVersion: typeof STORY_CONTINUITY_SCHEMA_VERSION
  chapterNumber: number
  revision: number
  sceneBeats: SceneBeat[]
  arcContribution: ArcContribution
  emotionalCarryOver: EmotionalCarryOver[]
  readerExpectations: ReaderExpectation[]
  viewpointThreads: ViewpointThread[]
}

function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || value.trim().length > max) throw new Error(`${label}无效`)
  return value.trim()
}

function list(value: unknown, label: string, maxItems: number, maxText = 500): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label}无效`)
  return [...new Set(value.map(item => text(item, `${label}条目`, maxText)).filter(Boolean))]
}

function positiveInt(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${label}无效`)
  return value as number
}

function normalizeScene(value: unknown, index: number): SceneBeat {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`场景卡${index + 1}无效`)
  const record = value as Record<string, unknown>
  const status = record.status
  if (!['planned', 'candidate', 'confirmed', 'observed'].includes(String(status))) throw new Error(`场景卡${index + 1}状态无效`)
  return {
    id: text(record.id, `场景卡${index + 1} ID`, 120),
    sceneNumber: positiveInt(record.sceneNumber, `场景卡${index + 1}序号`),
    status: status as StoryContinuityStatus,
    entryState: text(record.entryState, '场景进入状态'),
    goal: text(record.goal, '场景目标'),
    obstacle: text(record.obstacle, '场景阻碍'),
    choice: text(record.choice, '场景选择'),
    consequence: text(record.consequence, '场景后果'),
    exitState: text(record.exitState, '场景离开状态'),
    evidence: list(record.evidence ?? [], '场景证据', 8, 300),
  }
}

function normalizeArc(value: unknown): ArcContribution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('卷级推进记录无效')
  const record = value as Record<string, unknown>
  return {
    volume: text(record.volume, '卷名', 160),
    mainline: text(record.mainline, '主线贡献'),
    subplots: list(record.subplots ?? [], '支线贡献', 12),
    characterArcs: list(record.characterArcs ?? [], '人物弧贡献', 12),
    turningPoint: text(record.turningPoint, '转折', 500),
    cost: text(record.cost, '代价'),
    unresolvedQuestions: list(record.unresolvedQuestions ?? [], '卷级待回应问题', 12),
  }
}

function normalizeEmotion(value: unknown, index: number): EmotionalCarryOver {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`情绪记录${index + 1}无效`)
  const record = value as Record<string, unknown>
  return {
    character: text(record.character, '情绪人物', 120),
    previousState: text(record.previousState, '前置情绪'),
    trigger: text(record.trigger, '情绪触发'),
    choice: text(record.choice, '情绪选择'),
    cost: text(record.cost, '情绪代价'),
    nextState: text(record.nextState, '后续状态'),
    evidence: list(record.evidence ?? [], '情绪证据', 8, 300),
  }
}

function normalizeExpectation(value: unknown, index: number): ReaderExpectation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`读者期待${index + 1}无效`)
  const record = value as Record<string, unknown>
  const status = record.status
  if (!['open', 'progressing', 'resolved', 'abandoned'].includes(String(status))) throw new Error(`读者期待${index + 1}状态无效`)
  const dueChapter = record.dueChapter === undefined ? undefined : positiveInt(record.dueChapter, '期待期限')
  return {
    id: text(record.id, '期待 ID', 120),
    question: text(record.question, '期待问题'),
    introducedChapter: positiveInt(record.introducedChapter, '期待提出章节'),
    expectedProgress: text(record.expectedProgress, '期待推进'),
    ...(dueChapter === undefined ? {} : { dueChapter }),
    status: status as ReaderExpectationStatus,
    delayReason: text(record.delayReason, '期待延后理由'),
    evidence: list(record.evidence ?? [], '期待证据', 8, 300),
  }
}

function normalizeViewpoint(value: unknown, index: number): ViewpointThread {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`视角线索${index + 1}无效`)
  const record = value as Record<string, unknown>
  return {
    viewpoint: text(record.viewpoint, '视角人物', 120),
    lastChapter: positiveInt(record.lastChapter, '视角最后章节'),
    unresolvedHooks: list(record.unresolvedHooks ?? [], '视角未解钩子', 12),
    readerKnowledge: text(record.readerKnowledge, '读者已知信息'),
    nextLanding: text(record.nextLanding, '视角下次落点'),
  }
}

export function emptyStoryContinuityDocument(chapterNumber: number): StoryContinuityDocument {
  if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) throw new Error('章节号无效')
  return {
    schemaVersion: STORY_CONTINUITY_SCHEMA_VERSION,
    chapterNumber,
    revision: 0,
    sceneBeats: [],
    arcContribution: {
      volume: '', mainline: '', subplots: [], characterArcs: [], turningPoint: '', cost: '', unresolvedQuestions: [],
    },
    emotionalCarryOver: [],
    readerExpectations: [],
    viewpointThreads: [],
  }
}

/**
 * Suggest scene cards from finalized prose without inferring story facts.
 *
 * Paragraph grouping is deliberately mechanical: the only durable evidence
 * produced here is a short excerpt copied from the manuscript, and every
 * field that would require semantic judgment stays empty for the author to
 * complete. The result is always `candidate`, never `confirmed` or `observed`.
 */
export function suggestSceneCandidatesFromText(content: string, maxScenes = 12): SceneBeat[] {
  if (typeof content !== 'string' || content.trim() === '' || !Number.isSafeInteger(maxScenes) || maxScenes < 1) return []
  const paragraphs = content
    .split(/\r?\n\s*\r?\n/gu)
    .map(paragraph => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(paragraph => paragraph.length >= 12)
  if (paragraphs.length === 0) return []
  const sceneCount = Math.min(maxScenes, paragraphs.length)
  const groupSize = Math.max(1, Math.ceil(paragraphs.length / sceneCount))
  const scenes: SceneBeat[] = []
  for (let start = 0; start < paragraphs.length && scenes.length < maxScenes; start += groupSize) {
    const evidence = paragraphs.slice(start, start + groupSize).join(' ').slice(0, 320).trim()
    if (!evidence) continue
    const sceneNumber = scenes.length + 1
    scenes.push({
      id: `scene-candidate-${sceneNumber}-${evidence.slice(0, 24).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}`,
      sceneNumber,
      status: 'candidate',
      entryState: '',
      goal: '',
      obstacle: '',
      choice: '',
      consequence: '',
      exitState: '',
      evidence: [evidence],
    })
  }
  return scenes
}

export function normalizeStoryContinuityDocument(value: unknown, chapterNumber: number): StoryContinuityDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('章节连续性文档无效')
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== STORY_CONTINUITY_SCHEMA_VERSION || record.chapterNumber !== chapterNumber) {
    throw new Error('章节连续性文档版本或章节号无效')
  }
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 0) throw new Error('章节连续性 revision 无效')
  if (!Array.isArray(record.sceneBeats) || record.sceneBeats.length > 30) throw new Error('场景卡数量无效')
  if (!Array.isArray(record.emotionalCarryOver) || record.emotionalCarryOver.length > 30) throw new Error('情绪记录数量无效')
  if (!Array.isArray(record.readerExpectations) || record.readerExpectations.length > 30) throw new Error('读者期待数量无效')
  if (!Array.isArray(record.viewpointThreads) || record.viewpointThreads.length > 20) throw new Error('视角线索数量无效')
  return {
    schemaVersion: STORY_CONTINUITY_SCHEMA_VERSION,
    chapterNumber,
    revision: record.revision as number,
    sceneBeats: record.sceneBeats.map(normalizeScene),
    arcContribution: normalizeArc(record.arcContribution),
    emotionalCarryOver: record.emotionalCarryOver.map(normalizeEmotion),
    readerExpectations: record.readerExpectations.map(normalizeExpectation),
    viewpointThreads: record.viewpointThreads.map(normalizeViewpoint),
  }
}

export function storyContinuityProgress(document: StoryContinuityDocument): {
  sceneConsequences: number
  activeExpectations: number
  viewpointHooks: number
} {
  return {
    sceneConsequences: document.sceneBeats.filter(scene => scene.consequence.trim().length > 0).length,
    activeExpectations: document.readerExpectations.filter(item => item.status === 'open' || item.status === 'progressing').length,
    viewpointHooks: document.viewpointThreads.reduce((total, thread) => total + thread.unresolvedHooks.length, 0),
  }
}

/**
 * Finds author-reviewable gaps in scenes that are already confirmed or
 * observed. Planned/candidate scenes are intentionally ignored because their
 * causal fields may still be blank by design.
 */
export function findSceneCausalityGaps(document: StoryContinuityDocument): SceneCausalityGap[] {
  return document.sceneBeats
    .filter(scene => scene.status === 'confirmed' || scene.status === 'observed')
    .map(scene => ({
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber,
      missing: [
        ...(scene.consequence.trim() ? [] : ['consequence' as const]),
        ...(scene.exitState.trim() ? [] : ['exitState' as const]),
      ],
    }))
    .filter(gap => gap.missing.length > 0)
}
