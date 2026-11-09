import type { Graph } from '../graph'
import { ancestors } from './dsep'
import type { Independence, NodeSet, Roles } from './types'

/**
 * Conditional independencies implied by the graph (spec 4.13, phase 27). For every unordered pair
 * of observed, non-selected, non-adjacent nodes, one minimal separating set found with FindMinSep
 * (van der Zander, Liśkiewicz & Textor 2019), always conditioning on the selected nodes S.
 */
export function impliedIndependencies(
  graph: Graph,
  roles: Roles,
): Independence[] {
  const selected = new Set(roles.s)
  const candidates = roles.observed.filter((id) => !selected.has(id))
  const adjacent = new Set<string>()
  for (const e of graph.edges) {
    adjacent.add(`${e.source}\u0000${e.target}`)
    adjacent.add(`${e.target}\u0000${e.source}`)
  }
  const result: Independence[] = []
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      if (adjacent.has(`${a}\u0000${b}`)) continue
      const restrict = candidates.filter((id) => id !== a && id !== b)
      const sep = findMinSep(graph, [a], [b], roles.s, restrict)
      if (sep === null) continue
      result.push({ a, b, given: sep.filter((id) => !selected.has(id)) })
    }
  }
  return result
}

/**
 * FindMinSep (van der Zander, Liśkiewicz & Textor 2019), written from the paper: a minimal set Z
 * with `include` ⊆ Z ⊆ `restrict` ∪ `include` that d-separates `xs` and `ys`, or null when there
 * is none. "Minimal" is relative to `include`: no proper subset of Z that still contains
 * `include` separates. The result (with `include`) is in graph order.
 *
 * Private copy until phase 30 imports `findMinSep` from `adjustment.ts` (phase 25).
 */
function findMinSep(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
  include: NodeSet,
  restrict: NodeSet,
): NodeSet | null {
  const xSet = new Set(xs)
  const ySet = new Set(ys)
  const iSet = new Set(include)
  // Every separator Z with I ⊆ Z ⊆ An(X ∪ Y ∪ I) leaves the ancestral set An(X ∪ Y ∪ Z) equal to
  // An(X ∪ Y ∪ I), so d-separation becomes plain separation in the moral graph of that set, with
  // the nodes of I removed.
  const anc = ancestors(graph, [...xs, ...ys, ...include])
  const neighbours = moralGraph(graph, anc)
  for (const id of include) neighbours.delete(id)
  // Z' = R ∩ An(X ∪ Y ∪ I) \ (X ∪ Y ∪ I): if any separator exists inside R ∪ I, Z' ∪ I is one.
  const zPrime = new Set(
    restrict.filter(
      (id) => anc.has(id) && !xSet.has(id) && !ySet.has(id) && !iSet.has(id),
    ),
  )
  // Z'': the nodes of Z' reachable from X along paths without Z' or I inside. Meeting Y means
  // Z' ∪ I does not separate, so no separator exists.
  const fromX = reach(neighbours, xs, zPrime)
  if (ys.some((y) => fromX.has(y))) return null
  const zSecond = new Set([...zPrime].filter((id) => fromX.has(id)))
  // Z: the nodes of Z'' also reachable from Y along paths without Z'' or I inside.
  const fromY = reach(neighbours, ys, zSecond)
  const keep = new Set([
    ...include,
    ...[...zSecond].filter((id) => fromY.has(id)),
  ])
  return graph.nodes.filter((n) => keep.has(n.id)).map((n) => n.id)
}

/**
 * The undirected moral graph of the subgraph induced by `nodes` (an ancestral set): every edge
 * without its direction, plus an edge between every two parents of a common child.
 */
function moralGraph(
  graph: Graph,
  nodes: Set<string>,
): Map<string, Set<string>> {
  const neighbours = new Map<string, Set<string>>()
  for (const id of nodes) neighbours.set(id, new Set())
  const parentsOf = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) continue
    neighbours.get(e.source)?.add(e.target)
    neighbours.get(e.target)?.add(e.source)
    const ps = parentsOf.get(e.target) ?? []
    ps.push(e.source)
    parentsOf.set(e.target, ps)
  }
  for (const ps of parentsOf.values()) {
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        neighbours.get(ps[i])?.add(ps[j])
        neighbours.get(ps[j])?.add(ps[i])
      }
    }
  }
  return neighbours
}

/**
 * Every node reachable from `starts` in the undirected graph `neighbours`, where nodes of `stops`
 * are reached but not passed through. Nodes missing from `neighbours` are never entered.
 */
function reach(
  neighbours: Map<string, Set<string>>,
  starts: Iterable<string>,
  stops: Set<string>,
): Set<string> {
  const seen = new Set<string>()
  const stack: string[] = []
  for (const s of starts) {
    if (neighbours.has(s) && !seen.has(s)) {
      seen.add(s)
      stack.push(s)
    }
  }
  while (stack.length > 0) {
    const v = stack.pop() as string
    if (stops.has(v)) continue
    for (const w of neighbours.get(v) ?? []) {
      if (!seen.has(w)) {
        seen.add(w)
        stack.push(w)
      }
    }
  }
  return seen
}
