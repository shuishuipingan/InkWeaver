#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import { summarizeQualityReview } from './quality-review-summary.ts'

export function parseQualityReviewRows(raw) {
  let value
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(`quality review input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(value)) throw new Error('quality review input must be an array')
  return summarizeQualityReview(value)
}

function option(name) {
  const prefix = `${name}=`
  const argument = process.argv.find(value => value.startsWith(prefix))
  return argument?.slice(prefix.length)
}

const invokedAsMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsMain) {
  try {
    const inputPath = option('--input')
    if (!inputPath) throw new Error('Usage: node --experimental-strip-types scripts/summarize-quality-review.mjs --input=<rows.json> [--strict]')
    const summary = parseQualityReviewRows(await readFile(inputPath, 'utf8'))
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    if (process.argv.includes('--strict') && !summary.eligible) process.exitCode = 2
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
