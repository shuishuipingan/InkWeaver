export const app = Object.freeze({
  getPath() {
    throw new Error('Packaged vector smoke must not access Electron application paths')
  },
})

// The vector smoke bundle reaches the shared runtime logger through the
// knowledge-base seam. Keep the Electron substitute linkable without exposing
// a real IPC surface to the qualification process.
export const ipcMain = Object.freeze({
  handle() {},
})
