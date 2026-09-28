/**
 * 渲染进程的 IPC 客户端 — 类型安全的主进程通信封装
 *
 * 用法：
 *   import { ipc } from '@/services/ipc-client'
 *   const result = await ipc.invoke('project:create', { name: '...' })
 */
import type {
  AllInvokeChannels,
  AllEventChannels,
  InvokeChannel,
  EventChannel,
} from '../shared/ipc-channels'
import type { ProjectSessionContext } from '../shared/ipc-channels'
import {
  getActiveProjectSessionContext,
  sameProjectSessionContext,
} from '../shared/project-session-context'
import { runtimeLog } from './runtime-log'
import { perf } from './perf-monitor'

type BackgroundProjectQueryChannel =
  | 'fs:list-dir'
  | 'db:draft-list'
  | 'db:draft-list-all'
  | 'db:character-roster-read'
  | 'db:project-core-get'
  | 'db:blueprint-get-all'
  | 'db:blueprint-get'
  | 'db:story-direction-snapshot'
  | 'db:story-direction-latest-run'
  | 'db:planning-material-list'
  | 'db:continuity-list-all'
  | 'db:chapter-handoff-list-all'
  | 'db:narrative-thread-list'
  | 'db:draft-get-full'
  | 'db:writing-style-history-list'
  | 'db:story-continuity-read'
  | 'db:continuity-list-before'
  | 'db:story-continuity-list-all'
  | 'db:chapter-handoff-latest-before'
  | 'db:narrative-thread-list-relevant'
  | 'db:knowledge-event-list-for-chapter'
  | 'db:knowledge-event-list-review'
  | 'db:draft-get-meta'
  | 'db:chapter-handoff-list-for-chapter'
  | 'db:character-extraction-candidates-list'
  | 'db:consistency-exemption-list'
  | 'db:import-run-list-resumable'
  | 'db:import-run-author-preview'
  | 'fs:read-file'
  | 'fs:read-json'
  | 'kb:list-documents'
  | 'kb:stats'
  | 'kb:get-vector-rebuild-status'
  | 'db:draft-authority-sequence'

const BACKGROUND_PROJECT_QUERY_CHANNELS = new Set<string>([
  'fs:list-dir',
  'db:draft-list',
  'db:draft-list-all',
  'db:character-roster-read',
  'db:project-core-get',
  'db:blueprint-get-all',
  'db:blueprint-get',
  'db:story-direction-snapshot',
  'db:story-direction-latest-run',
  'db:planning-material-list',
  'db:continuity-list-all',
  'db:chapter-handoff-list-all',
  'db:narrative-thread-list',
  'db:draft-get-full',
  'db:writing-style-history-list',
  'db:story-continuity-read',
  'db:continuity-list-before',
  'db:story-continuity-list-all',
  'db:chapter-handoff-latest-before',
  'db:narrative-thread-list-relevant',
  'db:knowledge-event-list-for-chapter',
  'db:knowledge-event-list-review',
  'db:draft-get-meta',
  'db:chapter-handoff-list-for-chapter',
  'db:character-extraction-candidates-list',
  'db:consistency-exemption-list',
  'db:import-run-list-resumable',
  'db:import-run-author-preview',
  'fs:read-file',
  'fs:read-json',
  'kb:list-documents',
  'kb:stats',
  'kb:get-vector-rebuild-status',
  'db:draft-authority-sequence',
])

function isBackgroundProjectQueryChannel(channel: string): channel is BackgroundProjectQueryChannel {
  return BACKGROUND_PROJECT_QUERY_CHANNELS.has(channel)
}

/** 从 preload 暴露的 velaAPI */
interface VelaAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  once: (channel: string, callback: (...args: unknown[]) => void) => void
  send: (channel: string, ...args: unknown[]) => void
  setZoomLevel: (level: number) => void
  setZoomFactor: (factor: number) => void
  getZoomLevel: () => number
}

/** 获取 velaAPI（由 preload 注入到 window） */
function getAPI(): VelaAPI {
  const api = (window as unknown as { velaAPI: VelaAPI }).velaAPI
  if (!api) {
    // 浏览器模式下的降级处理（开发时直接浏览器打开的情况）
    console.warn('[InkWeaver IPC] velaAPI 未注入，可能不在 Electron 环境中运行')
    return {
      invoke: async () => { throw new Error('不在 Electron 环境中') },
      on: () => () => {},
      once: () => {},
      send: () => {},
      setZoomLevel: () => {},
      setZoomFactor: () => {},
      getZoomLevel: () => 0,
    }
  }
  return api
}

/**
 * 这些请求的授权来自用户选择后由主进程签发的 grant，或固定 app-data 边界；
 * 它们绝不能借用、也不需要当前项目会话。
 */
function isCapabilityOrAppDataChannel(channel: string): boolean {
  return channel.startsWith('fs:grant-')
    || channel.startsWith('dialog:select-')
    || channel.startsWith('prompt:')
    || channel === 'skills:list-user'
}

function isProjectScopedChannel(channel: string): boolean {
  if (isCapabilityOrAppDataChannel(channel)) return false
  return channel.startsWith('db:')
    || channel.startsWith('kb:')
    || channel.startsWith('chapter:')
    || channel.startsWith('fs:')
    || channel === 'project:save'
    || channel === 'project:update-config'
    || channel === 'project:delete'
}

// Runtime-log transport calls are themselves the persistence boundary. They
// must not emit another IPC trace event or the renderer would recursively
// enqueue log calls while trying to flush the queue.
function isRuntimeLogChannel(channel: string): boolean {
  return channel === 'runtime:log'
    || channel === 'runtime:log-batch'
    || channel === 'runtime:log-status'
    || channel === 'runtime:log-page'
    || channel === 'runtime:log-flush'
    || channel === 'runtime:log-export'
    || channel === 'runtime:set-level'
    || channel === 'runtime:get-level'
}

function invokeWithSession<C extends InvokeChannel>(
  channel: C,
  args: AllInvokeChannels[C]['args'],
  context?: ProjectSessionContext,
): Promise<AllInvokeChannels[C]['return']> {
  if (!isProjectScopedChannel(channel)) {
    return getAPI().invoke(channel, ...args) as Promise<AllInvokeChannels[C]['return']>
  }
  const projectSession = context ?? getActiveProjectSessionContext()
  if (!projectSession) {
    throw new Error('缺少当前项目会话，已拒绝项目数据访问')
  }
  return getAPI().invoke(channel, ...args, projectSession) as Promise<AllInvokeChannels[C]['return']>
}

/**
 * Query boundary for passive work owned by a project view or refresh subscriber.
 * A missing/replaced lease means the work was cancelled by the lifecycle. Errors
 * are still surfaced while the same lease remains active, and writes continue
 * to use invokeWithProjectSession so the main process can reject stale leases.
 */
async function invokeBackgroundWithProjectSession<C extends InvokeChannel>(
  context: ProjectSessionContext,
  channel: C & BackgroundProjectQueryChannel,
  args: AllInvokeChannels[C]['args'],
): Promise<AllInvokeChannels[C]['return'] | undefined> {
  if (!isBackgroundProjectQueryChannel(channel)) {
    throw new Error(`后台项目查询通道不允许此操作：${channel}`)
  }

  const isCurrent = () => sameProjectSessionContext(
    context,
    getActiveProjectSessionContext(),
  )
  if (!isCurrent()) return undefined

  const startedAt = Date.now()
  const timing = perf.start('ipc-background-invoke', { channel })
  const trace = !isRuntimeLogChannel(channel)
  if (trace) runtimeLog.debug('ipc', `调用(后台查询) ${channel}`, {
    projectId: context.projectId,
    argCount: args.length,
  })

  try {
    const result = await invokeWithSession(channel, args, context)
    if (!isCurrent()) {
      timing.end({ elapsedMs: Date.now() - startedAt, cancelled: true })
      return undefined
    }
    if (trace) runtimeLog.debug('ipc', `完成(后台查询) ${channel}`, { elapsedMs: Date.now() - startedAt })
    timing.end({ elapsedMs: Date.now() - startedAt })
    return result as AllInvokeChannels[C]['return']
  } catch (error) {
    if (!isCurrent()) {
      timing.end({ elapsedMs: Date.now() - startedAt, cancelled: true })
      return undefined
    }
    if (trace) {
      runtimeLog.error('ipc', `失败(后台查询) ${channel}`, {
        error: String(error),
        elapsedMs: Date.now() - startedAt,
      })
    }
    timing.end({ elapsedMs: Date.now() - startedAt, failed: true })
    throw error
  }
}

/** 类型安全的 IPC 客户端 */
export const ipc = {
  /**
   * 调用主进程并等待返回值（类型安全）
   *
   * @example
   * const result = await ipc.invoke('project:create', { name: '我的小说', path: '/path', genre: '玄幻', targetAudience: '男频' })
   */
  invoke: async <C extends InvokeChannel>(
    channel: C,
    ...args: AllInvokeChannels[C]['args']
  ): Promise<AllInvokeChannels[C]['return']> => {
    const startedAt = Date.now()
    const timing = perf.start('ipc-invoke', { channel })
    const trace = !isRuntimeLogChannel(channel)
    if (trace) runtimeLog.debug('ipc', `调用 ${channel}`, { argCount: args.length })
    let result: unknown
    try {
      result = await invokeWithSession(channel, args)
      if (trace) runtimeLog.debug('ipc', `完成 ${channel}`, { elapsedMs: Date.now() - startedAt })
      timing.end({ elapsedMs: Date.now() - startedAt })
      return result as AllInvokeChannels[C]['return']
    } catch (error) {
      if (trace) {
        runtimeLog.error('ipc', `失败 ${channel}`, {
          error: String(error),
          elapsedMs: Date.now() - startedAt,
        })
      }
      timing.end({ elapsedMs: Date.now() - startedAt, failed: true })
      throw error
    }
  },

  /** Invoke only passive project reads; lifecycle cancellation resolves to undefined. */
  invokeBackground: async <C extends BackgroundProjectQueryChannel>(
    channel: C,
    ...args: AllInvokeChannels[C]['args']
  ): Promise<AllInvokeChannels[C]['return'] | undefined> => {
    if (!isBackgroundProjectQueryChannel(channel)) {
      throw new Error(`后台查询通道不允许此操作：${channel}`)
    }
    const context = getActiveProjectSessionContext()
    if (!context) return undefined
    return invokeBackgroundWithProjectSession(context, channel, args)
  },

  /** Invoke a passive project read using the session frozen by its owning view. */
  invokeBackgroundWithProjectSession: async <C extends BackgroundProjectQueryChannel>(
    context: ProjectSessionContext,
    channel: C,
    ...args: AllInvokeChannels[C]['args']
  ): Promise<AllInvokeChannels[C]['return'] | undefined> => (
    invokeBackgroundWithProjectSession(context, channel, args) as Promise<AllInvokeChannels[C]['return'] | undefined>
  ),

  /** 工作流/工具在启动处冻结会话后，必须使用此入口而不是重新读取 currentProject。 */
  invokeWithProjectSession: async <C extends InvokeChannel>(
    context: ProjectSessionContext,
    channel: C,
    ...args: AllInvokeChannels[C]['args']
  ): Promise<AllInvokeChannels[C]['return']> => {
    if (!isProjectScopedChannel(channel)) {
      throw new Error(`通道不属于项目会话范围：${channel}`)
    }
    const startedAt = Date.now()
    const trace = !isRuntimeLogChannel(channel)
    if (trace) {
      runtimeLog.debug('ipc', `调用(带会话) ${channel}`, {
        projectId: context.projectId,
        argCount: args.length,
      })
    }
    try {
      const result = await invokeWithSession(channel, args, context)
      if (trace) runtimeLog.debug('ipc', `完成(带会话) ${channel}`, { elapsedMs: Date.now() - startedAt })
      return result
    } catch (error) {
      if (trace) {
        runtimeLog.error('ipc', `失败(带会话) ${channel}`, {
          error: String(error),
          elapsedMs: Date.now() - startedAt,
        })
      }
      throw error
    }
  },

  /**
   * 监听主进程推送的事件（返回取消订阅函数）
   *
   * @example
   * const unsub = ipc.on('llm:stream-chunk', (data) => console.log(data.chunk))
   * // 组件卸载时取消
   * unsub()
   */
  on: <C extends EventChannel>(
    channel: C,
    callback: (data: AllEventChannels[C]) => void,
  ): (() => void) => {
    return getAPI().on(channel, callback as (...args: unknown[]) => void)
  },

  /** 一次性监听 */
  once: <C extends EventChannel>(
    channel: C,
    callback: (data: AllEventChannels[C]) => void,
  ) => {
    getAPI().once(channel, callback as (...args: unknown[]) => void)
  },

  /** 单向发送（无返回值） */
  send: (channel: string, ...args: unknown[]) => {
    getAPI().send(channel, ...args)
  },

  /** 是否在 Electron 环境中 */
  get isElectron(): boolean {
    return typeof window !== 'undefined'
      && !!(window as unknown as { velaAPI: VelaAPI }).velaAPI
  },

  /** 设置窗口缩放级别 */
  setZoomLevel: (level: number) => {
    getAPI().setZoomLevel(level)
  },

  /** 设置绝对缩放比例 */
  setZoomFactor: (factor: number) => {
    getAPI().setZoomFactor(factor)
  },

  /** 获取当前缩放级别 */
  getZoomLevel: () => {
    return getAPI().getZoomLevel()
  }
}
