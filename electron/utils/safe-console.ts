/**
 * 安全控制台输出 — 主进程专用（零依赖，可被任意模块安全引用）
 *
 * 打包后主进程的 stdout/stderr 可能是已断开的管道（从资源管理器启动、
 * 终端窗口已关闭等）。此时 console.log/warn/error 会抛 EPIPE，并升级成
 * uncaughtException，Electron 会弹出"主进程 JavaScript 错误"对话框。
 * 所有主进程控制台输出都应经由这里；本模块不做任何 IO，无加载期副作用。
 *
 * 历史修复：仓库里曾有两个同名 safeConsole —— 本文件仅输出控制台，
 * runtime-logger.ts 里另有一个"控制台 + 镜像文件"版本（曾是死代码）。
 * 现在两者统一：这里用「懒加载」转发到 runtime-logger 的文件镜像，
 * 既保持零依赖（测试/无 Electron 环境下不会拉入 electron 模块），
 * 又保证任何 safeConsole 输出都会落盘（source=console）。
 */

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

function safeWrite(level: ConsoleLevel, args: unknown[]): void {
  try {
    // eslint-disable-next-line no-console
    const fn = console[level]
    fn.apply(console, args)
  } catch { /* 管道断开时静默忽略 */ }
}

function argsToText(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/** 懒加载镜像到文件日志：避免模块加载期拉入 electron 依赖（测试环境安全）。 */
function mirrorToFile(level: 'info' | 'warn' | 'error', text: string): void {
  import('../services/runtime-logger')
    .then(({ mirrorConsoleToFile }) => mirrorConsoleToFile(level, text))
    .catch(() => { /* 测试环境或无 electron：仅控制台输出 */ })
}

export const safeConsole = {
  log: (...args: unknown[]) => {
    safeWrite('log', args)
    mirrorToFile('info', argsToText(args))
  },
  info: (...args: unknown[]) => {
    safeWrite('info', args)
    mirrorToFile('info', argsToText(args))
  },
  warn: (...args: unknown[]) => {
    safeWrite('warn', args)
    mirrorToFile('warn', argsToText(args))
  },
  error: (...args: unknown[]) => {
    safeWrite('error', args)
    mirrorToFile('error', argsToText(args))
  },
}
