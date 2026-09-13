import { sha256Hex } from './sha256-hex'

export const PLANNING_MATERIAL_SCHEMA_VERSION = 1 as const

export const PLANNING_MATERIAL_KINDS = [
  'premise', 'outline', 'world', 'character', 'timeline', 'style', 'other',
] as const
export type PlanningMaterialKind = typeof PLANNING_MATERIAL_KINDS[number]
export type PlanningMaterialStatus = 'candidate' | 'confirmed' | 'rejected' | 'stale'

export interface PlanningMaterialInput {
  name: string
  kind: PlanningMaterialKind
  content: string
  sourceDisplayName?: string
  sourceHash?: string
}

export interface PlanningMaterialRecord extends PlanningMaterialInput {
  id: string
  schemaVersion: typeof PLANNING_MATERIAL_SCHEMA_VERSION
  status: PlanningMaterialStatus
  contentHash: string
  createdAt: string
  updatedAt: string
  confirmedAt?: string
}

function normalizeName(name: string): string {
  const value = name.trim()
  if (!value || value.length > 160) throw new Error('规划资料名称无效')
  return value
}

function normalizeContent(content: string): string {
  const value = content.replace(/^\uFEFF/u, '').trim()
  if (!value || Buffer.byteLength(value, 'utf8') > 2_000_000) throw new Error('规划资料内容为空或过大')
  return value
}

export function isPlanningMaterialKind(value: unknown): value is PlanningMaterialKind {
  return typeof value === 'string' && (PLANNING_MATERIAL_KINDS as readonly string[]).includes(value)
}

export async function createPlanningMaterialInput(input: {
  name: string
  kind: PlanningMaterialKind
  content: string
  sourceDisplayName?: string
}): Promise<PlanningMaterialInput> {
  if (!isPlanningMaterialKind(input.kind)) throw new Error('规划资料类型无效')
  const content = normalizeContent(input.content)
  return {
    name: normalizeName(input.name),
    kind: input.kind,
    content,
    ...(input.sourceDisplayName?.trim() ? { sourceDisplayName: input.sourceDisplayName.trim().slice(0, 240) } : {}),
    sourceHash: await sha256Hex(content),
  }
}

export async function planningMaterialId(input: Pick<PlanningMaterialInput, 'name' | 'kind' | 'sourceHash'>): Promise<string> {
  return sha256Hex(`planning-material:${input.kind}:${input.name}:${input.sourceHash ?? ''}`)
}
