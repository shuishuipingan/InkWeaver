import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * 视图转场组件 — 统一「进场 + 退场」编排。
 *
 * 用法：
 *   <ViewTransition transitionKey={activeTabId}>
 *     {content}
 *   </ViewTransition>
 *
 * 行为：
 * - transitionKey 变化时，旧内容先退场（--dur-fast 淡出），再换入新内容并播放入场动画。
 * - 仅动 opacity / transform，不触发重排；遵守 prefers-reduced-motion（由全局 CSS 兜底）。
 * - children 变化但 transitionKey 未变时不触发转场（如流式内容原地更新）。
 */
interface ViewTransitionProps {
  /** 切换依据；变化时触发转场 */
  transitionKey: string | number
  /** 入场动画类，默认 anim-fade-in-up */
  enterClassName?: string
  /** 退场动画类，默认 anim-fade-out */
  exitClassName?: string
  /** 退场时长（ms），与 --dur-fast 对齐 */
  exitDurationMs?: number
  /** 是否启用退场（默认 true） */
  exit?: boolean
  className?: string
  children: React.ReactNode
}

export function ViewTransition({
  transitionKey,
  enterClassName = 'anim-fade-in-up',
  exitClassName = 'anim-fade-out',
  exitDurationMs = 80,
  exit = true,
  className,
  children,
}: ViewTransitionProps) {
  const [state, setState] = React.useState<{
    key: string | number
    node: React.ReactNode
    leaving: boolean
  }>({ key: transitionKey, node: children, leaving: false })

  React.useEffect(() => {
    if (state.key === transitionKey) return
    // With exit disabled the new child is already derived during render; this
    // timer only aligns the retained transition snapshot for the next change.
    // With exit enabled, render derives `leaving` without a cascading update.
    const timer = window.setTimeout(() => {
      setState({ key: transitionKey, node: children, leaving: false })
    }, exit ? exitDurationMs : 0)
    return () => window.clearTimeout(timer)
  }, [state.key, transitionKey, children, exit, exitDurationMs])

  const visibleState = state.key === transitionKey
    ? state
    : exit
      ? { ...state, leaving: true }
      : { key: transitionKey, node: children, leaving: false }

  return (
    <div className={cn('h-full min-h-0', className)}>
      <div
        key={visibleState.key}
        className={cn('h-full min-h-0', visibleState.leaving ? exitClassName : enterClassName)}
      >
        {visibleState.node}
      </div>
    </div>
  )
}

ViewTransition.displayName = 'ViewTransition'
