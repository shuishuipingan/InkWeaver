import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { setActiveProjectSessionContext } from '../../../../shared/project-session-context'
import { useAgentStore } from '../../../../stores/agent-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import ConfirmCard from '../ConfirmCard'

const session = { projectId: 'A', leaseId: 'lease-A', projectPath: 'C:\\novels\\A' }
const project = {
  id: 'A', sessionLease: 'lease-A', path: session.projectPath, name: 'A', characterStates: '', createdAt: '', updatedAt: '',
  novelConfig: {
    genre: '奇幻', subGenre: '', targetAudience: '青年', totalChapters: 10, wordsPerChapter: 3000,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '旧大纲', worldSetting: '',
    goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
}

/** 复现用户现场的那条校验错误：character 给成了对象而不是文本。 */
const invalidPlanArguments = {
  plan: {
    summary: '更新林舟的当前状态',
    items: [
      { kind: 'character-state', reason: '推进主线', character: { name: '林舟' }, state: { mood: '冷静' } },
    ],
  },
}

let container: HTMLDivElement
let root: Root
const originalSendMessage = useAgentStore.getState().sendMessage
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
}

function mount(toolCall: Record<string, unknown>) {
  return act(async () => {
    root.render(<ConfirmCard toolCall={toolCall as never} />)
  })
}

function changePlanToolCall(id: string, args: Record<string, unknown>) {
  return { id, toolName: 'propose_change_plan', arguments: args, status: 'waiting_confirm', source: 'builtin', projectSession: session }
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: project as never })
  setActiveProjectSessionContext(session)
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async (channel: string) => (
        channel === 'db:project-core-get' ? { novelConfig: project.novelConfig, characterStates: '' } : []
      )),
      on: vi.fn(), once: vi.fn(), send: vi.fn(),
      setZoomLevel: vi.fn(), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(),
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useProjectStore.setState({ currentProject: null })
  setActiveProjectSessionContext(null)
  useAgentStore.getState().clearPendingConfirmations()
  useAgentStore.setState({ sendMessage: originalSendMessage })
})

describe('Agent confirmation card liveness', () => {
  it('keeps approval disabled and shows the blocking reason when the change plan is invalid', async () => {
    useAgentStore.getState().beginToolConfirmation('plan-invalid', () => {})
    await mount(changePlanToolCall('plan-invalid', invalidPlanArguments))
    await flush()

    await expect.element(page.getByText(/改动计划校验未通过/)).toBeVisible()
    await expect.element(page.getByRole('button', { name: '批准执行' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: '请助手修正此计划' })).not.toBeDisabled()
    expect(container.querySelector('[data-confirm-card-state="active"]')).not.toBeNull()
  })

  it('renders an expired card with every action disabled when the confirmation is gone', async () => {
    // 不登记 pending —— 模拟生成超时或被取消之后，历史消息里那张已经失效的卡片。
    await mount(changePlanToolCall('plan-expired', invalidPlanArguments))
    await flush()

    await expect.element(page.getByText(/生成已结束、超时或被取消/)).toBeVisible()
    await expect.element(page.getByRole('button', { name: '批准执行' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: '拒绝' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: '取消本次助手任务' })).toBeDisabled()
    expect(container.querySelector('[data-confirm-card-state="expired"]')).not.toBeNull()
  })

  it('sends the validation error back to the assistant as a new user turn', async () => {
    const sendMessage = vi.fn(async (_content: string) => {})
    useAgentStore.setState({ sendMessage })
    await mount(changePlanToolCall('plan-revise', invalidPlanArguments))
    await flush()

    await page.getByRole('button', { name: '请助手修正此计划' }).click()

    await vi.waitFor(() => { expect(sendMessage).toHaveBeenCalledTimes(1) })
    const feedback = String(sendMessage.mock.calls[0]?.[0] ?? '')
    expect(feedback).toContain('character 必须是文本')
    expect(feedback).toContain('propose_change_plan')
  })
})
