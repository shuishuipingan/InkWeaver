/**
 * 护栏：会发起 LLM 调用的命令必须进入 GenerationRuntime。
 *
 * 背景（task-106）：directory.command 的补档走了 callLLMWithBoundedCompletion，
 * 而该命令从不经过 executeWithGenerationRuntime → requireGenerationExecution 必然抛，
 * 又被 catch 吞成一条日志 → 生产环境静默失效，组件测试全绿也发现不了。
 * 这条契约把同类问题拦在开发期：**只要调用 LLM，就必须进入运行时**。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { readNormalizedSource } from '../../../../../test/source-contract'

const COMMANDS_DIR = path.resolve('src/services/workflows/commands')

function collectCommandSources(): Array<{ path: string; source: string }> {
  return fs.readdirSync(COMMANDS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => ({
      path: 'src/services/workflows/commands/' + entry.name,
      source: readNormalizedSource(path.join(COMMANDS_DIR, entry.name)),
    }))
}

/**
 * 已知例外清单：调用 LLM 却不进入 GenerationRuntime 的文件。
 * **终局必须是空的** —— 要么合规，要么根本不存在。
 * （2026-10 唯一的条目 chapter-handoff.command.ts 已按 task-107 删除死类，清单恢复为空。）
 */
const KNOWN_RUNTIME_ENTRY_EXCEPTIONS: readonly string[] = []

/** 调用任一 callLLM* 变体却不进入 GenerationRuntime，就是违规（已知例外单独列出）。 */
function findRuntimeEntryViolations(files: Array<{ path: string; source: string }>): string[] {
  const callsModel = /this\.callLLM/u
  const entersRuntime = /executeWithGenerationRuntime/u
  return files
    .filter(file => callsModel.test(file.source))
    .filter(file => !entersRuntime.test(file.source))
    .map(file => file.path)
    .filter(filePath => !KNOWN_RUNTIME_ENTRY_EXCEPTIONS.includes(filePath))
}

describe('生成运行时入口契约', () => {
  it('所有调用 callLLM* 的命令都进入了 GenerationRuntime', () => {
    expect(findRuntimeEntryViolations(collectCommandSources())).toEqual([])
  })

  it('判别力自证：把 executeWithGenerationRuntime 抽掉，同一判定必须报违规', () => {
    expect(findRuntimeEntryViolations([
      { path: 'violating.command.ts', source: 'await this.callLLM(prompt, system, callbacks)' },
      { path: 'compliant.command.ts', source: 'await this.executeWithGenerationRuntime(async () => this.callLLM(a, b, c))' },
    ])).toEqual(['violating.command.ts'])
  })
})
