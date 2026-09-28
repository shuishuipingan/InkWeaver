export const app = Object.freeze({
  getPath() {
    throw new Error('Packaged vector smoke must not access Electron application paths')
  },
})

// The vector smoke runner imports the same storage modules as the packaged
// main process. Those modules lazily load runtime-logger through safeConsole;
// esbuild therefore needs the small ipcMain surface even though the smoke
// itself never registers an IPC handler or opens a native dialog. Keep these
// APIs inert so the qualification runner cannot depend on a live Electron process.
export const ipcMain = Object.freeze({
  handle() {},
  removeHandler() {},
})

export const dialog = Object.freeze({
  async showOpenDialog() {
    throw new Error('Packaged vector smoke must not open an Electron dialog')
  },
})

export const shell = Object.freeze({
  async openPath() {
    throw new Error('Packaged vector smoke must not open a native path')
  },
})
