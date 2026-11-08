/** Identifier of the current GraphCreator file format (written as the `schema` line). */
export const SCHEMA_ID = 'graphcreator/0.1'
/** File formats this version can read. */
export const KNOWN_SCHEMAS = ['graphcreator/0.1'] as const

export const ROLES = [
  'exposure',
  'outcome',
  'latent',
  'adjusted',
  'selected',
  'other',
] as const
export const VAR_TYPES = [
  'categorical',
  'ordinal',
  'continuous',
  'discrete',
] as const
/** Variable types that may have levels. */
export const LEVELED_TYPES = ['categorical', 'ordinal'] as const
/** Variable types that may have a unit. */
export const NUMERIC_TYPES = ['continuous', 'discrete'] as const

export type Role = (typeof ROLES)[number]
export type VarType = (typeof VAR_TYPES)[number]

export function isLeveledType(t: VarType | undefined): boolean {
  return t !== undefined && (LEVELED_TYPES as readonly string[]).includes(t)
}

export function isNumericType(t: VarType | undefined): boolean {
  return t !== undefined && (NUMERIC_TYPES as readonly string[]).includes(t)
}
