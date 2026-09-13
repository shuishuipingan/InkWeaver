/**
 * Skill 注册中心
 *
 * 管理所有可用的 Skill（基于 SKILL.md 的模块化知识包）。
 * 支持：
 * - 内置 Skill（随 InkWeaver 发布的预设 Skill）
 * - 用户 Skill（用户放在 ~/.vela/skills/ 下的自定义 Skill）
 * - 项目 Skill（放在项目的 .vela/skills/ 下的项目级 Skill）
 *
 * Skill 格式兼容 Cursor 的 SKILL.md 生态。
 */

import { ipc } from '../ipc-client'
import { useProjectStore } from '../../stores/project-store'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectSessionContext,
} from '../../shared/project-session-context'
import { toolRegistry, type AgentExecutionContext, type AgentTool } from './tool-registry'

// ===== 类型定义 =====

/** Skill 来源 */
export type SkillSource = 'builtin' | 'user' | 'project'

/** Workflow stage at which a writing Skill is offered. */
export type WritingSkillStage = 'planning' | 'drafting' | 'review' | 'polish'
export const WRITING_SKILL_STAGES: readonly WritingSkillStage[] = [
  'planning', 'drafting', 'review', 'polish',
]

/** Skill 元数据（从 SKILL.md frontmatter 解析） */
export interface SkillMetadata {
  /** Skill 唯一名称 */
  name: string
  /** 显示名称 */
  displayName?: string
  /** 功能描述 */
  description: string
  /** 使用场景（用于 Agent 自动匹配） */
  whenToUse?: string
  /** 版本 */
  version?: string
  /** 允许的工具列表（白名单） */
  allowedTools?: string[]
  /** 参数提示 */
  argumentHint?: string
  /** 是否可由模型自动调用 */
  userInvocable?: boolean
  /** Stages in which the Skill is selectable; missing means all stages for legacy Skills. */
  stages?: WritingSkillStage[]
}

/** 加载后的 Skill */
export interface LoadedSkill {
  /** 元数据 */
  metadata: SkillMetadata
  /** Skill 内容（Markdown 提示词） */
  content: string
  /** 来源 */
  source: SkillSource
  /** 文件所在目录 */
  baseDir: string
  /** SKILL.md 文件路径 */
  filePath: string
  /** 项目级 Skill 必须绑定其加载时的完整项目 lease。 */
  projectSession?: ProjectSessionContext
}

// ===== Skill Registry =====

class SkillRegistryImpl {
  private skills: Map<string, LoadedSkill> = new Map()
  private loadSequence = 0

  /** 注册一个 Skill */
  register(skill: LoadedSkill): void {
    this.skills.set(skill.metadata.name, skill)
  }

  /** 查找 Skill */
  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name)
  }

  /** 列出所有 Skill */
  listAll(): LoadedSkill[] {
    return Array.from(this.skills.values())
  }

  /** 按来源列出 */
  listBySource(source: SkillSource): LoadedSkill[] {
    return this.listAll().filter(s => s.source === source)
  }

  /** List only Skills explicitly applicable to a writing stage. */
  listForStage(stage: WritingSkillStage): LoadedSkill[] {
    return this.listAll().filter(skill => !skill.metadata.stages || skill.metadata.stages.includes(stage))
  }

  /** Skill 数量 */
  get size(): number {
    return this.skills.size
  }

  /** Install a user Skill as an independent package through the fixed app-data IPC boundary. */
  async installUserSkill(content: string): Promise<LoadedSkill> {
    const parsed = parseSkillMarkdown(content, '', 'user', '', '')
    const name = parsed?.metadata.name ?? ''
    if (!parsed || !isSafeSkillName(name) || !hasExplicitSkillManifest(content)) {
      throw new Error('Skill manifest is invalid: name, description, and a closed frontmatter block are required')
    }
    const result = await ipc.invoke('skills:install-user', name, content)
    if (!result.success) throw new Error(result.error ?? 'Skill installation failed')
    await this.loadAll()
    return parsed
  }

  /** Remove a user Skill without exposing its filesystem path to the renderer. */
  async removeUserSkill(name: string): Promise<{ success: boolean; error?: string }> {
    if (!isSafeSkillName(name)) throw new Error('Skill name is invalid')
    const result = await ipc.invoke('skills:remove-user', name)
    if (result.success) await this.loadAll()
    return result
  }

  /** 清空 */
  clear(): void {
    this.skills.clear()
  }

  /** 从主进程管理的用户 Skill 目录加载，渲染进程不接触 VELA_HOME 路径。 */
  private async loadUserSkills(loadSequence: number): Promise<number> {
    let count = 0
    try {
      const entries = await ipc.invoke('skills:list-user')
      for (const entry of entries) {
        if (loadSequence !== this.loadSequence) return count
        const skill = parseSkillMd(entry.content, entry.name, 'user', entry.baseDir, entry.filePath)
        if (!skill) continue
        this.register(skill)
        count++
      }
    } catch {
      // 用户目录不可用时不影响内置或项目 Skill。
    }
    return count
  }

  /**
   * 从当前项目边界内加载 Skills。
   *
   * 项目路径仍须通过项目会话在主进程重新校验。
   */
  private async loadProjectSkills(
    dir: string,
    projectPath: string,
    projectSession: ProjectSessionContext,
    loadSequence: number,
  ): Promise<number> {
    let count = 0
    try {
      const entries = await ipc.invokeWithProjectSession(
        projectSession,
        'fs:list-dir',
        dir,
        projectPath,
      )
      if (
        loadSequence !== this.loadSequence
        || !sameProjectSessionContext(
          projectSession,
          projectSessionContextFromProject(useProjectStore.getState().currentProject),
        )
      ) return count
      for (const entry of entries) {
        if (
          loadSequence !== this.loadSequence
          || !sameProjectSessionContext(
            projectSession,
            projectSessionContextFromProject(useProjectStore.getState().currentProject),
          )
        ) return count
        if (!entry.isDir) continue

        const skillFile = `${entry.path}/SKILL.md`
        try {
          const result = await ipc.invokeWithProjectSession(
            projectSession,
            'fs:read-file',
            skillFile,
            projectPath,
          )
          if (
            loadSequence !== this.loadSequence
            || !sameProjectSessionContext(
              projectSession,
              projectSessionContextFromProject(useProjectStore.getState().currentProject),
            )
          ) return count
          if (!result.success) continue

          const skill = parseSkillMd(
            result.content,
            entry.name,
            'project',
            entry.path,
            skillFile,
            projectSession,
          )
          if (skill) {
            this.register(skill)
            count++
          }
        } catch {
          // 单个 Skill 加载失败不影响整体
        }
      }
    } catch {
      // 目录不存在等情况，静默处理
    }
    return count
  }

  /**
   * 加载所有 Skill（内置 + 用户 + 项目）
   */
  async loadAll(): Promise<void> {
    const loadSequence = ++this.loadSequence
    const projectSession = projectSessionContextFromProject(
      useProjectStore.getState().currentProject,
    )
    this.clear()

    // 注册内置 Skill
    registerBuiltinSkills(this)

    // 用户 Skill 路径只能由主进程的固定应用数据服务访问。
    const userCount = await this.loadUserSkills(loadSequence)
    if (loadSequence !== this.loadSequence) return
    if (userCount > 0) {
      console.log(`[Skills] 加载了 ${userCount} 个用户 Skill`)
    }

    // 加载项目 Skill（项目/.vela/skills/）
    if (
      projectSession
      && sameProjectSessionContext(
        projectSession,
        projectSessionContextFromProject(useProjectStore.getState().currentProject),
      )
    ) {
      const projectSkillsDir = `${projectSession.projectPath}/.vela/skills`
      const projectCount = await this.loadProjectSkills(
        projectSkillsDir,
        projectSession.projectPath,
        projectSession,
        loadSequence,
      )
      if (loadSequence !== this.loadSequence) return
      if (projectCount > 0) {
        console.log(`[Skills] 加载了 ${projectCount} 个项目 Skill`)
      }
    }

    // 将所有 Skill 注册为 Agent Tool
    this.registerToToolRegistry()

    console.log(`[Skills] 共加载 ${this.size} 个 Skill`)
  }

  /**
   * 将 Skill 注册为 Agent Tool
   */
  private registerToToolRegistry(): void {
    // 先清理旧的 Skill Tool
    toolRegistry.unregisterBySource('skill')

    for (const skill of this.listAll()) {
      const agentTool: AgentTool = {
        name: `skill__${skill.metadata.name}`,
        description: skill.metadata.description + (skill.metadata.whenToUse ? ` — ${skill.metadata.whenToUse}` : ''),
        source: 'skill',
        inputSchema: {
          type: 'object',
          properties: {
            args: {
              type: 'string',
              description: skill.metadata.argumentHint ?? '可选的参数',
            },
          },
        },
        requiresConfirmation: false,
        isReadOnly: true,
        userFacingName: skill.metadata.displayName ?? skill.metadata.name,
        execute: async (toolArgs, context?: AgentExecutionContext) => {
          if (
            skill.projectSession
            && !sameProjectSessionContext(skill.projectSession, context?.projectSession)
          ) {
            return {
              success: false,
              content: '',
              error: '项目 Skill 的加载会话已失效，请重新加载当前项目 Skill',
            }
          }
          const userArgs = (toolArgs.args as string) ?? ''
          // 变量替换
          let content = skill.content
          if (userArgs) {
            content = content.replace(/\$\{args\}/g, userArgs)
            content = content.replace(/\$1/g, userArgs)
          }
          content = content.replace(/\$\{SKILL_DIR\}/g, skill.baseDir)

          return {
            success: true,
            content: `[Skill: ${skill.metadata.displayName ?? skill.metadata.name}]\n\n${content}`,
          }
        },
      }
      toolRegistry.register(agentTool)
    }
  }
}

/** 全局 Skill 注册中心 */
export const skillRegistry = new SkillRegistryImpl()

// ===== SKILL.md 解析 =====

/**
 * 解析 SKILL.md 文件内容
 *
 * 格式：
 * ```
 * ---
 * name: skill-name
 * description: 功能描述
 * when_to_use: 什么时候使用
 * allowed-tools: [read_file, search_knowledge]
 * ---
 *
 * # Skill 提示词内容
 * ...
 * ```
 */
export function parseSkillMarkdown(
  raw: string,
  fallbackName: string,
  source: SkillSource,
  baseDir: string,
  filePath: string,
  projectSession?: ProjectSessionContext,
): LoadedSkill | null {
  // 解析 frontmatter
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  const frontmatter: Record<string, unknown> = {}
  let content = raw

  if (fmMatch) {
    const fmText = fmMatch[1]
    content = raw.slice(fmMatch[0].length)

    // 简单的 YAML 解析（支持 key: value 和 key: [items]）
    for (const line of fmText.split('\n')) {
      const kvMatch = line.match(/^\s*([^:]+):\s*(.*)$/)
      if (!kvMatch) continue
      const key = kvMatch[1].trim()
      let val: unknown = kvMatch[2].trim()

      // 解析数组 [a, b, c]
      if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      }
      // 解析布尔值
      if (val === 'true') val = true
      if (val === 'false') val = false

      frontmatter[key] = val
    }
  }

  const rawStages = frontmatter['stages'] ?? frontmatter['stage']
  const stageValues = rawStages === undefined
    ? undefined
    : (Array.isArray(rawStages) ? rawStages : String(rawStages).split(/[\s,]+/u))
      .map(value => String(value).trim().toLowerCase())
      .filter(Boolean)
  if (stageValues && (
    stageValues.length === 0
    || stageValues.some(value => !WRITING_SKILL_STAGES.includes(value as WritingSkillStage))
  )) return null

  const metadata: SkillMetadata = {
    name: (frontmatter['name'] as string) || fallbackName,
    displayName: frontmatter['display_name'] as string,
    description: (frontmatter['description'] as string) || `Skill: ${fallbackName}`,
    whenToUse: frontmatter['when_to_use'] as string,
    version: frontmatter['version'] as string,
    allowedTools: frontmatter['allowed-tools'] as string[],
    argumentHint: frontmatter['argument-hint'] as string,
    userInvocable: frontmatter['user-invocable'] !== false,
    ...(stageValues ? { stages: stageValues as WritingSkillStage[] } : {}),
  }

  return {
    metadata,
    content: content.trim(),
    source,
    baseDir,
    filePath,
    projectSession,
  }
}

// Keep the old private name as a local alias for call sites in this module;
// external consumers use the explicit parser export above.
const parseSkillMd = parseSkillMarkdown

const SAFE_SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

function isSafeSkillName(name: string): boolean {
  return SAFE_SKILL_NAME.test(name) && name !== '.' && name !== '..'
}

function hasExplicitSkillManifest(raw: string): boolean {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u)
  if (!match) return false
  const fields = new Map<string, string>()
  for (const line of match[1]!.split('\n')) {
    const field = line.match(/^\s*([^:]+):\s*(.*?)\s*$/u)
    if (field) fields.set(field[1]!.trim(), field[2]!.trim())
  }
  return Boolean(fields.get('name') && fields.get('description'))
}

// ===== 内置 Skills =====

function registerBuiltinSkills(registry: SkillRegistryImpl): void {
  const builtins: Array<{ metadata: SkillMetadata; content: string }> = [
    {
      metadata: {
        name: 'review-chapter',
        displayName: '章节审阅',
        description: '对指定章节进行全面的质量审阅，包括剧情逻辑、角色一致性、节奏感、伏笔呼应等多个维度。',
        whenToUse: '用户要求审阅、检查、评估某个章节时',
        stages: ['review'],
      },
      content: `# 章节审阅

请对目标章节进行专业的小说审阅。依次检查以下维度：

## 1. 剧情逻辑
- 情节是否连贯，有无逻辑矛盾
- 因果关系是否成立

## 2. 角色一致性
- 角色行为是否符合既定性格
- 对话风格是否一致

## 3. 节奏感
- 张弛是否有度
- 是否有不必要的拖沓或过于仓促的转折

## 4. 伏笔与呼应
- 已有伏笔是否得到了回应
- 新埋的伏笔是否自然

## 5. 文笔与风格
- 描写是否生动
- 是否符合整体文风设定

请先使用 read_drafts 工具读取目标章节，再使用 read_architecture 读取故事架构进行对比评估。
输出格式：每个维度评分（1-5星）+ 详细说明 + 修改建议。`,
    },
    {
      metadata: {
        name: 'brainstorm',
        displayName: '脑暴创意',
        description: '针对指定话题进行创意脑暴，生成多个创意方向和灵感。',
        whenToUse: '用户要求头脑风暴、找灵感、想创意时',
        stages: ['planning'],
      },
      content: `# 创意脑暴

请围绕用户给出的话题进行专业的创意脑暴。

## 输出格式
为每个创意方向提供：
1. **创意概念**（一句话）
2. **详细展开**（100-200 字）
3. **可行性评估**（高/中/低）
4. **与已有剧情的融合度**

请先使用 read_architecture 和 read_project_state 了解项目背景，确保创意与现有设定不矛盾。
至少提供 5 个不同方向的创意。`,
    },
    {
      metadata: {
        name: 'character-analysis',
        displayName: '角色分析',
        description: '深入分析指定角色的性格、动机、角色弧、人物关系等。',
        whenToUse: '用户想深入了解或调整角色设定时',
        stages: ['planning', 'review'],
      },
      content: `# 角色深度分析

请对目标角色进行全方位的深度分析。

## 分析维度
1. **核心性格特质** — MBTI、大五人格倾向
2. **深层动机** — 驱动角色行动的核心诉求
3. **角色弧预测** — 基于当前设定推演角色成长轨迹
4. **关系网络** — 与其他角色的关系图谱
5. **冲突点** — 角色面临的核心矛盾和困境
6. **独特标识** — 口头禅、习惯动作、标志性特征

请先使用 read_characters 读取角色卡，以及 read_architecture 了解故事结构。`,
    },
    {
      metadata: {
        name: 'continuity-check',
        displayName: '连续性检查',
        description: '检查小说中的设定一致性和连续性问题，发现矛盾和遗漏。',
        whenToUse: '用户想检查设定有没有矛盾、是否有不一致的地方时',
        stages: ['review'],
      },
      content: `# 连续性与一致性检查

请对项目进行全面的连续性检查。

## 检查项
1. **时间线一致性** — 事件发生顺序是否合理
2. **地理一致性** — 地点描述是否前后一致
3. **角色状态** — 角色的伤病、装备、能力等是否正确追踪
4. **设定遵守** — 是否与世界观设定产生矛盾
5. **伏笔追踪** — 哪些伏笔已回收，哪些待回收

请使用 list_chapters 了解进度，使用 read_architecture 获取设定，逐章检查关键节点。
输出为表格形式，标注问题严重程度（🔴严重 / 🟡注意 / 🟢正常）。`,
    },
    {
      metadata: {
        name: 'writing-coach',
        displayName: '写作教练',
        description: '提供专业的写作技巧指导和文笔改善建议。',
        whenToUse: '用户想提高写作水平、求教写作技巧时',
        stages: ['drafting', 'polish'],
      },
      content: `# 写作教练

作为专业的写作教练，为用户提供针对性的指导。

## 指导范围
- 叙述技巧（视角运用、时间线处理）
- 描写技法（环境渲染、人物刻画）
- 对话写作（个性化对话、潜台词运用）
- 节奏控制（场景切换、留白技巧）
- 悬念设置（钩子、反转、暗线）

请先使用 read_project_state 了解项目的写作风格设定，
再根据用户的具体问题提供定制化建议，并附上示例对比。`,
    },
  ]

  for (const { metadata, content } of builtins) {
    registry.register({
      metadata,
      content,
      source: 'builtin',
      baseDir: '',
      filePath: `builtin://${metadata.name}`,
    })
  }
}
