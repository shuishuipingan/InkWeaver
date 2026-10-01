import type { Locale } from '../../i18n/types'
import {
  PromptBudgetExceededError,
} from './generation-harness'
import type { PromptBudgetReport } from '../../shared/prompt-budget'

export const PROMPT_BUDGET_FAILURE_CODE = 'prompt_budget_exhausted' as const

export type PromptBudgetFailureCode = typeof PROMPT_BUDGET_FAILURE_CODE

const SECTION_LABELS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  'global-guidance': ['全局指导', 'Global guidance'],
  'global-guidance-config': ['全局指导', 'Global guidance'],
  'project-guidance': ['项目专属指导', 'Project-specific guidance'],
  'confirmed-planning-materials': ['已确认规划资料', 'Confirmed planning materials'],
  'step-guidance': ['步骤指导', 'Step guidance'],
  'reference-works': ['参考作品', 'Reference works'],
  'knowledge-base': ['知识库', 'Knowledge base'],
  'story-premise': ['故事前提', 'Story premise'],
  'core-outline': ['核心大纲', 'Core outline'],
  synopsis: ['剧情概要', 'Synopsis'],
  'core-cast': ['本章核心角色档案', 'Core cast profiles'],
  'linked-cast': ['本章角色背景与弧线', 'Cast background and arcs'],
  'secondary-cast': ['相关非出场角色', 'Related non-present cast'],
  'novel-configuration': ['小说配置', 'Novel configuration'],
  'existing-ending': ['已写正文结尾', 'Existing manuscript ending'],
  'distant-blueprints': ['远期章节蓝图', 'Distant blueprints'],
  genre: ['作品类型', 'Genre'],
  'protagonist-profile': ['主角设定', 'Protagonist profile'],
  'identity-manifest': ['角色身份清单', 'Character identity manifest'],
  'validated-prefix': ['已验证角色详情', 'Validated character details'],
  'batch-slot-ids': ['本批角色标识', 'Batch character identifiers'],
  architecture: ['故事架构', 'Story architecture'],
  'previous-blueprints': ['已有章节蓝图', 'Previous chapter blueprints'],
  'target-chapter': ['目标章节', 'Target chapter'],
  'project-chapter-count': ['项目章节数', 'Project chapter count'],
  'repair-contract': ['结构化修复合同', 'Structured repair contract'],
  'repair-candidate': ['待修复候选', 'Repair candidate'],
  'system-instructions': ['系统指令', 'System instructions'],
  'continuation-request': ['续写请求', 'Continuation request'],
  'prompt-overhead': ['模板与结构开销', 'Template and structure overhead'],
})

function sectionLabel(sectionName: string, locale: Locale): string {
  const normalizedSectionName = /^confirmed-planning-material-\d+$/u.test(sectionName)
    ? 'confirmed-planning-materials'
    : sectionName
  const labels = SECTION_LABELS[normalizedSectionName]
  if (!labels) return locale === 'zh-CN' ? '其他结构化上下文' : 'Other structured context'
  return locale === 'zh-CN' ? labels[0] : labels[1]
}

function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value)
}

export function formatAdaptivePromptBudgetNotice(report: PromptBudgetReport, locale: Locale): string {
  if (report.limitInputTokens === undefined || report.estimatedInputTokens === undefined) return ''
  const estimate = formatInteger(report.estimatedInputTokens, locale)
  const limit = formatInteger(report.limitInputTokens, locale)
  const output = formatInteger(report.reservedOutputTokens, locale)
  const capacity = report.capacityKnown && report.contextWindowTokens
    ? formatInteger(report.contextWindowTokens, locale)
    : locale === 'zh-CN' ? '未知，使用保守预算' : 'unknown; conservative budget'
  return locale === 'zh-CN'
    ? `写前预算：估算输入 ${estimate}/${limit} Tokens；输出预留 ${output}；模型上下文 ${capacity}。`
    : `Preflight budget: estimated input ${estimate}/${limit} tokens; output reservation ${output}; model context ${capacity}.`
}

/** Formats only the safe byte report; prompt fragments never cross this boundary. */
export function formatPromptBudgetFailure(report: PromptBudgetReport, locale: Locale): string {
  if (report.limitInputTokens !== undefined) {
    const protectedNames = [...new Set(report.protectedSections ?? [])].map(name => sectionLabel(name, locale)).join(locale === 'zh-CN' ? '、' : ', ')
    return locale === 'zh-CN'
      ? `${formatAdaptivePromptBudgetNotice(report, locale)} 必保资料无法完整容纳，已阻止模型请求。保护区段：${protectedNames}。${report.capacityKnown ? '' : '模型上下文容量未知，请在模型设置中确认容量。'}请使用已确认的大容量模型、调整本章范围或精简核心说明。结果码：${report.errorCode}。`
      : `${formatAdaptivePromptBudgetNotice(report, locale)} Required material cannot fit; the request was blocked. Protected sections: ${protectedNames}. ${report.capacityKnown ? '' : 'Confirm the model context capacity in settings. '}Use a confirmed larger-capacity model, narrow this chapter, or simplify core descriptions. Code: ${report.errorCode}.`
  }
  const contributors = [...report.sections]
    .sort((left, right) => right.utf8Bytes - left.utf8Bytes)
    .slice(0, 3)
    .map(section => `${sectionLabel(section.sectionName, locale)} ${formatInteger(section.utf8Bytes, locale)}`)
    .join(locale === 'zh-CN' ? '、' : ', ')

  const summary = locale === 'zh-CN'
    ? [
      `提示词共 ${formatInteger(report.totalUtf8Bytes, locale)} UTF-8 字节，超过上限 ${formatInteger(report.limitUtf8Bytes, locale)} 字节；输出保留空间为 ${formatInteger(report.reservedOutputTokens, locale)} tokens。`,
      `主要占用：${contributors}。`,
      `模型：${report.modelId}；结果码：${report.errorCode}。`,
    ].join('')
    : [
      `The prompt uses ${formatInteger(report.totalUtf8Bytes, locale)} UTF-8 bytes, exceeding the ${formatInteger(report.limitUtf8Bytes, locale)}-byte limit; ${formatInteger(report.reservedOutputTokens, locale)} tokens are reserved for output. `,
      `Top contributors: ${contributors}. `,
      `Model: ${report.modelId}; result code: ${report.errorCode}.`,
    ].join('')

  const compactionNotice = formatPromptBudgetCompactionNotice(report, locale)
  return compactionNotice ? `${summary} ${compactionNotice}` : summary
}

/** Formats safe compaction counts for a preflight log or generation receipt. */
export function formatPromptBudgetCompactionNotice(report: PromptBudgetReport, locale: Locale): string {
  const compaction = report.compaction
  if (!compaction) return ''

  const grouped = new Map<string, { removedUtf8Bytes: number; retainedUtf8Bytes: number }>()
  for (const section of compaction.sections) {
    const label = sectionLabel(section.sectionName, locale)
    const totals = grouped.get(label) ?? { removedUtf8Bytes: 0, retainedUtf8Bytes: 0 }
    totals.removedUtf8Bytes += section.removedUtf8Bytes
    grouped.set(label, totals)
  }
  for (const section of report.sections) {
    const label = sectionLabel(section.sectionName, locale)
    const totals = grouped.get(label)
    if (totals) totals.retainedUtf8Bytes += section.utf8Bytes
  }
  const sectionCounts = [...grouped.entries()].map(([label, totals]) => (
    `${label}: ${locale === 'zh-CN' ? '移除' : 'removed'} `
    + `${formatInteger(totals.removedUtf8Bytes, locale)}, ${locale === 'zh-CN' ? '保留' : 'retained'} `
    + `${formatInteger(totals.retainedUtf8Bytes, locale)} ${locale === 'zh-CN' ? '字节' : 'bytes'}`
  )).join(locale === 'zh-CN' ? '；' : '; ')

  if (locale === 'zh-CN') {
    return `提示词已在请求模型前自动压缩：移除 ${formatInteger(compaction.removedUtf8Bytes, locale)} UTF-8 字节，最终保留 ${formatInteger(compaction.retainedTotalUtf8Bytes, locale)} 字节。区段：${sectionCounts}。`
  }
  return `Prompt context was automatically compacted before the model request: removed ${formatInteger(compaction.removedUtf8Bytes, locale)} UTF-8 bytes and retained ${formatInteger(compaction.retainedTotalUtf8Bytes, locale)} bytes. Sections: ${sectionCounts}.`
}

export function promptBudgetFailureFromError(
  error: unknown,
  locale: Locale,
): { failureCode: PromptBudgetFailureCode; message: string; report: PromptBudgetReport } | undefined {
  if (!(error instanceof PromptBudgetExceededError)) return undefined
  return {
    failureCode: PROMPT_BUDGET_FAILURE_CODE,
    message: formatPromptBudgetFailure(error.report, locale),
    report: error.report,
  }
}
