import type { GEdge, GNode, Graph } from './graph'
import { autoLayout } from './layout'
import { NODE_DIAMETER } from './nodeSize'
import type { Issue, Result } from './result'
import { ROLES, VAR_TYPES, type Role, type VarType } from './schema'
import { validateGraph } from './validate'

/**
 * Shared parts of the exchange formats (spec 4.15, phase 31): the checks and messages that the
 * GML, DOT and networkx JSON parsers have in common, and the `;`-separated lists used by dagitty
 * details and DOT.
 */

/** A node read from GML, DOT or networkx JSON, before checking. Fields are as written in the file. */
export interface ExchangeNode {
  /** The format's own node id (GML id, DOT id, JSON id), as text. */
  key: string
  /** `name ?? label ?? key`, trimmed. */
  name: string
  role?: unknown
  varType?: unknown
  levels?: unknown
  description?: unknown
  unit?: unknown
  /** Canvas px, y down, the centre of the circle. */
  centre?: { x: number; y: number }
  line?: number
}

/** An edge read from GML, DOT or networkx JSON; `source` and `target` are node keys. */
export interface ExchangeEdge {
  source: string
  target: string
  evidence?: unknown
  note?: unknown
  line?: number
}

const LAYOUT_WARNING =
  'Some nodes had no position, so the graph was laid out automatically.'

/** The message for an attribute GraphCreator does not use. */
export function ignoredAttribute(
  format: string,
  key: string,
  line?: number,
): Issue {
  const issue: Issue = {
    message: `Ignored ${format} attribute "${key}" (not used by GraphCreator).`,
  }
  if (line !== undefined) issue.line = line
  return issue
}

/** Items joined by `;`; inside an item `\` becomes `\\` and `;` becomes `\;`. */
export function encodeList(items: string[]): string {
  return items.map((item) => item.replace(/[\\;]/g, (c) => `\\${c}`)).join(';')
}

/** The reverse of `encodeList`. Empty items are dropped; a lone trailing `\` is kept. */
export function decodeList(text: string): string[] {
  const items: string[] = []
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' && i + 1 < text.length) {
      current += text[++i]
    } else if (c === ';') {
      items.push(current)
      current = ''
    } else {
      current += c
    }
  }
  items.push(current)
  return items.filter((item) => item !== '')
}

type Field<T> = { ok: true; value: T } | { ok: false }

/** Text, a number as text, or absent; empty or whitespace-only text counts as absent. */
function readText(value: unknown): Field<string | undefined> {
  if (value === undefined || value === null)
    return { ok: true, value: undefined }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { ok: true, value: String(value) }
  }
  if (typeof value !== 'string') return { ok: false }
  return { ok: true, value: value.trim() === '' ? undefined : value }
}

/** A list of text (numbers become text), or one text as a one-item list; empty → absent. */
function readList(value: unknown): Field<string[] | undefined> {
  if (value === undefined || value === null)
    return { ok: true, value: undefined }
  const items = Array.isArray(value) ? value : [value]
  const result: string[] = []
  for (const item of items) {
    const text = readText(item)
    if (!text.ok) return { ok: false }
    if (text.value !== undefined) result.push(text.value)
  }
  return { ok: true, value: result.length > 0 ? result : undefined }
}

/** One of `allowed`, or absent. */
function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): Field<T | undefined> {
  const text = readText(value)
  if (!text.ok) return { ok: false }
  if (text.value === undefined) return { ok: true, value: undefined }
  return (allowed as readonly string[]).includes(text.value)
    ? { ok: true, value: text.value as T }
    : { ok: false }
}

/**
 * Turns parsed nodes and edges into a `Graph` (spec 4.15 "Shared parts"): field types, edges,
 * positions and `validateGraph`, with every problem collected. `warnings` (the parser's own, e.g.
 * ignored attributes) come first in the result.
 */
export function buildGraph(
  input: { name?: string; nodes: ExchangeNode[]; edges: ExchangeEdge[] },
  warnings: Issue[],
): Result<Graph> {
  const errors: Issue[] = []
  const fail = (message: string, line?: number) =>
    errors.push(line === undefined ? { message } : { message, line })

  const byKey = new Map<string, string>()
  const nodes: GNode[] = []
  let missingPos = false
  for (const p of input.nodes) {
    const id = `n${nodes.length + 1}`
    const name = p.name.trim()
    const label = `Node "${name}"`
    if (byKey.has(p.key)) {
      fail(`Two nodes have the id "${p.key}".`, p.line)
      continue
    }
    byKey.set(p.key, id)

    const role = readEnum<Role>(p.role, ROLES)
    if (!role.ok) {
      fail(`${label}: role must be one of ${ROLES.join(', ')}.`, p.line)
    }
    const varType = readEnum<VarType>(p.varType, VAR_TYPES)
    if (!varType.ok) {
      fail(`${label}: var_type must be one of ${VAR_TYPES.join(', ')}.`, p.line)
    }
    const levels = readList(p.levels)
    if (!levels.ok) fail(`${label}: levels must be a list of text.`, p.line)
    const description = readText(p.description)
    if (!description.ok) fail(`${label}: description must be text.`, p.line)
    const unit = readText(p.unit)
    if (!unit.ok) fail(`${label}: unit must be text.`, p.line)

    const node: GNode = {
      id,
      name,
      role: (role.ok && role.value) || 'other',
      pos: { x: 0, y: 0 },
    }
    if (varType.ok && varType.value) node.varType = varType.value
    if (levels.ok && levels.value) node.levels = levels.value
    if (description.ok && description.value)
      node.description = description.value
    if (unit.ok && unit.value) node.unit = unit.value
    if (p.centre) {
      const d = NODE_DIAMETER
      node.pos = { x: p.centre.x - d / 2, y: p.centre.y - d / 2 }
    } else {
      missingPos = true
    }
    nodes.push(node)
  }

  const edges: GEdge[] = []
  const seen = new Set<string>()
  for (const e of input.edges) {
    const label = `Edge from "${e.source}" to "${e.target}"`
    const source = byKey.get(e.source)
    const target = byKey.get(e.target)
    if (source === undefined || target === undefined) {
      const missing = source === undefined ? e.source : e.target
      fail(
        `The edge from "${e.source}" to "${e.target}" refers to "${missing}", but there is no node with that id.`,
        e.line,
      )
      continue
    }
    const evidence = readList(e.evidence)
    if (!evidence.ok) fail(`${label}: evidence must be a list of text.`, e.line)
    const note = readText(e.note)
    if (!note.ok) fail(`${label}: note must be text.`, e.line)
    const pair = `${source}\u0000${target}`
    if (seen.has(pair)) continue // duplicates merge, keeping the first (as dagitty does)
    seen.add(pair)
    const edge: GEdge = {
      id: `e${edges.length + 1}`,
      source,
      target,
      evidence: (evidence.ok && evidence.value) || [],
    }
    if (note.ok && note.value) edge.note = note.value
    edges.push(edge)
  }

  let graph: Graph = { nodes, edges }
  const name = input.name?.trim()
  if (name) graph.name = name
  errors.push(...validateGraph(graph).errors)
  if (errors.length > 0) return { ok: false, errors }

  const allWarnings = [...warnings]
  if (missingPos && nodes.length > 0) {
    graph = autoLayout(graph)
    allWarnings.push({ message: LAYOUT_WARNING })
  }
  allWarnings.push(...validateGraph(graph).warnings)
  return { ok: true, value: graph, warnings: allWarnings }
}
