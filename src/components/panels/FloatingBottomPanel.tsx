import { useCallback, useRef } from 'react'
import { X, Minimize2 } from 'lucide-react'
import BottomPanel from './BottomPanel'
import { PanelHeader } from '../ui/PanelHeader'
import { useLayoutStore } from '../../stores/layout-store'
import { useLocaleStore } from '../../stores/locale-store'

/**
 * 底部面板悬浮窗：fixed 定位、可拖拽移动、可缩放。
 * 位置/尺寸持久化在 layout-store（localStorage），下次打开保持。
 */
export default function FloatingBottomPanel() {
  const text = useLocaleStore(s => s.text)
  const bounds = useLayoutStore(s => s.floatingBounds)
  const setBounds = useLayoutStore(s => s.setFloatingBounds)
  const toggleFloating = useLayoutStore(s => s.toggleBottomPanelFloating)
  // 悬浮窗关闭 = 退出悬浮模式 + 关闭面板（避免残留悬浮窗但面板状态不一致）
  const closePanel = useCallback(() => {
    const s = useLayoutStore.getState()
    if (s.bottomPanelFloating) s.toggleBottomPanelFloating()
    if (s.bottomPanelOpen) s.toggleBottomPanel()
  }, [])

  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; orig: typeof bounds } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent, mode: 'move' | 'resize') => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...bounds },
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [bounds])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (drag.mode === 'move') {
      setBounds({
        ...drag.orig,
        x: Math.max(0, drag.orig.x + dx),
        y: Math.max(0, drag.orig.y + dy),
      })
    } else {
      setBounds({
        ...drag.orig,
        width: Math.max(320, drag.orig.width + dx),
        height: Math.max(200, drag.orig.height + dy),
      })
    }
  }, [setBounds])

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
    <div
      className="floating-bottom-panel"
      style={{
        position: 'fixed',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg, 12px)',
        background: 'var(--color-panel)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}
    >
      {/* 标题栏（拖拽移动） */}
      <PanelHeader
        title={text('悬浮面板', 'Floating panel')}
        titleClassName="text-xs font-semibold"
        style={{
          cursor: 'grab',
          background: 'var(--color-titlebar)',
        }}
        onPointerDown={(e) => onPointerDown(e, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        htmlTitle={text('拖拽移动悬浮窗', 'Drag to move')}
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFloating}
              title={text('停靠回底部面板', 'Dock back to bottom panel')}
              className="icon-btn"
              style={{ width: 18, height: 18 }}
            >
              <Minimize2 size={12} strokeWidth={1.5} />
            </button>
            <button
              onClick={closePanel}
              title={text('关闭面板', 'Close panel')}
              className="icon-btn"
              style={{ width: 18, height: 18 }}
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        }
      />

      {/* 内容区：复用 BottomPanel 的视图 */}
      <div className="flex-1 overflow-hidden">
        <BottomPanel />
      </div>

      {/* 右下角缩放手柄 */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 18,
          height: 18,
          cursor: 'nwse-resize',
          background: 'transparent',
        }}
        onPointerDown={(e) => onPointerDown(e, 'resize')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  )
}
