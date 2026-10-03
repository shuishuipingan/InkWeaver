import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findBetterSqliteBinding,
  findLanceBinding,
  findOnnxRuntimeBinaries,
  findWindowsSafeFileSystemHelper,
  verifyPackagedBetterSqliteLoad,
  verifyPackagedLanceLoad,
  verifyPackagedOnnxRuntimeLoad,
  verifyWindowsPackage,
} from '../verify-win-package.mjs'

const fixtures: string[] = []

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-novel-package-'))
  fixtures.push(root)
  return root
}

function write(root: string, relative: string) {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relative)
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Fixture path escapes its root: ${relative}`)
  }
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, 'fixture')
}

const onnxRuntimeDir = 'resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/win32/x64'

function writeOnnxRuntime(root: string) {
  write(root, `${onnxRuntimeDir}/onnxruntime_binding.node`)
  write(root, `${onnxRuntimeDir}/onnxruntime.dll`)
  write(root, `${onnxRuntimeDir}/DirectML.dll`)
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Windows package verification', () => {
  it('rejects a package without the LanceDB native binding', () => {
    const root = fixture()
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')

    expect(() => verifyWindowsPackage(root)).toThrow('Missing LanceDB Windows native binding')
  })

  it('finds and accepts the unpacked LanceDB binding', () => {
    const root = fixture()
    const relative = 'resources/app.asar.unpacked/node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node'
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')
    write(root, relative)
    const betterSqliteRelative =
      'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
    write(root, betterSqliteRelative)
    writeOnnxRuntime(root)
    const helperRelative = 'resources/security/windows-safe-file-system.ps1'
    write(root, helperRelative)

    expect(findLanceBinding(root)).toBe(path.join(root, relative))
    expect(findBetterSqliteBinding(root)).toBe(path.join(root, betterSqliteRelative))
    expect(findOnnxRuntimeBinaries(root)).toMatchObject({
      binding: path.join(root, onnxRuntimeDir, 'onnxruntime_binding.node'),
      sharedLibrary: path.join(root, onnxRuntimeDir, 'onnxruntime.dll'),
      directMl: path.join(root, onnxRuntimeDir, 'DirectML.dll'),
    })
    expect(findWindowsSafeFileSystemHelper(root)).toBe(path.join(root, helperRelative))
    expect(verifyWindowsPackage(root)).toMatchObject({
      executable: path.join(root, 'InkWeaver.exe'),
      nativeBinding: path.join(root, relative),
      betterSqliteBinding: path.join(root, betterSqliteRelative),
      secureFileSystemHelper: path.join(root, helperRelative),
    })
  })

  it('rejects a package without the better-sqlite3 native binding', () => {
    const root = fixture()
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')
    write(
      root,
      'resources/app.asar.unpacked/node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node',
    )

    expect(() => verifyWindowsPackage(root)).toThrow('Missing better-sqlite3 Windows native binding')
  })

  it('rejects a package missing the Windows secure file-system helper', () => {
    const root = fixture()
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')
    write(
      root,
      'resources/app.asar.unpacked/node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node',
    )
    write(root, 'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node')
    writeOnnxRuntime(root)

    expect(() => verifyWindowsPackage(root)).toThrow('Missing Windows secure file-system helper')
  })

  it('rejects a package without the ONNX Runtime binaries for local embedding', () => {
    const root = fixture()
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')
    write(
      root,
      'resources/app.asar.unpacked/node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node',
    )
    write(root, 'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node')

    expect(() => verifyWindowsPackage(root)).toThrow(
      'Missing ONNX Runtime Windows binaries for local embedding',
    )
  })

  it('rejects a package missing the DirectML runtime that accelerates local embedding', () => {
    const root = fixture()
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')
    write(
      root,
      'resources/app.asar.unpacked/node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node',
    )
    write(root, 'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node')
    write(root, 'resources/security/windows-safe-file-system.ps1')
    write(root, `${onnxRuntimeDir}/onnxruntime_binding.node`)
    write(root, `${onnxRuntimeDir}/onnxruntime.dll`)

    expect(() => verifyWindowsPackage(root)).toThrow(
      'Missing DirectML runtime for local embedding GPU acceleration',
    )
  })

  it('rejects a package that still ships other platforms ONNX Runtime binaries', () => {
    const root = fixture()
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')
    write(
      root,
      'resources/app.asar.unpacked/node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node',
    )
    write(root, 'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node')
    write(root, 'resources/security/windows-safe-file-system.ps1')
    writeOnnxRuntime(root)
    write(root, 'resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node')
    write(root, 'resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/win32/arm64/onnxruntime_binding.node')

    expect(() => verifyWindowsPackage(root)).toThrow('Package still contains foreign ONNX Runtime binaries')
  })

  it('loads LanceDB with the packaged executable in Electron Node mode', () => {
    const root = fixture()
    write(root, 'resources/app.asar')
    write(root, 'InkWeaver.exe')
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const runner = (command: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options })
      return { status: 0, stdout: 'PACKAGED_LANCEDB_LOAD_OK', stderr: '' }
    }

    expect(verifyPackagedLanceLoad(root, runner)).toBe('PACKAGED_LANCEDB_LOAD_OK')
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe(path.join(root, 'InkWeaver.exe'))
    expect(calls[0].args.join(' ')).toContain('@lancedb/lancedb')
    expect(calls[0].options).toMatchObject({
      cwd: root,
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
    })
  })

  it('opens an in-memory SQLite database with the packaged executable in Electron Node mode', () => {
    const root = fixture()
    write(root, 'InkWeaver.exe')
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const runner = (command: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options })
      return { status: 0, stdout: 'PACKAGED_BETTER_SQLITE3_LOAD_OK', stderr: '' }
    }

    expect(verifyPackagedBetterSqliteLoad(root, runner)).toBe('PACKAGED_BETTER_SQLITE3_LOAD_OK')
    expect(calls).toHaveLength(1)
    expect(calls[0].args.join(' ')).toContain("new Database(':memory:')")
    expect(calls[0].options).toMatchObject({
      cwd: root,
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
    })
  })

  it('loads ONNX Runtime with the packaged executable in Electron Node mode', () => {
    const root = fixture()
    write(root, 'InkWeaver.exe')
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const runner = (command: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options })
      return { status: 0, stdout: 'PACKAGED_ONNXRUNTIME_LOAD_OK', stderr: '' }
    }

    expect(verifyPackagedOnnxRuntimeLoad(root, runner)).toBe('PACKAGED_ONNXRUNTIME_LOAD_OK')
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe(path.join(root, 'InkWeaver.exe'))
    expect(calls[0].args.join(' ')).toContain('onnxruntime-node')
    expect(calls[0].options).toMatchObject({
      cwd: root,
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
    })
  })
})
