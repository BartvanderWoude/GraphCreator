import { Graph as DagreGraph, layout } from '@dagrejs/dagre'
import type { Graph } from './graph'

/** Width of a node box on the canvas, in px. */
export const NODE_WIDTH = 160
/** Height of a node box on the canvas, in px. */
export const NODE_HEIGHT = 48

/**
 * Lays out the whole graph left to right with dagre and returns a new graph with every node's
 * `pos` (top-left of its box) replaced by integer coordinates. Deterministic for the same input.
 */
export function autoLayout(graph: Graph): Graph {
  const g = new DagreGraph()
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of graph.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }
  layout(g)
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const { x, y } = g.node(node.id) as { x: number; y: number }
      return {
        ...node,
        pos: {
          x: Math.round(x - NODE_WIDTH / 2),
          y: Math.round(y - NODE_HEIGHT / 2),
        },
      }
    }),
  }
}
