import { describe, expect, it } from 'vitest'
import type { GEdge, GNode, Graph } from './graph'
import { autoLayout } from './layout'

function node(id: string): GNode {
  return { id, name: id, role: 'other', pos: { x: 0, y: 0 } }
}

function edge(source: string, target: string): GEdge {
  return { id: `${source}-${target}`, source, target, evidence: [] }
}

const graph: Graph = {
  name: 'Test',
  nodes: ['A', 'B', 'C', 'D', 'E'].map(node),
  edges: [edge('A', 'B'), edge('B', 'C'), edge('A', 'C'), edge('D', 'C')],
}

describe('autoLayout', () => {
  it('gives every node integer positions', () => {
    const laid = autoLayout(graph)
    expect(laid.nodes).toHaveLength(graph.nodes.length)
    for (const n of laid.nodes) {
      expect(Number.isInteger(n.pos.x)).toBe(true)
      expect(Number.isInteger(n.pos.y)).toBe(true)
    }
  })

  it('places parents left of their children', () => {
    const laid = autoLayout(graph)
    const x = new Map(laid.nodes.map((n) => [n.id, n.pos.x]))
    for (const e of graph.edges) {
      expect(x.get(e.source)!).toBeLessThan(x.get(e.target)!)
    }
  })

  it('is deterministic and does not mutate its input', () => {
    const before = structuredClone(graph)
    const first = autoLayout(graph)
    expect(autoLayout(graph)).toEqual(first)
    expect(graph).toEqual(before)
  })

  it('keeps everything but positions', () => {
    const laid = autoLayout(graph)
    expect(laid.name).toBe('Test')
    expect(laid.edges).toEqual(graph.edges)
    expect(laid.nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id))
  })

  it('handles an empty graph', () => {
    expect(autoLayout({ nodes: [], edges: [] })).toEqual({
      nodes: [],
      edges: [],
    })
  })
})
