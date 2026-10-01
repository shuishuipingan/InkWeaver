import { afterEach, expect, it, vi } from 'vitest'
import { useWorkflowStore } from '../workflow-store'
import { useProjectStore } from '../project-store'
import { listWorkflowRecoveryCheckpoints } from '../../shared/workflow-recovery'

afterEach(() => {
  vi.unstubAllGlobals()
  useProjectStore.setState({ currentProject: null })
})

it('checkpoints persisted-effect metadata immediately and retains it when the step fails', async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  const session = { projectId: 'recovery', leaseId: 'recovery-lease', projectPath: 'C:/recovery' }
  useProjectStore.setState({ currentProject: {
    id: session.projectId, path: session.projectPath, sessionLease: session.leaseId,
    name: 'Recovery', novelConfig: {},
  } as never })
  let signalSaved!: () => void
  let releaseStep!: () => void
  const saved = new Promise<void>(resolve => { signalSaved = resolve })
  const blocked = new Promise<void>(resolve => { releaseStep = resolve })
  const completion = useWorkflowStore.getState().startWorkflow({
    runId: 'persisted-effect-run', type: 'batch_generate', title: 'Batch',
    projectPath: session.projectPath, projectSession: session,
    resumeMetadata: { startChapterNumber: 1, chapterCount: 2 },
    steps: [{ name: 'chapter one', description: '', executor: async (_step, _context, callbacks) => {
      callbacks.setResumeMetadata?.({ draftId_1: 42, draftContentHash_1: 'saved-body-hash' })
      signalSaved()
      await blocked
      throw new Error('finalization interrupted')
    } }],
  })
  await saved
  const expected = { startChapterNumber: 1, chapterCount: 2, draftId_1: 42, draftContentHash_1: 'saved-body-hash' }
  const checkpoint = listWorkflowRecoveryCheckpoints(session.projectPath)[0]
  releaseStep()
  await completion
  expect(checkpoint?.resumeMetadata).toEqual(expected)
  expect(listWorkflowRecoveryCheckpoints(session.projectPath)[0]).toMatchObject({
    boundary: 'failed', resumeMetadata: expected,
  })
})
