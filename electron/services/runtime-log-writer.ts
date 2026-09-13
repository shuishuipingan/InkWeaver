import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile, appendFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import type { RuntimeLogEvent, RuntimeLogPage, RuntimeLogPageQuery, RuntimeLogPersistenceState, RuntimeLogStatus } from '../../src/shared/runtime-log'
import { isRuntimeLogEvent } from '../../src/shared/runtime-log'

export interface RuntimeLogFilesystem {
  appendFile(filePath: string, data: string, encoding?: BufferEncoding): void | Promise<void>
  mkdir(directory: string, options?: { recursive?: boolean }): void | Promise<void>
  exists(filePath: string): boolean | Promise<boolean>
  readdir(directory: string): string[] | Promise<string[]>
  stat(filePath: string): { size: number } | Promise<{ size: number }>
  rename(from: string, to: string): void | Promise<void>
  unlink?(filePath: string): void | Promise<void>
  writeFile(filePath: string, data: string, encoding?: BufferEncoding): void | Promise<void>
  readFile?(filePath: string, encoding?: BufferEncoding): string | Promise<string>
}

const defaultFilesystem: RuntimeLogFilesystem = {
  appendFile: async (filePath, data, encoding = 'utf8') => { await appendFile(filePath, data, encoding) },
  mkdir: async (directory, options) => { await mkdir(directory, options) },
  exists: async filePath => {
    try {
      await stat(filePath)
      return true
    } catch {
      return false
    }
  },
  readdir: directory => readdir(directory),
  stat: filePath => stat(filePath),
  rename: (from, to) => rename(from, to),
  unlink: filePath => unlink(filePath),
  writeFile: async (filePath, data, encoding = 'utf8') => { await writeFile(filePath, data, encoding) },
  readFile: (filePath, encoding = 'utf8') => readFile(filePath, encoding),
}

export interface RuntimeLogWriterOptions {
  rootDir: string
  maxSegmentBytes?: number
  maxSegments?: number
  fsync?: boolean
  filesystem?: RuntimeLogFilesystem
  now?: () => Date
}

export interface RuntimeLogAppendResult {
  persisted: boolean
  eventId: string
  serverSequence?: number
}

export interface RuntimeLogExportReceipt {
  destination: string
  files: string[]
  status: RuntimeLogWriterStatus
}

export type RuntimeLogWriterStatus = RuntimeLogStatus

interface PendingEvent {
  event: RuntimeLogEvent
  serialized: string
  retryCount: number
}

const SEGMENT_PATTERN = /^app-(\d{4}-\d{2}-\d{2})\.(\d{3})\.jsonl$/u
const MANIFEST_SUFFIX = '.manifest.json'
const EMERGENCY_SPOOL = 'emergency-spool.jsonl'

function dateToken(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function segmentFile(date: string, index: number): string {
  return `app-${date}.${String(index).padStart(3, '0')}.jsonl`
}

function safeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 200
  return Math.max(1, Math.min(2_000, Math.trunc(value)))
}

function eventMatches(event: RuntimeLogEvent, query: RuntimeLogPageQuery): boolean {
  if (query.level && event.level !== query.level) return false
  if (query.process && event.process !== query.process) return false
  if (query.source && !event.source.includes(query.source)) return false
  if (query.event && !event.event.includes(query.event)) return false
  if (query.runId && event.runId !== query.runId) return false
  if (query.projectSessionId && event.projectSessionId !== query.projectSessionId) return false
  if (query.correlationId && event.correlationId !== query.correlationId) return false
  if (query.from && event.occurredAt < query.from) return false
  if (query.to && event.occurredAt > query.to) return false
  return true
}

/**
 * Append-only runtime log writer. Every failed append remains in memory and is
 * mirrored to an emergency spool when possible; callers receive an explicit
 * persisted=false result instead of silently losing the event.
 */
export class RuntimeLogWriter {
  private readonly rootDir: string
  private readonly maxSegmentBytes: number
  private readonly maxSegments: number
  private readonly filesystem: RuntimeLogFilesystem
  private readonly now: () => Date
  private readonly pending: PendingEvent[] = []
  private readonly persistedEventIds = new Set<string>()
  private readonly emergencyEventIds = new Set<string>()
  private currentDate = ''
  private currentIndex = 0
  private currentBytes = 0
  private currentHash = createHash('sha256')
  private currentEventCount = 0
  private currentFirstSequence: number | undefined
  private currentLastSequence: number | undefined
  private serverSequence = 0
  private historicalIndexLoaded = false
  private retryCount = 0
  private totalPersisted = 0
  private totalFailed = 0
  private lastError: string | undefined
  private persistenceState: RuntimeLogPersistenceState = 'healthy'
  private emergencySpoolCreated = false
  private emergencyLoaded = false
  private operation: Promise<void> = Promise.resolve()

  constructor(options: RuntimeLogWriterOptions) {
    this.rootDir = path.resolve(options.rootDir)
    this.maxSegmentBytes = Math.max(128, Math.trunc(options.maxSegmentBytes ?? 10 * 1024 * 1024))
    this.maxSegments = Math.max(1, Math.trunc(options.maxSegments ?? 30))
    this.filesystem = options.filesystem ?? defaultFilesystem
    this.now = options.now ?? (() => new Date())
  }

  append(event: RuntimeLogEvent): Promise<RuntimeLogAppendResult> {
    const task = this.operation.then(() => this.appendNow(event), () => this.appendNow(event))
    this.operation = task.then(() => undefined, () => undefined)
    return task
  }

  async flush(): Promise<void> {
    const task = this.operation.then(async () => {
      await this.loadEmergencyPending()
      if (this.pending.length === 0) return
      const retrying = this.pending.splice(0)
      for (const item of retrying) {
        try {
          await this.writeSerialized(item.event, item.serialized)
          this.totalPersisted += 1
          this.persistedEventIds.add(item.event.eventId)
          this.emergencyEventIds.delete(item.event.eventId)
        } catch (error) {
          item.retryCount += 1
          this.retryCount += 1
          this.totalFailed += 1
          this.pending.push(item)
          this.lastError = error instanceof Error ? error.message : String(error)
          this.persistenceState = 'emergency-spool'
          await this.writeEmergencySpool(item.serialized)
        }
      }
      if (this.pending.length === 0) {
        if (this.persistenceState !== 'degraded') {
          this.persistenceState = 'healthy'
          this.lastError = undefined
        }
        await this.clearReplayedEmergencySpool()
      }
    }, async () => undefined)
    this.operation = task.then(() => undefined, () => undefined)
    await task
  }

  status(): RuntimeLogWriterStatus {
    return {
      persistenceState: this.persistenceState,
      pendingCount: this.pending.length,
      queueDepth: this.pending.length,
      retryCount: this.retryCount,
      ...(this.currentDate ? { segment: segmentFile(this.currentDate, this.currentIndex) } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      totalPersisted: this.totalPersisted,
      totalFailed: this.totalFailed,
    }
  }

  /** Flush and copy every segment, manifest, and emergency spool to a new directory. */
  async exportBundle(destination: string): Promise<RuntimeLogExportReceipt> {
    const target = path.resolve(destination)
    if (target === this.rootDir || target.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new Error('日志导出目录不能位于日志源目录内')
    }
    if (!this.filesystem.readFile) throw new Error('当前日志文件系统不支持导出回读')
    await this.flush()
    await this.filesystem.mkdir(target, { recursive: true })
    const sourceNames = await this.filesystem.readdir(this.rootDir)
    const names = sourceNames.filter(name => (
      SEGMENT_PATTERN.test(name) || name.endsWith(`${MANIFEST_SUFFIX}`) || name === EMERGENCY_SPOOL
    )).sort()
    const copied: string[] = []
    for (const name of names) {
      const source = path.join(this.rootDir, name)
      const content = await this.filesystem.readFile(source, 'utf8')
      await this.filesystem.writeFile(path.join(target, name), content, 'utf8')
      copied.push(name)
    }
    const bundleFiles = [...copied, 'bundle-manifest.json']
    await this.filesystem.writeFile(
      path.join(target, 'bundle-manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        exportedAt: this.now().toISOString(),
        files: bundleFiles,
        complete: this.status().persistenceState === 'healthy' && this.status().pendingCount === 0,
        privacy: 'metadata-only',
        status: this.status(),
      })}\n`,
      'utf8',
    )
    copied.push('bundle-manifest.json')
    return { destination: target, files: copied, status: this.status() }
  }

  async readPage(query: RuntimeLogPageQuery = {}): Promise<RuntimeLogPage> {
    const names = await this.listSegments()
    const events: RuntimeLogEvent[] = []
    for (const name of names) {
      const filePath = path.join(this.rootDir, name)
      const raw = await this.readText(filePath)
      for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
        try {
          const value: unknown = JSON.parse(line)
          if (isRuntimeLogEvent(value) && eventMatches(value, query)
            && !events.some(existing => existing.eventId === value.eventId)) events.push(value)
        } catch { /* ignore an incomplete trailing line; manifest reports it */ }
      }
    }
    const emergencyEvents = await this.readEmergencyEvents()
    if (emergencyEvents.length > 0) {
      this.persistenceState = 'emergency-spool'
      for (const event of emergencyEvents) {
        if (!events.some(existing => existing.eventId === event.eventId)) events.push(event)
      }
    }
    // If even the emergency spool is unavailable, keep the in-memory pending
    // events visible to the query surface until the process can flush or exit.
    // The status remains incomplete, so the UI cannot mistake this view for a
    // fully persisted history.
    for (const item of this.pending) {
      if (eventMatches(item.event, query) && !events.some(existing => existing.eventId === item.event.eventId)) {
        events.push(item.event)
      }
    }
    events.sort((left, right) => (left.serverSequence ?? left.sequence) - (right.serverSequence ?? right.sequence))
    const start = query.cursor ? Math.max(0, Number.parseInt(query.cursor, 10) || 0) : 0
    const limit = safeLimit(query.limit)
    const selected = events.slice(start, start + limit)
    const nextIndex = start + selected.length
    return {
      events: selected,
      ...(nextIndex < events.length ? { nextCursor: String(nextIndex) } : {}),
      complete: nextIndex >= events.length && this.pending.length === 0 && emergencyEvents.length === 0,
      status: this.status(),
    }
  }

  private async appendNow(event: RuntimeLogEvent): Promise<RuntimeLogAppendResult> {
    await this.loadEmergencyPending()
    await this.loadHistoricalIndex()
    if (this.persistedEventIds.has(event.eventId)) {
      return { persisted: true, eventId: event.eventId, ...(event.serverSequence !== undefined ? { serverSequence: event.serverSequence } : {}) }
    }
    const persistedEvent = event.serverSequence === undefined
      ? { ...event, serverSequence: await this.allocateServerSequence() }
      : event
    const serialized = `${JSON.stringify(persistedEvent)}\n`
    try {
      await this.writeSerialized(persistedEvent, serialized)
      this.totalPersisted += 1
      this.persistedEventIds.add(persistedEvent.eventId)
      if (this.persistenceState !== 'degraded') {
        this.persistenceState = this.pending.length === 0 ? 'healthy' : 'pending'
      }
      return { persisted: true, eventId: persistedEvent.eventId, serverSequence: persistedEvent.serverSequence }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.totalFailed += 1
      this.lastError = message
      const pending: PendingEvent = { event: persistedEvent, serialized, retryCount: 0 }
      this.pending.push(pending)
      this.persistenceState = 'emergency-spool'
      await this.writeEmergencySpool(serialized)
      return { persisted: false, eventId: persistedEvent.eventId, serverSequence: persistedEvent.serverSequence }
    }
  }

  private async allocateServerSequence(): Promise<number> {
    await this.loadHistoricalIndex()
    this.serverSequence += 1
    return this.serverSequence
  }

  /**
   * Rebuild the in-process event index after a restart. The server sequence
   * scan used to ignore event IDs, which allowed a replayed emergency-spool
   * event to be physically appended twice after the next process restart.
   */
  private async loadHistoricalIndex(): Promise<void> {
    if (this.historicalIndexLoaded) return
    this.historicalIndexLoaded = true
    const segments = await this.listSegments()
    for (const name of segments) {
      try {
        const raw = await this.readText(path.join(this.rootDir, name))
        for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
          const value: unknown = JSON.parse(line)
          if (!isRuntimeLogEvent(value)) continue
          this.persistedEventIds.add(value.eventId)
          const sequence = Number(value.serverSequence ?? value.sequence)
          if (Number.isSafeInteger(sequence)) this.serverSequence = Math.max(this.serverSequence, sequence)
        }
      } catch { /* a malformed historical line must not block new logging */ }
    }
  }

  private async writeSerialized(event: RuntimeLogEvent, serialized: string): Promise<void> {
    await this.ensureDirectory()
    const date = dateToken(this.now())
    if (date !== this.currentDate) {
      this.currentDate = date
      this.currentIndex = await this.nextIndex(date)
      const existingPath = path.join(this.rootDir, segmentFile(this.currentDate, this.currentIndex))
      this.currentBytes = 0
      this.currentHash = createHash('sha256')
      this.currentEventCount = 0
      this.currentFirstSequence = undefined
      this.currentLastSequence = undefined
      try {
        const existing = await this.filesystem.stat(existingPath)
        this.currentBytes = existing.size
        if (this.filesystem.readFile && existing.size > 0) {
          const content = await this.filesystem.readFile(existingPath, 'utf8')
          this.currentHash.update(content)
          for (const line of content.split(/\r?\n/u).filter(Boolean)) {
            try {
              const historical: unknown = JSON.parse(line)
              if (!isRuntimeLogEvent(historical)) continue
              this.currentEventCount += 1
              const sequence = historical.serverSequence ?? historical.sequence
              if (this.currentFirstSequence === undefined) this.currentFirstSequence = sequence
              this.currentLastSequence = sequence
            } catch { /* a malformed historical line is covered by the hash */ }
          }
        }
      } catch { /* first segment for this date */ }
    }
    const bytes = Buffer.byteLength(serialized, 'utf8')
    if (this.currentBytes > 0 && this.currentBytes + bytes > this.maxSegmentBytes) {
      try {
        await this.writeManifest()
      } catch (error) {
        this.markDegraded(error)
      }
      this.currentIndex += 1
      this.currentBytes = 0
      this.currentHash = createHash('sha256')
      this.currentEventCount = 0
      this.currentFirstSequence = undefined
      this.currentLastSequence = undefined
    }
    const name = segmentFile(this.currentDate, this.currentIndex)
    const filePath = path.join(this.rootDir, name)
    await this.filesystem.appendFile(filePath, serialized, 'utf8')
    this.currentBytes += bytes
    this.currentHash.update(serialized)
    this.currentEventCount += 1
    const sequence = event.serverSequence ?? event.sequence
    if (this.currentFirstSequence === undefined) this.currentFirstSequence = sequence
    this.currentLastSequence = sequence
    this.serverSequence = Math.max(this.serverSequence, event.serverSequence ?? event.sequence)
    // The JSONL append is the event's durable commit point. A sidecar
    // manifest failure must be visible as degraded integrity, but must not
    // turn an already-written event into a retry/spool candidate.
    try {
      await this.writeManifest()
    } catch (error) {
      this.markDegraded(error)
    }
    await this.pruneSegments()
  }

  private markDegraded(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error)
    this.persistenceState = 'degraded'
  }

  private async ensureDirectory(): Promise<void> {
    await this.filesystem.mkdir(this.rootDir, { recursive: true })
  }

  private async nextIndex(date: string): Promise<number> {
    const segments = await this.listSegments()
    const indexes = segments
      .map(name => SEGMENT_PATTERN.exec(name))
      .filter((match): match is RegExpExecArray => Boolean(match && match[1] === date))
      .map(match => Number(match[2]))
    return indexes.length > 0 ? Math.max(...indexes) : 1
  }

  private async listSegments(): Promise<string[]> {
    try {
      const names = await this.filesystem.readdir(this.rootDir)
      return names.filter(name => SEGMENT_PATTERN.test(name)).sort()
    } catch {
      return []
    }
  }

  private async readText(filePath: string): Promise<string> {
    if (this.filesystem.readFile) return await this.filesystem.readFile(filePath, 'utf8')
    return ''
  }

  private async readEmergencyEvents(): Promise<RuntimeLogEvent[]> {
    if (!this.filesystem.readFile) return []
    try {
      const raw = await this.filesystem.readFile(path.join(this.rootDir, EMERGENCY_SPOOL), 'utf8')
      return raw.split(/\r?\n/u).filter(Boolean).flatMap(line => {
        try {
          const value: unknown = JSON.parse(line)
          return isRuntimeLogEvent(value) ? [value] : []
        } catch { return [] }
      })
    } catch { return [] }
  }

  private async loadEmergencyPending(): Promise<void> {
    if (this.emergencyLoaded) return
    this.emergencyLoaded = true
    const events = await this.readEmergencyEvents()
    if (events.length === 0) return
    this.emergencySpoolCreated = true
    for (const event of events) {
      if (this.persistedEventIds.has(event.eventId) || this.pending.some(item => item.event.eventId === event.eventId)) continue
      this.pending.push({ event, serialized: `${JSON.stringify(event)}\n`, retryCount: 1 })
      this.emergencyEventIds.add(event.eventId)
      if (event.serverSequence !== undefined) this.serverSequence = Math.max(this.serverSequence, event.serverSequence)
    }
    this.persistenceState = 'emergency-spool'
  }

  private async clearReplayedEmergencySpool(): Promise<void> {
    if (this.emergencyEventIds.size > 0 || !this.emergencySpoolCreated || !this.filesystem.writeFile) return
    try {
      await this.filesystem.writeFile(path.join(this.rootDir, EMERGENCY_SPOOL), '', 'utf8')
    } catch { /* retain the spool as the durable fallback */ }
  }

  private async writeManifest(): Promise<void> {
    if (!this.currentDate) return
    const name = segmentFile(this.currentDate, this.currentIndex)
    let sha256 = createHash('sha256').update(`${name}:${this.currentBytes}:${this.serverSequence}`).digest('hex')
    try { sha256 = this.currentHash.copy().digest('hex') } catch { /* keep metadata hash for minimal test adapters */ }
    const manifest = {
      schemaVersion: 1,
      segment: name,
      bytes: this.currentBytes,
      eventCount: this.currentEventCount,
      ...(this.currentFirstSequence !== undefined ? { firstSequence: this.currentFirstSequence } : {}),
      ...(this.currentLastSequence !== undefined ? { lastSequence: this.currentLastSequence } : {}),
      serverSequence: this.serverSequence,
      sha256,
    }
    await this.filesystem.writeFile(path.join(this.rootDir, `${name}${MANIFEST_SUFFIX}`), `${JSON.stringify(manifest)}\n`, 'utf8')
  }

  private async writeEmergencySpool(serialized: string): Promise<void> {
    try {
      await this.ensureDirectory()
      const filePath = path.join(this.rootDir, EMERGENCY_SPOOL)
      const exists = this.emergencySpoolCreated || await this.filesystem.exists(filePath)
      if (exists) {
        await this.filesystem.appendFile(filePath, serialized, 'utf8')
      } else {
        await this.filesystem.writeFile(filePath, serialized, 'utf8')
      }
      this.emergencySpoolCreated = true
    } catch {
      // The in-memory pending queue and status remain authoritative when even
      // the emergency path is unavailable. The caller still sees persisted=false.
      this.persistenceState = 'degraded'
    }
  }

  private async pruneSegments(): Promise<void> {
    if (!this.filesystem.unlink) return
    const segments = await this.listSegments()
    if (segments.length <= this.maxSegments) return
    const current = this.currentDate ? segmentFile(this.currentDate, this.currentIndex) : ''
    let remaining = segments.length
    for (const name of segments) {
      if (remaining <= this.maxSegments) break
      if (name === current) continue
      try {
        await this.filesystem.unlink(path.join(this.rootDir, name))
        try {
          await this.filesystem.unlink(path.join(this.rootDir, `${name}${MANIFEST_SUFFIX}`))
        } catch { /* a segment may have no manifest after an interrupted write */ }
        remaining -= 1
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error)
        this.persistenceState = 'degraded'
        break
      }
    }
  }
}
