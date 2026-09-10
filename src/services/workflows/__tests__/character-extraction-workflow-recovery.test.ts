import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../ipc-client', () => ({ ipc: { invokeWithProjectSession: ipcMocks.invoke } }))

import { resumeCharacterExtractionWorkflowFromCheckpoint } from '../character-extraction-workflow'
import { textFingerprint } from '../../../shared/character-extraction'

const session = { projectId: 'character-project', leaseId: 'lease-a', projectPath: 'C:\\character-project' } as const
const text = '林墨走进雾港，周砧把旧船票交给了他。'

beforeEach(() => {
  vi.clearAllMocks()
  ipcMocks.invoke.mockImplementation(async (_session, channel: string, ...args: unknown[]) => {
    if (channel === 'db:draft-get-finalized') return { id: 7, chapterNumber: 3, status: 'finalized' }
    if (channel === 'db:draft-get-full') return { id: args[0], content: text }
    throw new Error(`unexpected channel: ${channel}`)
  })
})

describe('character extraction workflow recovery', () => {
  it('reloads the frozen finalized chapter and rebuilds source-bound chunks', async () => {
    const workflow = await resumeCharacterExtractionWorkflowFromCheckpoint({
      schemaVersion: 1,
      runId: 'character-run',
      projectPath: session.projectPath,
      projectSession: session,
      type: 'character_extraction',
      title: '从正文提取人物候选',
      writingLanguage: 'zh-CN',
      uiLocale: 'zh-CN',
      boundary: 'failed',
      currentStepIndex: 0,
      steps: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      resumeMetadata: {
        kind: 'character-extraction',
        sourceId: 'chapter:3:draft:7',
        sourceHash: textFingerprint(text),
        sourceKind: 'chapter',
        chapterNumbersJson: '[3]',
        existingNamesJson: '["林墨"]',
        persistCandidates: true,
      },
    }, session)

    expect(workflow).toMatchObject({ type: 'character_extraction', projectSession: session })
    expect(workflow.steps).toHaveLength(1)
    expect(ipcMocks.invoke).toHaveBeenCalledWith(session, 'db:draft-get-finalized', 3, session.projectPath)
    expect(ipcMocks.invoke).toHaveBeenCalledWith(session, 'db:draft-get-full', 7, session.projectPath)
  })
})
