import type { Graph } from './graph'

function childrenMap(graph: Graph): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const n of graph.nodes) children.set(n.id, [])
  for (const e of graph.edges) children.get(e.source)?.push(e.target)
  return children
}

/**
 * Finds a directed cycle. Returns its node ids with the first id repeated at the end
 * (e.g. `['n1', 'n2', 'n1']`), or null if the graph is acyclic.
 */
export function findCycle(graph: Graph): string[] | null {
  const children = childrenMap(graph)
  const state = new Map<string, 'active' | 'done'>()
  const stack: string[] = []

  const visit = (id: string): string[] | null => {
    state.set(id, 'active')
    stack.push(id)
    for (const child of children.get(id) ?? []) {
      const s = state.get(child)
      if (s === 'active') {
        return [...stack.slice(stack.indexOf(child)), child]
      }
      if (s === undefined) {
        const found = visit(child)
        if (found) return found
      }
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }

  for (const n of graph.nodes) {
    if (state.get(n.id) === undefined) {
      const found = visit(n.id)
      if (found) return found
    }
  }
  return null
}

/**
 * Finds a shortest directed path from `from` to `to` (both included), or null if there is none.
 * `findPath(g, a, a)` is `[a]`.
 */
export function findPath(
  graph: Graph,
  from: string,
  to: string,
): string[] | null {
  if (from === to) return [from]
  const children = childrenMap(graph)
  const previous = new Map<string, string>()
  const queue = [from]
  const seen = new Set([from])
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const child of children.get(id) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      previous.set(child, id)
      if (child === to) {
        const path = [to]
        let cur = to
        while (cur !== from) {
          cur = previous.get(cur)!
          path.unshift(cur)
        }
        return path
      }
      queue.push(child)
    }
  }
  return null
}
