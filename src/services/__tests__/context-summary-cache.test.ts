import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedContextSummary } from '../context-summary-cache'
import { ipc } from '../ipc-client'
vi.mock('../ipc-client', () => ({ ipc: { invokeWithProjectSession: vi.fn() } }))
const session = { projectId: 'a', leaseId: 'lease-a', projectPath: 'C:\\novels\\a' }
const entries = new Map<string, unknown>()
beforeEach(() => {
  entries.clear()
  vi.mocked(ipc.invokeWithProjectSession).mockReset()
  vi.mocked(ipc.invokeWithProjectSession).mockImplementation(async (captured, channel, ...args) => {
    const entry = args[0] as { sourceHash: string }
    const key = `${captured.projectId}:${entry.sourceHash}`
    if (channel === 'db:context-summary-cache-get') return (entries.get(key) ?? null) as never
    entries.set(key, entry)
    return { success: true } as never
  })
})
describe('source-bound cached context derivation', () => {
  it('reuses matching source and invalidates text, chapter, selection and project changes', async () => {
    const options = { maxChars: 12, terms: ['凤凰'], chapterNumber: 2 }
    const text = '村里种麦。城里卖布。凤凰守山门。'
    expect((await cachedContextSummary(session, 'architecture', 'world', text, options)).cacheHit).toBe(false)
    expect((await cachedContextSummary(session, 'architecture', 'world', text, options)).cacheHit).toBe(true)
    for (const change of [
      { text: `${text}智虫醒来。`, options },
      { text, options: { ...options, chapterNumber: 3 } },
      { text, options: { ...options, terms: ['城里'] } },
    ]) expect((await cachedContextSummary(session, 'architecture', 'world', change.text, change.options)).cacheHit).toBe(false)
    expect((await cachedContextSummary({ ...session, projectId: 'b', leaseId: 'b' }, 'architecture', 'world', text, options)).cacheHit).toBe(false)
  })
})
