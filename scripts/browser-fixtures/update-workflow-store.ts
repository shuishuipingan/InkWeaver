import { create } from 'zustand'

/**
 * The update-card browser harness only needs the active-run projection. The
 * production workflow store imports every workflow command and generation
 * adapter, which makes an isolated Vite fixture spend minutes compiling code
 * that this interaction never exercises. Keep the fixture's state contract
 * deliberately small while preserving the Zustand API used by the component
 * and the harness.
 */
export type WorkflowStatus = 'running' | 'paused' | 'waiting' | 'completed' | 'failed'

export interface UpdateWorkflowRun {
  id: string
  type: 'chapter_creation'
  title: string
  status: WorkflowStatus
  steps: Array<{
    id: string
    name: string
    description: string
    status: 'running' | 'completed'
    logs: unknown[]
  }>
  currentStepIndex: number
  createdAt: string
}

interface UpdateWorkflowState {
  activeRuns: UpdateWorkflowRun[]
  currentRun: UpdateWorkflowRun | null
}

export const useWorkflowStore = create<UpdateWorkflowState>(() => ({
  activeRuns: [],
  currentRun: null,
}))
