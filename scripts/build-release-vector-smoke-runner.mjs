import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.join(repositoryRoot, 'electron', 'release-vector-smoke-runner.ts')],
  bundle: true,
  alias: { electron: path.join(repositoryRoot, 'scripts', 'release-vector-smoke-electron-stub.mjs') },
  // 本地向量模型推理栈（transformers + ONNX Runtime + sharp）含原生 .node/.dll，
  // esbuild 无法打包（Linux/macOS 上会因为缺 .node loader 直接失败），
  // 且打包后的应用里已带这些依赖，运行时动态加载即可。
  external: [
    'better-sqlite3',
    '@lancedb/lancedb',
    '@huggingface/transformers',
    'onnxruntime-node',
    'onnxruntime-common',
    'onnxruntime-web',
    'sharp',
    '@img/*',
  ],
  banner: { js: 'const __aiNovelImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': '__aiNovelImportMetaUrl' },
  format: 'cjs',
  outfile: path.join(repositoryRoot, 'dist-electron', 'release-vector-smoke-runner.cjs'),
  platform: 'node',
  target: ['node22'],
})
