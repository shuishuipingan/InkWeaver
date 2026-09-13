import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeWithProjectSession = vi.hoisted(() => vi.fn())
vi.mock('../../../ipc-client', () => ({ ipc: { invokeWithProjectSession } }))

import { useProjectStore } from '../../../../stores/project-store'
import { createAgentExecutionContext } from '../project-context'
import { readPlanningMaterialsTool } from '../read-planning-materials.tool'

beforeEach(() => {
  useProjectStore.setState({ currentProject: {
    id: 'project', sessionLease: 'lease', path: 'C:\\novels\\project', name: 'Project', novelConfig: {},
  } as never })
  invokeWithProjectSession.mockReset()
})
describe('read_planning_materials tool', () => {
  it('reads only confirmed planning materials through the frozen project session', async () => {
    invokeWithProjectSession.mockResolvedValue([{
      id: 'material-1', name: '卷一', kind: 'outline', content: '第一卷', status: 'confirmed', contentHash: 'a'.repeat(64),
    }])
    const result = await readPlanningMaterialsTool.execute({}, createAgentExecutionContext('model'))
    expect(result.success).toBe(true)
    expect(result.content).toContain('卷一')
    expect(invokeWithProjectSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project', leaseId: 'lease' }),
      'db:planning-material-list',
      'confirmed',
      'C:\\novels\\project',
    )
  })
})
