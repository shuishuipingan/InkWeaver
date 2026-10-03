import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..')

export function findLanceBinding(unpackedDir) {
  const packageDir = path.join(
    unpackedDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    '@lancedb',
    'lancedb-win32-x64-msvc',
  )
  if (!existsSync(packageDir)) return null

  const pending = [packageDir]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(fullPath)
      if (entry.isFile() && entry.name.endsWith('.node')) return fullPath
    }
  }
  return null
}

export function findBetterSqliteBinding(unpackedDir) {
  const binding = path.join(
    unpackedDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  )
  return existsSync(binding) ? binding : null
}

/**
 * 本地向量模型推理依赖的原生运行时（Electron 主进程走 onnxruntime-node）。
 * DirectML.dll 是 Windows 上 GPU/核显加速的运行时，缺失会静默退回 CPU。
 */
export function findOnnxRuntimeBinaries(unpackedDir) {
  const dir = path.join(
    unpackedDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v3',
    'win32',
    'x64',
  )
  if (!existsSync(dir)) return null
  return {
    dir,
    binding: path.join(dir, 'onnxruntime_binding.node'),
    sharedLibrary: path.join(dir, 'onnxruntime.dll'),
    directMl: path.join(dir, 'DirectML.dll'),
  }
}

/**
 * 打包后应只保留目标平台与目标架构的推理二进制（afterPack 钩子负责裁剪）。
 * 这些目录若存在，说明裁剪失效或全部平台的二进制被重新打进包。
 */
export function findForeignOnnxRuntimeDirs(unpackedDir) {
  const napiRoot = path.join(
    unpackedDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v3',
  )
  const foreign = []
  for (const platform of ['darwin', 'linux']) {
    const dir = path.join(napiRoot, platform)
    if (existsSync(dir)) foreign.push(dir)
  }
  const winArm64 = path.join(napiRoot, 'win32', 'arm64')
  if (existsSync(winArm64)) foreign.push(winArm64)
  return foreign
}

export function findWindowsSafeFileSystemHelper(unpackedDir) {
  const helper = path.join(
    unpackedDir,
    'resources',
    'security',
    'windows-safe-file-system.ps1',
  )
  return existsSync(helper) ? helper : null
}

export function verifyWindowsPackage(unpackedDir) {
  const asar = path.join(unpackedDir, 'resources', 'app.asar')
  const executable = path.join(unpackedDir, 'InkWeaver.exe')
  for (const required of [asar, executable]) {
    if (!existsSync(required)) throw new Error(`Missing required package file: ${required}`)
  }

  const nativeBinding = findLanceBinding(unpackedDir)
  if (!nativeBinding) throw new Error('Missing LanceDB Windows native binding')
  const betterSqliteBinding = findBetterSqliteBinding(unpackedDir)
  if (!betterSqliteBinding) throw new Error('Missing better-sqlite3 Windows native binding')
  const onnxRuntime = findOnnxRuntimeBinaries(unpackedDir)
  if (!onnxRuntime) throw new Error('Missing ONNX Runtime Windows binaries for local embedding')
  if (!existsSync(onnxRuntime.binding)) throw new Error('Missing ONNX Runtime Windows native binding')
  if (!existsSync(onnxRuntime.sharedLibrary)) throw new Error('Missing ONNX Runtime Windows shared library')
  if (!existsSync(onnxRuntime.directMl)) {
    throw new Error('Missing DirectML runtime for local embedding GPU acceleration')
  }
  const foreignOnnxRuntimeDirs = findForeignOnnxRuntimeDirs(unpackedDir)
  if (foreignOnnxRuntimeDirs.length > 0) {
    throw new Error(`Package still contains foreign ONNX Runtime binaries: ${foreignOnnxRuntimeDirs.join(', ')}`)
  }
  const secureFileSystemHelper = findWindowsSafeFileSystemHelper(unpackedDir)
  if (!secureFileSystemHelper) throw new Error('Missing Windows secure file-system helper')

  return {
    asar,
    executable,
    nativeBinding,
    betterSqliteBinding,
    onnxRuntime,
    foreignOnnxRuntimeDirs,
    secureFileSystemHelper,
  }
}

export function verifyPackagedLanceLoad(unpackedDir, runner = spawnSync) {
  const executable = path.join(unpackedDir, 'InkWeaver.exe')
  const marker = 'PACKAGED_LANCEDB_LOAD_OK'
  const result = runner(
    executable,
    [
      '-e',
      `require('./resources/app.asar/node_modules/@lancedb/lancedb'); process.stdout.write('${marker}')`,
    ],
    {
      cwd: unpackedDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.status !== 0) {
    throw new Error(`Packaged LanceDB load failed: ${String(result.stderr ?? '').trim()}`)
  }
  if (!String(result.stdout ?? '').includes(marker)) {
    throw new Error('Packaged LanceDB load did not return its success marker')
  }
  return marker
}

export function verifyPackagedBetterSqliteLoad(unpackedDir, runner = spawnSync) {
  const executable = path.join(unpackedDir, 'InkWeaver.exe')
  const marker = 'PACKAGED_BETTER_SQLITE3_LOAD_OK'
  const result = runner(
    executable,
    [
      '-e',
      `const Database = require('./resources/app.asar/node_modules/better-sqlite3'); const db = new Database(':memory:'); const ok = db.prepare('select 1 as ok').get().ok; db.close(); if (ok !== 1) process.exit(2); process.stdout.write('${marker}')`,
    ],
    {
      cwd: unpackedDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.status !== 0) {
    throw new Error(`Packaged better-sqlite3 load failed: ${String(result.stderr ?? '').trim()}`)
  }
  if (!String(result.stdout ?? '').includes(marker)) {
    throw new Error('Packaged better-sqlite3 load did not return its success marker')
  }
  return marker
}

export function verifyPackagedOnnxRuntimeLoad(unpackedDir, runner = spawnSync) {
  const executable = path.join(unpackedDir, 'InkWeaver.exe')
  const marker = 'PACKAGED_ONNXRUNTIME_LOAD_OK'
  const result = runner(
    executable,
    [
      '-e',
      `const ort = require('./resources/app.asar/node_modules/onnxruntime-node'); if (typeof ort.InferenceSession !== 'function' || typeof ort.Tensor !== 'function') process.exit(2); process.stdout.write('${marker}')`,
    ],
    {
      cwd: unpackedDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.status !== 0) {
    throw new Error(`Packaged ONNX Runtime load failed: ${String(result.stderr ?? '').trim()}`)
  }
  if (!String(result.stdout ?? '').includes(marker)) {
    throw new Error('Packaged ONNX Runtime load did not return its success marker')
  }
  return marker
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  const unpackedDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repositoryRoot, 'release', packageJson.version, 'win-unpacked')
  const result = verifyWindowsPackage(unpackedDir)
  const loadMarker = verifyPackagedLanceLoad(unpackedDir)
  const betterSqliteLoadMarker = verifyPackagedBetterSqliteLoad(unpackedDir)
  const onnxRuntimeLoadMarker = verifyPackagedOnnxRuntimeLoad(unpackedDir)
  console.log(`Verified Windows package: ${result.executable}`)
  console.log(`Verified LanceDB native binding: ${result.nativeBinding}`)
  console.log(`Verified better-sqlite3 native binding: ${result.betterSqliteBinding}`)
  console.log(`Verified ONNX Runtime native binding: ${result.onnxRuntime.binding}`)
  console.log(`Verified DirectML runtime: ${result.onnxRuntime.directMl}`)
  console.log(`Verified no foreign ONNX Runtime binaries in the package`)
  console.log(`Verified Windows secure file-system helper: ${result.secureFileSystemHelper}`)
  console.log(`Verified packaged LanceDB load: ${loadMarker}`)
  console.log(`Verified packaged better-sqlite3 load: ${betterSqliteLoadMarker}`)
  console.log(`Verified packaged ONNX Runtime load: ${onnxRuntimeLoadMarker}`)
}
