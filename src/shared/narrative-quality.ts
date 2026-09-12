export type NarrativeQualityKind = 'repeated-opening' | 'repeated-ending' | 'repeated-weather-opening'

export interface NarrativeQualityFinding {
  id: string
  kind: NarrativeQualityKind
  chapterNumbers: number[]
  evidence: string
  intentionalRepetitionKey: string
}

function normalized(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[\s\p{P}\p{S}]+/gu, '')
}

function opening(content: string): string {
  return content.split(/\n\s*\n/gu).map(value => value.trim()).find(Boolean)?.slice(0, 240) ?? ''
}

function ending(content: string): string {
  return content.split(/\n\s*\n/gu).map(value => value.trim()).filter(Boolean).at(-1)?.slice(-240) ?? ''
}

export function detectNarrativeQualityFindings(
  chapters: ReadonlyArray<{ chapterNumber: number; content: string }>,
): NarrativeQualityFinding[] {
  const sorted = [...chapters].sort((left, right) => left.chapterNumber - right.chapterNumber)
  const findings: NarrativeQualityFinding[] = []
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!
    const current = sorted[index]!
    const previousOpening = opening(previous.content)
    const currentOpening = opening(current.content)
    if (previousOpening.length >= 18 && normalized(previousOpening) === normalized(currentOpening)) {
      findings.push({
        id: `quality:opening:${previous.chapterNumber}:${current.chapterNumber}`,
        kind: 'repeated-opening',
        chapterNumbers: [previous.chapterNumber, current.chapterNumber],
        evidence: currentOpening,
        intentionalRepetitionKey: normalized(currentOpening),
      })
    }
    const previousEnding = ending(previous.content)
    const currentEnding = ending(current.content)
    if (previousEnding.length >= 18 && normalized(previousEnding) === normalized(currentEnding)) {
      findings.push({
        id: `quality:ending:${previous.chapterNumber}:${current.chapterNumber}`,
        kind: 'repeated-ending',
        chapterNumbers: [previous.chapterNumber, current.chapterNumber],
        evidence: currentEnding,
        intentionalRepetitionKey: normalized(currentEnding),
      })
    }
    const weather = /(?:雨|雪|雾|风|雷|晴|阴|rain|snow|fog|wind|storm|sunny|cloudy)/iu
    if (weather.test(previousOpening) && weather.test(currentOpening) && previousOpening.length >= 12 && currentOpening.length >= 12) {
      findings.push({
        id: `quality:weather:${previous.chapterNumber}:${current.chapterNumber}`,
        kind: 'repeated-weather-opening',
        chapterNumbers: [previous.chapterNumber, current.chapterNumber],
        evidence: currentOpening,
        intentionalRepetitionKey: `${normalized(previousOpening)}:${normalized(currentOpening)}`,
      })
    }
  }
  return findings
}
