import type { TokenUsage } from './ipc-channels'
import type { PromptBudgetReport } from './prompt-budget'

/** Safe usage/cost attribution; deliberately excludes prompts, outputs, URLs, and credentials. */
export interface GenerationReceiptSummary {
  modelId: string
  attempt: number
  cumulativeRequestedOutputTokens: number
  maxRequestedOutputTokens: number
  maxRequestedOutputTokensPerAttempt: number
  usage?: TokenUsage
  /** Safe section byte counts retained from the exact prompt preflight. */
  promptBudget?: PromptBudgetReport
}

export function generationReceiptFromAttempt(receipt: {
  model: { id: string }
  budget: {
    attempt: number
    cumulativeRequestedOutputTokens: number
    maxRequestedOutputTokens: number
    maxRequestedOutputTokensPerAttempt: number
  }
  usage?: TokenUsage
  promptBudget?: PromptBudgetReport
}): GenerationReceiptSummary {
  return {
    modelId: receipt.model.id,
    attempt: receipt.budget.attempt,
    cumulativeRequestedOutputTokens: receipt.budget.cumulativeRequestedOutputTokens,
    maxRequestedOutputTokens: receipt.budget.maxRequestedOutputTokens,
    maxRequestedOutputTokensPerAttempt: receipt.budget.maxRequestedOutputTokensPerAttempt,
    ...(receipt.usage ? { usage: { ...receipt.usage } } : {}),
    ...(receipt.promptBudget ? { promptBudget: receipt.promptBudget } : {}),
  }
}
