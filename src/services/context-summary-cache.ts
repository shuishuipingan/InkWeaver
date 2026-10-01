import { ipc } from './ipc-client'
import { sha256Hex } from '../shared/sha256-hex'
import { CONTEXT_SUMMARY_VERSION, summarizeContextText, type ContextSummaryKind } from '../shared/context-summary'
import type { ProjectSessionContext } from '../shared/ipc-channels'

export async function cachedContextSummary(session: ProjectSessionContext, kind: ContextSummaryKind, sourceKey: string,
  text: string, options: { maxChars: number; terms: readonly string[]; chapterNumber: number }) {
  const sourceHash = await sha256Hex(JSON.stringify({ text, options: { ...options, terms: [...new Set(options.terms)].sort() }, version: CONTEXT_SUMMARY_VERSION }))
  const key = { kind, sourceKey, sourceHash, version: CONTEXT_SUMMARY_VERSION }
  let cached: { text: string } | null = null
  try { cached = await ipc.invokeWithProjectSession(session, 'db:context-summary-cache-get', key, session.projectPath) } catch { /* cache is optional, never an authority */ }
  const summary = cached ? { text: cached.text, originalChars: text.trim().length, retainedChars: cached.text.length }
    : summarizeContextText(text, options)
  try { await ipc.invokeWithProjectSession(session, 'db:context-summary-cache-put', { ...key, text: summary.text }, session.projectPath) } catch { /* full derivation remains available */ }
  return { ...summary, cacheHit: !!cached, sourceHash }
}
