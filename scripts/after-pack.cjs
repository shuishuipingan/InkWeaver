const { existsSync, readdirSync } = require('node:fs')
const { rm } = require('node:fs/promises')
const path = require('node:path')

const removeAppImageSandbox = require('./linux-appimage-after-pack.cjs')

/** electron-builder 的 Arch 枚举 → onnxruntime 的目录名。 */
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }
const RUNTIME_PLATFORMS = { win32: 'win32', darwin: 'darwin', linux: 'linux' }

function resolveArchName(arch) {
  return typeof arch === 'string' ? arch : ARCH_NAMES[arch] ?? null
}

/**
 * onnxruntime-node 把全部平台的 .node/.dll 打进同一个包（合计约 208MB），
 * 安装包只需要目标平台+目标架构的那一份，其余在打包后删除。
 *
 * 不在 electron-builder 的 files 里按平台裁剪：平台级 files 只写排除项时，
 * electron-builder 会把它当成“仅忽略”并回落为“包含全部文件”，
 * 导致整个仓库目录进包（实测 2.2GB asar）。
 *
 * 返回被删除的目录列表，便于测试与日志。
 */
async function pruneForeignOnnxRuntime({ appOutDir, electronPlatformName, arch }) {
  const platformDir = RUNTIME_PLATFORMS[electronPlatformName]
  const archName = resolveArchName(arch)
  if (!platformDir || !archName) return []
  const napiRoot = path.join(
    appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v3',
  )
  if (!existsSync(napiRoot)) return []

  const removed = []
  for (const [builderPlatform, dirName] of Object.entries(RUNTIME_PLATFORMS)) {
    if (builderPlatform === electronPlatformName) continue
    const target = path.join(napiRoot, dirName)
    if (!existsSync(target)) continue
    await rm(target, { recursive: true, force: true })
    removed.push(target)
  }

  // universal 构建需要同时保留 x64 与 arm64，其余只留目标架构。
  const platformRoot = path.join(napiRoot, platformDir)
  if (archName !== 'universal' && existsSync(platformRoot)) {
    for (const entry of readdirSync(platformRoot)) {
      if (entry === archName) continue
      const target = path.join(platformRoot, entry)
      await rm(target, { recursive: true, force: true })
      removed.push(target)
    }
  }
  return removed
}

async function afterPack(context) {
  const removed = await pruneForeignOnnxRuntime({
    appOutDir: context.appOutDir,
    electronPlatformName: context.electronPlatformName,
    arch: context.arch,
  })
  if (removed.length > 0) {
    console.log(`Pruned ${removed.length} foreign ONNX Runtime director(ies) from the package`)
  }
  await removeAppImageSandbox(context)
}

module.exports = afterPack
module.exports.pruneForeignOnnxRuntime = pruneForeignOnnxRuntime
