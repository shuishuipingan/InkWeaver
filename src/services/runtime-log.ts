/**
 * 渲染进程统一日志入口。
 *
 * 通过 IPC 将日志写入主进程的 logs/app-YYYY-MM-DD.log（与主进程日志合并成
 * 一份完整运行日志）。浏览器环境（无 velaAPI）下降级为 console。
 *
 * 修复历史问题：
 * - 旧版用单飞布尔量（loggingInFlight）去重，上一条未落地期间的所有日志被
 *   静默丢弃 → 实测渲染进程日志 0 落盘。现改为有界队列 + 批量 flush：
 *   队列上限 200 条，满则丢最旧并计数（绝不静默丢新日志）；
 *   每 200ms 或队列达 20 条即批量上报一次。
 * - 上报失败不再静默：降级到 console，并记录错误摘要。
 */

import { ipc } from './ipc-client'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  source: string
  message: string
  details?: unknown
}

const QUEUE_LIMIT = 200
const FLUSH_INTERVAL_MS = 200
const FLUSH_BATCH_SIZE = 20

/**
 * 测试环境检测：Vitest（Node 与浏览器模式）都会设置 VITEST 环境变量；
 * 测试用 stub 的 velaAPI.invoke 断言调用次数，日志 IPC 会破坏这类断言，
 * 因此测试环境下直接降级为 console（不影响任何业务逻辑）。
 */
function isTestEnv(): boolean {
  return (typeof process !== 'undefined' && process.env?.VITEST === 'true')
    || (typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test')
}

const queue: LogEntry[] = []
let droppedCount = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

function enqueue(level: LogLevel, source: string, message: string, details?: unknown): void {
  if (queue.length >= QUEUE_LIMIT) {
    // 队列满：丢最旧一条并计数（保留新日志，保证最新状态可追溯）
    queue.shift()
    droppedCount += 1
  }
  queue.push({ level, source, message, details: details === undefined ? undefined : serialize(details) })
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushing) return
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flush()
    return
  }
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, FLUSH_INTERVAL_MS)
}

async function flush(): Promise<void> {
  if (flushing) return
  if (queue.length === 0) return
  flushing = true
  const batch = queue.splice(0, FLUSH_BATCH_SIZE)
  const dropped = droppedCount
  droppedCount = 0
  try {
    await ipc.invoke('runtime:log', { batch, dropped } as never)
  } catch (error) {
    // 日志失败不影响应用：降级到 console，并补记一条错误摘要（不再静默吞掉）
    fallbackToConsole(batch)
    try {
      console.error('[runtime-log] 日志上报失败:', error)
    } catch { /* 忽略 */ }
  } finally {
    flushing = false
  }
  // 若 flush 期间又有新日志，继续调度
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flush()
  } else if (queue.length > 0 && !flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, FLUSH_INTERVAL_MS)
  }
}

function fallbackToConsole(batch: LogEntry[]): void {
  for (const entry of batch) {
    const fn = entry.level === 'error'
      ? console.error
      : entry.level === 'warn'
        ? console.warn
        : console.log
    try {
      fn(`[${entry.source}] ${entry.message}`, entry.details ?? '')
    } catch { /* 忽略 */ }
  }
}

function serialize(value: unknown): unknown {
  try {
    if (value === undefined) return undefined
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

export const runtimeLog = {
  debug(source: string, message: string, details?: unknown): void {
    write('debug', source, message, details)
  },
  info(source: string, message: string, details?: unknown): void {
    write('info', source, message, details)
  },
  warn(source: string, message: string, details?: unknown): void {
    write('warn', source, message, details)
  },
  error(source: string, message: string, details?: unknown): void {
    write('error', source, message, details)
  },
}

function write(level: LogLevel, source: string, message: string, details?: unknown): void {
  if (!ipc.isElectron || isTestEnv()) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`[${source}] ${message}`, details ?? '')
    return
  }
  enqueue(level, source, message, details)
}
