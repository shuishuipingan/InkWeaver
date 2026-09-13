/** Read author-confirmed planning materials for blueprint and drafting context. */
import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { assertAgentProjectCurrent, requireAgentProject } from './project-context'

export const readPlanningMaterialsTool = buildAgentTool({
  name: 'read_planning_materials',
  description: '读取作者已确认的规划资料（大纲、世界观、人物表、时间线与文风约束）。候选或拒绝资料不会进入结果。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        description: '可选资料类型：premise、outline、world、character、timeline、style、other。',
      },
    },
  },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    try {
      const rows = await ipc.invokeWithProjectSession(
        projectSession,
        'db:planning-material-list',
        'confirmed',
        project.path,
      )
      assertAgentProjectCurrent(context)
      const kind = typeof args.kind === 'string' ? args.kind.trim() : ''
      const filtered = kind ? rows.filter(row => row.kind === kind) : rows
      if (filtered.length === 0) {
        return { success: true, content: '暂无作者已确认的规划资料。' }
      }
      return {
        success: true,
        content: filtered.map(row => `## ${row.name} (${row.kind})\n${row.content}`).join('\n\n---\n\n'),
      }
    } catch (error) {
      return { success: false, content: '', error: `读取规划资料失败：${String(error)}` }
    }
  },
})
