import type { Graph } from '../graph'
import { ancestors, dConnected, descendants, withoutEdges } from './dsep'
import {
  MAX_SETS,
  type AdjustmentResult,
  type NodeSet,
  type Roles,
} from './types'

/**
 * Adjustment sets (spec 4.13, phase 25), for the total effect of X on Y.
 *
 * - Proper causal paths, Forb(X, Y) and the proper back-door graph follow van der Zander,
 *   Liśkiewicz & Textor (2014).
 * - The adjustment criterion is that of Shpitser, VanderWeele & Robins (2010) and Perković et al.
 *   (2018); with selected nodes S it is the selection criterion of Correa, Tian & Bareinboim
 *   (2018), conditions (a)–(d) as written in spec 4.13.
 * - Minimal sets use FindMinSep and ListMinSep of van der Zander, Liśkiewicz & Textor (2019),
 *   written here from the paper. ListMinSep reduces the problem to listing the minimal vertex
 *   separators of two nodes in an undirected graph, done with a backtracking search in the style
 *   of Takata (2010), the algorithm the paper cites.
 */

/** Ids of `graph`'s nodes in graph order that `keep` accepts. */
function inGraphOrder(graph: Graph, keep: (id: string) => boolean): NodeSet {
  return graph.nodes.filter((n) => keep(n.id)).map((n) => n.id)
}

/** `G_{X̄}`: the graph without the edges into X. */
function withoutEdgesInto(graph: Graph, xs: NodeSet): Graph {
  const x = new Set(xs)
  return withoutEdges(graph, (e) => x.has(e.target))
}

/** `G_{X̲}`: the graph without the edges out of X. */
function withoutEdgesOutOf(graph: Graph, xs: NodeSet): Graph {
  const x = new Set(xs)
  return withoutEdges(graph, (e) => x.has(e.source))
}

/** PCP(X, Y) = (De_{G_X̄}(X) \ X) ∩ An_{G_X̲}(Y): the nodes on proper causal paths, X excluded. */
export function properCausalNodes(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
): Set<string> {
  const x = new Set(xs)
  const down = descendants(withoutEdgesInto(graph, xs), xs)
  const up = ancestors(withoutEdgesOutOf(graph, xs), ys)
  const result = new Set<string>()
  for (const v of down) if (!x.has(v) && up.has(v)) result.add(v)
  return result
}

/** Forb(X, Y) = De(PCP(X, Y)) ∪ X. */
export function forbidden(graph: Graph, xs: NodeSet, ys: NodeSet): Set<string> {
  const result = descendants(graph, properCausalNodes(graph, xs, ys))
  for (const x of xs) result.add(x)
  return result
}

/** The proper back-door graph: without every edge x → w with x ∈ X and w ∈ PCP(X, Y). */
export function properBackdoorGraph(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
): Graph {
  const x = new Set(xs)
  const pcp = properCausalNodes(graph, xs, ys)
  return withoutEdges(graph, (e) => x.has(e.source) && pcp.has(e.target))
}

/**
 * Conditions (c) and (d) of the selection criterion, which do not depend on Z: (c) Y and S are
 * d-separated by X in `G_{X̄}`; (d) every x ∈ X that is an ancestor of S is d-separated from Y
 * (given nothing) in `G_{X̲}`. Both hold trivially when S is empty.
 */
function selectionOk(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
  s: NodeSet,
): boolean {
  if (s.length === 0) return true
  if (dConnected(withoutEdgesInto(graph, xs), ys, s, xs)) return false
  const ancestorsOfS = ancestors(graph, s)
  const cut = withoutEdgesOutOf(graph, xs)
  return xs.every((x) => !ancestorsOfS.has(x) || !dConnected(cut, [x], ys, []))
}

/**
 * Whether `zs` is sufficient for the total effect of X on Y: (a) Z ∩ Forb(X, Y) = ∅ and (b) Z ∪ S
 * d-separates X and Y in `G^pbd`; with a non-empty `s` also conditions (c) and (d) of the
 * selection criterion.
 */
export function isAdjustmentSet(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
  zs: NodeSet,
  s: NodeSet = [],
): boolean {
  const forb = forbidden(graph, xs, ys)
  if (zs.some((z) => forb.has(z))) return false
  const pbd = properBackdoorGraph(graph, xs, ys)
  if (dConnected(pbd, xs, ys, [...zs, ...s])) return false
  return selectionOk(graph, xs, ys, s)
}

// --- Separators (van der Zander, Liśkiewicz & Textor 2019) ---

/**
 * The moral graph of `G_{An(X ∪ Y ∪ I)}` with the I nodes removed afterwards, as undirected
 * adjacency: every edge between ancestral nodes, and an edge between every two parents of an
 * ancestral node. I is conditioned on, so its nodes block every path through them.
 */
function moralWithout(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
  include: NodeSet,
): Map<string, Set<string>> {
  const anc = ancestors(graph, [...xs, ...ys, ...include])
  const adj = new Map<string, Set<string>>()
  for (const n of graph.nodes) if (anc.has(n.id)) adj.set(n.id, new Set())
  const join = (a: string, b: string) => {
    adj.get(a)?.add(b)
    adj.get(b)?.add(a)
  }
  const parentsOf = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue
    join(e.source, e.target)
    const ps = parentsOf.get(e.target)
    if (ps) ps.push(e.source)
    else parentsOf.set(e.target, [e.source])
  }
  for (const ps of parentsOf.values()) {
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) join(ps[i], ps[j])
    }
  }
  for (const i of include) {
    for (const w of adj.get(i) ?? []) adj.get(w)?.delete(i)
    adj.delete(i)
  }
  return adj
}

/**
 * The nodes of `stops` reachable from `from` in `adj` by paths whose inner nodes are not in
 * `stops` (a search that does not go on past a node of `stops`).
 */
function reachedStops(
  adj: Map<string, Set<string>>,
  from: Iterable<string>,
  stops: Set<string>,
): Set<string> {
  const seen = new Set<string>()
  const found = new Set<string>()
  const queue: string[] = []
  for (const v of from) {
    if (adj.has(v) && !seen.has(v)) {
      seen.add(v)
      queue.push(v)
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const w of adj.get(queue[i]) ?? []) {
      if (seen.has(w)) continue
      seen.add(w)
      if (stops.has(w)) found.add(w)
      else queue.push(w)
    }
  }
  return found
}

/**
 * FindMinSep (van der Zander, Liśkiewicz & Textor 2019): an I-minimal d-separator Z of X and Y
 * with I ⊆ Z whose other members are in R (`restrict`), or null when none exists. "I-minimal":
 * no proper subset of Z that still contains I separates. As in the paper, the result includes the
 * `include` nodes (I); it is in graph order.
 *
 * In the moral graph of `G_{An(X ∪ Y ∪ I)}` with I removed, the candidates start as
 * R ∩ An(X ∪ Y ∪ I) \ (X ∪ Y ∪ I); they are cut down to those reachable from X without passing
 * another candidate, and then to those reachable from Y in the same way. (The paper's listing
 * starts from R ∩ An(X ∪ Y); An(X ∪ Y ∪ I) is used here because with X → W → I ← Y the only
 * separator containing I is {W, I}, and W is not an ancestor of X or Y.)
 */
export function findMinSep(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
  include: NodeSet,
  restrict: NodeSet,
): NodeSet | null {
  const adj = moralWithout(graph, xs, ys, include)
  const ends = new Set([...xs, ...ys])
  const candidates = new Set(restrict.filter((v) => adj.has(v) && !ends.has(v)))
  const nearX = reachedStops(adj, xs, candidates)
  const z = reachedStops(adj, ys, nearX)
  const result = new Set([...z, ...include])
  if (dConnected(graph, xs, ys, result)) return null
  return inGraphOrder(graph, (id) => result.has(id))
}

/**
 * ListMinSep (van der Zander, Liśkiewicz & Textor 2019): calls `emit` with every I-minimal
 * d-separator of X and Y (I = `include`, other members in R = `restrict`), each without the I
 * nodes and in graph order, until `emit` returns false.
 *
 * As in the paper: take the moral graph of `G_{An(X ∪ Y ∪ I)}`, remove I, add a node s joined to
 * every X node and a node t joined to every Y node, and remove every node outside R (X and Y
 * included) after joining its neighbours. The minimal s–t vertex separators of that undirected
 * graph are the sets wanted. They are listed by backtracking in the style of Takata (2010), which
 * the paper cites. For a connected node set A ∋ s, the separator closest to A is N(T), where T is
 * t's component outside A and its neighbours. `visit(A, F)` lists every minimal separator whose
 * s side contains A and that contains F. Such a separator exists exactly when F ⊆ N(T), and then
 * N(T) is one, so every call that goes on outputs a set and the delay is polynomial. The others
 * are split by the first free member v of N(T) that they leave out (v then lies on their s side):
 * each part is `visit(A ∪ {v}, F ∪ the free members before v)`.
 */
function listMinSeps(
  graph: Graph,
  xs: NodeSet,
  ys: NodeSet,
  include: NodeSet,
  restrict: NodeSet,
  emit: (set: NodeSet) => boolean,
): void {
  const moral = moralWithout(graph, xs, ys, include)
  const ends = new Set([...xs, ...ys])
  const allowed = new Set(restrict)
  const keep = (id: string) => !ends.has(id) && allowed.has(id)

  // Every node of the moral graph gets a number: the kept nodes (in R) first, in graph order,
  // then s and t, then the nodes to be removed.
  const kept = inGraphOrder(graph, (id) => moral.has(id) && keep(id))
  const s = kept.length
  const t = s + 1
  const removed = inGraphOrder(graph, (id) => moral.has(id) && !keep(id))
  const number = new Map<string, number>()
  kept.forEach((id, i) => number.set(id, i))
  removed.forEach((id, i) => number.set(id, t + 1 + i))
  const full: number[][] = Array.from(
    { length: t + 1 + removed.length },
    () => [],
  )
  const join = (a: number, b: number) => {
    full[a].push(b)
    full[b].push(a)
  }
  for (const [v, ns] of moral) {
    const a = number.get(v) as number
    for (const w of ns) full[a].push(number.get(w) as number)
  }
  for (const x of xs) {
    const n = number.get(x)
    if (n !== undefined) join(s, n)
  }
  for (const y of ys) {
    const n = number.get(y)
    if (n !== undefined) join(t, n)
  }

  // The reduced graph on 0..t: u ~ w when a path joins them whose inner nodes are all removed.
  const adj: number[][] = []
  for (let u = 0; u <= t; u++) {
    const seen = new Set<number>([u])
    const queue = [u]
    const near: number[] = []
    for (let i = 0; i < queue.length; i++) {
      for (const w of full[queue[i]]) {
        if (seen.has(w)) continue
        seen.add(w)
        if (w <= t) near.push(w)
        else queue.push(w)
      }
    }
    adj.push(near)
  }

  /** N(T) for T = t's component outside A ∪ N(A), ascending; null when t is in A ∪ N(A). */
  function closest(inA: boolean[]): number[] | null {
    const closed = inA.slice()
    for (let v = 0; v <= t; v++) {
      if (inA[v]) for (const w of adj[v]) closed[w] = true
    }
    if (closed[t]) return null
    const inT = new Array<boolean>(t + 1).fill(false)
    inT[t] = true
    const queue = [t]
    const border = new Set<number>()
    for (let i = 0; i < queue.length; i++) {
      for (const w of adj[queue[i]]) {
        if (inT[w]) continue
        if (closed[w]) border.add(w)
        else {
          inT[w] = true
          queue.push(w)
        }
      }
    }
    return [...border].sort((a, b) => a - b)
  }

  let going = true
  function visit(inA: boolean[], mustHave: Set<number>): void {
    const sep = closest(inA)
    if (sep === null) return
    const members = new Set(sep)
    for (const f of mustHave) if (!members.has(f)) return
    going = emit(sep.map((v) => kept[v]))
    const taken = new Set(mustHave)
    for (const v of sep) {
      if (!going) return
      if (taken.has(v)) continue
      const next = inA.slice()
      next[v] = true
      visit(next, new Set(taken))
      taken.add(v)
    }
  }

  const start = new Array<boolean>(t + 1).fill(false)
  start[s] = true
  visit(start, new Set())
}

/** Compares two sets by size, then by the graph order of their members. */
function bySizeThenOrder(graph: Graph): (a: NodeSet, b: NodeSet) => number {
  const order = new Map(graph.nodes.map((n, i) => [n.id, i]))
  return (a, b) => {
    if (a.length !== b.length) return a.length - b.length
    for (let i = 0; i < a.length; i++) {
      const d = (order.get(a[i]) ?? 0) - (order.get(b[i]) ?? 0)
      if (d !== 0) return d
    }
    return 0
  }
}

/**
 * The minimal sufficient sets W ⊆ R = observed \ (Forb(X, Y) ∪ Y ∪ S), S excluded, at most
 * MAX_SETS (then `truncated`), sorted by size and then by the graph order of their members. With
 * selected nodes, W ∪ S must separate X and Y in `G^pbd`; when condition (c) or (d) of the
 * selection criterion fails there are none.
 */
export function minimalAdjustmentSets(
  graph: Graph,
  roles: Roles,
): { sets: NodeSet[]; truncated: boolean } {
  const { x, y, s } = roles
  if (!selectionOk(graph, x, y, s)) return { sets: [], truncated: false }
  const out = new Set([...forbidden(graph, x, y), ...y, ...s])
  const r = roles.observed.filter((v) => !out.has(v))
  const pbd = properBackdoorGraph(graph, x, y)
  const sets: NodeSet[] = []
  let truncated = false
  listMinSeps(pbd, x, y, s, r, (set) => {
    if (sets.length === MAX_SETS) {
      truncated = true
      return false
    }
    sets.push(set)
    return true
  })
  sets.sort(bySizeThenOrder(graph))
  return { sets, truncated }
}

/** Minimal sets and the check of the user's own set Z. */
export function adjustment(graph: Graph, roles: Roles): AdjustmentResult {
  const { x, y, s, z } = roles
  const forb = forbidden(graph, x, y)
  const { sets, truncated } = minimalAdjustmentSets(graph, roles)
  return {
    sets,
    truncated,
    zSufficient: isAdjustmentSet(graph, x, y, z, s),
    zForbidden: z.filter((v) => forb.has(v)),
    selectionBias: !selectionOk(graph, x, y, s),
  }
}
