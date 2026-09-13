/**
 * 安全控制台输出 — 主进程专用（零依赖，可被任意模块安全引用）
 *
 * 打包后主进程的 stdout/stderr 可能是已断开的管道（从资源管理器启动、
 * 终端窗口已关闭等）。此时 console.log/warn/error 会抛 EPIPE，并升级成
 * uncaughtException，Electron 会弹出"主进程 JavaScript 错误"对话框。
 * 所有主进程控制台输出都应经由这里；本模块不做任何 IO，无加载期副作用。
 *
 * runtime-logger 在主进程启动早期安装全局 console 捕获，因此这里仅负责
 * EPIPE 安全输出；再做一次异步镜像会产生重复事件，且在退出时可能丢失。
 */

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

function safeWrite(level: ConsoleLevel, args: unknown[]): void {
  try {
    // eslint-disable-next-line no-console
    const fn = console[level]
    fn.apply(console, args)
  } catch { /* 管道断开时静默忽略 */ }
}

export const safeConsole = {
  log: (...args: unknown[]) => {
    safeWrite('log', args)
  },
  info: (...args: unknown[]) => {
    safeWrite('info', args)
  },
  warn: (...args: unknown[]) => {
    safeWrite('warn', args)
  },
  error: (...args: unknown[]) => {
    safeWrite('error', args)
  },
}
