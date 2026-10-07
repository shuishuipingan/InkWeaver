/**
 * task-80 第 3 条：项目切换时中止旧项目的在途流。
 *
 * 写库侧本就有会话校验兜底（不会写进新项目），这里验证的是"请求本身被中止"：
 * 中止后 provider 会走既有 onError 路径，渲染层通过 llm:stream-error 收到终止结果。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  capturedSignal: { value: undefined as AbortSignal | undefined },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      mocks.handlers.set(channel, handler)
    },
  },
  BrowserWindow: {
    fromWebContents: () => ({
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: () => {} },
    }),
  },
  app: { getPath: () => '' },
}))

vi.mock('../../services/runtime-logger', () => ({
  runtimeLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), flush: vi.fn() },
}))

vi.mock('../../utils/safe-console', () => ({
  safeConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../utils/config-utils', () => ({
  readJsonFile: vi.fn(() => [{
    id: 'model-1', name: 'verify-model', modelName: 'gpt-6.1-sol', protocol: 'openai',
    baseUrl: 'https://example.test', apiKey: 'k',
  }]),
  tryReadJsonFile: vi.fn(() => ({ success: true, data: [] })),
  writeJsonFile: vi.fn(),
  MODELS_CONFIG_PATH: 'models.json',
  GLOBAL_CONFIG_PATH: 'global.json',
  DEFAULT_GLOBAL_CONFIG: {},
}))

vi.mock('../../database', () => ({
  getCurrentProjectPath: vi.fn(() => null),
  getProjectDb: vi.fn(() => null),
}))

vi.mock('../../repositories/llm-repository', () => ({
  LLMHistoryRepository: { logCall: vi.fn(), getStats: vi.fn(), getHistory: vi.fn(() => []) },
}))

vi.mock('../../services/project-access', () => ({
  projectAccess: { assertCurrentProjectContext: vi.fn(), captureCurrentSession: vi.fn(() => null) },
}))

vi.mock('../../services/model-execution-lease', () => ({
  ModelExecutionLeaseError: class ModelExecutionLeaseError extends Error {},
  ModelExecutionLeaseRegistry: class {
    begin() { return { leaseId: 'lease', expiresAt: Date.now() + 1000 } }
    resolve() { return null }
    close() { return true }
  },
}))

vi.mock('../../services/model-discovery-service', () => ({
  ModelDiscoveryService: class { async discover() { return { success: false, error: 'not used' } } },
}))

vi.mock('../../services/model-capability-probe', () => ({
  ModelCapabilityProbe: class { async probe() { return { success: false, error: 'not used' } } },
}))

vi.mock('../../llm/generation-parameter-policy', () => ({
  resolveGenerationParameters: vi.fn(() => ({})),
}))

vi.mock('../../llm/llm-factory', () => ({
  LLMFactory: {
    getProvider: () => ({
      // 挂起直到被中止：把 signal 暴露给测试，行为上等价于一次长流式请求。
      // 替身在 abort 时以 resolve 收尾（真实 provider 会走 onError 路径），
      // 这样测试只断言"请求被中止"这一件事，不引入额外的 rejection 噪声。
      generateStream: (_model: unknown, _messages: unknown, options: { signal: AbortSignal }) => {
        mocks.capturedSignal.value = options.signal
        return new Promise<void>(resolve => {
          options.signal.addEventListener('abort', () => resolve())
        })
      },
    }),
  },
}))

import { abortActiveStreams, registerLLMController } from '../llm-controller'

beforeEach(() => {
  mocks.handlers.clear()
  mocks.capturedSignal.value = undefined
  registerLLMController()
})

describe('项目切换中止在途流', () => {
  it('进行中的流式请求会在切换时被中止，且入口可重复调用', async () => {
    const start = mocks.handlers.get('llm:generate-stream')!
    const started = await start({ sender: {} }, 'req-1', {
      modelId: 'model-1',
      messages: [{ role: 'user', content: '生成一段内容' }],
    }) as { started: boolean }

    expect(started.started).toBe(true)
    expect(mocks.capturedSignal.value?.aborted).toBe(false)

    expect(abortActiveStreams('project-open')).toBe(1)
    expect(mocks.capturedSignal.value?.aborted).toBe(true)

    // 已清空：再次调用不再报告中止（幂等）
    expect(abortActiveStreams('project-open')).toBe(0)
  })

  it('没有在途流时返回 0（切换项目本身不受影响）', () => {
    expect(abortActiveStreams('project-close')).toBe(0)
  })
})
