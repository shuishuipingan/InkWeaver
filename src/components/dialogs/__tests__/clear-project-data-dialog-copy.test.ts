import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { readNormalizedSource } from '../../../../test/source-contract'

const dialog = readNormalizedSource(path.resolve('src/components/dialogs/ClearProjectDataDialog.tsx'))

describe('清空生成数据对话框的文案口径', () => {
  it('明确点出助手会话不受影响，并指明清空对话的正确入口', () => {
    expect(dialog).toContain('助手会话记录不受影响')
    expect(dialog).toContain('到助手面板的历史记录里删除会话')
    expect(dialog).toContain('data-testid="clear-project-data-assistant-scope"')
  })

  it('同时列出会被清掉的生成内容，避免只说"不清什么"', () => {
    expect(dialog).toContain('草稿正文、定稿、蓝图、架构与文风档案在勾选后会被清除')
  })

  it('中英文说明成对存在，避免只挂一边', () => {
    expect(dialog).toContain('Assistant conversations are not affected')
    expect(dialog).toContain('use the assistant panel history')
  })
})
