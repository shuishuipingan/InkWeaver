import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { runtimeLogger, registerRuntimeLoggerIPC } from './services/runtime-logger'
import { registerIPCHandlers } from './ipc-handlers'
import { registerMCPHandlers } from './mcp/mcp-ipc-bridge'
import { mainT } from './i18n'
import { registerUpdateController } from './controllers/update-controller'
import { createElectronUpdaterBackend } from './services/electron-updater-adapter'
import { GlobalConfigUpdatePreferencesStore } from './services/update-preferences-store'
import {
  hasWindowsUpdateConfiguration,
  isWindowsUpdateRuntimeEnabled,
} from './services/update-runtime'
import { startUpdateRuntime } from './services/update-startup'
import {
  claimReleaseVectorSmokeInvocation,
  releaseVectorSmokeWasRequested,
  runReleaseVectorSmoke,
} from './services/release-vector-smoke'
import {
  claimReleaseOfficialHomepageSmokeInvocation,
  releaseOfficialHomepageSmokeWasRequested,
  runReleaseOfficialHomepageSmoke,
} from './services/release-official-homepage-smoke'
import {
  claimReleaseSkinSmokeInvocation,
  releaseSkinSmokeWasRequested,
  runReleaseSkinSmoke,
} from './services/release-skin-smoke'
import { registerOfficialHomepageController } from './controllers/official-homepage-controller'
import type { UpdateState } from './services/update-service'
import {
  createOfficialHomepageWindowOpenHandler,
  preventRendererNavigation,
} from './services/official-homepage-navigation'
import { configureSingleInstanceRuntime } from './services/single-instance-runtime'

import { fileURLToPath } from 'node:url'
import path from 'node:path'
// 主进程兜底：任何未捕获异常都先写入文件日志，再决定是否继续。
// 重点是 EPIPE——主进程 stdout/stderr 是已断开的管道时（从资源管理器启动、
// 终端关闭等），console.* 抛 EPIPE 会升级成 uncaughtException 并弹出
// "主进程 JavaScript 错误"对话框。这类管道故障不影响应用功能，只记录。
process.on('uncaughtException', (error) => {
  try {
    const message = String(error?.message ?? error)
    if (message.includes('EPIPE') || message.includes('broken pipe')) {
      runtimeLogger.warn('main', '主进程管道写入失败（EPIPE，已忽略）')
    } else {
      runtimeLogger.error('main', '未捕获异常', { error: message, stack: String(error?.stack ?? '') })
    }
  } catch { /* 日志本身失败时不再递归 */ }
})
process.on('unhandledRejection', (reason) => {
  try {
    runtimeLogger.error('main', '未处理的 Promise 拒绝', { reason: String(reason) })
  } catch { /* 忽略 */ }
})
process.on('warning', (warning) => {
  try {
    runtimeLogger.warn('main', 'Node 运行时警告', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    }, { operation: 'process.warning', outcome: 'failed' })
  } catch { /* logging must not turn a runtime warning into a crash */ }
})

// Electron 41 在部分 Windows 环境中无法启动受限 GPU 子进程（0xC0000135），
// 随后会触发 Chromium 的致命检查。仅放宽 GPU 子进程，保持 renderer 隔离策略不变。
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 构建产物目录结构
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

// The installed-package vector qualification is deliberately opt-in and
// fail-closed. A command-line request without the matching environment token
// must never turn into a normal interactive application launch.
const releaseVectorSmokeRequested = releaseVectorSmokeWasRequested(process.argv)
const releaseHomepageSmokeRequested = releaseOfficialHomepageSmokeWasRequested(process.argv)
const releaseSkinSmokeRequested = releaseSkinSmokeWasRequested(process.argv)
const releaseSmokeRequested = releaseVectorSmokeRequested || releaseHomepageSmokeRequested || releaseSkinSmokeRequested
const releaseVectorSmokeInvocation = releaseVectorSmokeRequested
  ? claimReleaseVectorSmokeInvocation(process.argv, process.env)
  : undefined
const releaseHomepageSmokeInvocation = releaseHomepageSmokeRequested
  ? claimReleaseOfficialHomepageSmokeInvocation(process.argv, process.env)
  : undefined
const releaseSkinSmokeInvocation = releaseSkinSmokeRequested
  ? claimReleaseSkinSmokeInvocation(process.argv, process.env)
  : undefined
const applicationInstanceAccepted = configureSingleInstanceRuntime({
  releaseSmokeRequested,
  requestLock: () => app.requestSingleInstanceLock(),
  quit: () => app.quit(),
  onSecondInstance: listener => { app.on('second-instance', () => listener()) },
  getWindow: () => win,
})
let releaseSmokeStage = 'not-requested'
let releaseSmokeTimeout: NodeJS.Timeout | undefined

function reportReleaseSmokeStage(stage: string): void {
  if (!releaseSmokeRequested) return
  releaseSmokeStage = stage
  process.stderr.write(`[AI Novel release smoke] stage=${stage}\n`)
}

function clearReleaseSmokeTimeout(): void {
  if (releaseSmokeTimeout === undefined) return
  clearTimeout(releaseSmokeTimeout)
  releaseSmokeTimeout = undefined
}

if (releaseSmokeRequested) {
  reportReleaseSmokeStage('bootstrap')
  const timeoutDescription = releaseVectorSmokeRequested
    ? 'Packaged vector smoke timed out after 90 seconds'
    : releaseHomepageSmokeRequested
      ? 'Packaged official homepage smoke timed out after 90 seconds'
      : 'Packaged skin smoke timed out after 90 seconds'
  releaseSmokeTimeout = setTimeout(() => {
    console.error(`[AI Novel release smoke] ${timeoutDescription}; last stage=${releaseSmokeStage}`)
    app.exit(1)
  }, 90_000)
}

function publishUpdateState(state: UpdateState): void {
  for (const target of BrowserWindow.getAllWindows()) {
    if (target.isDestroyed() || target.webContents.isDestroyed()) continue
    target.webContents.send('update:state', state)
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: mainT(app.getLocale(), 'app.windowTitle'),
    icon: path.join(process.env.APP_ROOT!, 'build', 'icon.png'),
    // 使用应用内自绘标题栏，避免 Windows 原生标题栏与棕色标题栏重复显示。
    frame: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      // 安全性设置
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (process.platform === 'darwin') {
    app.dock?.setIcon(path.join(process.env.APP_ROOT!, 'build', 'icon.png'))
  }

  // 隐藏默认菜单栏（Windows/Linux）
  win.setMenuBarVisibility(false)
  runtimeLogger.info('main', '主窗口已创建', { width: 1440, height: 900 })

  // 渲染进程崩溃/挂起记录到日志（弹窗会打断用户，这里只记录，便于事后排查）
  win.webContents.on('render-process-gone', (_event, details) => {
    runtimeLogger.error('main', '渲染进程异常退出', {
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })
  win.webContents.on('unresponsive', () => {
    runtimeLogger.warn('main', '渲染进程无响应（可能卡死）')
  })
  win.webContents.on('responsive', () => {
    runtimeLogger.info('main', '渲染进程恢复响应')
  })
  win.on('closed', () => {
    runtimeLogger.info('main', '主窗口已关闭')
  })

  // 所有新窗口都留在应用外；仅精确匹配的官方仓库可交给系统浏览器。
  win.webContents.setWindowOpenHandler(createOfficialHomepageWindowOpenHandler({
    openExternal: url => shell.openExternal(url),
    onOpenExternalError: error => {
      console.warn('[InkWeaver] Unable to open official homepage from a window request.', error)
    },
  }))
  // 渲染进程不能把现有主窗口导航到外部内容。
  win.webContents.on('will-navigate', preventRendererNavigation)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function createReleaseHomepageSmokeWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
}

async function runPackagedOfficialHomepageSmoke(token: string) {
  return runReleaseOfficialHomepageSmoke(token, {
    createWindow: createReleaseHomepageSmokeWindow,
    loadProbeDocument: window => window.loadFile(path.join(RENDERER_DIST, 'release-homepage-smoke.html')),
    removeHandler: channel => ipcMain.removeHandler(channel),
    registerController: options => registerOfficialHomepageController(options),
  })
}

// macOS: 关闭所有窗口不退出. On an actual quit, keep the process alive long
// enough for the append-only writer to flush the final lifecycle events.
let shutdownFlushStarted = false
app.on('before-quit', (event) => {
  if (shutdownFlushStarted) return
  shutdownFlushStarted = true
  event.preventDefault()
  runtimeLogger.info('main', '应用退出', undefined, { operation: 'app.before-quit', outcome: 'started' })
  void runtimeLogger.flush().finally(() => app.quit())
})
app.on('window-all-closed', () => {
  if (!applicationInstanceAccepted) return
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

// macOS: 点击 dock 图标重新创建窗口
app.on('activate', () => {
  if (!applicationInstanceAccepted || releaseSmokeRequested) return
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  if (!applicationInstanceAccepted) return
  reportReleaseSmokeStage('electron-ready')
  if (releaseSmokeRequested) {
    const requestedSmokeModeCount = Number(releaseVectorSmokeRequested)
      + Number(releaseHomepageSmokeRequested)
      + Number(releaseSkinSmokeRequested)
    const invocationCount = Number(releaseVectorSmokeInvocation !== undefined)
      + Number(releaseHomepageSmokeInvocation !== undefined)
      + Number(releaseSkinSmokeInvocation !== undefined)
    if (requestedSmokeModeCount !== 1 || invocationCount !== 1) {
      throw new Error('Invalid packaged smoke invocation: exactly one environment and one-time CLI token pair must match')
    }
    reportReleaseSmokeStage(
      releaseVectorSmokeInvocation
        ? 'vector-invocation-valid'
        : releaseHomepageSmokeInvocation
          ? 'official-homepage-invocation-valid'
          : 'skin-invocation-valid',
    )
    const evidence = releaseVectorSmokeInvocation
      ? await runReleaseVectorSmoke(releaseVectorSmokeInvocation.token)
      : releaseHomepageSmokeInvocation
        ? await runPackagedOfficialHomepageSmoke(releaseHomepageSmokeInvocation.token)
        : runReleaseSkinSmoke(releaseSkinSmokeInvocation!.token)
    reportReleaseSmokeStage('evidence-ready')
    process.stdout.write(`${JSON.stringify(evidence)}\n`)
    clearReleaseSmokeTimeout()
    app.exit(0)
    return
  }

  // 先准备主进程服务和 IPC，再允许渲染层加载并发起调用。
  runtimeLogger.info('main', '应用启动', {
    version: app.getVersion(),
    platform: process.platform,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
  })
  registerRuntimeLoggerIPC()
  registerIPCHandlers()
  registerMCPHandlers()
  // 更新功能失败不能阻断作者进入应用；窗口先于更新运行时创建。
  createWindow()
  // The legacy helper keeps its Windows-only default for older callers; the
  // explicit fourth flag enables the same updater on packaged macOS builds.
  const updateRuntimeEnabled = isWindowsUpdateRuntimeEnabled(
    app.isPackaged,
    VITE_DEV_SERVER_URL,
    process.platform,
    true,
  )
  const updateConfiguration = updateRuntimeEnabled && !hasWindowsUpdateConfiguration()
    ? 'missing'
    : 'available'
  startUpdateRuntime({
    updateRuntimeEnabled,
    updateConfiguration,
    currentVersion: app.getVersion(),
    createBackend: createElectronUpdaterBackend,
    createPreferences: () => new GlobalConfigUpdatePreferencesStore(),
    registerController: updateService => {
      registerUpdateController(updateService, { ipc: ipcMain, publish: publishUpdateState })
    },
    reportFailure: (operation, error) => {
      console.warn(`[InkWeaver Update] ${operation}失败，已降级并继续启动应用。`, error)
    },
  })
}).catch((error: unknown) => {
  clearReleaseSmokeTimeout()
  console.error('[InkWeaver] Electron 启动失败。', error)
  if (releaseSmokeRequested) {
    app.exit(1)
    return
  }
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
