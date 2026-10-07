/**
 * 角色卡「势力立场」字段的编辑器表示 ↔ 存储表示。
 *
 * 存储层（CharacterFactionEdge[]）是结构化数组，而角色卡的编辑体验与「关系网」
 * 一致用多行文本：这样增删改都自然成立，也避免为数组字段引入元素级的 store 动作。
 *
 * 双向的约定（与 relationship-presentation 里的关系字段同构）：
 *   format(parse(text)) 在语义上与 text 等价 —— 分隔符会归一成「势力 — 立场」，
 *   只写了势力名的行保留为「势力」（立场留空，等作者补），空行被忽略。
 */
import type { CharacterFactionEdge } from '../../shared/character-roster'

/** 行内分隔符：破折号系与冒号系都接受，作者怎么写都行。 */
const FACTION_LINE = /^(.+?)\s*(?:—|–|--|－|：|:)\s*(.*)$/u

export function formatFactionEdgesForEditor(edges: readonly CharacterFactionEdge[] | undefined): string {
  if (!edges || edges.length === 0) return ''
  return edges
    .map(edge => {
      const faction = edge.faction.trim()
      const stance = edge.stance.trim()
      return stance ? faction + ' — ' + stance : faction
    })
    .filter(line => line.length > 0)
    .join('\n')
}

export function factionEdgesFromEditor(value: string): CharacterFactionEdge[] {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
  const edges: CharacterFactionEdge[] = []
  for (const line of lines) {
    const match = FACTION_LINE.exec(line)
    const faction = (match ? match[1]! : line).trim()
    const stance = (match ? match[2]! : '').trim()
    if (!faction) continue
    // 保留可选 text 字段的语义：这里只编辑 faction/stance，不需要凭空造 text。
    edges.push(stance ? { faction, stance } : { faction, stance: '' })
  }
  return edges
}
