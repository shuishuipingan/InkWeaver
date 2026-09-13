import { describe, expect, it } from 'vitest'

import { hasUpdateConfiguration, isUpdateRuntimeEnabled, isWindowsUpdateRuntimeEnabled } from '../update-runtime'

describe('isWindowsUpdateRuntimeEnabled', () => {
  it('enables updater startup only in a packaged Windows app without a development server', () => {
    expect(isWindowsUpdateRuntimeEnabled(true, undefined, 'win32')).toBe(true)
    expect(isWindowsUpdateRuntimeEnabled(false, undefined, 'win32')).toBe(false)
    expect(isWindowsUpdateRuntimeEnabled(true, 'http://127.0.0.1:5173', 'win32')).toBe(false)
    expect(isWindowsUpdateRuntimeEnabled(true, undefined, 'darwin')).toBe(false)
    expect(isWindowsUpdateRuntimeEnabled(true, undefined, 'linux')).toBe(false)
  })
})

describe('cross-platform update runtime', () => {
  it('enables packaged in-app updates on both macOS architectures and Windows', () => {
    expect(isUpdateRuntimeEnabled(true, undefined, 'win32')).toBe(true)
    expect(isUpdateRuntimeEnabled(true, undefined, 'darwin')).toBe(true)
    expect(isUpdateRuntimeEnabled(true, 'http://127.0.0.1:5180', 'darwin')).toBe(false)
    expect(isUpdateRuntimeEnabled(true, undefined, 'linux')).toBe(false)
  })

  it('checks the shared app-update.yml contract for either desktop platform', () => {
    expect(hasUpdateConfiguration('C:\\resources', filePath => filePath.endsWith('app-update.yml'))).toBe(true)
    expect(hasUpdateConfiguration(undefined, () => true)).toBe(false)
  })
})
