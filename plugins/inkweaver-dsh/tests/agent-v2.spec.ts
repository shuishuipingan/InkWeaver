import { describe, expect, it } from 'vitest'
import { inject, name } from '../src/agent-v2.ts'
import {
  INKWEAVER_PACKAGE_NAME,
  INKWEAVER_PRESET_ID,
  INKWEAVER_PROJECT_DIRECTORY,
  INKWEAVER_RPC_CHANNEL,
  INKWEAVER_V2_PRESET_ID,
} from '../src/identity.ts'

describe('织墨 V2 agent entry', () => {
  it('publishes the canonical InkWeaver runtime identities', () => {
    expect({
      packageName: INKWEAVER_PACKAGE_NAME,
      presetId: INKWEAVER_PRESET_ID,
      projectDirectory: INKWEAVER_PROJECT_DIRECTORY,
      rpcChannel: INKWEAVER_RPC_CHANNEL,
      v2PresetId: INKWEAVER_V2_PRESET_ID,
    }).toEqual({
      packageName: '@shuishuipingan/inkweaver-dsh',
      presetId: 'inkweaver',
      projectDirectory: '.inkweaver',
      rpcChannel: '/inkweaver',
      v2PresetId: 'inkweaver-v2',
    })
  })

  it('declares its Workspace registry requirement without making V1 require it', () => {
    expect(name).toBe('inkweaver-agent-v2')
    expect(inject).toEqual(['agents', 'systemPrompt', 'tools', 'workspaceRegistry'])
  })
})
