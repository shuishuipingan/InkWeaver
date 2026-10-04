/**
 * 本地向量模型权重的落点解析与就绪判定 — 纯函数模块。
 *
 * 为什么这里有两套布局（本次修复的根因）：
 * - 下载侧走 transformers.js，它按 HuggingFace Hub 约定把仓库 id 展开成目录树：
 *   `env.cacheDir = <cacheDir>` + `pipeline(task, spec.repo)` →
 *   `<cacheDir>/<org>/<name>/…`（见 local-embedding-engine.ts 的 applyCacheEnvironment/ensureLoaded，
 *   以及 embedding.ts 传给引擎的 cacheDir）。
 * - 判定侧历史上按扁平模型 id 拼 `<cacheDir>/<id>`，与真实落点对不上，于是
 *   "已下载"的模型在知识库链路被判为未配置（EMBEDDING_MODEL_NOT_CONFIGURED）。
 *   两套布局都必须保留：老版本可能残留扁平目录，新下载一律是 Hub 布局。
 *
 * 判定只在候选目录内部递归，**绝不在 cacheDir 根递归**：否则任意一个模型的权重都会让
 * 其它模型误判为已就绪。
 *
 * 本模块是纯函数集合，**不得引入 electron**（需要能被 node 直接 import 做端到端验证）；
 * userData 由调用方注入。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 权重档位标识（唯一物理定义处；local-embedding-catalog 对外转出同名类型）。 */
export type LocalEmbeddingDtype = 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'q4f16'

/**
 * dtype → transformers.js 实际落盘的权重文件名（唯一物理定义处；由 catalog 对外转出）。
 *
 * 同一仓库的不同档位写的是不同文件名（Q8 = model_quantized.onnx、F32 = model.onnx…）。
 * 若判定只看"目录里有没有 .onnx"，只装了 Q8 的仓库会让同仓库的其它档位一起被判为已下载，
 * 用户选中未下载的档位后引擎加载失败——即"显示已选中但不可用"。下载侧与判定侧共用这一份登记。
 */
export const LOCAL_EMBEDDING_DTYPE_FILES: Readonly<Record<LocalEmbeddingDtype, string>> = Object.freeze({
  fp32: 'model.onnx',
  fp16: 'model_fp16.onnx',
  q8: 'model_quantized.onnx',
  int8: 'model_int8.onnx',
  uint8: 'model_uint8.onnx',
  q4: 'model_q4.onnx',
  q4f16: 'model_q4f16.onnx',
})

/** 该档位对应的权重文件名。 */
export function localEmbeddingWeightFile(dtype: LocalEmbeddingDtype): string {
  return LOCAL_EMBEDDING_DTYPE_FILES[dtype]
}

/** 判定所需的最小模型描述；local-embedding-catalog 的 spec 可直接传入。 */
export interface LocalEmbeddingStorageSpec {
  readonly id: string
  readonly repo: string
  /** 指定档位时按该档位的具体权重文件名精确判定；省略则退化为"任一 .onnx"。 */
  readonly dtype?: LocalEmbeddingDtype
}

/**
 * 只读的环境变量读取面：带索引签名，`process.env` 可直接传入
 * （纯可选属性的对象类型会触发 TS2559 弱类型不兼容）。
 */
export interface LocalEmbeddingCacheEnv {
  /** 覆盖权重缓存根目录；空白值视为未设置。 */
  AI_NOVEL_LOCAL_EMBEDDING_CACHE?: string | undefined
  [key: string]: string | undefined
}

/** 候选目录内递归查找 .onnx 的深度上限（实盘布局 `onnx/model_quantized.onnx` 为 1）。 */
const MAX_ONNX_SEARCH_DEPTH = 4

/** 路径归一化键：Windows/macOS 文件系统大小写不敏感，去重按归一化结果比较。 */
function pathKey(target: string): string {
  return path.normalize(target).toLocaleLowerCase('en-US')
}

/**
 * 权重缓存根目录：环境变量覆盖优先，否则 `<userDataPath>/models/embedding`。
 * 与 transformers.js 的 `env.cacheDir` 同源，三处调用点不再各自拼路径。
 */
export function resolveLocalEmbeddingCacheDir(
  userDataPath: string,
  env?: LocalEmbeddingCacheEnv,
): string {
  const override = env?.AI_NOVEL_LOCAL_EMBEDDING_CACHE?.trim()
  if (override) return override
  return path.join(userDataPath, 'models', 'embedding')
}

/** HF Hub 布局：repo `Xenova/bge-small-zh-v1.5` → `<cacheDir>/Xenova/bge-small-zh-v1.5`。 */
export function localEmbeddingHubDir(cacheDir: string, repo: string): string {
  // 过滤空段与相对段，避免仓库 id 里的多余斜杠或 `..` 逃出缓存根。
  const segments = repo
    .split('/')
    .filter(segment => segment !== '' && segment !== '.' && segment !== '..')
  return path.join(cacheDir, ...segments)
}

/** 候选目录：Hub 布局优先，其次扁平 `<cacheDir>/<id>`；去重；不存在的也返回。 */
export function localEmbeddingModelDirCandidates(
  cacheDir: string,
  spec: LocalEmbeddingStorageSpec,
): string[] {
  const candidates = [
    localEmbeddingHubDir(cacheDir, spec.repo),
    path.join(cacheDir, spec.id),
  ]
  const seen = new Set<string>()
  const unique: string[] = []
  for (const candidate of candidates) {
    const key = pathKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(candidate)
  }
  return unique
}

/** 条目类型判定；软链接按目标类型归类（断链视为不可用，深度上限同时兜住链接环）。 */
function entryKind(entry: fs.Dirent, entryPath: string): 'file' | 'dir' | 'other' {
  if (entry.isFile()) return 'file'
  if (entry.isDirectory()) return 'dir'
  if (!entry.isSymbolicLink()) return 'other'
  try {
    const stat = fs.statSync(entryPath)
    if (stat.isFile()) return 'file'
    if (stat.isDirectory()) return 'dir'
  } catch {
    // 断链 / 无权限：按不可用处理，绝不因此抛错。
  }
  return 'other'
}

/** 在该目录内递归查找满足条件的文件名；深度上限同时兜住符号链接环。 */
function hasEntryNamed(dir: string, matches: (fileName: string) => boolean): boolean {
  let pending: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }]
  while (pending.length > 0) {
    const next: Array<{ dir: string; depth: number }> = []
    for (const current of pending) {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        const entryPath = path.join(current.dir, entry.name)
        const kind = entryKind(entry, entryPath)
        if (kind === 'file' && matches(entry.name)) return true
        if (kind === 'dir' && current.depth + 1 <= MAX_ONNX_SEARCH_DEPTH) {
          next.push({ dir: entryPath, depth: current.depth + 1 })
        }
      }
    }
    pending = next
  }
  return false
}

/** 仅在该目录内递归查找 `*.onnx`（大小写不敏感）；目录不存在或不可读返回 false。 */
export function hasOnnxWeights(dir: string): boolean {
  return hasEntryNamed(dir, name => name.toLocaleLowerCase('en-US').endsWith('.onnx'))
}

/** 该档位对应的具体权重文件名必须存在（大小写不敏感比较）。 */
function hasDtypeWeights(dir: string, dtype: LocalEmbeddingDtype): boolean {
  const expected = LOCAL_EMBEDDING_DTYPE_FILES[dtype].toLocaleLowerCase('en-US')
  return hasEntryNamed(dir, name => name.toLocaleLowerCase('en-US') === expected)
}

/**
 * 是否已下载。
 * - `spec.dtype` 有值：候选目录内必须存在**该档位对应的具体权重文件名**才算已下载；
 *   同仓库其它档位的权重（以及中断残留的 `*.onnx.download`）不会被误认为本档位就绪。
 * - `spec.dtype` 缺省（调用方拿不到内置目录条目时的回退）：保持"任一 .onnx"语义。
 */
export function isLocalEmbeddingModelDownloaded(
  cacheDir: string,
  spec: LocalEmbeddingStorageSpec,
): boolean {
  const candidates = localEmbeddingModelDirCandidates(cacheDir, spec)
  const { dtype } = spec
  if (dtype !== undefined) return candidates.some(candidate => hasDtypeWeights(candidate, dtype))
  return candidates.some(candidate => hasOnnxWeights(candidate))
}
