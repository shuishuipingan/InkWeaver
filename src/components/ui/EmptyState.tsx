import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * 统一空状态组件。
 *
 * 修复历史问题：旧版对整个容器设 opacity: 0.3，导致内嵌操作按钮
 * 看起来像 disabled。新版只弱化图标与正文，children/action 保持全不透明。
 *
 * 用法：
 *   <EmptyState
 *     icon={<BookOpen size={36} />}
 *     title="还没有章节"
 *     description="创建第一个章节开始写作"
 *     action={<Button onClick={...}>新建章节</Button>}
 *   />
 */

type EmptyStateSize = 'sm' | 'default' | 'lg'

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 装饰图标（建议 28–36px） */
  icon?: React.ReactNode
  /** 主文案（原 message，保持兼容） */
  message?: string
  /** 主标题（比 message 更醒目的变体） */
  title?: string
  /** 次级说明文字 */
  description?: string
  /** 操作区（按钮等），保持全不透明 */
  action?: React.ReactNode
  /** 尺寸，默认 default */
  size?: EmptyStateSize
  /** 兼容旧 API：仅弱化图标与正文层级（默认 0.35），不再作用于 children */
  opacity?: number
  children?: React.ReactNode
}

const SIZE_GAP: Record<EmptyStateSize, string> = {
  sm: 'gap-1.5',
  default: 'gap-2.5',
  lg: 'gap-4',
}

const SIZE_TEXT: Record<EmptyStateSize, string> = {
  sm: 'text-xs',
  default: 'text-sm',
  lg: 'text-base',
}

export function EmptyState({
  icon,
  message,
  title,
  description,
  action,
  size = 'default',
  opacity = 0.35,
  className,
  style,
  children,
  ...props
}: EmptyStateProps) {
  const resolvedTitle = title ?? message

  return (
    <div
      className={cn('anim-fade-in flex flex-col items-center justify-center h-full text-center px-6', SIZE_GAP[size], className)}
      {...props}
      style={style}
    >
      {icon != null && (
        <div style={{ opacity }} aria-hidden="true" className="flex-shrink-0">
          {icon}
        </div>
      )}
      {resolvedTitle != null && (
        <span
          className={cn('font-medium leading-relaxed', SIZE_TEXT[size])}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {resolvedTitle}
        </span>
      )}
      {description != null && (
        <span
          className={cn(size === 'sm' ? 'text-xs' : 'text-xs', 'max-w-[320px] leading-relaxed')}
          style={{ color: 'var(--color-text-muted)' }}
        >
          {description}
        </span>
      )}
      {children}
      {action}
    </div>
  )
}
