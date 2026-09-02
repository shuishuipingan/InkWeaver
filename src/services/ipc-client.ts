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
import { getActiveProjectSessionContext } from '../shared/project-session-context'
import { runtimeLog } from './runtime-log'
import { perf } from './perf-monitor'

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
    runtimeLog.debug('ipc', `调用 ${channel}`, { argCount: args.length })
    let result: unknown
    try {
      result = await invokeWithSession(channel, args)
      runtimeLog.debug('ipc', `完成 ${channel}`, { elapsedMs: Date.now() - startedAt })
      timing.end({ elapsedMs: Date.now() - startedAt })
      return result as AllInvokeChannels[C]['return']
    } catch (error) {
      runtimeLog.error('ipc', `失败 ${channel}`, {
        error: String(error),
        elapsedMs: Date.now() - startedAt,
      })
      timing.end({ elapsedMs: Date.now() - startedAt, failed: true })
      throw error
    }
  },

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
    runtimeLog.debug('ipc', `调用(带会话) ${channel}`, {
      projectId: context.projectId,
      argCount: args.length,
    })
    try {
      const result = await invokeWithSession(channel, args, context)
      runtimeLog.debug('ipc', `完成(带会话) ${channel}`, { elapsedMs: Date.now() - startedAt })
      return result
    } catch (error) {
      runtimeLog.error('ipc', `失败(带会话) ${channel}`, {
        error: String(error),
        elapsedMs: Date.now() - startedAt,
      })
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
