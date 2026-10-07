/**
 * 角色名的结构性守卫 —— **纯检测，不决定错误形态**。
 *
 * 抽成共享模块的原因：同一套规则原先在 agent 工具与架构解码器各持一份，属于
 * 「同一套规则多处实现、改一处忘一处」的漂移风险（本轮已修过四处同类白名单丢点）。
 * 这里只回答「这个名字看起来像什么」，怎么报错由各调用方决定：
 *   · propose-new-characters.tool.ts → 可读错误 + allow_multi_name / allow_faction_entries 开关
 *   · architecture.command.ts        → StructuredContractDiagnostic('invalid_value', slots[i].name)
 */

/** 强分隔符：出现即视为「多个名字写在一个 name 里」。刻意**不含**「·」「・」这类笔名/译名符号。 */
export const MULTI_NAME_SEPARATORS = ['、', '，', ',', ';', '；'] as const

/** 「甲和乙」「甲与乙」：要求两侧各 2–4 个字，避免误伤「王和芳」「和珅」这类真名。 */
const CONJUNCTION_NAME_PATTERN = /^(.{2,4})(?:和|与)(.{2,4})$/u

/** 势力标志词：与聚合词**同时**成立才判为势力形态（「龙门」「明镜」这类角色名不受影响）。 */
export const FACTION_MARKERS = ['盟', '宫', '庭', '宗', '派', '教', '会', '阁', '楼', '门', '朝廷', '王国', '组织'] as const

/** 聚合词：描述「组织中的一群人」，而不是某一个人的名字。 */
export const FACTION_COLLECTIVES = ['推动者', '成员', '高层', '首脑', '使者', '众人'] as const

export interface CharacterNameInspection {
  /** 命中「多个名字合并」的迹象；separators 列出命中的分隔符（含 '和/与' 这一伪分隔符）。 */
  multiName?: { separators: string[] }
  /** 看起来是势力 / 组织 / 阵营，而不是单个角色。 */
  factionLike?: boolean
}

export function inspectCharacterName(name: string): CharacterNameInspection {
  const trimmed = name.trim()
  if (!trimmed) return {}

  const inspection: CharacterNameInspection = {}
  const separators = MULTI_NAME_SEPARATORS.filter(mark => trimmed.includes(mark))
  if (separators.length > 0) {
    inspection.multiName = { separators: [...separators] }
  } else if (CONJUNCTION_NAME_PATTERN.test(trimmed)) {
    inspection.multiName = { separators: ['和/与'] }
  }

  if (
    FACTION_MARKERS.some(marker => trimmed.includes(marker))
    && FACTION_COLLECTIVES.some(collective => trimmed.includes(collective))
  ) {
    inspection.factionLike = true
  }

  return inspection
}
