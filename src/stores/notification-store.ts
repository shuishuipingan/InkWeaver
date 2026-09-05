/**
 * 统一通知 store — 收敛 Toast / ActionToast 三套实现为单一事实来源。
 *
 * 能力：
 * - 单一容器渲染（NotificationHost）
 * - 去重：2s 内相同 type+message 合并计数（显示 ×N）
 * - 悬停暂停（pause/resume）
 * - 进度/常驻通知（duration 0 = 常驻，需手动关闭）
 * - ARIA：容器 aria-live，error 级用 role="alert"
 */

import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'ai'

export interface NotificationAction {
  /** 按钮文案 */
  label: string
  /** 点击回调（点击后通知自动关闭） */
  onClick?: () => void | Promise<void>
  /** 按钮风格：主色('primary') 或灰色('ghost') */
  variant?: 'primary' | 'ghost'
}

export interface Notification {
  id: number
  type: NotificationType
  message: string
  duration: number
  actions?: NotificationAction[]
  createdAt: number
  /** 悬停暂停时剩余时长（ms） */
  remainingMs: number
  /** 去重计数（>1 表示同一消息被合并） */
  repeatCount: number
}

export interface ShowNotificationOptions {
  type?: NotificationType
  message: string
  duration?: number
  actions?: NotificationAction[]
}

interface NotificationState {
  notifications: Notification[]
  show: (options: ShowNotificationOptions) => number
  dismiss: (id: number) => void
  /** 悬停暂停自动关闭计时 */
  pause: (id: number) => void
  /** 离开后恢复计时 */
  resume: (id: number) => void
}

let _nextId = 1

/** 去重窗口：相同消息在 2s 内重复 → 合并计数 */
const DEDUP_WINDOW_MS = 2000
/** 最多同时显示条数，超出后移除最早一条 */
const MAX_VISIBLE = 4

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 3500,
  error: 5000,
  warning: 4500,
  info: 4000,
  ai: 8000,
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  show: (options) => {
    const type = options.type ?? 'info'
    const duration = options.duration ?? DEFAULT_DURATIONS[type]

    // 去重：2s 内相同 type+message → 合并计数并重置计时
    const now = Date.now()
    const existing = get().notifications.find(
      n => n.type === type && n.message === options.message && now - n.createdAt < DEDUP_WINDOW_MS,
    )
    if (existing && !options.actions?.length) {
      set(state => ({
        notifications: state.notifications.map(n =>
          n.id === existing.id
            ? { ...n, repeatCount: n.repeatCount + 1, createdAt: now, remainingMs: duration }
            : n,
        ),
      }))
      return existing.id
    }

    const id = _nextId++
    set(state => {
      const notifications = [
        ...state.notifications,
        { id, type, message: options.message, duration, actions: options.actions, createdAt: now, remainingMs: duration, repeatCount: 1 },
      ]
      // 超出上限：移除最早一条（正在退出动画的除外——简单起见直接移除）
      if (notifications.length > MAX_VISIBLE) {
        notifications.shift()
      }
      return { notifications }
    })
    return id
  },

  dismiss: (id) => {
    set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }))
  },

  pause: (id) => {
    set(state => ({
      notifications: state.notifications.map(n => {
        if (n.id !== id) return n
        const elapsed = Date.now() - n.createdAt
        return { ...n, remainingMs: Math.max(0, n.duration - elapsed), createdAt: Date.now() }
      }),
    }))
  },

  resume: (id) => {
    set(state => ({
      notifications: state.notifications.map(n => (n.id === id ? { ...n, createdAt: Date.now() } : n)),
    }))
  },
}))

/**
 * 便捷 API：toast.success(msg) 等（与旧 Toast.tsx API 完全兼容）。
 * 类型别名保留，避免业务代码 import 变动。
 */
export type ToastType = NotificationType

export const toast = {
  success: (msg: string, duration?: number) => useNotificationStore.getState().show({ type: 'success', message: msg, duration }),
  error:   (msg: string, duration?: number) => useNotificationStore.getState().show({ type: 'error', message: msg, duration }),
  warning: (msg: string, duration?: number) => useNotificationStore.getState().show({ type: 'warning', message: msg, duration }),
  info:    (msg: string, duration?: number) => useNotificationStore.getState().show({ type: 'info', message: msg, duration }),
}

/**
 * 便捷 API：actionToast.show(...) / actionToast.workflowComplete(...)
 * （与旧 ActionToast.tsx API 完全兼容）。
 */
export const actionToast = {
  show: (options: ShowNotificationOptions) => useNotificationStore.getState().show(options),
  workflowComplete: (message: string, openAction?: () => void) =>
    useNotificationStore.getState().show({
      type: 'ai',
      message,
      actions: openAction
        ? [{ label: '打开查看', onClick: openAction }]
        : undefined,
    }),
}
