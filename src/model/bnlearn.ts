import { toDagittyIds } from './dagitty'
import type { Graph } from './graph'

/**
 * Writes the bnlearn model string (`bnlearn::modelstring`, spec 4.15): one `[node]` or
 * `[node|parent1:parent2]` per node, in graph order, with the parents in graph order and safe
 * ids throughout, on one line ending with a newline. An empty graph gives `''`. Edges whose
 * endpoints are missing are skipped.
 */
export function toBnlearn(graph: Graph): string {
  if (graph.nodes.length === 0) return ''
  const ids = toDagittyIds(graph.nodes)
  const parents = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    const set = parents.get(edge.target) ?? new Set<string>()
    set.add(edge.source)
    parents.set(edge.target, set)
  }
  const parts = graph.nodes.map((node) => {
    const id = ids.get(node.id) ?? ''
    const set = parents.get(node.id)
    if (!set) return `[${id}]`
    const list = graph.nodes
      .filter((n) => set.has(n.id))
      .map((n) => ids.get(n.id))
    return `[${id}|${list.join(':')}]`
  })
  return `${parts.join('')}\n`
}
