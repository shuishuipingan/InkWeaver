import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  hasOnnxWeights,
  isLocalEmbeddingModelDownloaded,
  localEmbeddingHubDir,
  localEmbeddingModelDirCandidates,
  resolveLocalEmbeddingCacheDir,
} from '../local-embedding-storage'
import { getLocalEmbeddingModelSpec } from '../local-embedding-catalog'

/**
 * 本地向量模型落盘布局兼容的存储层契约。
 *
 * 背景（Lead 复现的根因）：下载侧走 HuggingFace Hub 布局
 * （cacheDir/Xenova/<id>/onnx/model_quantized.onnx），而判定侧查扁平
 * cacheDir/<id>，两边约定不一致，导致 UI 已选中的模型被判为未下载。
 *
 * 本文件用 os.tmpdir() 下的**真实目录结构**验证，不 mock fs 语义：
 * 只有真实 readdir/stat 才能暴露「在 cacheDir 根递归」这类串味实现。
 */
// 夹具提升到文件级：dtype 精确判定与布局判定共用同一套 tmpdir 结构。
let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkweaver-embedding-storage-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

/** 相对 root 写一个文件（自动建父目录），返回绝对路径。 */
function writeFixture(relativePath: string, content = 'fixture'): string {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
  return target
}

/** 相对 root 建一个空目录，返回绝对路径。 */
function makeFixtureDir(relativePath: string): string {
  const target = path.join(root, relativePath)
  fs.mkdirSync(target, { recursive: true })
  return target
}

const cacheDir = (): string => path.join(root, 'models', 'embedding')

describe('local embedding storage layout', () => {
  const targetSpec = { id: 'bge-small-zh-v1.5', repo: 'Xenova/bge-small-zh-v1.5' }

  describe('resolveLocalEmbeddingCacheDir', () => {
    it('默认把 cacheDir 拼在 userData 下的 models/embedding', () => {
      expect(resolveLocalEmbeddingCacheDir('/tmp/userdata'))
        .toBe(path.join('/tmp/userdata', 'models', 'embedding'))
      expect(resolveLocalEmbeddingCacheDir('D:\\profile\\inkweaver'))
        .toBe(path.join('D:\\profile\\inkweaver', 'models', 'embedding'))
    })

    it('env 覆盖优先于 userData 拼接', () => {
      const override = path.join(root, 'custom-cache')
      expect(resolveLocalEmbeddingCacheDir('/tmp/userdata', { AI_NOVEL_LOCAL_EMBEDDING_CACHE: override }))
        .toBe(override)
    })

    it('env 缺失、空串或纯空格时回退 userData 拼接', () => {
      // 与 local-embedding-controller.ts 的既有语义一致：trim 后为空视为未设置。
      const fallback = path.join('/tmp/userdata', 'models', 'embedding')
      expect(resolveLocalEmbeddingCacheDir('/tmp/userdata', {})).toBe(fallback)
      expect(resolveLocalEmbeddingCacheDir('/tmp/userdata', { AI_NOVEL_LOCAL_EMBEDDING_CACHE: '' })).toBe(fallback)
      expect(resolveLocalEmbeddingCacheDir('/tmp/userdata', { AI_NOVEL_LOCAL_EMBEDDING_CACHE: '   ' })).toBe(fallback)
      expect(resolveLocalEmbeddingCacheDir('/tmp/userdata', undefined)).toBe(fallback)
    })
  })

  describe('localEmbeddingHubDir', () => {
    it('按 repo 的 org/name 还原 transformers.js 的 Hub 目录', () => {
      expect(localEmbeddingHubDir('/cache', 'Xenova/bge-small-zh-v1.5'))
        .toBe(path.join('/cache', 'Xenova', 'bge-small-zh-v1.5'))
      expect(localEmbeddingHubDir('/cache', 'onnx-community/Qwen3-Embedding-0.6B-ONNX'))
        .toBe(path.join('/cache', 'onnx-community', 'Qwen3-Embedding-0.6B-ONNX'))
    })
  })

  describe('localEmbeddingModelDirCandidates', () => {
    it('Hub 布局优先，其后是扁平布局（向后兼容）', () => {
      const candidates = localEmbeddingModelDirCandidates('/cache', targetSpec)
      expect(candidates[0]).toBe(path.join('/cache', 'Xenova', 'bge-small-zh-v1.5'))
      expect(candidates[1]).toBe(path.join('/cache', 'bge-small-zh-v1.5'))
    })

    it('候选去重：repo 已经是扁平形式时不重复返回同一个目录', () => {
      const candidates = localEmbeddingModelDirCandidates('/cache', { id: 'flat-model', repo: 'flat-model' })
      expect(candidates).toEqual([path.join('/cache', 'flat-model')])
    })

    it('不因目录不存在而省略候选（存在性由调用方判定）', () => {
      const candidates = localEmbeddingModelDirCandidates(path.join(root, 'never-created'), targetSpec)
      expect(candidates.length).toBeGreaterThanOrEqual(2)
      for (const candidate of candidates) expect(fs.existsSync(candidate)).toBe(false)
    })
  })

  describe('hasOnnxWeights', () => {
    it('识别 Hub 布局的 onnx（transformers.js 的真实落点）', () => {
      const dir = makeFixtureDir('models/embedding/Xenova/bge-small-zh-v1.5')
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/onnx/model_quantized.onnx', 'w'.repeat(64))
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/config.json', '{}')
      expect(hasOnnxWeights(dir)).toBe(true)
    })

    it('识别扁平布局的 onnx（向后兼容）', () => {
      const dir = makeFixtureDir('models/embedding/bge-small-zh-v1.5')
      writeFixture('models/embedding/bge-small-zh-v1.5/model.onnx')
      expect(hasOnnxWeights(dir)).toBe(true)
    })

    it('识别限内深度的 onnx，且忽略下载未完成的 .part/.tmp 文件', () => {
      const dir = makeFixtureDir('deep')
      writeFixture('deep/a/b/model.onnx')
      expect(hasOnnxWeights(dir)).toBe(true)

      const partial = makeFixtureDir('partial')
      writeFixture('partial/onnx/model.onnx.part')
      writeFixture('partial/onnx/model.onnx.tmp')
      writeFixture('partial/onnx/model_quantized.onnx.download')
      expect(hasOnnxWeights(partial)).toBe(false)
    })

    it('目录存在但只有 config/tokenizer 等非 onnx 文件时返回 false（下载未完成）', () => {
      const dir = makeFixtureDir('models/embedding/Xenova/bge-small-zh-v1.5')
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/config.json', '{}')
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/tokenizer.json', '{}')
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/tokenizer_config.json', '{}')
      expect(hasOnnxWeights(dir)).toBe(false)
    })

    it('不存在的目录、空字符串与非目录路径都返回 false 且不抛异常', () => {
      expect(hasOnnxWeights(path.join(root, 'missing'))).toBe(false)
      expect(hasOnnxWeights('')).toBe(false)
      // 传入文件路径而非目录：readdir 会 ENOTDIR，必须被吞成 false。
      const filePath = writeFixture('not-a-dir.txt')
      expect(hasOnnxWeights(filePath)).toBe(false)
    })

    it('超过深度上限的 onnx 不视为已下载（避免误判嵌套的无关权重）', () => {
      const dir = makeFixtureDir('too-deep')
      writeFixture('too-deep/a/b/c/d/e/f/g/model.onnx')
      expect(hasOnnxWeights(dir)).toBe(false)
    })
  })

  describe('isLocalEmbeddingModelDownloaded', () => {
    it('Hub 布局命中：Xenova/<id>/onnx/model_quantized.onnx', () => {
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/onnx/model_quantized.onnx', 'w'.repeat(64))
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(true)
    })

    it('扁平布局命中：<cacheDir>/<id>/model.onnx', () => {
      writeFixture('models/embedding/bge-small-zh-v1.5/model.onnx')
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(true)
    })

    it('目录存在但无非 onnx 文件时返回 false（下载未完成）', () => {
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/config.json', '{}')
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/tokenizer.json', '{}')
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(false)

      writeFixture('models/embedding/bge-small-zh-v1.5/config.json', '{}')
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(false)
    })

    it('防串味：别的模型的 Hub 权重存在时，目标模型仍判 false', () => {
      // 关键回归点：绝不能在 cacheDir 根递归找 onnx，否则任何一个已下载模型
      // 都会让所有模型被判定为已就绪。
      writeFixture('models/embedding/Xenova/all-MiniLM-L6-v2/onnx/model.onnx', 'w'.repeat(64))
      writeFixture('models/embedding/onnx-community/Qwen3-Embedding-0.6B-ONNX/onnx/model_quantized.onnx', 'w')
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(false)
    })

    it('防串味：别的模型的扁平权重存在时，目标模型仍判 false', () => {
      writeFixture('models/embedding/all-minilm-l6-v2/model.onnx', 'w'.repeat(64))
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(false)
    })

    it('防串味：目标目录只有非 onnx，兄弟模型有 onnx 时仍为 false', () => {
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/config.json', '{}')
      writeFixture('models/embedding/Xenova/all-MiniLM-L6-v2/onnx/model.onnx', 'w'.repeat(64))
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(false)
    })

    it('cacheDir 整体不存在时返回 false 且不抛异常', () => {
      expect(isLocalEmbeddingModelDownloaded(path.join(root, 'no-such-cache'), targetSpec)).toBe(false)
      expect(isLocalEmbeddingModelDownloaded('', targetSpec)).toBe(false)
    })

    it('用真实目录条目驱动：catalog 里每个模型的 Hub 与扁平两种布局都能被识别', () => {
      const spec = getLocalEmbeddingModelSpec('bge-small-zh-v1.5')
      expect(spec).toBeTruthy()
      if (!spec) return
      const hub = localEmbeddingHubDir(cacheDir(), spec.repo)
      fs.mkdirSync(path.join(hub, 'onnx'), { recursive: true })
      fs.writeFileSync(path.join(hub, 'onnx', 'model_quantized.onnx'), 'w'.repeat(64))
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), { id: spec.id, repo: spec.repo })).toBe(true)
    })

    it('固化根因：只按扁平 <cacheDir>/<id> 判定的旧口径在真实 Hub 布局下必然为 false', () => {
      writeFixture('models/embedding/Xenova/bge-small-zh-v1.5/onnx/model_quantized.onnx', 'w'.repeat(64))
      // 逐字复刻修复前 kb-controller.ts:176-183 与 local-embedding-controller.ts:81-88 的判定：
      // 目录取扁平 modelId，且只在该目录内递归找 .onnx。真实下载落点是 Hub 布局，
      // 因此旧口径必然为 false —— 这就是 EMBEDDING_MODEL_NOT_CONFIGURED 的根因。
      const legacyDir = path.join(cacheDir(), targetSpec.id)
      const legacyReady = fs.existsSync(legacyDir)
        && fs.readdirSync(legacyDir, { recursive: true }).some(entry => String(entry).endsWith('.onnx'))
      expect(legacyReady).toBe(false)
      // 同一份磁盘内容，修复后的判定必须认同（否则回归即复现）。
      expect(isLocalEmbeddingModelDownloaded(cacheDir(), targetSpec)).toBe(true)
    })
  })
})

/**
 * dtype 精确判定（bug 族第二实例）。
 *
 * 同一个 repo 会以多个量化档位收录（embeddinggemma 有 q8 / q4f16 / fp32 三条
 * spec，repo 完全相同）。若判定只看「目录里有没有任意 .onnx」，用户下载 Q8 后
 * 另两个档位也会显示为已下载，选中后引擎找不到 model.onnx / model_q4f16.onnx，
 * 重演「显示已选中但不可用」。
 *
 * 这里刻意用 catalog 的真实 spec 驱动（含 dtype），而不是手写字面量：
 * 契约是「有 dtype 按具体文件名判定，无 dtype 退回任一 onnx」。
 */
describe('dtype 精确判定（同 repo 多档位不互相冒充）', () => {
  const gemmaRepo = 'onnx-community/embeddinggemma-300m-ONNX'
  const gemmaDir = (...segments: string[]): string =>
    path.join(cacheDir(), 'onnx-community', 'embeddinggemma-300m-ONNX', ...segments)

  function gemma(modelId: string) {
    const spec = getLocalEmbeddingModelSpec(modelId)
    if (!spec) throw new Error('catalog 缺少模型：' + modelId)
    return spec
  }

  function writeGemmaFile(fileName: string): void {
    const target = path.join(gemmaDir('onnx'), fileName)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'w'.repeat(64))
  }

  it('Lead 实证场景：只放 Q8 权重时，仅 q8 判已下载，q4f16 与 fp32 均为 false', () => {
    writeGemmaFile('model_quantized.onnx')

    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q8'))).toBe(true)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q4f16'))).toBe(false)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-f32'))).toBe(false)
  })

  it('补放 fp32 权重后 f32 转 true，且 q4f16 仍为 false', () => {
    writeGemmaFile('model_quantized.onnx')
    writeGemmaFile('model.onnx')

    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-f32'))).toBe(true)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q8'))).toBe(true)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q4f16'))).toBe(false)
  })

  it('dtype 维度防串味：只放别的 dtype 的文件时目标 dtype 为 false', () => {
    writeGemmaFile('model_q4f16.onnx')

    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q4f16'))).toBe(true)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q8'))).toBe(false)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-f32'))).toBe(false)
  })

  it('文件名大小写不敏感：Model_Quantized.ONNX 仍算 Q8 已下载', () => {
    writeGemmaFile('Model_Quantized.ONNX')

    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q8'))).toBe(true)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q4f16'))).toBe(false)
  })

  it('扁平布局下 dtype 精确判定同样生效', () => {
    const flat = path.join(cacheDir(), 'embeddinggemma-300m-q8')
    fs.mkdirSync(flat, { recursive: true })
    fs.writeFileSync(path.join(flat, 'model_quantized.onnx'), 'w'.repeat(64))

    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q8'))).toBe(true)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-f32'))).toBe(false)
  })

  it('无 dtype 的 spec 在同样目录下仍按“任一 onnx”判定（向后兼容）', () => {
    writeGemmaFile('model_quantized.onnx')

    expect(isLocalEmbeddingModelDownloaded(
      cacheDir(),
      { id: 'embeddinggemma-300m-q8', repo: gemmaRepo },
    )).toBe(true)
  })

  it('无 dtype 的 spec 在目录里没有 onnx 时仍为 false', () => {
    writeGemmaFile('config.json')

    expect(isLocalEmbeddingModelDownloaded(
      cacheDir(),
      { id: 'embeddinggemma-300m-q8', repo: gemmaRepo },
    )).toBe(false)
  })

  it('固化根因：不区分 dtype 的旧口径在同 repo 目录上会把三个档位全部误判为已下载', () => {
    writeGemmaFile('model_quantized.onnx')
    const dir = gemmaDir()

    // 逐字复刻修复前的判定：任一候选目录内存在任意 *.onnx 即视为已下载。
    const legacyReady = fs.existsSync(dir)
      && fs.readdirSync(dir, { recursive: true }).some(entry => String(entry).endsWith('.onnx'))
    expect(legacyReady).toBe(true)

    // 同一份磁盘内容，dtype 精确判定必须把另外两个档位判为未下载。
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-q4f16'))).toBe(false)
    expect(isLocalEmbeddingModelDownloaded(cacheDir(), gemma('embeddinggemma-300m-f32'))).toBe(false)
  })
})
