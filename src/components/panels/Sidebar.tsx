/**
 * Sidebar — 左侧导航面板容器
 *
 * 纯路由容器，根据 sidebarView 切换子视图。
 * 所有子视图已拆分到 sidebar/ 子目录。
 */

import { useState, useEffect } from 'react'
import { useLayoutStore } from '../../stores/layout-store'
import { ContextMenu } from '../ui/ContextMenu'
import { ViewTransition } from '../ui/ViewTransition'
import { useScrollShadow } from '../../hooks/useScrollShadow'
import KnowledgePanel from './KnowledgePanel'
import HomeSidebarPanel from './sidebar/HomeSidebarPanel'
import ProjectTree from './sidebar/ProjectTree'
import CharactersView from './sidebar/CharactersView'
import {
  registerMenuSetter, unregisterMenuSetter,
  type SidebarMenuState,
} from './sidebar/sidebar-menu'
import { useLocaleStore } from '../../stores/locale-store'

/** 左侧面板 */
export default function Sidebar() {
  const sidebarView = useLayoutStore(s => s.sidebarView)
  const text = useLocaleStore(s => s.text)
  // 全局右键菜单状态
  const [sidebarMenu, setSidebarMenu] = useState<SidebarMenuState | null>(null)

  // 注册 / 注销右键菜单 setter
  useEffect(() => {
    registerMenuSetter(setSidebarMenu)
    return () => { unregisterMenuSetter() }
  }, [])

  const viewTitles: Record<string, string> = {
    home:       text('主页', 'Home'),
    project:    text('项目结构', 'Project'),
    knowledge:  text('知识库', 'Knowledge'),
    characters: text('角色管理', 'Characters'),
  }

  // 滚动阴影：内容溢出时提示「还有更多」
  const { ref: scrollRef, topShadow, bottomShadow } = useScrollShadow<HTMLDivElement>()

  return (
    <div
      className="skin-workspace-panel w-full h-full flex flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--color-sidebar)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      <div className="panel-header">
        <span>{viewTitles[sidebarView]}</span>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto py-1">
          {/* ViewTransition 统一「退场 + 进场」转场（仅 opacity/transform） */}
          <ViewTransition transitionKey={sidebarView} className="h-full">
            {sidebarView === 'home'       && <HomeSidebarPanel />}
            {sidebarView === 'project'    && <ProjectTree />}
            {sidebarView === 'knowledge'  && <KnowledgePanel />}
            {sidebarView === 'characters' && <CharactersView />}
          </ViewTransition>
        </div>
        {/* 滚动阴影 — 由 hook 驱动透明度 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-3 scroll-shadow-top"
          style={{ ['--scroll-shadow-opacity' as string]: topShadow ? 1 : 0 }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3 scroll-shadow-bottom"
          style={{ ['--scroll-shadow-opacity' as string]: bottomShadow ? 1 : 0 }}
        />
      </div>

      {/* 动态右键菜单 */}
      {sidebarMenu && (
        <ContextMenu
          items={sidebarMenu.items}
          position={sidebarMenu.position}
          onClose={() => setSidebarMenu(null)}
        />
      )}
    </div>
  )
}
