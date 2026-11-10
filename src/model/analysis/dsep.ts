import type { GEdge, Graph } from '../graph'
import type { NodeSet } from './types'

/**
 * Graph walks and d-separation (spec 4.13). d-separation uses Bayes-Ball reachability (Shachter
 * 1998; Koller & Friedman 2009, Algorithm 3.1), written here from those descriptions. Edges whose
 * end points are not nodes of the graph are ignored.
 */

/** Ids of `graph`'s nodes in graph order, filtered by `keep`. */
function inGraphOrder(graph: Graph, keep: Set<string>): NodeSet {
  return graph.nodes.filter((n) => keep.has(n.id)).map((n) => n.id)
}

/** Parent and child lists of every node, built once per walk. */
function adjacency(graph: Graph): {
  parentsOf: Map<string, string[]>
  childrenOf: Map<string, string[]>
} {
  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  for (const n of graph.nodes) {
    parentsOf.set(n.id, [])
    childrenOf.set(n.id, [])
  }
  for (const e of graph.edges) {
    const ps = parentsOf.get(e.target)
    const cs = childrenOf.get(e.source)
    if (!ps || !cs) continue
    ps.push(e.source)
    cs.push(e.target)
  }
  return { parentsOf, childrenOf }
}

/** Every node reachable from `ids` along `next`, including `ids` themselves (when in the graph). */
function closure(
  ids: Iterable<string>,
  next: Map<string, string[]>,
): Set<string> {
  const seen = new Set<string>()
  const stack: string[] = []
  for (const id of ids) {
    if (next.has(id) && !seen.has(id)) {
      seen.add(id)
      stack.push(id)
    }
  }
  while (stack.length > 0) {
    const v = stack.pop() as string
    for (const w of next.get(v) ?? []) {
      if (!seen.has(w)) {
        seen.add(w)
        stack.push(w)
      }
    }
  }
  return seen
}

/** The parents of `id`, in graph order. */
export function parents(graph: Graph, id: string): NodeSet {
  const set = new Set(
    graph.edges.filter((e) => e.target === id).map((e) => e.source),
  )
  return inGraphOrder(graph, set)
}

/** The children of `id`, in graph order. */
export function children(graph: Graph, id: string): NodeSet {
  const set = new Set(
    graph.edges.filter((e) => e.source === id).map((e) => e.target),
  )
  return inGraphOrder(graph, set)
}

/** The ancestors of `ids`, including `ids` themselves. */
export function ancestors(graph: Graph, ids: Iterable<string>): Set<string> {
  return closure(ids, adjacency(graph).parentsOf)
}

/** The descendants of `ids`, including `ids` themselves. */
export function descendants(graph: Graph, ids: Iterable<string>): Set<string> {
  return closure(ids, adjacency(graph).childrenOf)
}

/**
 * Every node d-connected to some node of `from` given `given` (Bayes-Ball), not counting nodes in
 * `given`. Start nodes that are not in `given` are included. Linear in the size of the graph.
 */
export function reachable(
  graph: Graph,
  from: Iterable<string>,
  given: Iterable<string>,
): Set<string> {
  const { parentsOf, childrenOf } = adjacency(graph)
  const conditioned = new Set(given)
  const ancestorsOfGiven = closure(conditioned, parentsOf)
  // Visited (node, direction) pairs: 'up' = reached from a child, 'down' = reached from a parent.
  const visitedUp = new Set<string>()
  const visitedDown = new Set<string>()
  const stack: [string, 'up' | 'down'][] = []
  const result = new Set<string>()

  function visit(v: string, dir: 'up' | 'down') {
    const visited = dir === 'up' ? visitedUp : visitedDown
    if (visited.has(v)) return
    visited.add(v)
    stack.push([v, dir])
  }

  for (const x of from) if (parentsOf.has(x)) visit(x, 'up')

  while (stack.length > 0) {
    const [v, dir] = stack.pop() as [string, 'up' | 'down']
    const isGiven = conditioned.has(v)
    if (!isGiven) result.add(v)
    if (dir === 'up') {
      if (isGiven) continue
      for (const p of parentsOf.get(v) ?? []) visit(p, 'up')
      for (const c of childrenOf.get(v) ?? []) visit(c, 'down')
    } else {
      if (!isGiven) {
        for (const c of childrenOf.get(v) ?? []) visit(c, 'down')
      }
      if (ancestorsOfGiven.has(v)) {
        for (const p of parentsOf.get(v) ?? []) visit(p, 'up')
      }
    }
  }
  return result
}

/** Whether some node of `xs` is d-connected to some node of `ys` given `given`. */
export function dConnected(
  graph: Graph,
  xs: Iterable<string>,
  ys: Iterable<string>,
  given: Iterable<string>,
): boolean {
  const conditioned = new Set(given)
  const from = [...xs]
  const targets = [...ys].filter((y) => !conditioned.has(y))
  const starts = new Set(from.filter((x) => !conditioned.has(x)))
  if (targets.some((y) => starts.has(y))) return true
  const reached = reachable(graph, from, conditioned)
  return targets.some((y) => reached.has(y))
}

/** `graph` without the edges for which `pred` is true (for derived graphs such as `G^pbd`). */
export function withoutEdges(graph: Graph, pred: (e: GEdge) => boolean): Graph {
  return { ...graph, edges: graph.edges.filter((e) => !pred(e)) }
}
