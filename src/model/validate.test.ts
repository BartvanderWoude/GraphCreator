import { describe, expect, it } from 'vitest'
import type { GEdge, GNode, Graph } from './graph'
import { validateGraph } from './validate'

function node(id: string, extra: Partial<GNode> = {}): GNode {
  return {
    id,
    name: id,
    role: 'other',
    varType: 'continuous',
    pos: { x: 0, y: 0 },
    ...extra,
  }
}

function edge(
  source: string,
  target: string,
  id = `${source}-${target}`,
): GEdge {
  return { id, source, target, evidence: [] }
}

const messages = (issues: { message: string }[]) => issues.map((i) => i.message)

describe('validateGraph', () => {
  it('reports nothing for a clean graph', () => {
    const g: Graph = {
      nodes: [
        node('A', { varType: 'categorical', levels: ['no', 'yes'] }),
        node('B', { unit: 'g' }),
      ],
      edges: [edge('A', 'B')],
    }
    expect(validateGraph(g)).toEqual({ errors: [], warnings: [] })
  })

  it('reports empty and duplicate names', () => {
    const g: Graph = {
      nodes: [
        node('a', { name: ' ' }),
        node('b', { name: 'Age' }),
        node('c', { name: 'Age ' }),
        node('d', { name: 'Age' }),
      ],
      edges: [],
    }
    expect(messages(validateGraph(g).errors)).toEqual([
      'A node has no name.',
      'Node name "Age" is used more than once.',
    ])
  })

  it('treats names case-sensitively', () => {
    const g: Graph = {
      nodes: [node('a', { name: 'Age' }), node('b', { name: 'age' })],
      edges: [],
    }
    expect(validateGraph(g).errors).toEqual([])
  })

  it('reports levels and units on the wrong types', () => {
    const g: Graph = {
      nodes: [
        node('A', { levels: ['x', 'y'] }),
        node('B', { varType: undefined, levels: ['x', 'y'] }),
        node('C', { varType: 'ordinal', levels: ['x', 'y'], unit: 'g' }),
      ],
      edges: [],
    }
    expect(messages(validateGraph(g).errors)).toEqual([
      'Node "A" has levels, but only categorical and ordinal variables can have levels.',
      'Node "B" has levels, but only categorical and ordinal variables can have levels.',
      'Node "C" has a unit, but only continuous and discrete variables can have a unit.',
    ])
  })

  it('reports self edges, duplicate edges, dangling edges and cycles', () => {
    const g: Graph = {
      nodes: [node('A'), node('B'), node('C')],
      edges: [
        edge('A', 'A'),
        edge('A', 'B', 'e1'),
        edge('A', 'B', 'e2'),
        edge('B', 'X'),
        edge('B', 'C'),
        edge('C', 'A'),
      ],
    }
    expect(messages(validateGraph(g).errors)).toEqual([
      'Node "A" points to itself.',
      'The edge from "A" to "B" appears more than once.',
      'An edge refers to a node that does not exist.',
      'The graph has a cycle: A → B → C → A.',
    ])
  })

  it('warns about untyped nodes and incomplete or duplicate levels', () => {
    const g: Graph = {
      nodes: [
        node('SES', { varType: undefined }),
        node('Smoking', { varType: 'categorical' }),
        node('Grade', { varType: 'ordinal', levels: ['low'] }),
        node('Edu', {
          varType: 'ordinal',
          levels: ['low', 'high', 'low', 'high', 'mid'],
        }),
      ],
      edges: [],
    }
    const result = validateGraph(g)
    expect(result.errors).toEqual([])
    expect(messages(result.warnings)).toEqual([
      'Node "SES" has no variable type.',
      'Node "Smoking" is categorical but has fewer than two levels.',
      'Node "Grade" is ordinal but has fewer than two levels.',
      'Node "Edu" has duplicate levels ("low", "high").',
    ])
  })
})
