import { afterEach, describe, expect, it } from 'vitest'

import { parseSkillMarkdown, skillRegistry } from '../skill-registry'
import { getAllSlashCommands } from '../intent-router'

describe('stage-aware writing skills', () => {
  afterEach(() => skillRegistry.clear())

  it('parses a writing stage list and filters skills by planning/drafting/review/polish', () => {
    const skill = parseSkillMarkdown(`---
name: scene-craft
description: Build a scene beat by beat.
stage: [planning, drafting]
---

Use the selected stage.`, 'fallback', 'user', '/skills/scene-craft', '/skills/scene-craft/SKILL.md')

    expect(skill?.metadata.stages).toEqual(['planning', 'drafting'])
    skillRegistry.register(skill!)
    expect(skillRegistry.listForStage('planning').map(item => item.metadata.name)).toEqual(['scene-craft'])
    expect(skillRegistry.listForStage('drafting').map(item => item.metadata.name)).toEqual(['scene-craft'])
    expect(skillRegistry.listForStage('review')).toEqual([])
    expect(getAllSlashCommands('review').some(command => command.name === 'scene-craft')).toBe(false)
    expect(getAllSlashCommands('drafting').some(command => command.name === 'scene-craft')).toBe(true)
  })

  it('rejects an unknown stage instead of making an invalid skill selectable', () => {
    expect(parseSkillMarkdown(`---
name: broken
description: invalid
stage: publishing
---
`, 'fallback', 'user', '/skills/broken', '/skills/broken/SKILL.md')).toBeNull()
  })
})
