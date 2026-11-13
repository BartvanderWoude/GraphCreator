import { describe, expect, it } from 'vitest'
import type { GEdge, GNode, Graph } from './graph'
import { autoLayout } from './layout'
import { NODE_DIAMETER } from './nodeSize'

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

  describe('circle boxes (spec 4.5 redesign)', () => {
    const LONG = 'Maternal smoking during pregnancy'
    const named = (id: string, name: string): GNode => ({
      ...node(id),
      name,
    })
    const centre = (n: GNode) => ({
      x: n.pos.x + NODE_DIAMETER / 2,
      y: n.pos.y + NODE_DIAMETER / 2,
    })

    it('gives every node a NODE_DIAMETER square, with pos its top-left', () => {
      // A → L in one row: centres line up and the gap between squares is ranksep (100).
      const laid = autoLayout({
        nodes: [named('A', 'Age'), named('L', LONG)],
        edges: [edge('A', 'L')],
      })
      const [a, l] = laid.nodes
      expect(Math.abs(centre(a).y - centre(l).y)).toBeLessThanOrEqual(1)
      expect(
        Math.abs(l.pos.x - (a.pos.x + NODE_DIAMETER) - 100),
      ).toBeLessThanOrEqual(1)
    })

    it('gives every node the same space, whatever its name', () => {
      // P → A, P → B: A and B share a rank; the distance between their centres is
      // half of each square plus nodesep (50).
      const gap = (bName: string) => {
        const laid = autoLayout({
          nodes: [named('P', 'P'), named('A', 'Age'), named('B', bName)],
          edges: [edge('P', 'A'), edge('P', 'B')],
        })
        const byId = new Map(laid.nodes.map((n) => [n.id, n]))
        return Math.abs(centre(byId.get('A')!).y - centre(byId.get('B')!).y)
      }
      const expected = NODE_DIAMETER + 50
      expect(Math.abs(gap('Sex') - expected)).toBeLessThanOrEqual(1)
      expect(Math.abs(gap(LONG) - expected)).toBeLessThanOrEqual(1)
    })
  })
})
