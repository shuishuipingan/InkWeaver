import { describe, expect, it } from 'vitest'

import { inspectCharacterName } from '../character-name-guards'

describe('character name guards（共享检测的规则本体）', () => {
  it('flags every strong separator', () => {
    for (const mark of ['、', '，', ',', ';', '；']) {
      expect(inspectCharacterName('沈瑶光' + mark + '鹿鸣').multiName?.separators).toEqual([mark])
    }
    // 多个分隔符时全部列出，便于错误信息说明。
    expect(inspectCharacterName('沈瑶光、鹿鸣，谢无尘').multiName?.separators).toEqual(['、', '，'])
  })

  it('flags the 甲和乙 / 甲与乙 pattern', () => {
    expect(inspectCharacterName('沈瑶光和林雪').multiName?.separators).toEqual(['和/与'])
    expect(inspectCharacterName('沈瑶光与林雪').multiName?.separators).toEqual(['和/与'])
  })

  it('leaves legitimate single names alone', () => {
    for (const name of ['苏倦', '萧十一郎', '沈瑶光', '阿·喀琉斯', '王和芳', '和珅', '李·法兰克']) {
      expect(inspectCharacterName(name).multiName).toBeUndefined()
    }
  })

  it('flags faction-shaped entries only when both conditions hold', () => {
    expect(inspectCharacterName('仙盟的祭局推动者').factionLike).toBe(true)
    expect(inspectCharacterName('太虚宫高层').factionLike).toBe(true)
    // 只有标志词或只有聚合词都不算。
    expect(inspectCharacterName('龙门').factionLike).toBeUndefined()
    expect(inspectCharacterName('明镜').factionLike).toBeUndefined()
    expect(inspectCharacterName('鹿鸣').factionLike).toBeUndefined()
  })

  it('reports both findings at once and ignores blank input', () => {
    const both = inspectCharacterName('仙盟、太虚宫的推动者')
    expect(both.multiName?.separators).toEqual(['、'])
    expect(both.factionLike).toBe(true)
    expect(inspectCharacterName('   ')).toEqual({})
    expect(inspectCharacterName('')).toEqual({})
  })
})
