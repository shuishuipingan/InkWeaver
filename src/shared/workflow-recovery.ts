import type { ProjectSessionContext } from './ipc-channels'
import type { Locale } from '../i18n/types'
import type { WritingLanguage } from './writing-language'

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
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, WorkflowRecoveryCheckpoint>
    raw[checkpoint.runId] = checkpoint
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
  } catch { /* recovery metadata must never break the workflow */ }
}

export function listWorkflowRecoveryCheckpoints(projectPath?: string): WorkflowRecoveryCheckpoint[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, WorkflowRecoveryCheckpoint>
    return Object.values(raw).filter(item => !projectPath || item.projectPath === projectPath)
  } catch { return [] }
}

export function clearWorkflowRecoveryCheckpoint(runId: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, WorkflowRecoveryCheckpoint>
    delete raw[runId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
  } catch { /* best effort */ }
}
