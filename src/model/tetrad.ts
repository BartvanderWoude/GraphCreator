import { toDagittyIds } from './dagitty'
import type { Graph } from './graph'

/**
 * Writes Tetrad's saved graph text (spec 4.15), which causal-learn's `txt2generalgraph` also
 * reads: `Graph Nodes:`, the safe ids joined by `;`, a blank line, `Graph Edges:` and one
 * numbered `a --> b` line per edge, all in graph order. The output ends with a newline; edges
 * whose endpoints are missing are skipped.
 */
export function toTetrad(graph: Graph): string {
  const ids = toDagittyIds(graph.nodes)
  const lines = [
    'Graph Nodes:',
    graph.nodes.map((n) => ids.get(n.id)).join(';'),
    '',
    'Graph Edges:',
  ]
  let number = 0
  for (const edge of graph.edges) {
    const source = ids.get(edge.source)
    const target = ids.get(edge.target)
    if (source === undefined || target === undefined) continue
    number++
    lines.push(`${number}. ${source} --> ${target}`)
  }
  return `${lines.join('\n')}\n`
}
