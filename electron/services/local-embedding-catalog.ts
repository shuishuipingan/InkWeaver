/**
 * 内置本地向量模型目录 — 首跑下载与离线检索共用的唯一事实源。
 *
 * 每个条目描述一个可通过 transformers.js 加载的 ONNX 模型：来源仓库、
 * 量化档位、输出维度、池化方式、近似下载体积与面向用户的介绍。
 * 下载体积为近似值（以仓库文件实测为准），仅用于展示。
 *
 * 档位类型与"档位 → 权重文件名"登记表物理定义在 local-embedding-storage（判定模块，
 * 必须能被 node 直跑），此处按主进程惯例以不带扩展名的相对导入转出，依赖方向单向。
 */

import type { LocalEmbeddingDtype } from './local-embedding-storage'

export type LocalEmbeddingPool = 'cls' | 'mean'

export interface LocalEmbeddingModelSpec {
  /** 用户可见且用于指纹的唯一标识（持久化到全局配置）。 */
  id: string
  displayName: string
  /** HuggingFace（或镜像）仓库 id，包含 ONNX 权重。 */
  repo: string
  /**
   * transformers.js 的 dtype 档位，决定下载的权重文件。
   *
   * 与 local-embedding-storage 的档位登记表、引擎的 LocalEmbeddingSpec.dtype 同源，
   * 三处共用同一个联合类型，避免扩档时只有一边被改到。
   */
  dtype: LocalEmbeddingDtype
  /** 输出向量维度；写入向量库前会据此校验。 */
  dimension: number
  pooling: LocalEmbeddingPool
  /** 单条文本的最大 token 数（模型上限，非分块参数）。 */
  maxSequenceTokens: number
  /** 近似下载体积（字节），用于选择界面的展示。 */
  approxBytes: number
  license: string
  descriptionZh: string
  descriptionEn: string
}

export const LOCAL_EMBEDDING_MODELS: readonly LocalEmbeddingModelSpec[] = Object.freeze([
  {
    id: 'bge-small-zh-v1.5',
    displayName: 'BGE small zh v1.5（中文推荐）',
    repo: 'Xenova/bge-small-zh-v1.5',
    dtype: 'q8',
    dimension: 512,
    pooling: 'cls',
    maxSequenceTokens: 512,
    approxBytes: 24_000_000,
    license: 'MIT',
    descriptionZh: '专为中文优化的轻量检索模型，速度快、体积小，最适合中文小说的场景与对话检索；中文知识库的首选。',
    descriptionEn: 'Lightweight retrieval model optimized for Chinese. Fast and small; the best default for Chinese novel libraries.',
  },
  {
    id: 'embeddinggemma-300m-q8',
    displayName: 'EmbeddingGemma 300M（Q8 量化）',
    repo: 'onnx-community/embeddinggemma-300m-ONNX',
    // 该仓库的 8 位档是 model_quantized.onnx（transformers.js 的 dtype 'q8'），
    // 不是 model_int8.onnx——按实测文件清单选择，否则下载会失败。
    dtype: 'q8',
    dimension: 768,
    pooling: 'mean',
    maxSequenceTokens: 2048,
    approxBytes: 310_000_000,
    license: 'Gemma 使用许可',
    descriptionZh: 'Google 多语言嵌入模型（100+ 语言），质量高于轻量模型，支持 2K 上下文；体积与内存需求中等。',
    descriptionEn: 'Google multilingual embedder (100+ languages). Higher quality than lightweight models with 2K context; medium size.',
  },
  {
    id: 'embeddinggemma-300m-q4f16',
    displayName: 'EmbeddingGemma 300M（Q4 更小更快）',
    repo: 'onnx-community/embeddinggemma-300m-ONNX',
    dtype: 'q4f16',
    dimension: 768,
    pooling: 'mean',
    maxSequenceTokens: 2048,
    approxBytes: 180_000_000,
    license: 'Gemma 使用许可',
    descriptionZh: '体积最小的 EmbeddingGemma 档位（ONNX 无 GGUF 的 Q5_K，Q4 比它更小），适合磁盘或内存紧张、可接受轻微质量损失的机器。',
    descriptionEn: 'Smallest EmbeddingGemma variant (ONNX has no GGUF Q5_K; Q4 is even smaller). For tight disk or memory budgets with a slight quality trade-off.',
  },
  {
    id: 'embeddinggemma-300m-f32',
    displayName: 'EmbeddingGemma 300M（F32 全精度）',
    repo: 'onnx-community/embeddinggemma-300m-ONNX',
    dtype: 'fp32',
    dimension: 768,
    pooling: 'mean',
    maxSequenceTokens: 2048,
    approxBytes: 1_200_000_000,
    license: 'Gemma 使用许可',
    descriptionZh: '全精度版本，质量与 Q8 基本一致但体积与内存大得多；仅在明确需要全精度时选择。',
    descriptionEn: 'Full-precision variant. Quality is nearly identical to Q8 but much larger; choose only for specific needs.',
  },
  {
    id: 'all-minilm-l6-v2',
    displayName: 'all-MiniLM-L6-v2（英文轻量）',
    repo: 'Xenova/all-MiniLM-L6-v2',
    dtype: 'q8',
    dimension: 384,
    pooling: 'mean',
    maxSequenceTokens: 512,
    approxBytes: 23_000_000,
    license: 'Apache-2.0',
    descriptionZh: '英文场景的经典轻量模型，速度极快；中文效果有限，适合以英文为主的资料库。',
    descriptionEn: 'Classic lightweight English model. Extremely fast; limited Chinese quality — best for English-heavy libraries.',
  },
  {
    id: 'paraphrase-multilingual-minilm-l12-v2',
    displayName: 'paraphrase-multilingual MiniLM-L12（多语言轻量）',
    repo: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    dtype: 'q8',
    dimension: 384,
    pooling: 'mean',
    maxSequenceTokens: 512,
    approxBytes: 118_000_000,
    license: 'Apache-2.0',
    descriptionZh: '50+ 语言的多语言轻量模型，中英文混合资料库的均衡选择。',
    descriptionEn: 'Multilingual lightweight model covering 50+ languages; a balanced pick for mixed-language libraries.',
  },
  {
    id: 'qwen3-embedding-0.6b-q8',
    displayName: 'Qwen3-Embedding 0.6B（Q8，质量优先）',
    repo: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    dtype: 'int8',
    dimension: 1024,
    pooling: 'mean',
    maxSequenceTokens: 32_768,
    approxBytes: 600_000_000,
    license: 'Apache-2.0',
    descriptionZh: '质量最高的可下载选项：多语言检索、32K 上下文，长章节与复杂设定也能完整编码；体积与内存较大。',
    descriptionEn: 'Highest-quality downloadable option: multilingual retrieval with 32K context for long chapters; large size and memory.',
  },
])

export function getLocalEmbeddingModelSpec(modelId: string): LocalEmbeddingModelSpec | undefined {
  return LOCAL_EMBEDDING_MODELS.find(model => model.id === modelId)
}

/** 用于指纹与空间隔离的稳定标识；模型切换时向量库按此隔离并触发重建。 */
export function localEmbeddingFingerprint(modelId: string): string {
  return `local|builtin|${modelId}`
}

/**
 * 档位类型与"档位 → 权重文件名"登记表：物理定义在 local-embedding-storage
 * （判定模块必须能被 node 直接跑，不能反向依赖本文件），此处对外转出，
 * 使 catalog 仍是使用方唯一的引用入口。
 */
export { LOCAL_EMBEDDING_DTYPE_FILES, localEmbeddingWeightFile } from './local-embedding-storage'
export type { LocalEmbeddingDtype } from './local-embedding-storage'

/** 全局配置里的下载状态记录；真正落地以缓存目录存在文件为准。 */
export interface LocalEmbeddingDownloadState {
  modelId: string
  downloadedAt: string
}

export function formatApproxBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  return `${Math.round(bytes / 1_000_000)} MB`
}
