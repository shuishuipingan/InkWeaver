#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function option(name, fallback) {
  const prefix = `${name}=`
  const argument = process.argv.find(value => value.startsWith(prefix))
  return argument === undefined ? fallback : argument.slice(prefix.length)
}

const outputDir = resolve(option('--output-dir', '.runtime/quality-review-packet'))
const seed = option('--seed', 'inkweaver-1.1.0-review-v1')
const { FIXED_CHAPTER_PAIR_CASES } = await import('./quality-fixtures.ts')
const { createBlindQualityReviewPacket } = await import('./quality-review-packet.ts')
const result = createBlindQualityReviewPacket(FIXED_CHAPTER_PAIR_CASES, seed)
await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'public-packet.json'), `${JSON.stringify(result.publicPacket, null, 2)}\n`, 'utf8')
await writeFile(resolve(outputDir, 'evaluation-key.private.json'), `${JSON.stringify(result.evaluationKey, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ outputDir, seedFingerprint: result.publicPacket.seedFingerprint, caseCount: result.publicPacket.cases.length })}\n`)
