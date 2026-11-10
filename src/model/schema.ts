import { z } from 'zod'

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

/** One entry of the file's `nodes` list (spec 4.1). */
const FileNodeSchema = z.strictObject({
  name: z.string(),
  role: z.enum(ROLES).default('other'),
  var_type: z.enum(VAR_TYPES).optional(),
  levels: z.array(z.string()).optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  pos: z.tuple([z.number(), z.number()]).optional(),
})

/** One entry of the file's `edges` list (spec 4.1). */
const FileEdgeSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  evidence: z.array(z.string()).default([]),
  note: z.string().optional(),
})

/**
 * Zod schema of a GraphCreator YAML file (spec 4.1), the single source of truth for the file
 * shape. Unknown keys are errors at every level. Semantic rules (unique names, existing edge
 * endpoints, no cycles, levels/unit only for matching types) are checked by `parseYaml`.
 */
export const GraphFileSchema = z.strictObject({
  schema: z.enum(KNOWN_SCHEMAS),
  name: z.string().optional(),
  nodes: z.array(FileNodeSchema).default([]),
  edges: z.array(FileEdgeSchema).default([]),
})

/** A parsed GraphCreator file, after defaults are applied. */
export type GraphFile = z.infer<typeof GraphFileSchema>
