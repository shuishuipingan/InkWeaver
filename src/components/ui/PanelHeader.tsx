import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * 统一面板头部 — 替代 5 处手写副本（AIOutputPanel / BottomPanel / StatsView /
 * FloatingBottomPanel / AgentHeader），遵循 .panel-header 类设计：
 * 36px 高、px-3、大写 11px 弱化标题、底部边框。
 */
interface PanelHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 面板标题（组件会自动 uppercase） */
  title?: React.ReactNode
  /** 标题前的图标 */
  icon?: React.ReactNode
  /** 右侧操作区 */
  actions?: React.ReactNode
  /** 是否显示底部边框，默认 true */
  border?: boolean
  /** 标题是否大写（默认 true，JetBrains 风格） */
  uppercase?: boolean
  /** 标题样式覆盖 */
  titleClassName?: string
  /** 原生 title 提示（悬浮窗拖拽提示等） */
  htmlTitle?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function PanelHeader({
  title,
  icon,
  actions,
  border = true,
  uppercase = true,
  titleClassName,
  htmlTitle,
  className,
  style,
  children,
  ...divProps
}: PanelHeaderProps) {
  return (
    <div
      className={cn('panel-header no-select', !border && 'border-b-0', className)}
      style={style}
      title={htmlTitle}
      {...divProps}
    >
      {icon}
      {title != null && (
        <span
          className={cn(
            'flex-1 min-w-0 truncate',
            uppercase ? 'uppercase tracking-widest' : '',
            titleClassName,
          )}
        >
          {title}
        </span>
      )}
      {children}
      {actions}
    </div>
  )
}

/**
 * 统一面板底部操作条 — 32px 高、px-3、顶部边框、右侧操作区。
 */
interface PanelFooterProps {
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function PanelFooter({ children, actions, className, style }: PanelFooterProps) {
  return (
    <div
      className={cn(
        'no-select flex items-center justify-between gap-2 px-3 flex-shrink-0',
        className,
      )}
      style={{
        height: 32,
        borderTop: '1px solid var(--color-border)',
        ...style,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">{children}</div>
      {actions}
    </div>
  )
}
