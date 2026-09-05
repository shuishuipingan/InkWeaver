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

  const prevKey = React.useRef(transitionKey)

  React.useEffect(() => {
    if (prevKey.current === transitionKey) return
    prevKey.current = transitionKey

    if (!exit) {
      // The transition state intentionally follows the prop after an effect;
      // this branch is the no-exit fast path and avoids a stale child frame.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ key: transitionKey, node: children, leaving: false })
      return
    }

    // 阶段 1：旧内容退场
    setState(s => ({ ...s, leaving: true }))
    // 阶段 2：换入新内容（新 key 触发重挂载 + 入场动画）
    const timer = window.setTimeout(() => {
      setState({ key: transitionKey, node: children, leaving: false })
    }, exitDurationMs)
    return () => window.clearTimeout(timer)
  }, [transitionKey, children, exit, exitDurationMs])

  return (
    <div className={cn('h-full min-h-0', className)}>
      <div
        key={state.key}
        className={cn('h-full min-h-0', state.leaving ? exitClassName : enterClassName)}
      >
        {state.node}
      </div>
    </div>
  )
}

ViewTransition.displayName = 'ViewTransition'
