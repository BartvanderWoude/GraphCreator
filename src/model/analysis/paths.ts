import type { Graph } from '../graph'
import { ancestors } from './dsep'
import {
  PATH_LIMIT,
  type PathInfo,
  type PathsResult,
  type Roles,
} from './types'

/**
 * Paths between the exposures and the outcomes (spec 4.13, phase 26).
 *
 * A path is a simple path in the skeleton (edge directions ignored) from some x ∈ X to some
 * y ∈ Y whose inner nodes are in neither X nor Y. It is causal when every edge points from the
 * exposure end towards the outcome end, otherwise biasing. Given C = Z ∪ S, it is open when every
 * inner collider is in ancestors(C) and no inner non-collider is in C.
 */

/** One step from a node to a skeleton neighbour. */
interface Step {
  to: string
  edge: string
  /** The edge points along the step (from → to). */
  forward: boolean
}

/** A found path with the edge ids and directions along it. */
interface FoundPath {
  nodes: string[]
  edges: string[]
  forward: boolean[]
}

const EMPTY_TRUNCATED: PathsResult = {
  paths: [],
  truncated: true,
  causalEdges: [],
  biasingEdges: [],
}

/** Skeleton neighbours of every node, in graph order of the edges. */
function skeleton(graph: Graph): Map<string, Step[]> {
  const steps = new Map<string, Step[]>()
  for (const n of graph.nodes) steps.set(n.id, [])
  for (const e of graph.edges) {
    const out = steps.get(e.source)
    const into = steps.get(e.target)
    if (!out || !into || e.source === e.target) continue
    out.push({ to: e.target, edge: e.id, forward: true })
    into.push({ to: e.source, edge: e.id, forward: false })
  }
  return steps
}

/**
 * Every exposure–outcome path, or null when there are more than PATH_LIMIT. The search only
 * enters a node from which an outcome can still be reached without touching the path so far or
 * an exposure, so every branch it explores yields at least one path and the work stays bounded
 * by the number of paths.
 */
function enumerate(
  steps: Map<string, Step[]>,
  xs: Set<string>,
  ys: Set<string>,
  starts: string[],
): FoundPath[] | null {
  const found: FoundPath[] = []
  const onPath = new Set<string>()
  const nodes: string[] = []
  const edges: string[] = []
  const forward: boolean[] = []

  /** An outcome is reachable from `from` through nodes that are neither on the path nor in X. */
  function canReachOutcome(from: string): boolean {
    const seen = new Set<string>([from])
    const stack = [from]
    while (stack.length > 0) {
      const v = stack.pop() as string
      for (const s of steps.get(v) ?? []) {
        if (ys.has(s.to)) return true
        if (seen.has(s.to) || onPath.has(s.to) || xs.has(s.to)) continue
        seen.add(s.to)
        stack.push(s.to)
      }
    }
    return false
  }

  /** Extends the path ending at `v`; false once the limit is passed. */
  function visit(v: string): boolean {
    for (const s of steps.get(v) ?? []) {
      if (onPath.has(s.to) || xs.has(s.to)) continue
      nodes.push(s.to)
      edges.push(s.edge)
      forward.push(s.forward)
      let ok = true
      if (ys.has(s.to)) {
        found.push({
          nodes: [...nodes],
          edges: [...edges],
          forward: [...forward],
        })
        ok = found.length <= PATH_LIMIT
      } else if (canReachOutcome(s.to)) {
        onPath.add(s.to)
        ok = visit(s.to)
        onPath.delete(s.to)
      }
      nodes.pop()
      edges.pop()
      forward.pop()
      if (!ok) return false
    }
    return true
  }

  for (const x of starts) {
    onPath.add(x)
    nodes.push(x)
    const ok = visit(x)
    nodes.pop()
    onPath.delete(x)
    if (!ok) return null
  }
  return found
}

/** Whether a found path is open given C (spec 4.13). */
function isOpen(
  path: FoundPath,
  conditioned: Set<string>,
  ancestorsOfC: Set<string>,
): boolean {
  for (let i = 1; i < path.nodes.length - 1; i++) {
    const v = path.nodes[i]
    // Both edges point into v: the edge before v runs forward, the edge after it backward.
    const collider = path.forward[i - 1] && !path.forward[i]
    if (collider ? !ancestorsOfC.has(v) : conditioned.has(v)) return false
  }
  return true
}

/** Orders paths: causal first, then shorter, then by the names along the path. */
function comparePaths(
  a: PathInfo,
  b: PathInfo,
  name: (id: string) => string,
): number {
  if (a.kind !== b.kind) return a.kind === 'causal' ? -1 : 1
  if (a.nodes.length !== b.nodes.length) return a.nodes.length - b.nodes.length
  for (let i = 0; i < a.nodes.length; i++) {
    const p = name(a.nodes[i])
    const q = name(b.nodes[i])
    if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

/** Lists and classifies the paths between the exposures and the outcomes (spec 4.13). */
export function classifyPaths(graph: Graph, roles: Roles): PathsResult {
  const xs = new Set(roles.x)
  const ys = new Set(roles.y)
  const found = enumerate(skeleton(graph), xs, ys, roles.x)
  if (found === null) return EMPTY_TRUNCATED

  const conditioned = new Set([...roles.z, ...roles.s])
  const ancestorsOfC = ancestors(graph, conditioned)
  const causalOpen = new Set<string>()
  const biasingOpen = new Set<string>()
  const infos = found.map((path): PathInfo => {
    const kind = path.forward.every(Boolean) ? 'causal' : 'biasing'
    const open = isOpen(path, conditioned, ancestorsOfC)
    if (open) {
      const into = kind === 'causal' ? causalOpen : biasingOpen
      for (const e of path.edges) into.add(e)
    }
    return { nodes: path.nodes, kind, open }
  })

  const names = new Map(graph.nodes.map((n) => [n.id, n.name]))
  const name = (id: string) => names.get(id) ?? id
  infos.sort((a, b) => comparePaths(a, b, name))

  // "Biasing wins": an edge on both an open causal and an open biasing path is biasing only.
  const edgeIds = graph.edges.map((e) => e.id)
  return {
    paths: infos,
    truncated: false,
    causalEdges: edgeIds.filter(
      (e) => causalOpen.has(e) && !biasingOpen.has(e),
    ),
    biasingEdges: edgeIds.filter((e) => biasingOpen.has(e)),
  }
}
