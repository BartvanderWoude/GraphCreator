import { describe, expect, it } from 'vitest'
import smokingYaml from './__fixtures__/smoking.dag.yaml?raw'
import type { GEdge, GNode, Graph } from './graph'
import { toMermaid } from './mermaid'
import type { Role } from './schema'
import { parseYaml } from './yaml'

function smoking(): Graph {
  const result = parseYaml(smokingYaml)
  if (!result.ok) throw new Error('smoking.dag.yaml does not parse.')
  return result.value
}

function node(id: string, name: string, role: Role = 'other'): GNode {
  return { id, name, role, pos: { x: 0, y: 0 } }
}

function edge(id: string, source: string, target: string): GEdge {
  return { id, source, target, evidence: [] }
}

describe('toMermaid', () => {
  it('writes the 4.15 example for the 4.1 graph', () => {
    expect(toMermaid(smoking())).toBe(`%% Smoking and birth weight
flowchart TB
  v1(("Maternal smoking"))
  v2(("Birth weight"))
  v3(("SES"))
  v4(("Genetic factors"))
  v3 --> v1
  v1 --> v2
  v3 --> v2
  v4 --> v2
  classDef exposure fill:#e3f1e8,stroke:#4a946a,color:#24563a
  classDef outcome fill:#e2eaf8,stroke:#5b83cf,color:#23407a
  classDef latent fill:#f3f4f6,stroke:#80868f,color:#374151
  classDef other fill:#ffffff,stroke:#7d8a9c,color:#0f172a
  class v1 exposure
  class v2 outcome
  class v4 latent
  class v3 other
`)
  })

  it('writes only flowchart TB for an empty graph', () => {
    expect(toMermaid({ nodes: [], edges: [] })).toBe('flowchart TB\n')
  })

  it('writes the name comment only when the graph has a name', () => {
    const graph: Graph = { name: 'Two\nlines', nodes: [], edges: [] }
    expect(toMermaid(graph)).toBe('%% Two lines\nflowchart TB\n')
  })

  it('escapes #, ", < and > with entity codes, # first', () => {
    const graph: Graph = { nodes: [node('n1', 'a "b" <c> #35; d#')], edges: [] }
    expect(toMermaid(graph)).toContain(
      '  v1(("a #quot;b#quot; #lt;c#gt; #35;35; d#35;"))\n',
    )
  })

  it('has a classDef and a class line only for the roles in use, in ROLES order', () => {
    const graph: Graph = {
      nodes: [
        node('n1', 'S', 'selected'),
        node('n2', 'A', 'exposure'),
        node('n3', 'B', 'adjusted'),
        node('n4', 'C', 'selected'),
      ],
      edges: [],
    }
    const lines = toMermaid(graph).split('\n')
    expect(lines.filter((l) => l.includes('classDef'))).toEqual([
      '  classDef exposure fill:#e3f1e8,stroke:#4a946a,color:#24563a',
      '  classDef adjusted fill:#f8eedd,stroke:#ad7a2c,color:#6b4510',
      '  classDef selected fill:#efe7f7,stroke:#9375c4,color:#4c2f75',
    ])
    expect(lines.filter((l) => l.startsWith('  class '))).toEqual([
      '  class v2 exposure',
      '  class v3 adjusted',
      '  class v1,v4 selected',
    ])
  })

  it('skips edges with missing endpoints', () => {
    const graph: Graph = {
      nodes: [node('n1', 'A'), node('n2', 'B')],
      edges: [edge('e1', 'n1', 'n2'), edge('e2', 'gone', 'n2')],
    }
    expect(toMermaid(graph)).toBe(`flowchart TB
  v1(("A"))
  v2(("B"))
  v1 --> v2
  classDef other fill:#ffffff,stroke:#7d8a9c,color:#0f172a
  class v1,v2 other
`)
  })
})
