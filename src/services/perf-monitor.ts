/**
 * 渲染进程性能监控 — 轻量埋点 + 慢操作告警。
 *
 * 设计：
 * - 与主进程 runtime-logger 内置的 IPC 性能统计互补：本模块负责
 *   「渲染进程内」耗时测量（LLM 首字节、章节保存、树刷新等业务路径）。
 * - 慢操作（超过阈值）自动记 warn 到主进程日志，便于事后排查。
 * - 零依赖、无副作用；未显式调用 mark/measure 时不做任何事。
 *
 * 用法：
 *   import { perf } from '@/services/perf-monitor'
 *   const t = perf.start('chapter-save')
 *   ...
 *   t.end()                       // 低于阈值不记录；超阈值自动 warn
 *   t.end({ projectId })          // 可带业务上下文
 */

import { runtimeLog } from './runtime-log'

type PerfContext = Record<string, string | number | boolean | undefined>

interface ActiveMark {
  name: string
  startedAt: number
  context?: PerfContext
}

/** 慢操作阈值（ms）：低于阈值不产生任何日志，避免噪音 */
const SLOW_MS = 500

/** 同时进行中的埋点（防泄漏，超量时丢弃最旧） */
const active = new Map<string, ActiveMark>()
const MAX_ACTIVE = 32

let seq = 0

function currentTime(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/**
 * 开始测量一个操作。返回 end() 句柄。
 * 同名操作可叠加（如批量保存每章各测一次），内部用自增序号区分。
 */
export function start(name: string, context?: PerfContext): { end: (finalContext?: PerfContext) => void } {
  const id = `${name}#${++seq}`
  if (active.size >= MAX_ACTIVE) {
    // 防泄漏：丢弃最旧的一个（保留最新，保证当前状态可观测）
    const oldest = active.keys().next().value
    if (oldest !== undefined) active.delete(oldest)
  }
  active.set(id, { name, startedAt: currentTime(), context })
  return {
    end(finalContext?: PerfContext): void {
      const mark = active.get(id)
      if (!mark) return
      active.delete(id)
      const elapsedMs = currentTime() - mark.startedAt
      if (elapsedMs >= SLOW_MS) {
        runtimeLog.warn('perf', `慢操作：${name}`, {
          elapsedMs: Math.round(elapsedMs),
          ...mark.context,
          ...finalContext,
        })
      }
    },
  }
}

/** 单次便捷测量：fn 执行完毕后自动记录（仅慢操作产生日志）。 */
export async function measure<T>(
  name: string,
  fn: () => Promise<T>,
  context?: PerfContext,
): Promise<T> {
  const t = start(name, context)
  try {
    return await fn()
  } finally {
    t.end()
  }
}

export const perf = { start, measure }
