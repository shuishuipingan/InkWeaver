/** A final prompt fragment eligible for deterministic preflight compaction. */
export interface PromptBudgetDegradation {
  /** Lower priorities compact first; ties preserve declaration order. */
  priority: number
  strategy: 'utf8-prefix' | 'complete-lines' | 'whole-section' | 'json-string'
}

export interface PromptBudgetSection {
  /** Stable, non-sensitive section name used by receipts and localized diagnostics. */
  sectionName: string
  /** Index in the final message array where this exact assembled fragment occurs. */
  messageIndex: number
  /** Exact fragment from the final assembled request; never copied into reports or logs. */
  finalText: string
  /** Optional independent ceiling for one protected evidence section. */
  limitUtf8Bytes?: number
  /** Omitted means the section is protected and cannot be changed. */
  degradation?: PromptBudgetDegradation
}

export interface PromptBudgetPolicy {
  limitUtf8Bytes: number
  sections: readonly PromptBudgetSection[]
}

export interface PromptBudgetSectionReport {
  sectionName: string
  /** Bytes retained in the final prompt. */
  utf8Bytes: number
}

export interface PromptBudgetCompactionSectionReport {
  sectionName: string
  originalUtf8Bytes: number
  retainedUtf8Bytes: number
  removedUtf8Bytes: number
}

export interface PromptBudgetCompactionReport {
  originalTotalUtf8Bytes: number
  retainedTotalUtf8Bytes: number
  removedUtf8Bytes: number
  sections: readonly PromptBudgetCompactionSectionReport[]
}

export type PromptBudgetResultCode = 'OK' | 'PROMPT_BUDGET_EXHAUSTED'

/** Safe prompt diagnostics. Prompt text and provider endpoint details are deliberately absent. */
export interface PromptBudgetReport {
  totalUtf8Bytes: number
  limitUtf8Bytes: number
  reservedOutputTokens: number
  sections: readonly PromptBudgetSectionReport[]
  /** Present only when explicitly degradable context was compacted. */
  compaction?: PromptBudgetCompactionReport
  modelId: string
  errorCode: PromptBudgetResultCode
}
