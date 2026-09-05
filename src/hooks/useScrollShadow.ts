import { useEffect, useRef, useState } from 'react'

/**
 * 滚动阴影 hook — 容器滚动时在顶部/底部显示渐隐阴影，反馈「还有更多内容」。
 *
 * 用法：
 *   const { ref, topShadow, bottomShadow } = useScrollShadow<HTMLDivElement>()
 *   <div className="relative">
 *     {topShadow && <div className="pointer-events-none absolute inset-x-0 top-0 h-3 scroll-shadow-top" />}
 *     <div ref={ref} className="overflow-y-auto h-full">...</div>
 *     {bottomShadow && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 scroll-shadow-bottom" />}
 *   </div>
 *
 * 实现：监听 scroll + ResizeObserver 更新状态，不触发重排（仅读 scrollTop/scrollHeight/clientHeight）。
 * 阴影本身用渐变 + transition 淡入淡出，动画只动 opacity。
 */
export function useScrollShadow<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [shadow, setShadow] = useState({ top: false, bottom: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const hasOverflow = scrollHeight > clientHeight + 1
      setShadow({
        top: hasOverflow && scrollTop > 4,
        bottom: hasOverflow && scrollTop + clientHeight < scrollHeight - 4,
      })
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  return { ref, topShadow: shadow.top, bottomShadow: shadow.bottom }
}
