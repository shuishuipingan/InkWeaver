export type BlueprintEventCoverageStatus = 'completed' | 'prepared' | 'deferred' | 'not-found' | 'needs-verification'

export interface BlueprintEventCoverage {
  event: string
  status: BlueprintEventCoverageStatus
  evidence?: string
}

function normalize(value: string): string {
  return value.replace(/[\s\u3000]+/gu, '').replace(/^[\-*•·\d.)、:：]+/u, '').replace(/[。！？.!?；;]+$/u, '')
}

function eventsFromKeyEvents(keyEvents: string): string[] {
  return keyEvents
    .split(/\r?\n|[；;]/u)
    .map(line => normalize(line))
    .filter(Boolean)
    .filter((event, index, values) => values.indexOf(event) === index)
}

function sentenceEvidence(content: string, event: string): string | undefined {
  const sentences = content.split(/(?<=[。！？.!?])|\r?\n+/u).map(value => value.trim()).filter(Boolean)
  const normalizedEvent = normalize(event)
  return sentences.find(sentence => normalize(sentence).includes(normalizedEvent))
}

function overlapScore(event: string, text: string): number {
  const normalizedEvent = normalize(event)
  const normalizedText = normalize(text)
  if (!normalizedEvent || !normalizedText) return 0
  if (normalizedText.includes(normalizedEvent)) return normalizedEvent.length
  const units = [...normalizedEvent].filter((unit, index, values) => values.indexOf(unit) === index)
  return units.filter(unit => normalizedText.includes(unit)).length
}

/** Compare blueprint key events with the chapter and review evidence. */
export function buildBlueprintEventCoverage(
  keyEvents: string,
  finalizedOrDraftContent: string,
  reviewItems: readonly Record<string, unknown>[] = [],
): BlueprintEventCoverage[] {
  const events = eventsFromKeyEvents(keyEvents)
  return events.map(event => {
    const completedEvidence = sentenceEvidence(finalizedOrDraftContent, event)
    if (completedEvidence) return { event, status: 'completed' as const, evidence: completedEvidence }

    const matches = reviewItems
      .map(item => ({
        text: [item.description, item.quote, item.evidence, item.suggestion].filter(value => typeof value === 'string').join(' '),
        deferred: /(暂缓|延期|稍后|未完成|later|defer|not yet|postpon)/iu.test(JSON.stringify(item)),
      }))
      .map(item => ({ ...item, score: overlapScore(event, item.text) }))
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score)
    const best = matches[0]
    if (!best) return { event, status: 'not-found' as const, evidence: undefined }
    const exactEvidence = reviewItems
      .map(item => [item.quote, item.evidence].find(value => typeof value === 'string' && normalize(value).includes(normalize(event))))
      .find(value => typeof value === 'string') as string | undefined
    const threshold = Math.max(2, Math.ceil(normalize(event).length * 0.6))
    const supportingEvidence = exactEvidence ?? reviewItems
      .map(item => [item.quote, item.evidence].find(value => typeof value === 'string'))
      .map(value => typeof value === 'string' ? { value, score: overlapScore(event, value) } : undefined)
      .filter((value): value is { value: string; score: number } => Boolean(value))
      .sort((left, right) => right.score - left.score)[0]?.value
    // A verbatim or strongly overlapping quote/evidence is the only basis for
    // "prepared". A prose description alone can at most request verification.
    if (supportingEvidence && overlapScore(event, supportingEvidence) >= threshold) {
      return { event, status: 'prepared' as const, evidence: supportingEvidence }
    }
    if (best.score >= threshold && best.deferred) return { event, status: 'deferred' as const, evidence: undefined }
    if (best.score >= threshold) return { event, status: 'needs-verification' as const, evidence: undefined }
    if (best.deferred) return { event, status: 'not-found' as const, evidence: undefined }
    return { event, status: 'needs-verification' as const, evidence: undefined }
  })
}
