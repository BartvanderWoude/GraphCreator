import { updateNode, type GEdge, type GNode, type Graph } from './graph'
import type { EdgeSign, Sign } from './schema'

/**
 * Simulation details (spec 4.16): pure helpers for level shares, functional form, edge sign and
 * edge strength.
 */

/** How an edge's sign is given, by which of its ends are nominal (spec 4.16 "Meaning"). */
export type SignShape = 'single' | 'child-levels' | 'parent-levels' | 'none'

/**
 * A node is nominal when it is categorical with three or more levels. Ordinal nodes never are. The
 * effect side of an edge uses this: its levels are alternatives whose chances add up to 1, so a
 * binary effect needs only one sign (spec 4.16 "Levels in signs").
 */
export function isNominal(node: GNode): boolean {
  return node.varType === 'categorical' && (node.levels?.length ?? 0) >= 3
}

/**
 * A node has levels for signs when it is categorical with two or more levels. The cause side of an
 * edge uses this: every level of a cause carries its own sign (spec 4.16 "Levels in signs").
 */
export function hasClasses(node: GNode): boolean {
  return node.varType === 'categorical' && (node.levels?.length ?? 0) >= 2
}

function endpoints(
  graph: Graph,
  edge: GEdge,
): { parent: GNode | undefined; child: GNode | undefined } {
  return {
    parent: graph.nodes.find((n) => n.id === edge.source),
    child: graph.nodes.find((n) => n.id === edge.target),
  }
}

/**
 * The shape of the edge's sign. A missing endpoint counts as neither nominal nor leveled. The child
 * wins over the parent, so an edge from a two-level cause into a nominal child is 'child-levels'.
 */
export function signShape(graph: Graph, edge: GEdge): SignShape {
  const { parent, child } = endpoints(graph, edge)
  const parentNominal = parent !== undefined && isNominal(parent)
  const childNominal = child !== undefined && isNominal(child)
  if (parentNominal && childNominal) return 'none'
  if (childNominal) return 'child-levels'
  if (parent !== undefined && hasClasses(parent)) return 'parent-levels'
  return 'single'
}

/** The node whose levels key a sign map: the child for 'child-levels', the parent for 'parent-levels', else undefined. */
export function signLevelsNode(graph: Graph, edge: GEdge): GNode | undefined {
  const shape = signShape(graph, edge)
  const { parent, child } = endpoints(graph, edge)
  if (shape === 'child-levels') return child
  if (shape === 'parent-levels') return parent
  return undefined
}

/**
 * The edge's sign as a map over the levels of `signLevelsNode` (spec 4.16): a stored map gives
 * itself, and on a 'parent-levels' edge whose parent has exactly two levels a single word gives a
 * sign on the second level (the shorthand that files written before per-level signs use). No sign,
 * another shape or a sign that does not fit gives `undefined`.
 */
export function signLevelMap(
  graph: Graph,
  edge: GEdge,
): Record<string, Sign> | undefined {
  const sign = edge.sign
  if (sign === undefined) return undefined
  const shape = signShape(graph, edge)
  if (shape !== 'child-levels' && shape !== 'parent-levels') return undefined
  if (typeof sign !== 'string') return sign
  if (shape !== 'parent-levels') return undefined
  const levels = signLevelsNode(graph, edge)?.levels ?? []
  if (levels.length !== 2) return undefined
  // fromEntries, not a literal, so a level named "__proto__" becomes a plain key.
  return Object.fromEntries([[levels[1], sign]])
}

/**
 * Whether the edge's stored sign fits its shape (spec 4.16): no sign always fits, 'single' wants a
 * word, a level shape wants `signLevelMap` to be defined, and nothing fits 'none'.
 */
export function signFits(graph: Graph, edge: GEdge): boolean {
  const sign = edge.sign
  if (sign === undefined) return true
  const shape = signShape(graph, edge)
  if (shape === 'none') return false
  if (shape === 'single') return typeof sign === 'string'
  return signLevelMap(graph, edge) !== undefined
}

/**
 * What the edge's badge shows: a word gives itself, a map whose values are all the same gives that
 * value, and a map with both values gives 'mixed'. `undefined` and an empty map give `undefined`.
 */
export function signBadge(
  sign: EdgeSign | undefined,
): 'positive' | 'negative' | 'mixed' | undefined {
  if (sign === undefined) return undefined
  if (typeof sign === 'string') return sign
  const values = new Set<Sign>(Object.values(sign))
  if (values.size === 0) return undefined
  if (values.size > 1) return 'mixed'
  return [...values][0]
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000
}

/**
 * `n` equal shares: each 1/n rounded to 4 decimals, the last taking the remainder (also rounded to
 * 4 decimals), so `equalShares(3)` is [0.3333, 0.3333, 0.3334]. For n < 1 the list is empty.
 */
export function equalShares(n: number): number[] {
  if (n < 1) return []
  const share = round4(1 / n)
  const shares = Array.from({ length: n - 1 }, () => share)
  return [...shares, round4(1 - share * (n - 1))]
}

/** The sum of the shares (0 for none). */
export function sharesTotal(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s, 0)
}

/**
 * Replaces a node's levels. `origin[i]` is the index in the old `levels` that new item `i` came
 * from, or `null` for a new item; it must have the same length as `levels`.
 *
 * - Shares, when the node has them, follow their levels: new item `i` gets the old share at
 *   `origin[i]`, or 0 for a new item. An empty level list drops the shares.
 * - On each incident edge whose `signLevelsNode` (on the old graph) is this node, a sign-map key
 *   that named old level `origin[i]` is renamed to `levels[i]`, and keys of removed levels are
 *   dropped. Keys that named no old level are kept after the level keys. A map left empty becomes
 *   no sign. Other edges are untouched.
 * - The levels go through `updateNode`'s normalisation, so a node without a leveled type drops
 *   them (and its shares).
 *
 * Unknown node ids return the graph unchanged. Throws when `origin` and `levels` differ in length.
 */
export function setLevels(
  graph: Graph,
  nodeId: string,
  levels: string[],
  origin: (number | null)[],
): Graph {
  if (origin.length !== levels.length) {
    throw new Error('setLevels: origin and levels must have the same length.')
  }
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node) return graph
  const oldLevels = node.levels ?? []

  const patch: Partial<Omit<GNode, 'id' | 'name'>> = { levels: [...levels] }
  if (node.shares !== undefined && levels.length > 0) {
    const oldShares = node.shares
    patch.shares = origin.map((o) => (o === null ? 0 : (oldShares[o] ?? 0)))
  }
  const withLevels = updateNode(graph, nodeId, patch)

  const edges = graph.edges.map((edge) => {
    if (edge.source !== nodeId && edge.target !== nodeId) return edge
    const sign = edge.sign
    if (sign === undefined || typeof sign === 'string') return edge
    if (signLevelsNode(graph, edge)?.id !== nodeId) return edge
    // Maps, not objects, so level names such as "constructor" or "__proto__" are plain keys.
    const old = new Map(Object.entries(sign))
    const next = new Map<string, Sign>()
    levels.forEach((level, i) => {
      const o = origin[i]
      if (o === null || o === undefined) return
      const oldLevel = oldLevels[o]
      if (oldLevel === undefined) return
      const value = old.get(oldLevel)
      if (value !== undefined && !next.has(level)) next.set(level, value)
    })
    const known = new Set(oldLevels)
    for (const [key, value] of old) {
      if (!known.has(key) && !next.has(key)) next.set(key, value)
    }
    if (next.size === 0) {
      const { sign: _removed, ...rest } = edge
      void _removed
      return rest
    }
    return { ...edge, sign: Object.fromEntries(next) }
  })
  return { ...withLevels, edges }
}

/** Whether the node or edge has any simulation detail: shares, form, sign or strength. */
export function hasSimulationDetails(item: GNode | GEdge): boolean {
  const fields = item as Partial<GNode & GEdge>
  return (
    fields.shares !== undefined ||
    fields.form !== undefined ||
    fields.sign !== undefined ||
    fields.strength !== undefined
  )
}
