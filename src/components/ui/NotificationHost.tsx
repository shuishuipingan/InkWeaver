/**
 * NotificationHost — 统一通知容器（挂载在 App.tsx 根部）。
 *
 * 渲染 notification-store 中的所有通知，具备：
 * - 堆叠展示（最多 4 条）
 * - 进出场动画（animate-toast-enter / animate-toast-exit）
 * - 悬停暂停自动关闭
 * - ARIA 播报（error → role="alert"；其余 → aria-live="polite"）
 * - 去重计数徽标（×N）
 */

import * as React from 'react'
import { X, CheckCircle2, AlertTriangle, Info, Sparkles } from 'lucide-react'
import { useNotificationStore, type Notification, type NotificationAction } from '../../stores/notification-store'
import { useLocaleStore } from '../../stores/locale-store'
import { cn } from '../../lib/utils'

/** 类型 → 视觉映射 */
const NOTIFICATION_STYLE: Record<Notification['type'], { border: string; bg: string; icon: React.ReactNode }> = {
  success: {
    border: 'var(--color-success)',
    bg: 'color-mix(in srgb, var(--color-success) 10%, var(--color-popover-bg))',
    icon: <CheckCircle2 size={15} style={{ color: 'var(--color-success)', flexShrink: 0 }} />,
  },
  error: {
    border: 'var(--color-error)',
    bg: 'color-mix(in srgb, var(--color-error) 10%, var(--color-popover-bg))',
    icon: <AlertTriangle size={15} style={{ color: 'var(--color-error)', flexShrink: 0 }} />,
  },
  warning: {
    border: 'var(--color-warning)',
    bg: 'color-mix(in srgb, var(--color-warning) 10%, var(--color-popover-bg))',
    icon: <AlertTriangle size={15} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />,
  },
  info: {
    border: 'var(--color-accent)',
    bg: 'color-mix(in srgb, var(--color-accent) 10%, var(--color-popover-bg))',
    icon: <Info size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />,
  },
  ai: {
    border: 'var(--color-accent)',
    bg: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-popover-bg))',
    icon: <Sparkles size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />,
  },
}

function NotificationCard({ item }: { item: Notification }) {
  const dismiss = useNotificationStore(s => s.dismiss)
  const pause = useNotificationStore(s => s.pause)
  const resume = useNotificationStore(s => s.resume)
  const text = useLocaleStore(s => s.text)
  const [isExiting, setIsExiting] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)

  const { border, bg, icon } = NOTIFICATION_STYLE[item.type]

  const dismissWithAnimation = React.useCallback(() => {
    setIsExiting(true)
    // 退场动画 150ms 后移除 DOM
    window.setTimeout(() => dismiss(item.id), 150)
  }, [dismiss, item.id])

  // 自动关闭计时（duration 0 = 常驻；悬停暂停）
  React.useEffect(() => {
    if (item.duration <= 0) return
    if (hovered) return

    const timer = window.setTimeout(dismissWithAnimation, item.duration)
    return () => window.clearTimeout(timer)
  }, [item.duration, item.createdAt, item.remainingMs, hovered, dismissWithAnimation])

  const handleAction = async (action: NotificationAction) => {
    if (action.onClick) {
      await action.onClick()
    }
    dismissWithAnimation()
  }

  return (
    <div
      className={cn(
        'pointer-events-auto flex flex-col gap-2 px-4 py-3 rounded-xl border backdrop-blur-xl',
        isExiting ? 'animate-toast-exit' : 'animate-toast-enter',
      )}
      style={{
        backgroundColor: bg,
        backdropFilter: 'blur(24px)',
        border: `1px solid var(--color-border)`,
        borderLeft: `3px solid ${border}`,
        boxShadow: 'var(--shadow-popover)',
        maxWidth: 400,
        minWidth: 280,
      }}
      role={item.type === 'error' ? 'alert' : 'status'}
      aria-live={item.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => { setHovered(true); pause(item.id) }}
      onMouseLeave={() => { setHovered(false); resume(item.id) }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{icon}</div>
        <span
          className="flex-1 text-xs leading-relaxed"
          style={{
            color: 'var(--color-text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {item.message}
          {item.repeatCount > 1 && (
            <span className="ml-1.5 px-1 py-0.5 rounded text-[10px] align-middle" style={{ backgroundColor: 'rgba(var(--color-accent-rgb), 0.12)', color: 'var(--color-accent)' }}>
              ×{item.repeatCount}
            </span>
          )}
        </span>
        <button
          onClick={dismissWithAnimation}
          className="flex-shrink-0 p-0.5 rounded transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            lineHeight: 1,
          }}
          aria-label={text('关闭通知', 'Dismiss notification')}
        >
          <X size={13} />
        </button>
      </div>

      {item.actions && item.actions.length > 0 && (
        <div className="flex justify-end gap-1.5">
          {item.actions.map((action, i) => (
            <button
              key={i}
              onClick={() => void handleAction(action)}
              className={cn(
                'px-3 py-1 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-95',
                action.variant === 'ghost'
                  ? 'hover:bg-[var(--color-hover)]'
                  : 'hover:brightness-110',
              )}
              style={{
                border: action.variant === 'ghost' ? '1px solid var(--color-border)' : '1px solid transparent',
                backgroundColor: action.variant === 'ghost' ? 'transparent' : 'var(--color-accent)',
                color: action.variant === 'ghost' ? 'var(--color-text-secondary)' : 'var(--color-accent-foreground, #fff)',
                cursor: 'pointer',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 统一通知容器 — 挂载在 App.tsx 根部 */
export function NotificationHost() {
  const notifications = useNotificationStore(s => s.notifications)

  if (notifications.length === 0) return null

  return (
    <div
      className="fixed bottom-10 right-5 z-[var(--z-toast)] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {notifications.map(item => (
        <NotificationCard key={item.id} item={item} />
      ))}
    </div>
  )
}
