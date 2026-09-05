import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { runtimeLog } from './services/runtime-log'

// 渲染层全局错误上报：任何未捕获异常 / 未处理的 Promise 拒绝都写入主进程日志，
// 便于排查"界面异常但日志里什么都没有"的问题。
function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    const error = event.error
    runtimeLog.error('renderer', '未捕获的渲染错误', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: error instanceof Error ? String(error.stack) : undefined,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    runtimeLog.error('renderer', '未处理的 Promise 拒绝', {
      reason: reason instanceof Error ? String(reason.stack ?? reason.message) : String(reason),
    })
  })

  // 渲染层 console.* 全量转发到主进程日志：大量业务代码直接用 console 打点
  // （ErrorBoundary、各组件调试、第三方库），这些之前只进 DevTools 不进文件。
  // 只转发 warn/error 避免日志膨胀；debug/info 仍走 DevTools。
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)
  console.warn = (...args: unknown[]) => {
    originalWarn(...args)
    runtimeLog.warn('renderer', args.map((a) => (a instanceof Error ? String(a.stack ?? a.message) : String(a))).join(' '))
  }
  console.error = (...args: unknown[]) => {
    originalError(...args)
    runtimeLog.error('renderer', args.map((a) => (a instanceof Error ? String(a.stack ?? a.message) : String(a))).join(' '))
  }
}

installGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
