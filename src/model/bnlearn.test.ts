import { describe, expect, it } from 'vitest'
import smokingYaml from './__fixtures__/smoking.dag.yaml?raw'
import { toBnlearn } from './bnlearn'
import type { GEdge, GNode, Graph } from './graph'
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

describe('toBnlearn', () => {
  it('writes the 4.15 example for the 4.1 graph', () => {
    expect(toBnlearn(smoking())).toBe(
      '[Maternal_smoking|SES][Birth_weight|Maternal_smoking:SES:Genetic_factors][SES][Genetic_factors]\n',
    )
  })

  it('writes an empty string for an empty graph', () => {
    expect(toBnlearn({ nodes: [], edges: [] })).toBe('')
  })

  it('uses safe ids and lists parents in graph order', () => {
    const graph: Graph = {
      nodes: [
        node('n1', 'a b'),
        node('n2', 'a_b'),
        node('n3', 'x|y:z'),
        node('n4', 'Größe'),
      ],
      edges: [
        edge('e1', 'n2', 'n3'),
        edge('e2', 'n1', 'n3'),
        edge('e3', 'n3', 'n4'),
      ],
    }
    expect(toBnlearn(graph)).toBe(
      '[a_b][a_b_2][x_y_z|a_b:a_b_2][Gr__e|x_y_z]\n',
    )
  })

  it('skips edges with missing endpoints', () => {
    const graph: Graph = {
      nodes: [node('n1', 'A'), node('n2', 'B')],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'gone', 'n2'),
        edge('e3', 'n1', 'gone'),
      ],
    }
    expect(toBnlearn(graph)).toBe('[A][B|A]\n')
  })
})
