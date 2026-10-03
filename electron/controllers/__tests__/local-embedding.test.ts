import { describe, expect, it } from 'vitest'

import {
  LOCAL_EMBEDDING_MODELS,
  getLocalEmbeddingModelSpec,
  localEmbeddingFingerprint,
  formatApproxBytes,
} from '../../services/local-embedding-catalog'
import { resolveDeviceCandidates } from '../../services/local-embedding-engine'
import type { GlobalConfig, ModelProfile } from '../../../src/shared/ipc-channels'
import { resolveEmbeddingCall } from '../kb-controller'

describe('local embedding catalog', () => {
  it('includes the user-requested models with distinct ids and valid specs', () => {
    const ids = LOCAL_EMBEDDING_MODELS.map(model => model.id)
    expect(ids).toEqual(expect.arrayContaining([
      'bge-small-zh-v1.5',
      'all-minilm-l6-v2',
      'qwen3-embedding-0.6b-q8',
      'paraphrase-multilingual-minilm-l12-v2',
    ]))
    // EmbeddingGemma 以 F32 与 Q8 两个量化档位收录（Q5_K 是 GGUF 量化名，ONNX 等价档位为 int8/q4）。
    expect(ids.filter(id => id.startsWith('embeddinggemma')).length).toBeGreaterThanOrEqual(2)
    for (const model of LOCAL_EMBEDDING_MODELS) {
      expect(model.repo).toMatch(/^[^/]+\/[^/]+$/)
      expect(model.dimension).toBeGreaterThan(0)
      expect(model.maxSequenceTokens).toBeGreaterThan(0)
      expect(['cls', 'mean']).toContain(model.pooling)
    }
  })

  it('maps every catalog dtype to a file the model repo actually publishes', () => {
    // 实测各仓库 onnx/ 目录文件清单后固定：dtype 与文件名一一对应，
    // 任何一条写错都会在用户下载时失败。
    const dtypeToFile: Record<string, string> = {
      fp32: 'model.onnx',
      fp16: 'model_fp16.onnx',
      q8: 'model_quantized.onnx',
      int8: 'model_int8.onnx',
      uint8: 'model_uint8.onnx',
      q4: 'model_q4.onnx',
      q4f16: 'model_q4f16.onnx',
    }
    const available: Record<string, string[]> = {
      'Xenova/bge-small-zh-v1.5': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
      'onnx-community/embeddinggemma-300m-ONNX': ['model.onnx', 'model_fp16.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx'],
      'Xenova/all-MiniLM-L6-v2': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
      'onnx-community/Qwen3-Embedding-0.6B-ONNX': ['model.onnx', 'model_fp16.onnx', 'model_int8.onnx', 'model_q4.onnx', 'model_q4f16.onnx', 'model_quantized.onnx', 'model_uint8.onnx'],
    }
    for (const model of LOCAL_EMBEDDING_MODELS) {
      const file = dtypeToFile[model.dtype]
      expect(file, `${model.id} 的 dtype ${model.dtype} 未映射到文件名`).toBeTruthy()
      expect(available[model.repo], `${model.id} 的仓库未登记`).toContain(file)
    }
  })

  it('resolves specs by id and builds stable fingerprints', () => {
    expect(getLocalEmbeddingModelSpec('bge-small-zh-v1.5')?.dimension).toBe(512)
    expect(localEmbeddingFingerprint('bge-small-zh-v1.5')).toBe('local|builtin|bge-small-zh-v1.5')
    expect(formatApproxBytes(33_000_000)).toBe('33 MB')
    expect(formatApproxBytes(1_200_000_000)).toBe('1.2 GB')
  })
})

describe('device candidates (GPU → 核显 → CPU)', () => {
  it('tries DirectML on Windows, CoreML on macOS, CUDA on Linux, then CPU', () => {
    expect(resolveDeviceCandidates('auto', 'win32')).toEqual(['dml', 'cpu'])
    expect(resolveDeviceCandidates('auto', 'darwin')).toEqual(['coreml', 'cpu'])
    expect(resolveDeviceCandidates('auto', 'linux')).toEqual(['cuda', 'cpu'])
  })
  it('honors an explicit CPU preference', () => {
    expect(resolveDeviceCandidates('cpu', 'win32')).toEqual(['cpu'])
  })
})

describe('embedding source resolution', () => {
  const models: ModelProfile[] = [
    { id: 'main-chat', name: '主力对话', provider: 'deepseek', protocol: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: 'key', modelName: 'deepseek-flash', temperature: 0.7, maxTokens: 1000, purposes: ['generation'] },
    { id: 'api-embed', name: 'API 向量', provider: 'siliconflow' as ModelProfile['provider'], protocol: 'openai', baseUrl: 'https://api.siliconflow.cn', apiKey: 'key', modelName: 'bge-m3', temperature: 0.7, maxTokens: 1000, purposes: ['embedding'] },
  ]
  const global = (overrides: Partial<GlobalConfig>): GlobalConfig => ({
    theme: 'dark', defaultModelId: 'main-chat', ...overrides,
  }) as GlobalConfig

  it('never falls back to the main chat model when no embedding source is available', () => {
    // 回归：此前 getEmbeddingConfig 在缺省向量模型时回退 defaultModelId，
    // 导致每个分块批次都对主力对话模型反复调用 /embeddings。
    expect(resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: null }),
      models,
      () => false,
    )).toBeNull()
    expect(resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: 'main-chat' }),
      models,
      () => false,
    )).toBeNull()
  })

  it('prefers the downloaded local model in auto mode even when API is configured', () => {
    const call = resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: 'api-embed', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => true,
    )
    expect(call).toMatchObject({ protocol: 'local', model: { modelName: 'bge-small-zh-v1.5' } })
  })

  it('falls back to the API model in auto mode when local is not downloaded', () => {
    const call = resolveEmbeddingCall(
      global({ defaultEmbeddingModelId: 'api-embed' }),
      models,
      () => false,
    )
    expect(call).toMatchObject({ protocol: 'openai', model: { modelName: 'bge-m3' } })
  })

  it('honors explicit local-only and api-only sources', () => {
    expect(resolveEmbeddingCall(
      global({ embeddingSource: 'local', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => true,
    )).toMatchObject({ protocol: 'local', model: { modelName: 'bge-small-zh-v1.5' } })
    // local-only 但模型未下载 → null（FTS + 提示下载）。
    expect(resolveEmbeddingCall(
      global({ embeddingSource: 'local', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => false,
    )).toBeNull()
    expect(resolveEmbeddingCall(
      global({ embeddingSource: 'api', defaultEmbeddingModelId: 'api-embed', localEmbeddingModelId: 'bge-small-zh-v1.5' }),
      models,
      () => true,
    )).toMatchObject({ protocol: 'openai', model: { modelName: 'bge-m3' } })
  })
})
