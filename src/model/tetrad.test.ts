import { describe, expect, it } from 'vitest'
import smokingYaml from './__fixtures__/smoking.dag.yaml?raw'
import type { GEdge, GNode, Graph } from './graph'
import { toTetrad } from './tetrad'
import { parseYaml } from './yaml'

function smoking(): Graph {
  const result = parseYaml(smokingYaml)
  if (!result.ok) throw new Error('smoking.dag.yaml does not parse.')
  return result.value
}

function node(id: string, name: string): GNode {
  return { id, name, role: 'other', pos: { x: 0, y: 0 } }
}

function edge(id: string, source: string, target: string): GEdge {
  return { id, source, target, evidence: [] }
}

describe('toTetrad', () => {
  it('writes the 4.15 example for the 4.1 graph', () => {
    expect(toTetrad(smoking())).toBe(`Graph Nodes:
Maternal_smoking;Birth_weight;SES;Genetic_factors

Graph Edges:
1. SES --> Maternal_smoking
2. Maternal_smoking --> Birth_weight
3. SES --> Birth_weight
4. Genetic_factors --> Birth_weight
`)
  })

  it('writes the two headers for an empty graph', () => {
    expect(toTetrad({ nodes: [], edges: [] })).toBe(
      'Graph Nodes:\n\n\nGraph Edges:\n',
    )
  })

  it('ends after Graph Edges: when there are no edges', () => {
    const graph: Graph = {
      nodes: [node('n1', 'A'), node('n2', 'B')],
      edges: [],
    }
    expect(toTetrad(graph)).toBe('Graph Nodes:\nA;B\n\nGraph Edges:\n')
  })

  it('uses safe ids', () => {
    const graph: Graph = {
      nodes: [
        node('n1', 'a b'),
        node('n2', 'a_b'),
        node('n3', 'x;y'),
        node('n4', ''),
      ],
      edges: [edge('e1', 'n1', 'n3'), edge('e2', 'n2', 'n4')],
    }
    expect(toTetrad(graph)).toBe(`Graph Nodes:
a_b;a_b_2;x_y;node_2

Graph Edges:
1. a_b --> x_y
2. a_b_2 --> node_2
`)
  })

  it('skips edges with missing endpoints and keeps the numbering dense', () => {
    const graph: Graph = {
      nodes: [node('n1', 'A'), node('n2', 'B'), node('n3', 'C')],
      edges: [
        edge('e1', 'gone', 'n2'),
        edge('e2', 'n1', 'n2'),
        edge('e3', 'n2', 'n3'),
      ],
    }
    expect(toTetrad(graph)).toBe(
      'Graph Nodes:\nA;B;C\n\nGraph Edges:\n1. A --> B\n2. B --> C\n',
    )
  })
})
