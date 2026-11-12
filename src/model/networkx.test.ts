import { describe, expect, it } from 'vitest'
import { parseDagitty } from './dagitty'
import type { Graph } from './graph'
import { nodeDiameter } from './nodeSize'
import { parseNetworkx, toNetworkx } from './networkx'
import type { Issue, Result } from './result'
import { parseYaml, toYaml } from './yaml'

const yamlFixtures: Record<string, string> = import.meta.glob(
  './__fixtures__/*.dag.yaml',
  { query: '?raw', import: 'default', eager: true },
)
const dagittyFixtures: Record<string, string> = import.meta.glob(
  './__fixtures__/*.dagitty.txt',
  { query: '?raw', import: 'default', eager: true },
)

function ok(result: Result<Graph>): { graph: Graph; warnings: Issue[] } {
  if (!result.ok) {
    throw new Error(
      `Expected success, got: ${result.errors.map((e) => e.message).join(' | ')}`,
    )
  }
  return { graph: result.value, warnings: result.warnings }
}

function errors(result: Result<Graph>): string[] {
  if (result.ok) throw new Error('Expected an error, got success.')
  return result.errors.map((e) => e.message)
}

const messages = (issues: Issue[]) => issues.map((i) => i.message)

function smoking(): Graph {
  return ok(parseYaml(yamlFixtures['./__fixtures__/smoking.dag.yaml']!)).graph
}

/** Edges as "source name -> target name", in graph order. */
function edgeNames(graph: Graph): string[] {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)!.name
  return graph.edges.map((e) => `${name(e.source)} -> ${name(e.target)}`)
}

const SMOKING_JSON = `{
  "directed": true,
  "multigraph": false,
  "graph": {
    "name": "Smoking and birth weight"
  },
  "nodes": [
    {
      "id": "Maternal_smoking",
      "name": "Maternal smoking",
      "role": "exposure",
      "var_type": "categorical",
      "levels": ["never", "former", "current"],
      "description": "Self-reported during pregnancy",
      "pos": [42, 42]
    },
    {
      "id": "Birth_weight",
      "name": "Birth weight",
      "role": "outcome",
      "var_type": "continuous",
      "unit": "g",
      "pos": [336, 36]
    },
    {
      "id": "SES",
      "name": "SES",
      "var_type": "ordinal",
      "levels": ["low", "mid", "high"],
      "pos": [182, -88]
    },
    {
      "id": "Genetic_factors",
      "name": "Genetic factors",
      "role": "latent",
      "pos": [189, 159]
    }
  ],
  "edges": [
    {
      "source": "SES",
      "target": "Maternal_smoking",
      "evidence": ["PMID:123", "doi:10.1000/xyz"],
      "note": "Well established"
    },
    {
      "source": "Maternal_smoking",
      "target": "Birth_weight"
    },
    {
      "source": "SES",
      "target": "Birth_weight"
    },
    {
      "source": "Genetic_factors",
      "target": "Birth_weight"
    }
  ]
}
`

describe('toNetworkx', () => {
  it('writes the 4.15 example shape for the 4.1 graph', () => {
    expect(toNetworkx(smoking())).toBe(SMOKING_JSON)
  })

  it('is valid JSON with centres in canvas px', () => {
    const g = smoking()
    const data = JSON.parse(toNetworkx(g))
    data.nodes.forEach((n: { pos: number[] }, i: number) => {
      const r = nodeDiameter(g.nodes[i].name) / 2
      expect(n.pos).toEqual([g.nodes[i].pos.x + r, g.nodes[i].pos.y + r])
    })
  })

  it('writes an empty graph object without a name, and an empty graph', () => {
    expect(toNetworkx({ nodes: [], edges: [] })).toBe(`{
  "directed": true,
  "multigraph": false,
  "graph": {},
  "nodes": [],
  "edges": []
}
`)
  })

  it('rounds to two decimals, never writes -0, and skips dangling edges', () => {
    const d = nodeDiameter('A')
    const g: Graph = {
      nodes: [
        {
          id: 'n1',
          name: 'A',
          role: 'other',
          pos: { x: -d / 2 - 0.001, y: 1.23456 },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'gone', evidence: [] }],
    }
    const text = toNetworkx(g)
    expect(text).toContain(
      `"pos": [0, ${Math.round((1.23456 + d / 2) * 100) / 100}]`,
    )
    expect(text).not.toContain('-0')
    expect(text).toContain('"edges": []')
  })

  it('keeps arrays whose strings contain brackets, quotes and commas on one line', () => {
    const g: Graph = {
      nodes: [
        {
          id: 'n1',
          name: 'A',
          role: 'other',
          varType: 'categorical',
          levels: ['[x]', 'a, "b"', 'c\\d\ne'],
          pos: { x: 0, y: 0 },
        },
      ],
      edges: [],
    }
    const text = toNetworkx(g)
    expect(text).toContain('"levels": ["[x]", "a, \\"b\\"", "c\\\\d\\ne"],')
    expect(JSON.parse(text).nodes[0].levels).toEqual([
      '[x]',
      'a, "b"',
      'c\\d\ne',
    ])
  })

  it('uses safe ids and keeps the full name', () => {
    const g: Graph = {
      nodes: [
        { id: 'n1', name: 'a b', role: 'other', pos: { x: 0, y: 0 } },
        { id: 'n2', name: 'a_b', role: 'other', pos: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', evidence: [] }],
    }
    const data = JSON.parse(toNetworkx(g))
    expect(
      data.nodes.map((n: { id: string; name: string }) => [n.id, n.name]),
    ).toEqual([
      ['a_b', 'a b'],
      ['a_b_2', 'a_b'],
    ])
    expect(data.edges[0]).toEqual({ source: 'a_b', target: 'a_b_2' })
  })
})

describe('round trip', () => {
  function expectRoundTrip(g: Graph) {
    const { graph } = ok(parseNetworkx(toNetworkx(g)))
    const strip = (x: Graph) =>
      toYaml({
        ...x,
        nodes: x.nodes.map((n) => ({ ...n, pos: { x: 0, y: 0 } })),
      })
    expect(strip(graph)).toBe(strip(g))
    graph.nodes.forEach((n, i) => {
      expect(Math.abs(n.pos.x - g.nodes[i].pos.x)).toBeLessThanOrEqual(0.1)
      expect(Math.abs(n.pos.y - g.nodes[i].pos.y)).toBeLessThanOrEqual(0.1)
    })
    expect(toYaml(graph)).toBe(toYaml(g))
  }

  it('round-trips every valid YAML and dagitty fixture', () => {
    let count = 0
    for (const [path, text] of Object.entries(yamlFixtures)) {
      // networkx JSON leaves the simulation details out (spec 4.16).
      if (path.endsWith('/simulation.dag.yaml')) continue
      const result = parseYaml(text)
      if (!result.ok) continue
      expectRoundTrip(result.value)
      count++
    }
    for (const text of Object.values(dagittyFixtures)) {
      const result = parseDagitty(text)
      if (!result.ok) continue
      expectRoundTrip(result.value)
      count++
    }
    expect(count).toBe(8)
  })

  it('round-trips awkward names, every role and fractional positions', () => {
    const roles = [
      'exposure',
      'outcome',
      'latent',
      'adjusted',
      'selected',
      'other',
    ] as const
    const names = [
      'a b',
      'a_b',
      'Größe',
      'quote " and \\ backslash',
      'node',
      '[1, 2]',
    ]
    const g: Graph = {
      name: 'Odd "graph"',
      nodes: roles.map((role, i) => ({
        id: `n${i + 1}`,
        name: names[i],
        role,
        pos: { x: i * 33.333, y: -i * 17.77 },
      })),
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          evidence: ['x;y', '[z]'],
          note: 'n',
        },
        { id: 'e2', source: 'n3', target: 'n2', evidence: [] },
      ],
    }
    expectRoundTrip(g)
  })
})

describe('parseNetworkx', () => {
  const graphJson = (nodes: unknown[], edges: unknown[] = [], extra = {}) =>
    JSON.stringify({
      directed: true,
      multigraph: false,
      graph: {},
      nodes,
      edges,
      ...extra,
    })

  it('reads the smoking example back', () => {
    const { graph, warnings } = ok(parseNetworkx(SMOKING_JSON))
    expect(graph.name).toBe('Smoking and birth weight')
    expect(graph.nodes.map((n) => n.name)).toEqual([
      'Maternal smoking',
      'Birth weight',
      'SES',
      'Genetic factors',
    ])
    expect(graph.nodes[2]).toMatchObject({
      varType: 'ordinal',
      levels: ['low', 'mid', 'high'],
    })
    expect(graph.edges[0]).toMatchObject({
      evidence: ['PMID:123', 'doi:10.1000/xyz'],
      note: 'Well established',
    })
    expect(messages(warnings)).not.toContain(
      'Some nodes had no position, so the graph was laid out automatically.',
    )
  })

  it('accepts links instead of edges', () => {
    const text = JSON.stringify({
      directed: true,
      multigraph: false,
      graph: {},
      nodes: [{ id: 'A' }, { id: 'B' }],
      links: [{ source: 'A', target: 'B' }],
    })
    const { graph } = ok(parseNetworkx(text))
    expect(edgeNames(graph)).toEqual(['A -> B'])
  })

  it('prefers edges over links and allows neither', () => {
    const both = JSON.stringify({
      directed: true,
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ source: 'A', target: 'B' }],
      links: [{ source: 'B', target: 'A' }],
    })
    expect(edgeNames(ok(parseNetworkx(both)).graph)).toEqual(['A -> B'])
    const neither = JSON.stringify({ directed: true, nodes: [{ id: 'A' }] })
    expect(ok(parseNetworkx(neither)).graph.edges).toEqual([])
  })

  it('turns numeric ids into text', () => {
    const { graph } = ok(
      parseNetworkx(
        graphJson([{ id: 0 }, { id: 1.5 }], [{ source: 0, target: 1.5 }]),
      ),
    )
    expect(graph.nodes.map((n) => n.name)).toEqual(['0', '1.5'])
    expect(edgeNames(graph)).toEqual(['0 -> 1.5'])
  })

  it('takes the name from name, else label, else id', () => {
    const { graph } = ok(
      parseNetworkx(
        graphJson([
          { id: 'a', name: ' Full name ', label: 'L' },
          { id: 'b', label: 'Label' },
          { id: 'c' },
        ]),
      ),
    )
    expect(graph.nodes.map((n) => n.name)).toEqual(['Full name', 'Label', 'c'])
  })

  it('lays out a graph without positions, with the warning', () => {
    const { graph, warnings } = ok(
      parseNetworkx(
        graphJson([{ id: 'A' }, { id: 'B' }], [{ source: 'A', target: 'B' }]),
      ),
    )
    expect(graph.nodes).toHaveLength(2)
    expect(messages(warnings)).toContain(
      'Some nodes had no position, so the graph was laid out automatically.',
    )
  })

  it('gives the message for invalid JSON', () => {
    const [message] = errors(parseNetworkx('{"nodes": ['))
    expect(message).toMatch(/^The file is not valid JSON: .+[^.]\.$/)
  })

  it('gives the message for a missing nodes list', () => {
    const expected =
      'This JSON is not a networkx graph (it has no "nodes" list).'
    expect(errors(parseNetworkx('{"directed": true}'))).toEqual([expected])
    expect(errors(parseNetworkx('{"nodes": {}}'))).toEqual([expected])
    expect(errors(parseNetworkx('[1, 2]'))).toEqual([expected])
    expect(errors(parseNetworkx('null'))).toEqual([expected])
  })

  it('rejects undirected graphs and multigraphs', () => {
    expect(errors(parseNetworkx('{"directed": false, "nodes": []}'))).toEqual([
      'This networkx graph is not directed. GraphCreator reads directed graphs only.',
    ])
    expect(errors(parseNetworkx('{"nodes": []}'))).toEqual([
      'This networkx graph is not directed. GraphCreator reads directed graphs only.',
    ])
    expect(
      errors(
        parseNetworkx('{"directed": true, "multigraph": true, "nodes": []}'),
      ),
    ).toEqual(['networkx multigraphs are not supported.'])
  })

  it('warns once per unknown key on nodes, edges and graph', () => {
    const { warnings } = ok(
      parseNetworkx(
        graphJson(
          [
            { id: 'A', weight: 1, colour: 'red', pos: [0, 0] },
            { id: 'B', weight: 2, pos: [100, 0] },
          ],
          [{ source: 'A', target: 'B', weight: 3, key: 0 }],
          { graph: { name: 'G', creator: 'me' } },
        ),
      ),
    )
    expect(messages(warnings).slice(0, 4)).toEqual([
      'Ignored networkx attribute "creator" (not used by GraphCreator).',
      'Ignored networkx attribute "weight" (not used by GraphCreator).',
      'Ignored networkx attribute "colour" (not used by GraphCreator).',
      'Ignored networkx attribute "key" (not used by GraphCreator).',
    ])
    expect(
      messages(warnings).filter((m) => m.startsWith('Ignored')),
    ).toHaveLength(4)
  })

  it('requires pos to be two numbers', () => {
    for (const pos of [[1], [1, 2, 3], ['1', 2], 'x', { x: 1, y: 2 }]) {
      expect(errors(parseNetworkx(graphJson([{ id: 'SES', pos }])))).toEqual([
        'Node "SES": pos must be a list of two numbers, like [42, 42].',
      ])
    }
  })

  it('converts centres to top-left positions', () => {
    const { graph } = ok(
      parseNetworkx(graphJson([{ id: 'SES', pos: [182, -88.5] }])),
    )
    const r = nodeDiameter('SES') / 2
    expect(graph.nodes[0].pos).toEqual({ x: 182 - r, y: -88.5 - r })
  })

  it('reports field errors from buildGraph together with its own', () => {
    expect(
      errors(
        parseNetworkx(
          graphJson(
            [
              { id: 'A', role: 'boss', pos: [0] },
              { id: 'B', var_type: 'continuous', levels: ['x'] },
            ],
            [{ source: 'A', target: 'C' }],
          ),
        ),
      ),
    ).toEqual([
      'Node "A": pos must be a list of two numbers, like [42, 42].',
      'Node "A": role must be one of exposure, outcome, latent, adjusted, selected, other.',
      'The edge from "A" to "C" refers to "C", but there is no node with that id.',
      expect.stringContaining('B'),
    ])
  })

  it('rejects nodes and edges that are not objects or lack ids', () => {
    expect(
      errors(
        parseNetworkx(
          graphJson(
            [{ id: 'A' }, 'B', { name: 'C' }, { id: true }],
            [{ source: 'A' }, 3],
          ),
        ),
      ),
    ).toEqual([
      'Node 2 in the "nodes" list is not an object.',
      'Node 3 in the "nodes" list needs an "id" (text or a number).',
      'Node 4 in the "nodes" list needs an "id" (text or a number).',
      'Edge 1 in the "edges" list needs a "source" and a "target" (text or a number).',
      'Edge 2 in the "edges" list is not an object.',
    ])
    const links = JSON.stringify({ directed: true, nodes: [], links: 'x' })
    expect(errors(parseNetworkx(links))).toEqual([
      'This JSON is not a networkx graph ("links" is not a list).',
    ])
  })

  it('gives the duplicate-id, cycle and type errors through buildGraph', () => {
    expect(
      errors(parseNetworkx(graphJson([{ id: 'A' }, { id: 'A' }]))),
    ).toEqual(['Two nodes have the id "A".'])
    const cycle = errors(
      parseNetworkx(
        graphJson(
          [{ id: 'A' }, { id: 'B' }],
          [
            { source: 'A', target: 'B' },
            { source: 'B', target: 'A' },
          ],
        ),
      ),
    )
    expect(cycle.length).toBeGreaterThan(0)
    expect(
      errors(parseNetworkx(graphJson([{ id: 'A', name: { first: 'x' } }]))),
    ).toEqual(['Node "A": name must be text.'])
    expect(
      errors(
        parseNetworkx(graphJson([{ id: 'A' }], [], { graph: { name: [1] } })),
      ),
    ).toEqual(['The graph name must be text.'])
  })

  it('reads a number name and a numeric graph name as text', () => {
    const { graph } = ok(
      parseNetworkx(
        graphJson([{ id: 'A', name: 7 }], [], { graph: { name: 2024 } }),
      ),
    )
    expect(graph.name).toBe('2024')
    expect(graph.nodes[0].name).toBe('7')
  })
})
