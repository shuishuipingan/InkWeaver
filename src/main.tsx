import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  installRuntimeLogConsoleCapture,
  installRuntimeLogShutdownFlush,
  runtimeLog,
} from './services/runtime-log'
import App from './App'
import './index.css'

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

  // Forward all five console levels. The bridge keeps the native DevTools
  // output and queues a structured event for the main-process append-only log.
  installRuntimeLogConsoleCapture()
  installRuntimeLogShutdownFlush()
}

installGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
