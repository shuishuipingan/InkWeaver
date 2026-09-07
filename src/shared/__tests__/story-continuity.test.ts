import { describe, expect, it } from 'vitest'
import {
  emptyStoryContinuityDocument,
  normalizeStoryContinuityDocument,
  suggestSceneCandidatesFromText,
  storyContinuityProgress,
} from '../story-continuity'

describe('story continuity document', () => {
  it('keeps plan/observed scene beats, arc contribution, emotion and reader knowledge separate', () => {
    const base = emptyStoryContinuityDocument(4)
    const document = normalizeStoryContinuityDocument({
      ...base,
      sceneBeats: [{
        id: 'scene-4-1', sceneNumber: 1, status: 'observed',
        entryState: '带伤进入码头', goal: '找到暗锁', obstacle: '守门人阻拦',
        choice: '说出旧名', consequence: '守门人让路', exitState: '进入仓库',
        evidence: ['她说出旧名后，门闩向后弹开。'],
      }],
      arcContribution: {
        volume: '潮汐卷', mainline: '主角首次掌握未来信件规律', subplots: ['周砚开始怀疑灯塔'],
        characterArcs: ['林夏从回避转向主动'], turningPoint: '信上出现弟弟名字', cost: '失去一枚护符',
        unresolvedQuestions: ['谁在提前写信？'],
      },
      emotionalCarryOver: [{
        character: '林夏', previousState: '恐惧', trigger: '看见弟弟名字', choice: '继续追查', cost: '放弃回港', nextState: '执拗', evidence: ['她没有回头。'],
      }],
      readerExpectations: [{
        id: 'expect-letter', question: '弟弟是否还活着？', introducedChapter: 2,
        expectedProgress: '出现可验证线索', dueChapter: 6, status: 'progressing', delayReason: '', evidence: ['信件落款仍是弟弟。'],
      }],
      viewpointThreads: [{
        viewpoint: '林夏', lastChapter: 4, unresolvedHooks: ['信件来源'], readerKnowledge: '读者知道信件来自未来', nextLanding: '第六章回到灯塔',
      }],
    }, 4)
    expect(storyContinuityProgress(document)).toEqual({ sceneConsequences: 1, activeExpectations: 1, viewpointHooks: 1 })
    expect(document.sceneBeats[0]?.status).toBe('observed')
  })

  it('rejects a document that changes chapter identity or exceeds bounded evidence', () => {
    const base = emptyStoryContinuityDocument(2)
    expect(() => normalizeStoryContinuityDocument({ ...base, chapterNumber: 3 }, 2)).toThrow(/章节号/)
    expect(() => normalizeStoryContinuityDocument({
      ...base,
      emotionalCarryOver: Array.from({ length: 31 }, () => ({
        character: '林', previousState: '', trigger: '', choice: '', cost: '', nextState: '', evidence: [],
      })),
    }, 2)).toThrow(/情绪记录数量/)
  })

  it('suggests evidence-only candidate scenes without inventing causal fields', () => {
    const candidates = suggestSceneCandidatesFromText([
      '她在雨后的码头停下，听见仓门里传来金属碰撞声。',
      '',
      '林夏握紧信件，没有立刻推门，而是先观察守门人的手势。',
      '',
      '潮水退去后，暗锁露出一角；她把弟弟的名字说给守门人听。',
    ].join('\n\n'), 2)
    expect(candidates).toHaveLength(2)
    expect(candidates.every(scene => scene.status === 'candidate')).toBe(true)
    expect(candidates.every(scene => scene.goal === '' && scene.consequence === '' && scene.evidence.length === 1)).toBe(true)
    expect(candidates[0]?.evidence[0]).toContain('码头')
  })
})
