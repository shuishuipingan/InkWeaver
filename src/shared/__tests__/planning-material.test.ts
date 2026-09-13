import { describe, expect, it } from 'vitest'

import {
  createPlanningMaterialInput,
  PLANNING_MATERIAL_KINDS,
  type PlanningMaterialKind,
} from '../planning-material'

describe('planning material contract', () => {
  it('normalizes a planning material and computes a stable content hash', async () => {
    const value = await createPlanningMaterialInput({
      name: '卷一大纲',
      kind: 'outline',
      content: '  第一卷：潮汐城。  ',
      sourceDisplayName: 'volume-one.md',
    })

    expect(value).toMatchObject({
      name: '卷一大纲',
      kind: 'outline',
      content: '第一卷：潮汐城。',
      sourceDisplayName: 'volume-one.md',
      sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    })
  })

  it('rejects unsupported kinds and empty content', async () => {
    expect(PLANNING_MATERIAL_KINDS).toContain('timeline')
    await expect(createPlanningMaterialInput({ name: 'x', kind: 'unknown' as PlanningMaterialKind, content: 'x' }))
      .rejects.toThrow()
    await expect(createPlanningMaterialInput({ name: 'x', kind: 'outline', content: '   ' }))
      .rejects.toThrow()
  })
})
