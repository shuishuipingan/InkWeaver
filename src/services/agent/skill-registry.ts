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
    {
      metadata: {
        name: 'prose-polish',
        displayName: '文风打磨',
        description: '用可复核的测量找出口语化重复、句长失衡与副词堆砌，给出逐处修改方案并对比修改前后的数据。',
        whenToUse: '用户要求打磨文笔、去除重复句式、调整节奏时',
        allowedTools: ['analyze_prose_quality', 'read_drafts', 'read_project_state', 'write_file'],
        argumentHint: '章节号或要打磨的段落',
        stages: ['polish', 'review'],
      },
      content: `# 文风打磨

先用测量定位问题，再动笔修改；不要凭感觉声称"文笔变好了"。

## 工作流
1. 用 analyze_prose_quality 分析目标章节（或用户给出的段落），记录基线数据。
2. 用 read_drafts 读取原文，逐条核对测量结果对应的具体位置。
3. 按优先级给出修改方案，每处修改都引用触发它的数据：
   - 句首/短语重复 → 改写重复的开头或句式结构
   - 句长标准差低、平均句长偏高 → 拆句、插入短句制造节奏
   - 副词/模糊词密度高 → 用具体动作或细节替换副词
   - 长句占比过高 → 在语义停顿处断句
4. 修改完成后再次调用 analyze_prose_quality 对比前后数据，明确说明哪些问题已消除、哪些仍在。
5. 需要写入草稿时必须先向用户展示修改方案并等待确认，不要直接覆盖正文。`,
    },
    {
      metadata: {
        name: 'change-propagation',
        displayName: '联动修改',
        description: '一处改动智能牵动全局：先算出会受影响的人物档案、人物状态、章节蓝图、线索与规划资料，再一次性提交联动改动计划由作者确认。',
        whenToUse: '用户要求修改设定、人物、剧情、世界观或任何会牵动多处的内容时',
        allowedTools: ['analyze_change_impact', 'read_architecture', 'read_characters', 'read_blueprint', 'read_drafts', 'read_project_state', 'propose_change_plan'],
        argumentHint: '要改什么、改成什么（例如"把玄真改成隐藏的反派"）',
        stages: ['planning', 'drafting', 'polish'],
      },
      content: `# 联动修改

一处改动往往牵动多处事实。先分析影响，再组织改动链，最后由作者确认执行。

## 工作流
1. 用作者的原话调用 analyze_change_impact，取得影响清单。不要跳过这一步去猜。
2. 逐条判断清单上的对象是否真的需要改，并在计划里为每一项写明因果（reason）：
   - 必须修改：与改动直接冲突的档案字段、状态、蓝图职责
   - 需要复核：依赖旧设定的线索、规划资料、章节钩子
   - 不可自动修改：已定稿正文、定稿交接与知情边界——只向作者说明要在哪里处理（改稿流程 / 故事连续性面板），不要放进计划
3. 用 propose_change_plan 一次性提交计划（summary + items）。可用的条目类型：
   - config：题材、视角、文风、篇幅等作品配置
   - architecture：前提、世界观、剧情概要、核心大纲等架构正文
   - character-profile / character-state：人物档案字段与结构化当前状态
   - blueprint：章节蓝图的标题、职责、关键事件、出场人物、钩子、备注
   - narrative-thread / planning-material：线索规划与候选规划资料
4. 计划里不得包含新角色（必须先走角色候选确认）、不得改写已定稿章节。
5. 作者批准后按依赖顺序写入，并把"已应用/已跳过/失败"的结果如数汇报；未应用的项目要说明原因和下一步。

## 判断原则
- 改动越底层（世界观、前提、题材），需要复核的面越广：先配置与架构，再人物档案与状态，然后蓝图，最后线索与资料。
- 改动只涉及一个人物时，也要检查他的关系、出场章节与相关线索。
- 状态类改动要给出 updatedAtChapter：说明从第几章之后成立。`,
    },
    {
      metadata: {
        name: 'chapter-brief',
        displayName: '章节开写简报',
        description: '开写前把上一章交接、本章职责、该推进的伏笔、出场角色此刻各自知道什么、情绪余波汇总成一份简报。',
        whenToUse: '作者准备开始写某一章、或问「这一章该写什么 / 上一章留了什么」时',
        allowedTools: ['list_chapters', 'read_chapter_handoff', 'read_blueprint', 'read_narrative_threads', 'read_knowledge_events', 'read_story_continuity', 'read_characters', 'read_planning_materials'],
        argumentHint: '章节号',
        stages: ['planning', 'drafting'],
      },
      content: `# 章节开写简报

开写之前先把「之前留下了什么」摆到桌面上：这份简报只汇总读到的既有记录，不替作者发明设定。

## 工作流
1. 用 list_chapters 确认目标章节号与当前进度（哪些章已定稿、哪些章还是草稿），把范围写清楚。
2. 用 read_chapter_handoff 读上一章的交接单：未完成动作、即时目标、情绪状态、待回应问题、场景与视角落点。交接缺失时明确告知作者「没有交接记录」并建议先把上一章定稿，不要凭印象补。
3. 用 read_blueprint 读目标章节与相邻章节的蓝图：本章职责、关键事件、出场角色、钩子，说明它在整条线上的位置。
4. 用 read_narrative_threads 挑出「本章该推进或该回收」的线索：下一目标章节已到、休眠章数偏高、带逾期标记的优先。逐条给出来源章节与最近一次已确认事件。
5. 用 read_knowledge_events 列出本章出场角色此刻各自知道什么（默认只取作者已确认的记录）：避免写出「角色知道了不该知道的事」，也避免重复交代读者早已知道的信息。
6. 用 read_story_continuity 读连续性工作单：上一章留下的情绪余波、读者期待中该章应回应的悬念、视角落点。
7. 按需用 read_characters 与 read_planning_materials 补齐出场角色的当前状态与规划资料。
8. 汇总成一份简报，固定四段：
   - 本章要完成的推进（来自蓝图职责与线索目标）
   - 必须回应的悬念（来自交接的待回应问题与读者期待）
   - 不能违反的已知事实（来自知情边界与连续性工作单）
   - 开写前的待确认项（缺失的记录、相互矛盾之处、需要作者拍板的选择）

## 判断原则
- 简报里每一条都要能指回读到的记录（章节号 / 记录 ID / 交接 ID）；读不到就写「没有记录」，不要用常理补全。
- 「该回收」要说明依据（目标章节已到、逾期标记、休眠章数），不要只给结论。
- 知情边界只写作者已确认的记录；未确认候选默认不进简报，需要时先向作者说明再查。
- 交接缺失、蓝图缺失、工作单为空都要如实说明并给出下一步建议（先定稿上一章 / 先补蓝图），不要跳过。`,
    },
    {
      metadata: {
        name: 'dialogue',
        displayName: '对白打磨',
        description: '用正文检索建立角色的说话基线，再逐处对照当前对白，指出偏离了哪条基线证据并给出替代写法。',
        whenToUse: '作者要打磨对白、觉得某个角色「说话不像他」时',
        allowedTools: ['read_characters', 'read_project_state', 'search_project', 'read_drafts', 'propose_draft_revision'],
        argumentHint: '章节号或要打磨的对白段落',
        stages: ['polish', 'review'],
      },
      content: `# 对白打磨

对白的目标是「像这个人」，不是「更漂亮」。先把角色过往的说话方式立成基线，再逐处对照。

## 工作流
1. 用 read_characters 取目标角色的背景、性格、出身与当前状态；用 read_project_state 确认写作语言与整体文风设定。
2. 用 search_project 检索该角色过往台词：用角色名、称呼、口头禅等关键词多次检索，分别记录命中章节与片段，建立声音基线（用词层级、句长、称呼方式、回避与反问的习惯）。
3. 用 read_drafts 读当前要打磨的章节正文，把对白逐条摘出来。
4. 逐处对照基线，标注偏离点：
   - 用词层级突然抬高或降低（与身份、场合不符）
   - 句长与基线差异明显（一贯简短的人忽然长篇大论）
   - 既有称呼或口头禅丢失，或在不该出现的场合突然出现
   - 回避方式改变（一贯用沉默或转移话题的人忽然直说）
5. 给出逐处修改方案：每处写明「偏离了哪条基线证据（章节号 + 片段）」，给出替代写法与理由。
6. 需要写入正文时用 propose_draft_revision 提交修订提案，并先向作者展示方案等待确认，不要直接覆盖草稿或定稿。

## 判断原则
- 角色刻意改变说话方式（隐忍、伪装、情绪失控、对特定对象切换语气）不算失误：先判断这是叙事意图还是失手，拿不准就问作者。
- 该角色过往台词很少（检索不到或只有一两处）时，明说「样本不足，以下为基于人设的推断」，不要把推断说成结论。
- 不要用「更有文采」当修改理由；每条修改都要能指回基线证据或明确的叙事目的。
- search_project 搜的是本项目正文；若作者把台词记在参考资料里，改用 search_knowledge 并说明口径不同。`,
    },
    {
      metadata: {
        name: 'pacing',
        displayName: '节奏诊断',
        description: '按「该章是否完成蓝图赋予的职责」诊断推进力，标出无推进章、重复功能章、被压缩的转折与线索断层。',
        whenToUse: '作者觉得某段读起来拖或太快、想检查章节推进力时',
        allowedTools: ['list_chapters', 'read_blueprint', 'read_drafts', 'read_story_continuity', 'read_narrative_threads'],
        argumentHint: '章节范围（例如 12-18）或单章号',
        stages: ['review', 'planning'],
      },
      content: `# 节奏诊断

节奏是相对的：铺垫章与喘息章是必要的。判据不是「有没有大事件」，而是「这一章是否完成了蓝图赋予它的职责」。

## 工作流
1. 用 list_chapters 取目标范围与各章状态（有无蓝图、有无草稿、是否定稿），把诊断边界写清楚。
2. 用 read_blueprint 逐章读出职责、关键事件与钩子；用 read_story_continuity 读进入/离开状态与目标—阻碍—选择—后果。两相对照，判断这一章结束时局面是否真的变了。
3. 用 read_drafts 抽查正文，确认蓝图上的职责是否真的落到了正文里（有些章「计划推进」但正文没写）。
4. 用 read_narrative_threads 看线索推进的分布：是否连续多章没有任何线索事件，或所有线索挤在同一章回收。
5. 标出四类问题，每条给出依据（章节号 + 蓝图或工作单原文）：
   - 无推进章：进入状态与离开状态实质相同
   - 重复功能章：连续多章做同一件事（反复赶路、反复试探同一条线索）
   - 被压缩的转折：蓝图标为关键事件，正文却只一句带过
   - 线索断层：该推进的线索长时间无事件，或回收全挤在一起
6. 给出可执行的调整方向：合并、拆分、前移高潮、补一场过渡或余波、给配角线留呼吸位。每条说明改哪一章、为什么、会影响哪些后续章节。

## 判断原则
- 只给建议，不改写正文；涉及已定稿章节时说明「应在哪一章处理」，并提示走改稿流程而不是直接修改。
- 慢不等于坏：判断前先确认该章是否承担铺垫或喘息职责，承担了就如实说明「这一章慢是设计意图」。
- 诊断范围必须写明（第几章到第几章）；跨卷诊断时说明所依据的卷划分。
- 数据不足（缺蓝图或缺连续性工作单）时，明确说清哪些章无法判断，不要用推测把表格填满。`,
    },
    {
      metadata: {
        name: 'thread-audit',
        displayName: '线索审计',
        description: '把规划里的线索状态拿到正文里核对：用正文检索验证「已埋/已回收」是否属实，并写明落差与建议动作。',
        whenToUse: '作者要盘一遍伏笔进度、检查有没有埋了没收或收了没埋的线索时',
        allowedTools: ['read_narrative_threads', 'search_project', 'read_blueprint', 'read_drafts', 'read_story_continuity'],
        argumentHint: '可选：只看某状态或某范围',
        stages: ['planning', 'review'],
      },
      content: `# 线索审计

规划记录会说「已埋」，正文才算数。用正文检索核对每条线索的实际状态，落差要明确写出来。

## 工作流
1. 用 read_narrative_threads 取全部线索与状态（计划中 / 已埋 / 推进中 / 已回收 / 停滞），记录目标区间、休眠章数、逾期标记与最近一次事件。
2. 重点挑出三类：计划中但目标起始章已过、带逾期标记、长期无事件的停滞线索。
3. 用 search_project 在正文里核对该线索的关键词是否真的出现过：拿线索标题、作者意图里的关键物/人名/说法多试几个关键词，记录命中的章节号与片段作为正文证据。
4. 对标记「已回收」的线索同样抽查，确认回收确实落在正文里，并记下落在哪一章。
5. 用 read_blueprint、read_drafts、read_story_continuity 补上下文（相关章节的职责与场景因果），确认落差是否只是表述差异。
6. 输出审计表，每行：线索（ID + 名称）→ 规划状态 → 正文证据（章节号 + 片段摘要）→ 是否存在落差 → 建议动作（推进 / 补埋 / 回收 / 标记停滞 / 保持）。表后逐条说明判断依据。

## 判断原则
- 规划与正文不一致时以正文为准，并明确写出落差是什么，不要两边都含糊。
- 不擅自修改线索状态：需要变更时提示作者到线索面板处理，或另起一次联动改动计划。
- 正文里找不到佐证时写「未在正文中找到佐证」，并列出检索过的关键词，不要脑补。
- 统计口径要写清：本次覆盖的章节范围、检索了多少个关键词、有多少条线索因证据不足无法判定。`,
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
