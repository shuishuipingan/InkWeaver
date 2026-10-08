import { describe, expect, it, vi } from 'vitest'

import { findBlueprintContinuityRisks, findMissingCharacterStateFindings, mergeConsistencyFindingsIntoReview } from '../consistency-preflight'

// 服务层的接线也要有护栏：豁免从 IPC 读出来后必须真的被传进去，
// 否则「保存安排」会写库却从不被读取——这正是「开始创作点不动」的成因。
const ipcMock = vi.hoisted(() => ({ invokeWithProjectSession: vi.fn() }))
vi.mock('../../services/ipc-client', () => ({ ipc: ipcMock }))
import { readConsistencyPreflight } from '../../services/consistency-preflight'

describe('findBlueprintContinuityRisks', () => {
  const projection = [{
    draftId: 7,
    chapterNumber: 1,
    chapterTitle: '午夜怀表',
    chapterNotes: '银色怀表仍待调查。',
    facts: [{
      category: 'character-state' as const,
      entities: ['顾舟'],
      statement: '顾舟已经死亡。',
      sourceChapter: 1,
      evidence: '表盖内侧刻着一组陌生坐标。',
    }],
  }]

  it('returns a stable sourced finding when a terminal character is scheduled to appear', () => {
    const findings = findBlueprintContinuityRisks(projection, {
      chapterNumber: 2,
      title: '新的清晨',
      role: '发展',
      purpose: '主角拜访证人',
      keyEvents: '主角前往车站。',
      characters: ['林岚', '顾舟'],
      suspenseHook: '证人突然失踪。',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toEqual([expect.objectContaining({
      stableFactKey: expect.stringMatching(/^fact:[0-9a-f]{16}$/u),
      severity: 'warning',
      sourceChapter: 1,
      evidence: '表盖内侧刻着一组陌生坐标。',
    })])
    expect(findings[0]?.issue.zhCN).toContain('顾舟')
    expect(findings[0]?.issue.enUS).toContain('顾舟')
  })

  it('reports the named terminal subject instead of another entity or a witness', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      chapterNumber: 4,
      facts: [{
        category: 'character-state' as const,
        entities: ['林舟', '林海'],
        statement: '[结果] 林海死亡，U盘与证据落入林舟手中',
        sourceChapter: 4,
        evidence: '林海留下证据后死亡。',
      }, {
        category: 'character-state' as const,
        entities: ['林舟'],
        statement: '| 林舟 | 接收U盘与钥匙，目睹父亲死亡后逃脱 |',
        sourceChapter: 4,
        evidence: '林舟目睹父亲死亡。',
      }],
    }], {
      chapterNumber: 5,
      title: '回声中的证人',
      role: '收束',
      purpose: '出席听证会',
      keyEvents: '林海亲自现身。',
      characters: ['林舟', '苏遥', '林海'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('林海')
    expect(findings[0]?.issue.zhCN).not.toContain('“林舟”')
  })

  it('does not report an omitted open thread and suppresses only active stable-key exemptions', () => {
    const openThreadProjection = [{ ...projection[0]!, facts: [{
      category: 'open-thread' as const, entities: ['银色怀表'], statement: '坐标尚未解释。',
      sourceChapter: 1, evidence: '表盖内侧刻着坐标。',
    }] }]
    const continued = findBlueprintContinuityRisks(openThreadProjection, {
      chapterNumber: 2,
      title: '怀表坐标',
      role: '发展',
      purpose: '调查银色怀表',
      keyEvents: '林岚解读坐标。',
      characters: ['林岚'],
      suspenseHook: '坐标指向旧码头。',
      userGuidance: '',
      notes: '',
    }, [])
    expect(continued).toEqual([])

    const ignored = findBlueprintContinuityRisks(projection, {
      chapterNumber: 2,
      title: '新的清晨', role: '发展', purpose: '拜访证人', keyEvents: '前往车站',
      characters: ['林岚', '顾舟'], suspenseHook: '证人失踪', userGuidance: '', notes: '',
    }, [{ stableFactKey: findBlueprintContinuityRisks(projection, {
      chapterNumber: 2, title: '重逢', role: '发展', purpose: '顾舟归来', keyEvents: '顾舟敲门',
      characters: ['顾舟'], suspenseHook: '', userGuidance: '', notes: '',
    }, [])[0]!.stableFactKey, reason: '回忆场景', revoked: false }])
    expect(ignored).toEqual([])
  })

  it('reports an explicit finalized location that conflicts with the current blueprint', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      facts: [{
        category: 'character-state' as const,
        entities: ['顾舟'],
        statement: '顾舟位于旧码头，正在等待接头人。',
        sourceChapter: 1,
        evidence: '顾舟站在旧码头的雨棚下。',
      }],
    }], {
      chapterNumber: 2,
      title: '车站重逢',
      role: '发展',
      purpose: '顾舟等待接头',
      keyEvents: '顾舟在中央车站等待接头人。',
      characters: ['顾舟'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('地点')
    expect(findings[0]?.evidence).toContain('旧码头')
  })

  it('matches location predicates followed by a line break', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      facts: [{
        category: 'character-state' as const,
        entities: ['顾舟'],
        statement: '顾舟位于\n旧码头，等待接头人。',
        sourceChapter: 1,
        evidence: '顾舟站在旧码头的雨棚下。',
      }],
    }], {
      chapterNumber: 2,
      title: '车站重逢',
      role: '发展',
      purpose: '顾舟等待接头',
      keyEvents: '顾舟在\n中央车站等待接头人。',
      characters: ['顾舟'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('地点冲突')
  })

  it('reports an explicit item ownership conflict between finalized facts and a blueprint', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      facts: [{
        category: 'character-state' as const,
        entities: ['林舟'],
        statement: '林舟持有红色钥匙。',
        sourceChapter: 1,
        evidence: '林舟把红色钥匙收进口袋。',
      }],
    }], {
      chapterNumber: 2,
      title: '钥匙易主',
      role: '发展',
      purpose: '沈月寻找钥匙',
      keyEvents: '沈月拿着红色钥匙走进车站。',
      characters: ['林舟', '沈月'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('红色钥匙')
    expect(findings[0]?.issue.zhCN).toContain('归属')
  })

  it('matches held-item predicates followed by a line break', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      facts: [{
        category: 'character-state' as const,
        entities: ['林舟'],
        statement: '林舟持有\n红色钥匙。',
        sourceChapter: 1,
        evidence: '林舟把红色钥匙收进口袋。',
      }],
    }], {
      chapterNumber: 2,
      title: '钥匙易主',
      role: '发展',
      purpose: '沈月寻找钥匙',
      keyEvents: '沈月拿着\n红色钥匙走进车站。',
      characters: ['林舟', '沈月'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('物品归属冲突')
  })

  it('reports an explicit story-day conflict when both sources name different days', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      facts: [{
        category: 'timeline' as const,
        entities: ['林舟'],
        statement: '第3天，林舟抵达旧码头。',
        sourceChapter: 1,
        evidence: '第3天清晨，林舟抵达旧码头。',
      }],
    }], {
      chapterNumber: 2,
      title: '第四天',
      role: '发展',
      purpose: '林舟继续追查',
      keyEvents: '第2天，林舟在旧码头等待接头。',
      characters: ['林舟'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('时间线')
  })

  it('reports a knowledge leak when a blueprint gives a secret to an unproven character', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      facts: [{
        category: 'character-state' as const,
        entities: ['林舟'],
        statement: '林舟得知红门在旧码头。',
        sourceChapter: 1,
        evidence: '林舟从密信中得知红门在旧码头。',
      }],
    }], {
      chapterNumber: 2,
      title: '秘密扩散',
      role: '发展',
      purpose: '沈月已经知道红门在旧码头',
      keyEvents: '沈月得知红门在旧码头，并改变了行动路线。',
      characters: ['林舟', '沈月'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('知情')
  })

  it('matches knowledge predicates separated from the secret by whitespace', () => {
    const findings = findBlueprintContinuityRisks([{
      ...projection[0]!,
      facts: [{
        category: 'character-state' as const,
        entities: ['林舟'],
        statement: '林舟得知\n红门在旧码头。',
        sourceChapter: 1,
        evidence: '林舟从密信中得知红门在旧码头。',
      }],
    }], {
      chapterNumber: 2,
      title: '秘密扩散',
      role: '发展',
      purpose: '沈月已经知道\n红门在旧码头',
      keyEvents: '沈月得知\n红门在旧码头，并改变行动路线。',
      characters: ['林舟', '沈月'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.issue.zhCN).toContain('知情范围冲突')
  })

  it('maps deterministic findings into the existing review item shape', () => {
    const finding = findBlueprintContinuityRisks(projection, {
      chapterNumber: 2, title: '重逢', role: '发展', purpose: '顾舟归来', keyEvents: '顾舟敲门',
      characters: ['顾舟'], suspenseHook: '他为何归来', userGuidance: '', notes: '',
    }, [])[0]!
    const review = mergeConsistencyFindingsIntoReview({ summary: 'AI summary', items: [] }, [finding], 'en-US')
    expect(review.items).toEqual([expect.objectContaining({
      category: 'Deterministic continuity preflight [conflict]',
      certainty: 'conflict',
      severity: 'warning',
      quote: '表盖内侧刻着一组陌生坐标。',
    })])
    expect(review.items[0]?.description).toContain('顾舟')
  })

  it('reports information-insufficient state for a blueprint character without finalized facts', () => {
    // 豁免参数是必填的：这里显式传空数组，表示调用方明确不豁免任何线索。
    const findings = findMissingCharacterStateFindings(earlierChapter(1, ['林岚', '苏遥']) as never, {
      chapterNumber: 2,
      title: '新人登场',
      role: '发展',
      purpose: '苏遥首次出现在车站',
      keyEvents: '苏遥走进车站。',
      characters: ['林岚', '苏遥'],
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    }, [])
    expect(findings).toHaveLength(2)
    expect(findings.every(finding => finding.certainty === 'insufficient' && finding.severity === 'warning')).toBe(true)
    expect(findings.some(finding => finding.issue.zhCN.includes('苏遥') && finding.issue.enUS.includes('苏遥'))).toBe(true)
  })

  it('suppresses the missing-state finding once an active exemption covers its stable key', () => {
    const findings = findMissingCharacterStateFindings(earlierChapter(1, ['林岚', '苏遥']) as never, missingStateBlueprint(), [exemption()])
    expect(findings.map(finding => finding.stableFactKey)).toEqual(['missing:state:2:林岚'])
  })

  it('brings the finding back when the exemption is revoked', () => {
    const findings = findMissingCharacterStateFindings(earlierChapter(1, ['林岚', '苏遥']) as never, missingStateBlueprint(), [exemption({ revoked: true })])
    expect(findings.map(finding => finding.stableFactKey)).toEqual(['missing:state:2:林岚', 'missing:state:2:苏遥'])
  })

  it('stays silent for a character whose first appearance is this chapter', () => {
    // 用户现场：仅第 1 章已定稿（角色 [苏倦, 明镜]）；批量第 2–5 章；赵阔只出现在第 3、4 章蓝图。
    const finalized = earlierChapter(1, ['苏倦', '明镜']) as never
    const third = findMissingCharacterStateFindings(finalized, blueprintAt(3, ['苏倦', '赵阔']) as never, [])
    const fourth = findMissingCharacterStateFindings(finalized, blueprintAt(4, ['苏倦', '赵阔']) as never, [])
    // 赵阔是首次登场：没有"本应有记录却没有"的证据，两章都不该报。
    expect(third.some(finding => finding.stableFactKey.endsWith(':赵阔'))).toBe(false)
    expect(fourth.some(finding => finding.stableFactKey.endsWith(':赵阔'))).toBe(false)
    // 苏倦此前已出场、本章又没有适用状态 → 仍报（这才是这条规则的意义）。
    expect(third.map(finding => finding.stableFactKey)).toEqual(['missing:state:3:苏倦'])
  })

  it('still reports a character who appeared in an earlier finalized chapter', () => {
    const findings = findMissingCharacterStateFindings(earlierChapter(1, ['林岚']) as never, blueprintAt(3, ['林岚']) as never, [])
    expect(findings.map(finding => finding.stableFactKey)).toEqual(['missing:state:3:林岚'])
  })

  it('gives the same character distinct keys in different chapters', () => {
    const third = findMissingCharacterStateFindings(earlierChapter(1, ['赵阔']) as never, blueprintAt(3, ['赵阔']), [])
    const fourth = findMissingCharacterStateFindings(earlierChapter(1, ['赵阔']) as never, blueprintAt(4, ['赵阔']), [])
    expect(third[0]!.stableFactKey).toBe('missing:state:3:赵阔')
    expect(fourth[0]!.stableFactKey).toBe('missing:state:4:赵阔')
    // 撞键会让面板出现重复 React key，用户看到的就是「线索越积越多」。
    expect(third[0]!.stableFactKey).not.toBe(fourth[0]!.stableFactKey)
  })

  it('keeps legacy role-only exemptions working for every chapter', () => {
    const legacy = [{ stableFactKey: 'missing:state:赵阔', reason: '改键前保存的安排', revoked: false }] as never
    expect(findMissingCharacterStateFindings(earlierChapter(1, ['赵阔']) as never, blueprintAt(3, ['赵阔']), legacy)).toEqual([])
    expect(findMissingCharacterStateFindings(earlierChapter(1, ['赵阔']) as never, blueprintAt(4, ['赵阔']), legacy)).toEqual([])
  })

  it('scopes a chapter-qualified exemption to its own chapter only', () => {
    const scoped = [{ stableFactKey: 'missing:state:3:赵阔', reason: '首次出场', revoked: false }] as never
    expect(findMissingCharacterStateFindings(earlierChapter(1, ['赵阔']) as never, blueprintAt(3, ['赵阔']), scoped)).toEqual([])
    const fourth = findMissingCharacterStateFindings(earlierChapter(1, ['赵阔']) as never, blueprintAt(4, ['赵阔']), scoped)
    expect(fourth).toHaveLength(1)
    expect(fourth[0]!.stableFactKey).toBe('missing:state:4:赵阔')
  })

  it('treats an explicitly empty exemption list as no exemptions', () => {
    // 语义保留（不豁免时线索照旧全出），只是从「靠默认值」改成显式表达。
    const empty = findMissingCharacterStateFindings(earlierChapter(1, ['林岚', '苏遥']) as never, missingStateBlueprint(), [])
    expect(empty.map(finding => finding.stableFactKey)).toEqual(['missing:state:2:林岚', 'missing:state:2:苏遥'])
  })

})

/**
 * 更早的已定稿章节：里面的状态事实只在该章有效（validUntilChapter = 自己），
 * 于是本章找不到适用状态，但"该角色此前出场过"成立 —— 正是需要提醒的情形。
 */
function earlierChapter(chapterNumber: number, characters: string[]) {
  return [{
    draftId: chapterNumber,
    chapterNumber,
    chapterTitle: '第' + chapterNumber + '章',
    chapterNotes: '',
    facts: characters.map(character => ({
      category: 'character-state' as const,
      entities: [character],
      statement: character + '在第' + chapterNumber + '章已有状态。',
      sourceChapter: chapterNumber,
      validFromChapter: chapterNumber,
      validUntilChapter: chapterNumber,
      evidence: character + '的定稿证据。',
    })),
  }]
}

function blueprintAt(chapterNumber: number, characters: string[]) {
  return {
    chapterNumber,
    title: '第' + chapterNumber + '章',
    role: '发展',
    purpose: '',
    keyEvents: '',
    characters,
    suspenseHook: '',
    userGuidance: '',
    notes: '',
  }
}

function missingStateBlueprint() {
  return {
    chapterNumber: 2,
    title: '新人登场',
    role: '发展',
    purpose: '苏遥首次出现在车站',
    keyEvents: '苏遥走进车站。',
    characters: ['林岚', '苏遥'],
    suspenseHook: '',
    userGuidance: '',
    notes: '',
  }
}

function exemption(overrides: Record<string, unknown> = {}) {
  return {
    stableFactKey: 'missing:state:2:苏遥',
    reason: '首次出场',
    revoked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as never
}

describe('readConsistencyPreflight wiring', () => {
  it('feeds stored exemptions into the missing-state rule', async () => {
    ipcMock.invokeWithProjectSession.mockImplementation(async (_session: unknown, channel: string) => {
      if (channel === 'db:consistency-exemption-list') return [exemption()]
      if (channel === 'db:continuity-list-before') return earlierChapter(1, ['林岚', '苏遥'])
      return []
    })
    const result = await readConsistencyPreflight(
      { projectId: 'p', leaseId: 'l', projectPath: 'C:\\novels\\p' } as never,
      [missingStateBlueprint()] as never,
    )
    expect(result.findings.map(finding => finding.stableFactKey)).toEqual(['missing:state:2:林岚'])
  })
})
