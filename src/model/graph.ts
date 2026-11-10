import { findPath } from './cycle'
import type { Result } from './result'
import { isLeveledType, isNumericType, type Role, type VarType } from './schema'

export { findCycle, findPath } from './cycle'

export interface Position {
  x: number
  y: number
}

export interface GNode {
  /** Internal id, e.g. 'n1'. Stable across renames, never written to files. */
  id: string
  /** Any text; trimmed, non-empty, unique (case-sensitive). */
  name: string
  role: Role
  /** undefined = untyped (allowed, warned). */
  varType?: VarType
  /** Only for categorical/ordinal; order is meaningful. */
  levels?: string[]
  description?: string
  /** Only for continuous/discrete. */
  unit?: string
  /** Canvas px, top-left of the node box. */
  pos: Position
}

export interface GEdge {
  /** Internal id, e.g. 'e1'. */
  id: string
  /** GNode.id */
  source: string
  /** GNode.id */
  target: string
  /** Free text, e.g. 'PMID:123'; may be empty. */
  evidence: string[]
  note?: string
}

export interface Graph {
  name?: string
  nodes: GNode[]
  edges: GEdge[]
}

export type EdgeCheck =
  | { ok: true }
  | {
      ok: false
      reason: 'self' | 'duplicate' | 'cycle'
      message: string
      /** For 'cycle': node ids of the cycle the edge would close, first id repeated at the end. */
      cycle?: string[]
    }

/** Smallest unused id of the form `<prefix><n>`, n ≥ 1. */
export function newId(prefix: 'n' | 'e', existing: Iterable<string>): string {
  const taken = new Set(existing)
  let i = 1
  while (taken.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

export function emptyGraph(): Graph {
  return { nodes: [], edges: [] }
}

/** Smallest unused name of the form `Node <n>`, n ≥ 1. */
export function defaultNodeName(graph: Graph): string {
  const taken = new Set(graph.nodes.map((n) => n.name.trim()))
  let i = 1
  while (taken.has(`Node ${i}`)) i++
  return `Node ${i}`
}

function nodeName(graph: Graph, id: string): string {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`Unknown node id "${id}".`)
  return node.name
}

/** Empty or whitespace-only strings become undefined. */
function optionalText(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value
}

export function addNode(
  graph: Graph,
  init: { pos: Position; name?: string },
): { graph: Graph; node: GNode } {
  const node: GNode = {
    id: newId(
      'n',
      graph.nodes.map((n) => n.id),
    ),
    name: init.name?.trim() || defaultNodeName(graph),
    role: 'other',
    pos: { ...init.pos },
  }
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, node }
}

export function renameNode(
  graph: Graph,
  nodeId: string,
  newName: string,
): Result<Graph> {
  const name = newName.trim()
  if (name === '')
    return { ok: false, errors: [{ message: 'A node needs a name.' }] }
  if (graph.nodes.some((n) => n.id !== nodeId && n.name.trim() === name)) {
    return {
      ok: false,
      errors: [{ message: `There is already a node called "${name}".` }],
    }
  }
  return {
    ok: true,
    value: {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, name } : n)),
    },
    warnings: [],
  }
}

/**
 * Applies `patch` to a node. Empty description/unit become undefined. Afterwards fields not
 * allowed for the node's type are dropped: `levels` unless categorical/ordinal, `unit` unless
 * continuous/discrete. Pass `varType: undefined` to make a node untyped.
 */
export function updateNode(
  graph: Graph,
  nodeId: string,
  patch: Partial<Omit<GNode, 'id' | 'name'>>,
): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.id !== nodeId) return n
      const next: GNode = { ...n, ...patch }
      if ('description' in patch)
        next.description = optionalText(patch.description)
      if ('unit' in patch) next.unit = optionalText(patch.unit)
      if (!isLeveledType(next.varType)) delete next.levels
      if (!isNumericType(next.varType)) delete next.unit
      for (const key of ['varType', 'levels', 'description', 'unit'] as const) {
        if (key in next && next[key] === undefined) delete next[key]
      }
      return next
    }),
  }
}

export function removeNodes(graph: Graph, nodeIds: string[]): Graph {
  const gone = new Set(nodeIds)
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !gone.has(n.id)),
    edges: graph.edges.filter(
      (e) => !gone.has(e.source) && !gone.has(e.target),
    ),
  }
}

export function moveNode(graph: Graph, nodeId: string, pos: Position): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, pos: { ...pos } } : n,
    ),
  }
}

/** Checks whether the edge source → target may be added. Throws on unknown node ids. */
export function canAddEdge(
  graph: Graph,
  source: string,
  target: string,
): EdgeCheck {
  nodeName(graph, source)
  nodeName(graph, target)
  if (source === target) {
    return {
      ok: false,
      reason: 'self',
      message: 'A node cannot point to itself.',
    }
  }
  if (graph.edges.some((e) => e.source === source && e.target === target)) {
    return {
      ok: false,
      reason: 'duplicate',
      message: 'This edge already exists.',
    }
  }
  const back = findPath(graph, target, source)
  if (back) {
    const cycle = [source, ...back]
    return {
      ok: false,
      reason: 'cycle',
      message: `${cycle.map((id) => nodeName(graph, id)).join(' → ')} would form a cycle.`,
      cycle,
    }
  }
  return { ok: true }
}

export function addEdge(
  graph: Graph,
  source: string,
  target: string,
): Result<Graph> {
  const check = canAddEdge(graph, source, target)
  if (!check.ok) return { ok: false, errors: [{ message: check.message }] }
  const edge: GEdge = {
    id: newId(
      'e',
      graph.edges.map((e) => e.id),
    ),
    source,
    target,
    evidence: [],
  }
  return {
    ok: true,
    value: { ...graph, edges: [...graph.edges, edge] },
    warnings: [],
  }
}

/** Applies `patch` to an edge. An empty note becomes undefined. */
export function updateEdge(
  graph: Graph,
  edgeId: string,
  patch: Partial<Pick<GEdge, 'evidence' | 'note'>>,
): Graph {
  return {
    ...graph,
    edges: graph.edges.map((e) => {
      if (e.id !== edgeId) return e
      const next: GEdge = { ...e, ...patch }
      if (patch.evidence) next.evidence = [...patch.evidence]
      if ('note' in patch) {
        const note = optionalText(patch.note)
        if (note === undefined) delete next.note
        else next.note = note
      }
      return next
    }),
  }
}

export function removeEdges(graph: Graph, edgeIds: string[]): Graph {
  const gone = new Set(edgeIds)
  return { ...graph, edges: graph.edges.filter((e) => !gone.has(e.id)) }
}
