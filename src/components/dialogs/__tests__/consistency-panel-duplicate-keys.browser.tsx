import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { ConsistencyFinding } from '../../../shared/consistency-preflight'
import { findMissingCharacterStateFindings } from '../../../shared/consistency-preflight'
import { useLocaleStore } from '../../../stores/locale-store'
import ConsistencyPreflightPanel from '../ConsistencyPreflightPanel'

/**
 * 用户现场的复现：赵阔在第 3、4 章各有一条「缺少当前状态证据」线索。
 * 修前两条的 stableFactKey 完全相同（不含章节），面板出现重复 React key →
 * 反复更新 props 会残留旧节点，逻辑 2 条渲染出 5 个块。
 */
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

/**
 * 更早的已定稿章节：让这些角色「此前出场过」（事实只在自己那章有效），
 * 否则在「首次登场不报」的判据下根本不会产生线索，这条用例就失去意义。
 */
function earlierFinalized(characters: string[]) {
  return [{
    draftId: 1,
    chapterNumber: 1,
    chapterTitle: '第1章',
    chapterNotes: '',
    facts: characters.map(character => ({
      category: 'character-state' as const,
      entities: [character],
      statement: character + '已有状态。',
      sourceChapter: 1,
      validFromChapter: 1,
      validUntilChapter: 1,
      evidence: character + '的定稿证据。',
    })),
  }]
}

function preflightFor(chapters: Array<[number, string[]]>): ConsistencyFinding[] {
  const finalized = earlierFinalized([...new Set(chapters.flatMap(([, characters]) => characters))])
  return chapters.flatMap(([chapterNumber, characters]) => findMissingCharacterStateFindings(
    finalized as never,
    {
      chapterNumber,
      title: '第' + chapterNumber + '章',
      role: '发展',
      purpose: '',
      keyEvents: '',
      characters,
      suspenseHook: '',
      userGuidance: '',
      notes: '',
    } as never,
    [],
  ))
}

function renderedBlocks(): number {
  return Array.from(container?.querySelectorAll('button') ?? [])
    .filter(button => button.textContent?.includes('保存安排')).length
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function render(findings: ConsistencyFinding[]) {
  return act(async () => {
    root?.render(
      <ConsistencyPreflightPanel
        findings={findings}
        exemptions={[]}
        onIgnoreOnce={vi.fn()}
        onFixAndRerun={vi.fn()}
        onSave={vi.fn(async () => {})}
        onRevoke={vi.fn(async () => {})}
      />,
    )
  })
}

describe('ConsistencyPreflightPanel list identity', () => {
  it('renders one block per logical finding while saved arrangements shrink the list', async () => {
    const firstRun = preflightFor([
      [2, ['苏倦', '鹿鸣', '沈瑶光', '顾长安']],
      [3, ['苏倦', '赵阔', '陆沉舟']],
      [4, ['苏倦', '赵阔']],
      [5, ['苏倦', '温辞', '明镜']],
    ])
    await render(firstRun)
    expect(renderedBlocks()).toBe(firstRun.length)

    // 保存一条安排后重跑预检（列表缩短）——旧节点必须被清掉，而不是越积越多。
    const afterSavingOne = firstRun.filter(finding => !finding.stableFactKey.includes('苏倦'))
    await render(afterSavingOne)
    expect(renderedBlocks()).toBe(afterSavingOne.length)

    // 用户现场最终状态：只剩赵阔@第3章 与 赵阔@第4章。
    const onlyZhao = preflightFor([[3, ['赵阔']], [4, ['赵阔']]])
    expect(new Set(onlyZhao.map(finding => finding.stableFactKey)).size).toBe(2)
    await render(onlyZhao)
    expect(renderedBlocks()).toBe(2)
  })
})
