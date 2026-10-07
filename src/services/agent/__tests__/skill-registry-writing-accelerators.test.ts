import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { WRITING_SKILL_STAGES, skillRegistry } from '../skill-registry'
import { toolRegistry } from '../tool-registry'
import { builtinTools } from '../tools'
import { getAllSlashCommands } from '../intent-router'

const NEW_SKILLS = ['chapter-brief', 'dialogue', 'pacing', 'thread-audit']
const LEGACY_SKILLS = [
  'review-chapter', 'brainstorm', 'character-analysis', 'continuity-check',
  'writing-coach', 'prose-polish', 'change-propagation',
]

const registeredTools: string[] = []

// 内置技能只在 loadAll() 注册（loadAll 会先 clear 再注册内置 + 用户 + 项目技能）。
beforeAll(async () => {
  await skillRegistry.loadAll()
})

function registerTools(): void {
  toolRegistry.registerAll(builtinTools)
  registeredTools.push(...builtinTools.map(tool => tool.name))
}

afterEach(() => {
  for (const name of registeredTools.splice(0)) toolRegistry.unregister(name)
})

describe('writing accelerator skills', () => {
  it('registers four new builtin skills beside the seven existing ones', () => {
    const names = skillRegistry.listAll().map(skill => skill.metadata.name)
    for (const name of NEW_SKILLS) expect(names).toContain(name)
    for (const name of LEGACY_SKILLS) expect(names).toContain(name)
    expect(skillRegistry.listAll()).toHaveLength(11)
    expect(skillRegistry.listBySource('builtin')).toHaveLength(11)
  })

  it('declares complete metadata and a real workflow for every new skill', () => {
    for (const name of NEW_SKILLS) {
      const skill = skillRegistry.get(name)
      expect(skill, name + ' 必须已注册').toBeDefined()
      const metadata = skill!.metadata
      expect(metadata.name).toBe(name)
      expect(metadata.displayName?.trim() ?? '').not.toBe('')
      expect(metadata.description.trim().length).toBeGreaterThan(20)
      expect(metadata.whenToUse?.trim() ?? '').not.toBe('')
      expect(metadata.argumentHint?.trim() ?? '').not.toBe('')
      expect(Array.isArray(metadata.allowedTools) && metadata.allowedTools.length > 0).toBe(true)
      expect(Array.isArray(metadata.stages) && metadata.stages.length > 0).toBe(true)
      // 技能必须是可执行工作流，不是人设文案。
      expect(skill!.content).toContain('## 工作流')
      expect(skill!.content).toContain('## 判断原则')
      expect(skill!.content.split('\n').filter(line => /^\d+\. /.test(line)).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('only whitelists tools that actually exist in the registry', () => {
    registerTools()
    const missing: string[] = []
    for (const name of NEW_SKILLS) {
      for (const toolName of skillRegistry.get(name)!.metadata.allowedTools ?? []) {
        if (!toolRegistry.get(toolName)) missing.push(name + ' -> ' + toolName)
      }
    }
    expect(missing).toEqual([])
  })

  it('uses only legal writing stages', () => {
    for (const name of NEW_SKILLS) {
      const stages = skillRegistry.get(name)!.metadata.stages ?? []
      expect(stages.length).toBeGreaterThan(0)
      for (const stage of stages) expect(WRITING_SKILL_STAGES).toContain(stage)
    }
  })

  it('exposes the new skills as slash commands in their declared stages', () => {
    const all = getAllSlashCommands().map(command => command.name)
    for (const name of NEW_SKILLS) expect(all).toContain(name)
    expect(getAllSlashCommands('planning').map(command => command.name)).toContain('chapter-brief')
    expect(getAllSlashCommands('drafting').map(command => command.name)).toContain('chapter-brief')
    expect(getAllSlashCommands('polish').map(command => command.name)).toContain('dialogue')
    expect(getAllSlashCommands('review').map(command => command.name)).toContain('pacing')
    expect(getAllSlashCommands('review').map(command => command.name)).toContain('thread-audit')
  })

  it('leaves the seven existing skills untouched', () => {
    const prosePolish = skillRegistry.get('prose-polish')!
    expect(prosePolish.metadata.allowedTools).toEqual([
      'analyze_prose_quality', 'read_drafts', 'read_project_state', 'write_file',
    ])
    expect(prosePolish.metadata.stages).toEqual(['polish', 'review'])
    expect(prosePolish.content).toContain('不要凭感觉声称')
    expect(prosePolish.content).toContain('需要写入草稿时必须先向用户展示修改方案并等待确认')

    const changePropagation = skillRegistry.get('change-propagation')!
    expect(changePropagation.metadata.stages).toEqual(['planning', 'drafting', 'polish'])
    expect(changePropagation.content).toContain('不要跳过这一步去猜')
    expect(changePropagation.content).toContain('不可自动修改')

    expect(skillRegistry.get('review-chapter')!.metadata.stages).toEqual(['review'])
    expect(skillRegistry.get('brainstorm')!.metadata.stages).toEqual(['planning'])
    expect(skillRegistry.get('character-analysis')!.metadata.stages).toEqual(['planning', 'review'])
    expect(skillRegistry.get('continuity-check')!.metadata.stages).toEqual(['review'])
    expect(skillRegistry.get('writing-coach')!.metadata.stages).toEqual(['drafting', 'polish'])
  })

  it('keeps the safety boundary in the new writing-path skill', () => {
    const dialogue = skillRegistry.get('dialogue')!
    expect(dialogue.content).toContain('propose_draft_revision')
    expect(dialogue.content).toContain('不要直接覆盖草稿或定稿')
    expect(dialogue.metadata.allowedTools).toContain('propose_draft_revision')
    const brief = skillRegistry.get('chapter-brief')!
    expect(brief.content).toContain('没有记录')
    const audit = skillRegistry.get('thread-audit')!
    expect(audit.content).toContain('以正文为准')
  })
})
