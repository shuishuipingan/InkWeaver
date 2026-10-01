import type { ProjectSessionContext } from './ipc-channels'
import type { Locale } from '../i18n/types'
import type { WritingLanguage } from './writing-language'
import { isProjectSessionContext } from './project-session-context'

export const WORKFLOW_RECOVERY_SCHEMA_VERSION = 1 as const
export type WorkflowRecoveryBoundary = 'started' | 'step-completed' | 'paused' | 'failed' | 'cancelled' | 'completed'
export type WorkflowRecoveryMetadata = Readonly<Record<string, string | number | boolean>>

export interface WorkflowRecoveryStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  progress?: number
  failureCode?: string
}

export interface WorkflowRecoveryCheckpoint {
  schemaVersion: typeof WORKFLOW_RECOVERY_SCHEMA_VERSION
  runId: string
  projectPath: string
  projectSession: ProjectSessionContext
  type: string
  title: string
  writingLanguage: WritingLanguage
  uiLocale: Locale
  boundary: WorkflowRecoveryBoundary
  currentStepIndex: number
  steps: WorkflowRecoveryStep[]
  createdAt: string
  updatedAt: string
  /** JSON-safe frozen inputs owned by a workflow-specific resume factory. */
  resumeMetadata?: WorkflowRecoveryMetadata
}

const STORAGE_KEY = 'inkweaver.workflow-recovery.v1'

function isStoredCheckpoint(value: unknown): value is WorkflowRecoveryCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const metadata = row.resumeMetadata
  return row.schemaVersion === WORKFLOW_RECOVERY_SCHEMA_VERSION
    && typeof row.runId === 'string' && row.runId.length > 0
    && typeof row.projectPath === 'string'
    && isProjectSessionContext(row.projectSession)
    && typeof row.type === 'string' && typeof row.title === 'string'
    && ['zh-CN', 'en-US'].includes(String(row.writingLanguage))
    && ['zh-CN', 'en-US'].includes(String(row.uiLocale))
    && ['started', 'step-completed', 'paused', 'failed', 'cancelled', 'completed'].includes(String(row.boundary))
    && Number.isSafeInteger(row.currentStepIndex) && Number(row.currentStepIndex) >= 0
    && typeof row.createdAt === 'string' && typeof row.updatedAt === 'string'
    && Array.isArray(row.steps) && row.steps.every(step => (
      step && typeof step === 'object'
      && typeof step.id === 'string' && typeof step.name === 'string'
      && ['pending', 'running', 'completed', 'failed', 'skipped'].includes(step.status)
      && (step.progress === undefined || (typeof step.progress === 'number' && Number.isFinite(step.progress)))
      && (step.failureCode === undefined || typeof step.failureCode === 'string')
    ))
    && (metadata === undefined || (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
      && Object.values(metadata).every(item => typeof item === 'string' || typeof item === 'boolean'
        || (typeof item === 'number' && Number.isFinite(item)))))
}

function readStoredCheckpoints(): Record<string, WorkflowRecoveryCheckpoint> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.values(raw).filter(isStoredCheckpoint).map(row => [row.runId, row]))
  } catch { return {} }
}

export function checkpointFromRun(run: {
  id: string
  projectPath: string
  projectSession: ProjectSessionContext | null
  type: string
  title: string
  writingLanguage: WritingLanguage
  uiLocale: Locale
  status: string
  currentStepIndex: number
  steps: readonly WorkflowRecoveryStep[]
  createdAt: string
  completedAt?: string
  resumeMetadata?: WorkflowRecoveryMetadata
}, boundary: WorkflowRecoveryBoundary, now = new Date().toISOString()): WorkflowRecoveryCheckpoint | null {
  if (!run.projectSession) return null
  return {
    schemaVersion: WORKFLOW_RECOVERY_SCHEMA_VERSION,
    runId: run.id,
    projectPath: run.projectPath,
    projectSession: run.projectSession,
    type: run.type,
    title: run.title,
    writingLanguage: run.writingLanguage,
    uiLocale: run.uiLocale,
    boundary,
    currentStepIndex: run.currentStepIndex,
    steps: run.steps.map(step => ({
      id: step.id,
      name: step.name,
      status: step.status,
      ...(step.progress === undefined ? {} : { progress: step.progress }),
      ...(step.failureCode ? { failureCode: step.failureCode } : {}),
    })),
    createdAt: run.createdAt,
    updatedAt: now,
    ...(run.resumeMetadata ? { resumeMetadata: { ...run.resumeMetadata } } : {}),
  }
}

export function canResumeWorkflowCheckpoint(checkpoint: WorkflowRecoveryCheckpoint, currentSession: ProjectSessionContext): boolean {
  return checkpoint.schemaVersion === WORKFLOW_RECOVERY_SCHEMA_VERSION
    && checkpoint.projectSession.projectId === currentSession.projectId
    && checkpoint.projectSession.leaseId === currentSession.leaseId
    && checkpoint.projectSession.projectPath === currentSession.projectPath
    && checkpoint.projectPath === currentSession.projectPath
    && ['started', 'step-completed', 'paused', 'failed', 'cancelled'].includes(checkpoint.boundary)
}

export function saveWorkflowRecoveryCheckpoint(checkpoint: WorkflowRecoveryCheckpoint): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = readStoredCheckpoints()
    raw[checkpoint.runId] = checkpoint
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
  } catch { /* recovery metadata must never break the workflow */ }
}

export function listWorkflowRecoveryCheckpoints(projectPath?: string): WorkflowRecoveryCheckpoint[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = readStoredCheckpoints()
    return Object.values(raw).filter(item => !projectPath || item.projectPath === projectPath)
  } catch { return [] }
}

export function clearWorkflowRecoveryCheckpoint(runId: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = readStoredCheckpoints()
    delete raw[runId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
  } catch { /* best effort */ }
}
