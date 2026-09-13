import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimeLogEvent } from '../../../src/shared/runtime-log'
import { RuntimeLogWriter } from '../runtime-log-writer'

function event(sequence: number, message = `event-${sequence}`): RuntimeLogEvent {
  return {
    schemaVersion: 1,
    eventId: `event-${sequence}`,
    occurredAt: `2026-09-13T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    sessionId: 'session-a',
    process: 'main',
    level: 'info',
    source: 'test',
    event: 'test.event',
    message,
  }
}

describe('RuntimeLogWriter', () => {
  it('appends every event in sequence and reads pages after a fresh writer starts', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({ rootDir: root, maxSegmentBytes: 10_000 })

    await writer.append(event(1))
    await writer.append(event(2))
    await writer.flush()

    const restarted = new RuntimeLogWriter({ rootDir: root, maxSegmentBytes: 10_000 })
    const page = await restarted.readPage({ limit: 50 })
    expect(page.events.map(item => item.sequence)).toEqual([1, 2])
    expect(page.complete).toBe(true)
    expect(page.nextCursor).toBeUndefined()
  })

  it('rotates without overwriting segments and retains manifest hashes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({ rootDir: root, maxSegmentBytes: 260, maxSegments: 20 })

    for (let sequence = 1; sequence <= 12; sequence += 1) await writer.append(event(sequence, 'x'.repeat(70)))
    await writer.flush()

    const files = readdirSync(root).filter(name => name.endsWith('.jsonl'))
    expect(files.length).toBeGreaterThan(1)
    const all = files.flatMap(file => readFileSync(path.join(root, file), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as RuntimeLogEvent))
    expect(all.map(item => item.sequence)).toEqual(Array.from({ length: 12 }, (_value, index) => index + 1))
    const manifests = readdirSync(root).filter(name => name.endsWith('.manifest.json'))
    expect(manifests.length).toBe(files.length)
    expect(statSync(path.join(root, manifests[0]!)).size).toBeGreaterThan(0)
    const manifest = JSON.parse(readFileSync(path.join(root, manifests[0]!), 'utf8')) as {
      segment: string
      sha256: string
      eventCount: number
      firstSequence: number
      lastSequence: number
    }
    const content = readFileSync(path.join(root, manifest.segment), 'utf8')
    expect(manifest.sha256).toBe(createHash('sha256').update(content).digest('hex'))
    expect(manifest.eventCount).toBeGreaterThan(0)
    expect(manifest.firstSequence).toBeLessThanOrEqual(manifest.lastSequence)
  })

  it('retains only the newest segments and their manifests', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({ rootDir: root, maxSegmentBytes: 1_024, maxSegments: 2 })

    for (let sequence = 1; sequence <= 40; sequence += 1) await writer.append(event(sequence, 'x'.repeat(150)))
    await writer.flush()

    const segments = readdirSync(root).filter(name => /^app-.*\.jsonl$/u.test(name))
    const manifests = readdirSync(root).filter(name => name.endsWith('.manifest.json'))
    expect(segments.length).toBeLessThanOrEqual(2)
    expect(manifests.map(name => name.replace(/\.manifest\.json$/u, '')).sort()).toEqual(segments.sort())
  })

  it('assigns a monotonic server sequence independent of renderer sequence', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({ rootDir: root })

    await expect(writer.append(event(99))).resolves.toMatchObject({ serverSequence: 1 })
    await expect(writer.append({ ...event(1), eventId: 'event-other-session', sessionId: 'session-b' }))
      .resolves.toMatchObject({ serverSequence: 2 })
    const page = await writer.readPage({ limit: 10 })
    expect(page.events.map(item => item.serverSequence)).toEqual([1, 2])
  })

  it('keeps failed writes in an emergency spool and exposes the persistence gap', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({
      rootDir: root,
      fsync: true,
      filesystem: {
        appendFile: () => { throw new Error('disk-full') },
        mkdir: () => undefined,
        exists: () => false,
        readdir: () => [],
        stat: () => ({ size: 0 }),
        rename: () => undefined,
        writeFile: writeFileSync,
      },
    })

    await expect(writer.append(event(1))).resolves.toMatchObject({ persisted: false })
    const status = writer.status()
    expect(status.pendingCount).toBe(1)
    expect(status.persistenceState).toBe('emergency-spool')
    expect(status.lastError).toContain('disk-full')
  })

  it('shows pending events in a page when both primary and emergency persistence fail', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({
      rootDir: root,
      filesystem: {
        appendFile: () => { throw new Error('disk-full') },
        mkdir: () => undefined,
        exists: () => false,
        readdir: () => [],
        stat: () => ({ size: 0 }),
        rename: () => undefined,
        writeFile: () => { throw new Error('spool-unavailable') },
        readFile: () => { throw new Error('spool-unavailable') },
      },
    })

    await writer.append(event(1))
    const page = await writer.readPage({ limit: 10 })
    expect(page.events.map(item => item.eventId)).toEqual(['event-1'])
    expect(page.complete).toBe(false)
    expect(page.status.persistenceState).toBe('degraded')
  })

  it('does not duplicate an event when its segment append succeeds but manifest write fails', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({
      rootDir: root,
      filesystem: {
        appendFile: (filePath, data, encoding) => { appendFileSync(filePath, data, encoding) },
        mkdir: (directory, options) => { mkdirSync(directory, options) },
        exists: filePath => { try { statSync(filePath); return true } catch { return false } },
        readdir: directory => readdirSync(directory),
        stat: filePath => statSync(filePath),
        rename: (from, to) => renameSync(from, to),
        writeFile: (filePath, data, encoding) => {
          if (filePath.endsWith('.manifest.json')) throw new Error('manifest-readonly')
          writeFileSync(filePath, data, encoding)
        },
        readFile: (filePath, encoding = 'utf8') => readFileSync(filePath, encoding),
      },
    })

    await expect(writer.append(event(1))).resolves.toMatchObject({ persisted: true })
    await writer.flush()
    const segment = readdirSync(root).find(name => /^app-.*\.jsonl$/u.test(name))
    expect(segment).toBeDefined()
    const persisted = readFileSync(path.join(root, segment!), 'utf8')
      .trim().split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as RuntimeLogEvent)
    expect(persisted.filter(item => item.eventId === 'event-1')).toHaveLength(1)
    expect(writer.status().persistenceState).toBe('degraded')
  })

  it('appends multiple failed events to the emergency spool without overwriting it', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writes: string[] = []
    const appends: string[] = []
    const writer = new RuntimeLogWriter({
      rootDir: root,
      filesystem: {
        appendFile: (filePath, data) => {
          if (filePath.endsWith('emergency-spool.jsonl')) appends.push(data)
          else throw new Error('disk-full')
        },
        mkdir: () => undefined,
        exists: () => false,
        readdir: () => [],
        stat: () => ({ size: 0 }),
        rename: () => undefined,
        writeFile: (filePath, data) => { writes.push(`${filePath}|${data}`) },
      },
    })

    await writer.append(event(1))
    await writer.append(event(2))
    expect(writes.filter(item => item.includes('emergency-spool.jsonl'))).toHaveLength(1)
    expect(appends).toHaveLength(1)
  })

  it('includes emergency-spool events after a process restart instead of hiding the gap', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const failingWriter = new RuntimeLogWriter({
      rootDir: root,
      filesystem: {
        appendFile: (filePath, data, encoding) => {
          if (!filePath.endsWith('emergency-spool.jsonl')) throw new Error('disk-full')
          appendFileSync(filePath, data, encoding)
        },
        mkdir: (directory, options) => { mkdirSync(directory, options) },
        exists: filePath => { try { statSync(filePath); return true } catch { return false } },
        readdir: directory => readdirSync(directory),
        stat: filePath => statSync(filePath),
        rename: (from, to) => renameSync(from, to),
        writeFile: writeFileSync,
        readFile: (filePath, encoding = 'utf8') => readFileSync(filePath, encoding),
      },
    })
    await failingWriter.append(event(1))

    const restarted = new RuntimeLogWriter({ rootDir: root })
    const page = await restarted.readPage({ limit: 10 })
    expect(page.events.map(item => item.eventId)).toEqual(['event-1'])
    expect(page.complete).toBe(false)
  })

  it('does not physically duplicate an emergency event after replay and restart', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const failingWriter = new RuntimeLogWriter({
      rootDir: root,
      filesystem: {
        appendFile: (filePath, data, encoding) => {
          if (!filePath.endsWith('emergency-spool.jsonl')) throw new Error('disk-full')
          appendFileSync(filePath, data, encoding)
        },
        mkdir: (directory, options) => { mkdirSync(directory, options) },
        exists: filePath => { try { statSync(filePath); return true } catch { return false } },
        readdir: directory => readdirSync(directory),
        stat: filePath => statSync(filePath),
        rename: (from, to) => renameSync(from, to),
        writeFile: writeFileSync,
        readFile: (filePath, encoding = 'utf8') => readFileSync(filePath, encoding),
      },
    })
    await failingWriter.append(event(1))

    const restarted = new RuntimeLogWriter({ rootDir: root })
    await restarted.flush()
    expect(readFileSync(path.join(root, 'emergency-spool.jsonl'), 'utf8')).toBe('')
    const replayed = new RuntimeLogWriter({ rootDir: root })
    await replayed.append(event(1))
    await replayed.flush()

    const segment = readdirSync(root).find(name => /^app-.*\.jsonl$/u.test(name))
    expect(segment).toBeDefined()
    const persisted = readFileSync(path.join(root, segment!), 'utf8')
      .trim().split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as RuntimeLogEvent)
    expect(persisted.filter(item => item.eventId === 'event-1')).toHaveLength(1)
  })

  it('does not create an emergency spool during a healthy flush', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const writer = new RuntimeLogWriter({ rootDir: root })
    await writer.append(event(1))
    await writer.flush()
    expect(readdirSync(root).some(name => name === 'emergency-spool.jsonl')).toBe(false)
  })

  it('exports a complete, readback-verifiable log bundle without mutating the source segments', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-'))
    const destination = mkdtempSync(path.join(tmpdir(), 'inkweaver-runtime-log-export-'))
    const writer = new RuntimeLogWriter({ rootDir: root })
    await writer.append(event(1))
    const receipt = await writer.exportBundle(destination)

    expect(receipt.files.some(file => /\.jsonl$/u.test(file))).toBe(true)
    expect(readFileSync(path.join(destination, receipt.files.find(file => file.endsWith('.jsonl'))!), 'utf8'))
      .toContain('event-1')
    expect(receipt.files).toContain('bundle-manifest.json')
    expect(JSON.parse(readFileSync(path.join(destination, 'bundle-manifest.json'), 'utf8')))
      .toMatchObject({ schemaVersion: 1, files: expect.arrayContaining(['bundle-manifest.json']) })
    expect(readdirSync(root).some(name => name.endsWith('.jsonl'))).toBe(true)
  })
})
