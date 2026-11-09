import type { Graph } from '../graph'
import { ancestors, dConnected, descendants, withoutEdges } from './dsep'
import type { Instrument, NodeSet, Roles } from './types'

/**
 * Conditional instrumental variables (spec 4.13, phase 28), following van der Zander, Textor &
 * Liśkiewicz (2015, "Efficiently finding conditional instruments for causal inference", IJCAI):
 * algorithms NEAREST-SEPARATOR and ANCESTRAL-INSTRUMENT, generalised to the total effect by using
 * the proper back-door graph `G^pbd` for the paper's `G_c` and the descendants of the proper
 * causal paths and of Y for the paper's descendants of Y. Written from the paper.
 *
 * An observed node i ∉ {x, y} ∪ S is a conditional instrument given W (observed) when
 * W ∩ De(PCP({x}, {y}) ∪ {y}) = ∅, i is d-connected to x given W ∪ S in G, and i is d-separated from y
 * given W ∪ S in `G^pbd`. W is the nearest separator of y and i in `G^pbd`.
 */
export function instrumentalVariables(
  graph: Graph,
  roles: Roles,
): Instrument[] | 'needs-single' {
  if (roles.x.length !== 1 || roles.y.length !== 1) return 'needs-single'
  const [x] = roles.x
  const [y] = roles.y
  const selected = new Set(roles.s)
  const pcp = properCausalNodes(graph, x, y)
  const forbidden = descendants(graph, [...pcp, y])
  const pbd = withoutEdges(graph, (e) => e.source === x && pcp.has(e.target))
  // The paper's M, the nodes a separator may use: observed, not in S (always conditioned on
  // instead) and not in De(PCP ∪ {y}). The paper rejects descendants of Y after the search,
  // which is enough for the direct effect (its Lemma 4.1); for the total effect a nearest
  // separator could use a node of De(PCP) where one further from Y would do, so all forbidden
  // nodes count as unmeasured.
  const measured = new Set(
    roles.observed.filter((v) => !selected.has(v) && !forbidden.has(v)),
  )

  const result: Instrument[] = []
  for (const i of roles.observed) {
    if (i === x || i === y || selected.has(i)) continue
    const w = nearestSeparator(pbd, y, i, measured, selected)
    if (w === null) continue
    if (w.has(x)) continue // the paper's Corollary 4.2: not an ancestral instrument
    if (!dConnected(graph, [i], [x], [...w, ...selected])) continue
    result.push({ instrument: i, given: inGraphOrder(graph, w) })
  }
  return result
}

/**
 * PCP({x}, {y}) of spec 4.13: the descendants of x other than x in `G` without the edges into x,
 * that are ancestors of y in `G` without the edges out of x.
 * (Private until phase 30 imports `properCausalNodes` from `adjustment.ts`.)
 */
function properCausalNodes(graph: Graph, x: string, y: string): Set<string> {
  const down = descendants(
    withoutEdges(graph, (e) => e.target === x),
    [x],
  )
  const up = ancestors(
    withoutEdges(graph, (e) => e.source === x),
    [y],
  )
  const pcp = new Set<string>()
  for (const v of down) if (v !== x && up.has(v)) pcp.add(v)
  return pcp
}

/**
 * NEAREST-SEPARATOR(G, Y, Z) of the paper, with the nodes in `conditioned` (S) always conditioned
 * on: a set W ⊆ `measured` with Z d-separated from Y given W ∪ S, as close to Y as possible, or
 * null when no such set exists.
 *
 * Works in the moral graph of the ancestors of Y, Z and S, with S removed (Lauritzen et al. 1990).
 * The paper adds, for every path from Y to Z that W does not block yet, the first measured node
 * on it. Every such node lies on the frontier F: the measured nodes next to the part of the moral
 * graph that Y reaches through unmeasured nodes only. W is the part of F that has a path to Z
 * through no other frontier node, which makes the result minimal and independent of the order in
 * which paths are found.
 */
function nearestSeparator(
  graph: Graph,
  y: string,
  z: string,
  measured: Set<string>,
  conditioned: Set<string>,
): Set<string> | null {
  const moral = moralGraph(
    graph,
    ancestors(graph, [y, z, ...conditioned]),
    conditioned,
  )
  const neighbours = (v: string) => moral.get(v) ?? new Set<string>()

  // The part reached from Y through unmeasured nodes, and its measured frontier.
  const frontier = new Set<string>()
  const seen = new Set([y])
  const stack = [y]
  while (stack.length > 0) {
    const v = stack.pop() as string
    for (const w of neighbours(v)) {
      if (w === z) return null // an unblockable path from Y to Z
      if (seen.has(w)) continue
      seen.add(w)
      if (measured.has(w)) frontier.add(w)
      else stack.push(w)
    }
  }

  // Frontier nodes next to the part Z reaches without passing a frontier node (or Y).
  const result = new Set<string>()
  const fromZ = new Set([z])
  const queue = [z]
  while (queue.length > 0) {
    const v = queue.pop() as string
    for (const w of neighbours(v)) {
      if (frontier.has(w)) result.add(w)
      else if (w !== y && !fromZ.has(w)) {
        fromZ.add(w)
        queue.push(w)
      }
    }
  }

  // The paper's final check; always true by the construction above.
  if (dConnected(graph, [z], [y], [...result, ...conditioned])) return null
  return result
}

/**
 * The moral graph of `graph` restricted to the ancestral set `nodes`, with the nodes in `removed`
 * (the conditioned ones) taken out after moralising, so the marriages they cause remain.
 */
function moralGraph(
  graph: Graph,
  nodes: Set<string>,
  removed: Set<string>,
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const v of nodes) if (!removed.has(v)) adj.set(v, new Set())
  const link = (a: string, b: string) => {
    if (a === b) return
    const as = adj.get(a)
    const bs = adj.get(b)
    if (!as || !bs) return
    as.add(b)
    bs.add(a)
  }
  const parentsOf = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (!nodes.has(e.target) || !nodes.has(e.source)) continue
    link(e.source, e.target)
    const ps = parentsOf.get(e.target) ?? []
    ps.push(e.source)
    parentsOf.set(e.target, ps)
  }
  for (const ps of parentsOf.values()) {
    for (let a = 0; a < ps.length; a++) {
      for (let b = a + 1; b < ps.length; b++) link(ps[a], ps[b])
    }
  }
  return adj
}

function inGraphOrder(graph: Graph, keep: Set<string>): NodeSet {
  return graph.nodes.filter((n) => keep.has(n.id)).map((n) => n.id)
}
