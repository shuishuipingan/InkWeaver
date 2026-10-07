/**
 * task-80 第 4 条护栏：项目级通道的会话上下文识别约定。
 *
 * 统一包装器靠 `args.at(-1)` 识别 ProjectSessionContext。若将来新增的 db:* 通道
 * 把"含 projectId/leaseId/projectPath 的对象"放在最后一个参数（而不是 expectedProjectPath），
 * 它会被当成会话上下文 pop 掉，handler 静默拿到错位的参数。
 * 这里用类型级 + 源码级双重断言，让下一个加通道的人立刻发现。
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { readNormalizedSource } from '../../test/source-contract'
import type { DatabaseChannels } from '../../src/shared/ipc-channels'

type LastArg<Args> = Args extends readonly [...infer _Rest, infer Last] ? Last : never

type OffendingChannels = {
  [K in keyof DatabaseChannels]: LastArg<DatabaseChannels[K]['args']> extends string ? never : K
}[keyof DatabaseChannels]

describe('db:* 通道的会话约定护栏', () => {
  it('类型级：每个 db:* 通道的最后一个参数都是 string（== expectedProjectPath）', () => {
    // 若某个通道的末参不是 string，OffendingChannels 不再是 never，下面这行会编译失败。
    const contract: [OffendingChannels] extends [never] ? true : false = true
    expect(contract).toBe(true)
  })

  it('源码级：每个 db:* handler 的形参列表都声明了 expectedProjectPath', () => {
    const source = readNormalizedSource(path.resolve('electron/controllers/db-controller.ts'))
    const offenders: string[] = []
    const pattern = /ipcMain\.handle\(\s*'(db:[^']+)'/gu
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) {
      const channel = match[1]!
      const parenStart = source.indexOf('(', match.index + match[0].length - 1)
      let depth = 0
      let index = parenStart
      for (; index < source.length; index += 1) {
        const char = source[index]
        if (char === '(') depth += 1
        else if (char === ')') {
          depth -= 1
          if (depth === 0) break
        }
      }
      const signature = source.slice(parenStart, index + 1)
      if (!signature.includes('expectedProjectPath')) offenders.push(channel)
    }
    expect(offenders).toEqual([])
  })

  it('包装器确实以 args.at(-1) 判定会话（约定存在，需被上面的护栏守住）', () => {
    const source = readNormalizedSource(path.resolve('electron/controllers/db-controller.ts'))
    expect(source).toContain('const candidate = args.at(-1)')
    expect(source).toContain('isProjectSessionContext(candidate)')
  })
})
