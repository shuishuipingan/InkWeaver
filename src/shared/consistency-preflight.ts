import type { FinalizedContinuityProjection } from './finalized-continuity'

export interface ConsistencyExemption {
  stableFactKey: string
  reason: string
  revoked: boolean
}

export interface ConsistencyFinding {
  stableFactKey: string
  severity: 'warning'
  sourceChapter: number
  evidence: string
  issue: { zhCN: string; enUS: string }
  suggestion: { zhCN: string; enUS: string }
}

export interface ReviewLike {
  summary?: string
  items?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface BlueprintForPreflight {
  chapterNumber: number
  title: string
  role: string
  purpose: string
  keyEvents: string
  characters: string[]
  suspenseHook: string
  userGuidance: string
  notes: string
}

function normalizedKeyPart(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function isExplicitTerminalSubject(statement: string, entity: string): boolean {
  const subject = escapeRegExp(entity)
  const divider = String.raw`[\s|:：,，、—-]*`
  const chinese = new RegExp(
    `${subject}${divider}(?:(?:已经|已|被确认(?:为)?|被证实(?:为)?)${divider})?(?:死亡|身亡|牺牲|去世)`,
    'u',
  )
  const english = new RegExp(
    String.raw`${subject}[\s|:,-]+(?:(?:is|was|has(?: been)?)\s+)?(?:dead|died|deceased)\b`,
    'iu',
  )
  return chinese.test(statement) || english.test(statement)
}

function explicitLocation(statement: string, entity: string): string | undefined {
  const subject = escapeRegExp(entity)
  const match = new RegExp(
    `${subject}.{0,24}?(?:位于|在|处于)\s*([^，。；,.;\\n]+)`,
    'u',
  ).exec(statement)
  return match?.[1]?.trim() || undefined
}

function explicitHeldItem(statement: string, entity: string): string | undefined {
  const subject = escapeRegExp(entity)
  const match = new RegExp(
    `${subject}.{0,20}?(?:持有|拥有|拿着|握着|获得|得到)\s*([^，。；,.;\\n]+?)(?=[，。；,.;\\n]|走进|走向|进入|离开|回到|来到|$)`,
    'u',
  ).exec(statement)
  return match?.[1]?.trim() || undefined
}

function explicitStoryDay(statement: string, entity: string): number | undefined {
  const subject = escapeRegExp(entity)
  const match = new RegExp(
    `(?:第\\s*(\\d+)\\s*天|day\\s*(\\d+)).{0,24}?${subject}|${subject}.{0,24}?(?:第\\s*(\\d+)\\s*天|day\\s*(\\d+))`,
    'iu',
  ).exec(statement)
  const value = match?.slice(1).find(Boolean)
  const day = value ? Number(value) : NaN
  return Number.isSafeInteger(day) && day > 0 ? day : undefined
}

function explicitKnowledge(statement: string, entity: string): string | undefined {
  const subject = escapeRegExp(entity)
  const match = new RegExp(
    `${subject}.{0,20}?(?:知道|得知|获悉|听说)\s*[“"「]?([^，。；,.;”"」\\n]+)`,
    'u',
  ).exec(statement)
  return match?.[1]?.trim() || undefined
}

export function continuityStableFactKey(fact: {
  category: string
  sourceChapter: number
  entities: string[]
  statement: string
}): string {
  const identity = [
    fact.category,
    fact.sourceChapter,
    fact.entities.map(normalizedKeyPart).sort().join(','),
    normalizedKeyPart(fact.statement),
  ].join(':')
  let hash = 0xcbf29ce484222325n
  for (const character of identity) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `fact:${hash.toString(16).padStart(16, '0')}`
}

/**
 * Low-cost, deterministic preflight. The first rule is intentionally narrow:
 * a structured terminal character state conflicts with scheduling that same
 * character to appear in the current blueprint.
 * Findings are evidence, never a writing prohibition.
 */
export function findBlueprintContinuityRisks(
  projections: readonly FinalizedContinuityProjection[],
  blueprint: BlueprintForPreflight,
  exemptions: readonly ConsistencyExemption[],
): ConsistencyFinding[] {
  const activeExemptions = new Set(
    exemptions.filter(exemption => !exemption.revoked).map(exemption => exemption.stableFactKey),
  )
  const characters = new Set(blueprint.characters.map(normalizedKeyPart))

  return projections.flatMap(projection => (projection.facts ?? []).flatMap((fact) => {
    if (fact.category !== 'character-state' && fact.category !== 'timeline') return []
    const stableFactKey = continuityStableFactKey(fact)
    if (activeExemptions.has(stableFactKey)) return []
    const subject = fact.category === 'character-state'
      ? fact.entities
      .map(normalizedKeyPart)
      .find(entity => characters.has(entity) && isExplicitTerminalSubject(fact.statement, entity))
      : undefined
    if (subject) {
      return [{
        stableFactKey,
        severity: 'warning' as const,
        sourceChapter: fact.sourceChapter,
        evidence: fact.evidence,
        issue: {
          zhCN: `已定稿事实记录“${subject}”处于死亡终态，但当前蓝图仍将其列为出场角色。`,
          enUS: `Finalized facts record “${subject}” as dead, but the current blueprint still schedules the character to appear.`,
        },
        suggestion: {
          zhCN: '调整蓝图，或说明这是回忆、幻象等刻意安排。',
          enUS: 'Adjust the blueprint, or record an intentional device such as a flashback or vision.',
        },
      }]
    }

    for (const entity of fact.entities.map(normalizedKeyPart).filter(name => characters.has(name))) {
      if (fact.category === 'timeline') {
        const finalizedDay = explicitStoryDay(`${fact.statement}。${fact.evidence}`, entity)
        const blueprintDay = explicitStoryDay(`${blueprint.purpose}。${blueprint.keyEvents}`, entity)
        if (finalizedDay !== undefined && blueprintDay !== undefined && finalizedDay !== blueprintDay) {
          const timelineKey = `${stableFactKey}:day:${entity}`
          if (!activeExemptions.has(timelineKey)) {
            return [{
              stableFactKey: timelineKey,
              severity: 'warning' as const,
              sourceChapter: fact.sourceChapter,
              evidence: fact.evidence,
              issue: {
                zhCN: `时间线冲突：定稿事实将“${entity}”置于第${finalizedDay}天，但当前蓝图写为第${blueprintDay}天。`,
                enUS: `Timeline conflict: finalized facts place “${entity}” on story day ${finalizedDay}, but the current blueprint says day ${blueprintDay}.`,
              },
              suggestion: {
                zhCN: '补充时间跳转或调整蓝图日期。',
                enUS: 'Add the time transition or adjust the blueprint day.',
              },
            }]
          }
        }
        continue
      }
      const knownSecret = explicitKnowledge(`${fact.statement}。${fact.evidence}`, entity)
      if (knownSecret) {
        for (const other of blueprint.characters.map(normalizedKeyPart)) {
          if (other === entity || fact.entities.map(normalizedKeyPart).includes(other)) continue
          const blueprintSecret = explicitKnowledge(`${blueprint.purpose}。${blueprint.keyEvents}`, other)
          if (!blueprintSecret || normalizedKeyPart(blueprintSecret) !== normalizedKeyPart(knownSecret)) continue
          const knowledgeKey = `${stableFactKey}:knowledge:${entity}:${other}`
          if (activeExemptions.has(knowledgeKey)) continue
          return [{
            stableFactKey: knowledgeKey,
            severity: 'warning' as const,
            sourceChapter: fact.sourceChapter,
            evidence: fact.evidence,
            issue: {
              zhCN: `知情范围冲突：当前证据只证明“${entity}”得知“${knownSecret}”，但蓝图直接让“${other}”知情。`,
              enUS: `Knowledge-boundary conflict: evidence only proves “${entity}” learned “${knownSecret}”, but the blueprint gives that knowledge to “${other}”.`,
            },
            suggestion: {
              zhCN: '补充该角色获知秘密的事件，或调整蓝图中的信息状态。',
              enUS: 'Add how this character learned the secret, or adjust the blueprint knowledge state.',
            },
          }]
        }
      }
      const finalizedLocation = explicitLocation(fact.statement, entity)
      const blueprintLocation = explicitLocation(
        `${blueprint.purpose}。${blueprint.keyEvents}`,
        entity,
      )
      if (!finalizedLocation || !blueprintLocation || finalizedLocation === blueprintLocation) continue
      const locationKey = `${stableFactKey}:location:${entity}`
      if (activeExemptions.has(locationKey)) continue
      return [{
        stableFactKey: locationKey,
        severity: 'warning' as const,
        sourceChapter: fact.sourceChapter,
        evidence: fact.evidence,
        issue: {
          zhCN: `地点冲突：已定稿事实记录“${entity}”位于“${finalizedLocation}”，但当前蓝图将其安排在“${blueprintLocation}”。`,
          enUS: `Finalized facts place “${entity}” at “${finalizedLocation}”, but the current blueprint places the character at “${blueprintLocation}”.`,
        },
        suggestion: {
          zhCN: '补充移动或转场依据，或调整蓝图中的地点。',
          enUS: 'Add the missing movement or transition, or adjust the blueprint location.',
        },
      }]
    }

    const factText = `${fact.statement}。${fact.evidence}`
    for (const owner of fact.entities.map(normalizedKeyPart).filter(name => characters.has(name))) {
      const item = explicitHeldItem(factText, owner)
      if (!item) continue
      for (const other of blueprint.characters.map(normalizedKeyPart)) {
        if (other === owner) continue
        const blueprintItem = explicitHeldItem(`${blueprint.purpose}。${blueprint.keyEvents}`, other)
        if (!blueprintItem || normalizedKeyPart(blueprintItem) !== normalizedKeyPart(item)) continue
        const ownershipKey = `${stableFactKey}:possession:${owner}:${item}`
        if (activeExemptions.has(ownershipKey)) continue
        return [{
          stableFactKey: ownershipKey,
          severity: 'warning' as const,
          sourceChapter: fact.sourceChapter,
          evidence: fact.evidence,
          issue: {
            zhCN: `物品归属冲突：已定稿事实记录“${owner}”持有“${item}”，但当前蓝图写成“${other}”持有。`,
            enUS: `Item ownership conflict: finalized facts say “${owner}” holds “${item}”, but the current blueprint says “${other}” holds it.`,
          },
          suggestion: {
            zhCN: '补充物品转交过程，或调整蓝图中的持有者。',
            enUS: 'Add the transfer event, or adjust the blueprint owner.',
          },
        }]
      }
    }
    return []
  }))
}

export function mergeConsistencyFindingsIntoReview(
  review: ReviewLike,
  findings: readonly ConsistencyFinding[],
  locale: 'zh-CN' | 'en-US',
): ReviewLike & { items: Array<Record<string, unknown>> } {
  const mapped = findings.map(finding => ({
    category: locale === 'en-US' ? 'Deterministic continuity preflight' : '确定性一致性预检',
    severity: finding.severity,
    description: locale === 'en-US' ? finding.issue.enUS : finding.issue.zhCN,
    quote: finding.evidence,
    stableFactKey: finding.stableFactKey,
    sourceChapter: finding.sourceChapter,
  }))
  return { ...review, items: [...(Array.isArray(review.items) ? review.items : []), ...mapped] }
}
