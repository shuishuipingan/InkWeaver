/**
 * RuntimeLogger — 应用全局运行日志
 *
 * 写入日志目录 app-YYYY-MM-DD.log（按天滚动），同时镜像到控制台（容错）。
 * 提供 IPC 通道 runtime:log，渲染进程（含 Agent 引擎）也能写日志。
 * 单文件上限 MAX_LOG_FILE_BYTES，超过后归档为 .old 并新建；
 * 历史保留 MAX_LOG_FILES 个文件。
 *
 * 设计要点：
 * - 任何主进程错误（含 uncaughtException / unhandledRejection）都应落盘；
 * - safeConsole 是主进程安全控制台（吞 EPIPE），同时镜像到文件日志；
 * - 渲染进程 window.onerror / unhandledrejection 通过 runtime:log 上报；
 * - IPC 全局追踪记录每个通道的调用/完成/失败（敏感字段脱敏）。
 *
 * 安全：日志文件名只接受白名单格式（app-YYYY-MM-DD.log / .old），
 * 目录由 logDir() 固定生成，不接受任何外部输入。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { app, ipcMain } from 'electron'
import { VELA_HOME } from '../utils/config-utils'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
let DEFAULT_LEVEL: LogLevel = (process.env.AI_NOVEL_LOG_LEVEL as LogLevel) || 'info'
const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_LOG_FILES = 10 // 保留最近 10 个日志文件

/** 日志文件名字段白名单：只接受 app-YYYY-MM-DD.log 与 app-YYYY-MM-DD.log.old。 */
const LOG_FILE_NAME_PATTERN = /^app-\d{4}-\d{2}-\d{2}\.log(\.old)?$/

/**
 * 日志目录：软件根目录下的 logs/ 子目录。
 * 打包后为 exe 所在目录（例如 D:\Game APP\ai-novel\ai-novel-writer\logs），
 * 未打包开发模式回退到 ~/.vela/logs。
 */
function logDir(): string {
  try {
    const exeDir = path.dirname(app.getPath('exe'))
    const dir = path.join(exeDir, 'logs')
    // 确保日志目录可写；失败时回退到用户目录
    if (fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true }) === undefined) {
      const probe = path.join(dir, '.write-test')
      fs.writeFileSync(probe, 'ok')
      fs.unlinkSync(probe)
      return dir
    }
  } catch { /* 回退到用户目录 */ }
  return path.join(VELA_HOME, 'logs')
}

function logFileName(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `app-${y}-${m}-${d}.log`
}

/**
 * 安全拼接日志文件路径：文件名必须通过白名单校验，目录固定为 logDir()。
 * 不接受任何外部传入的路径片段，杜绝路径穿越。
 */
function safeLogPath(fileName: string): string {
  if (!LOG_FILE_NAME_PATTERN.test(fileName)) {
    throw new Error(`非法日志文件名: ${fileName}`)
  }
  return path.resolve(logDir(), fileName)
}

function ensureLogDir(): string {
  const dir = logDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 清理超出保留数量的历史日志文件。 */
function pruneOldLogs(): void {
  try {
    const dir = logDir()
    if (!fs.existsSync(dir)) return
    const files = fs.readdirSync(dir)
      .filter((name) => LOG_FILE_NAME_PATTERN.test(name) && !name.endsWith('.old'))
      .sort()
    while (files.length > MAX_LOG_FILES) {
      const oldest = files.shift()
      if (!oldest) break
      try {
        fs.unlinkSync(safeLogPath(oldest))
      } catch { /* 忽略清理失败 */ }
    }
  } catch { /* 忽略 */ }
}

/** 追加一行日志到当天文件；文件过大时归档为 .old 并新建。 */
function appendToFile(line: string): void {
  try {
    ensureLogDir()
    const file = safeLogPath(logFileName())
    const stat = fs.existsSync(file) ? fs.statSync(file) : null
    if (stat && stat.size > MAX_LOG_FILE_BYTES) {
      const old = `${file}.old`
      try {
        fs.renameSync(file, old)
      } catch { /* 归档失败则忽略 */ }
    }
    fs.appendFileSync(file, line + '\n', 'utf8')
  } catch { /* 日志失败不影响应用 */ }
}

function formatTime(date = new Date()): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[DEFAULT_LEVEL]
}

/* ===== 结构化字段：进程内序号 + 会话 ID（用于检测丢日志、关联同一次运行） ===== */
let _seq = 0
const _sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

/* ===== 去重限流：相同 level+source+message（无 details）在窗口内只记首次 =====
   针对 EPIPE 等高频重复警告；结构化日志（带 details）不受影响。 */
const RATE_LIMIT_WINDOW_MS = 60_000
const _rateLimit = new Map<string, { count: number; lastAt: number }>()

function rateLimitKey(level: LogLevel, source: string, message: string): string {
  return `${level}|${source}|${message}`
}

/** 返回 true 表示本次应跳过（窗口内重复）；false 表示正常写入。 */
function shouldRateLimit(level: LogLevel, source: string, message: string): boolean {
  const key = rateLimitKey(level, source, message)
  const now = Date.now()
  const prev = _rateLimit.get(key)
  if (!prev) {
    _rateLimit.set(key, { count: 1, lastAt: now })
    return false
  }
  if (now - prev.lastAt < RATE_LIMIT_WINDOW_MS) {
    prev.count += 1
    return true
  }
  // 窗口过期：若期间有累积，补记一条摘要；然后重置计数
  if (prev.count > 1) {
    appendToFile(`[${formatTime()}] [WARN] [${source}] ${message} [重复 ${prev.count} 次] | {"seq":${++_seq},"sessionId":"${_sessionId}"}`)
  }
  _rateLimit.set(key, { count: 1, lastAt: now })
  return false
}

/* ===== 性能监控：IPC 耗时统计（P50/P95/慢操作告警） ===== */
const SLOW_IPC_THRESHOLD_MS = 1000
const IPC_SAMPLE_LIMIT = 200
const _ipcElapsed: number[] = []
const _ipcSlowCount = { count: 0 }
let _slowestChannel = ''
let _slowestElapsedMs = 0

function recordIpcTiming(channel: string, elapsedMs: number): void {
  _ipcElapsed.push(elapsedMs)
  if (elapsedMs > SLOW_IPC_THRESHOLD_MS) {
    _ipcSlowCount.count += 1
    // 记录最慢通道（用于摘要里定位瓶颈）
    if (elapsedMs > _slowestElapsedMs) {
      _slowestElapsedMs = elapsedMs
      _slowestChannel = channel
    }
  }
  // 每 200 个样本输出一次性能摘要（P50/P95/慢操作数）
  if (_ipcElapsed.length >= IPC_SAMPLE_LIMIT) {
    const sorted = [..._ipcElapsed].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)]
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const max = sorted[sorted.length - 1]
    write('info', 'perf', 'IPC 性能摘要', {
      samples: _ipcElapsed.length,
      p50Ms: p50,
      p95Ms: p95,
      maxMs: max,
      slowOps: _ipcSlowCount.count,
      thresholdMs: SLOW_IPC_THRESHOLD_MS,
      slowestChannel: _slowestChannel || undefined,
      slowestMs: _slowestElapsedMs > 0 ? _slowestElapsedMs : undefined,
    })
    _ipcElapsed.length = 0
    _ipcSlowCount.count = 0
    _slowestChannel = ''
    _slowestElapsedMs = 0
  }
}

/**
 * 安全控制台输出。主进程 stdout/stderr 可能是已断开的管道（从资源管理器
 * 启动、终端关闭等），console.* 抛 EPIPE 会升级成 uncaughtException 并弹出
 * 错误对话框，因此吞掉管道写失败——文件日志始终完整。
 */
function safeConsoleLog(level: 'log' | 'warn' | 'error', line: string): void {
  try {
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  } catch { /* 管道断开时静默忽略，文件日志不受影响 */ }
}

/** 路径脱敏：用户主目录 → ~（避免把用户绝对路径写进日志）。 */
let _homeDir = ''
try {
  _homeDir = os.homedir()
} catch { /* 忽略 */ }

function redactPaths(text: string): string {
  if (!_homeDir) return text
  return text.split(_homeDir).join('~')
}

function write(level: LogLevel, source: string, message: string, details?: unknown): void {
  if (!shouldLog(level)) return
  // 无 details 的重复消息走限流（EPIPE 等高频警告），带 details 的结构化日志不限制
  if (details === undefined && shouldRateLimit(level, source, message)) return

  const time = formatTime()
  const seq = ++_seq
  let detailText: string
  if (details === undefined) {
    detailText = ` | {"seq":${seq},"sessionId":"${_sessionId}"}`
  } else {
    const body = typeof details === 'string' ? safeStringify({ text: details }) : safeStringify(details)
    detailText = ` | ${redactPaths(body)} | {"seq":${seq},"sessionId":"${_sessionId}"}`
  }
  const line = `[${time}] [${level.toUpperCase()}] [${source}] ${redactPaths(message)}${detailText}`
  // 控制台输出（debug 级别仅在显式开启时打印）；管道断开不影响文件日志。
  if (level === 'error') safeConsoleLog('error', line)
  else if (level === 'warn') safeConsoleLog('warn', line)
  else if (level === 'debug') {
    if (DEFAULT_LEVEL === 'debug') safeConsoleLog('log', line)
  } else safeConsoleLog('log', line)
  appendToFile(line)
}

function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text
  } catch {
    return String(value)
  }
}

export const runtimeLogger = {
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
  /** 设置日志级别（debug/info/warn/error）。 */
  setLevel(level: LogLevel): void {
    DEFAULT_LEVEL = level
  },
  /** 当前日志文件完整路径（调试用）。 */
  currentLogFile(): string {
    return safeLogPath(logFileName())
  },
}

/**
 * 主进程安全控制台输出（吞 EPIPE），并镜像到文件日志。
 * 供全项目替换裸 console.* 使用——这样任何主进程输出都会落盘，
 * 而不仅是 runtimeLogger 显式调用。
 */
export const safeConsole = {
  log: (...args: unknown[]) => mirrorConsole('log', args),
  info: (...args: unknown[]) => mirrorConsole('log', args),
  warn: (...args: unknown[]) => mirrorConsole('warn', args),
  error: (...args: unknown[]) => mirrorConsole('error', args),
}

function mirrorConsole(level: 'log' | 'warn' | 'error', args: unknown[]): void {
  const text = args
    .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
    .join(' ')
  if (!text) return
  safeConsoleLog(level, text)
  // 镜像到文件日志（source=console），保证裸 console 调用也能排查
  write(level === 'log' ? 'info' : level, 'console', text)
}

/**
 * utils/safe-console 懒加载入口：把一段已拼好的文本写入文件日志。
 * 供 utils/safe-console.ts 调用（避免该模块在加载期依赖 electron）。
 */
export function mirrorConsoleToFile(level: 'info' | 'warn' | 'error', text: string): void {
  if (!text) return
  write(level, 'console', text)
}

/** 注册渲染进程写日志的 IPC 通道：runtime:log / runtime:set-level / runtime:get-level */
export function registerRuntimeLoggerIPC(): void {
  ipcMain.handle('runtime:log', (_event, payload: {
    level?: LogLevel
    source?: string
    message?: string
    details?: unknown
    /** 批量上报（渲染进程有界队列 flush 模式） */
    batch?: Array<{ level: LogLevel; source: string; message: string; details?: unknown }>
    /** 队列满丢弃计数（>0 时记一条 warn，提示日志丢失） */
    dropped?: number
  }) => {
    try {
      if (Array.isArray(payload?.batch) && payload.batch.length > 0) {
        for (const entry of payload.batch) {
          const level = (['debug', 'info', 'warn', 'error'] as const).includes(entry?.level)
            ? entry.level
            : 'info'
          const source = typeof entry?.source === 'string' && entry.source ? entry.source : 'renderer'
          const message = typeof entry?.message === 'string' ? entry.message : String(entry?.message ?? '')
          write(level, source, message, entry?.details)
        }
        if (typeof payload.dropped === 'number' && payload.dropped > 0) {
          write('warn', 'renderer', `日志队列过载，丢弃 ${payload.dropped} 条（保留最新）`, { dropped: payload.dropped })
        }
        return { success: true }
      }

      const level = (['debug', 'info', 'warn', 'error'] as const).includes(payload?.level as LogLevel)
        ? (payload.level as LogLevel)
        : 'info'
      const source = typeof payload?.source === 'string' && payload.source
        ? payload.source
        : 'renderer'
      const message = typeof payload?.message === 'string' ? payload.message : String(payload?.message ?? '')
      write(level, source, message, payload?.details)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 运行时级别控制：渲染进程可在设置/日志面板调整日志详细程度
  ipcMain.handle('runtime:set-level', (_event, level: LogLevel) => {
    if (!(['debug', 'info', 'warn', 'error'] as const).includes(level)) {
      return { success: false, error: `非法日志级别: ${String(level)}` }
    }
    runtimeLogger.setLevel(level)
    runtimeLogger.info('runtime', '运行时日志级别已调整', { level })
    return { success: true, level }
  })

  ipcMain.handle('runtime:get-level', () => {
    return { success: true, level: DEFAULT_LEVEL }
  })
}

/**
 * 包装一个 ipcMain.handle，记录调用开始、成功、失败。
 * 敏感字段（apiKey、password 等）会被脱敏。
 */
const TRACE_SKIP_CHANNELS = new Set([
  'runtime:log',
  'llm:stream-chunk',
  'llm:stream-done',
  'llm:stream-error',
])

export function traceIPC<Args extends unknown[], Result>(
  channel: string,
  handler: (...args: Args) => Promise<Result> | Result,
): (...args: Args) => Promise<Result> {
  // 日志通道自身不追踪，避免递归
  if (TRACE_SKIP_CHANNELS.has(channel)) {
    return (...args: Args) => Promise.resolve(handler(...args))
  }
  // 关键通道（项目/模型/Agent 相关工作流）记录到 info，便于日常排查；
  // 其余通道记录到 debug，避免日志过于膨胀。
  const important = channel.startsWith('project:')
    || channel.startsWith('llm:')
    || channel.startsWith('db:')
    || channel.startsWith('kb:')
    || channel.startsWith('chapter:')
    || channel.startsWith('import:')
    || channel.startsWith('finalization:')
  return async (...args: Args): Promise<Result> => {
    const startedAt = Date.now()
    // 第一个参数通常是 Electron IpcMainInvokeEvent，不写入日志。
    const logArgs = args.slice(1)
    const safeArgs = redactSensitive(logArgs)
    if (important) {
      runtimeLogger.info('ipc', `调用 ${channel}`, { args: safeArgs })
    } else {
      runtimeLogger.debug('ipc', `调用 ${channel}`, { argCount: logArgs.length })
    }
    try {
      const result = await handler(...args)
      const elapsed = Date.now() - startedAt
      recordIpcTiming(channel, elapsed)
      // 慢操作告警：超过阈值记 warn（性能监控）
      if (elapsed > SLOW_IPC_THRESHOLD_MS) {
        runtimeLogger.warn('ipc', `慢操作 ${channel}`, { elapsedMs: elapsed, thresholdMs: SLOW_IPC_THRESHOLD_MS })
      } else if (important) {
        runtimeLogger.info('ipc', `完成 ${channel}`, { elapsedMs: elapsed })
      } else {
        runtimeLogger.debug('ipc', `完成 ${channel}`, { elapsedMs: elapsed })
      }
      return result
    } catch (error) {
      const elapsed = Date.now() - startedAt
      runtimeLogger.error('ipc', `失败 ${channel}`, { elapsedMs: elapsed, error: String(error) })
      throw error
    }
  }
}

const SENSITIVE_KEYS = new Set([
  'apiKey', 'api_key', 'apikey', 'authorization', 'password', 'token', 'secret',
])
/** 路径形字符串（含主目录或盘符绝对路径）→ 正则命中即脱敏 */
const PATH_SHAPED_PATTERN = /^[A-Za-z]:[\\/]|^\/[^/]+(?:[\\/][^/]+)+$/i

/** 递归脱敏敏感字段，避免 API Key、用户绝对路径等写入日志。 */
function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]'
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        out[key] = typeof val === 'string' && val ? '[REDACTED:' + val.length + ']' : '[REDACTED]'
      } else {
        out[key] = redactSensitive(val, depth + 1)
      }
    }
    return out
  }
  if (typeof value === 'string' && PATH_SHAPED_PATTERN.test(value)) {
    return redactPaths(value) === value ? '[REDACTED:path]' : redactPaths(value)
  }
  return value
}

/**
 * 全局包装 ipcMain.handle，让所有 IPC 通道自动记录调用/完成/失败。
 * 必须在任何控制器注册之前调用。
 */
export function installIPCGlobalTracing(ipc: {
  handle: (channel: string, listener: (...args: any[]) => any) => void
}): void {
  const originalHandle = ipc.handle.bind(ipc)
  ipc.handle = ((channel: string, listener: (...args: any[]) => any) => {
    const wrapped = traceIPC(channel, listener)
    return originalHandle(channel, wrapped)
  }) as typeof ipc.handle
  runtimeLogger.info('ipc', '全局 IPC 追踪已启用')
}

// 启动时清理历史日志并记录一次启动事件（加载期副作用必须容错：
// 单元测试中 app.getPath 可能不可用，此时跳过启动日志即可）。
try {
  pruneOldLogs()
  runtimeLogger.info('runtime', '运行日志服务已初始化', { logFile: runtimeLogger.currentLogFile() })
} catch { /* 测试环境或日志目录不可用时忽略 */ }
