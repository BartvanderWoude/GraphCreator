import { describe, expect, it } from 'vitest'
import { parseDagitty } from './dagitty'
import { parseGml, toGml } from './gml'
import type { Graph } from './graph'
import { nodeDiameter } from './nodeSize'
import type { Issue, Result } from './result'
import { parseYaml, toYaml } from './yaml'

const yamlFixtures: Record<string, string> = import.meta.glob(
  './__fixtures__/*.dag.yaml',
  { query: '?raw', import: 'default', eager: true },
)
const dagittyFixtures: Record<string, string> = import.meta.glob(
  ['./__fixtures__/*.dagitty.txt', './__fixtures__/analysis/*.dagitty.txt'],
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

function errors(result: Result<Graph>): Issue[] {
  if (result.ok) throw new Error('Expected an error, got success.')
  return result.errors
}

const messages = (issues: Issue[]) => issues.map((i) => i.message)

const smoking = ok(
  parseYaml(yamlFixtures['./__fixtures__/smoking.dag.yaml']),
).graph

const SMOKING_GML = `graph [
  directed 1
  name "Smoking and birth weight"
  node [
    id 0
    label "Maternal_smoking"
    name "Maternal smoking"
    role "exposure"
    var_type "categorical"
    levels "never"
    levels "former"
    levels "current"
    description "Self-reported during pregnancy"
    graphics [
      x 42
      y 42
    ]
  ]
  node [
    id 1
    label "Birth_weight"
    name "Birth weight"
    role "outcome"
    var_type "continuous"
    unit "g"
    graphics [
      x 336
      y 36
    ]
  ]
  node [
    id 2
    label "SES"
    name "SES"
    var_type "ordinal"
    levels "low"
    levels "mid"
    levels "high"
    graphics [
      x 182
      y -88
    ]
  ]
  node [
    id 3
    label "Genetic_factors"
    name "Genetic factors"
    role "latent"
    graphics [
      x 189
      y 159
    ]
  ]
  edge [
    source 2
    target 0
    evidence "PMID:123"
    evidence "doi:10.1000/xyz"
    note "Well established"
  ]
  edge [
    source 0
    target 1
  ]
  edge [
    source 2
    target 1
  ]
  edge [
    source 3
    target 1
  ]
]
`

/** `toYaml` without the `pos` lines, and the positions on their own. */
function splitPositions(graph: Graph) {
  return {
    yaml: toYaml(graph).replace(/^ {4}pos: .*\n/gm, ''),
    positions: graph.nodes.map((n) => n.pos),
  }
}

function expectSameGraph(actual: Graph, expected: Graph, label: string) {
  const a = splitPositions(actual)
  const e = splitPositions(expected)
  expect(a.yaml, label).toBe(e.yaml)
  expect(a.positions.length, label).toBe(e.positions.length)
  a.positions.forEach((p, i) => {
    expect(Math.abs(p.x - e.positions[i].x), label).toBeLessThanOrEqual(0.1)
    expect(Math.abs(p.y - e.positions[i].y), label).toBeLessThanOrEqual(0.1)
  })
}

function graphOf(names: string[], edges: [number, number][] = []): Graph {
  return {
    nodes: names.map((name, i) => ({
      id: `n${i + 1}`,
      name,
      role: 'other',
      pos: { x: i * 100, y: 0 },
    })),
    edges: edges.map(([s, t], i) => ({
      id: `e${i + 1}`,
      source: `n${s + 1}`,
      target: `n${t + 1}`,
      evidence: [],
    })),
  }
}

describe('toGml', () => {
  it('writes the 4.15 example for the 4.1 graph', () => {
    expect(toGml(smoking)).toBe(SMOKING_GML)
  })

  it('labels nodes with the safe id and always writes the full name', () => {
    const text = toGml(graphOf(['Age', 'Age group', 'Age-group']))
    expect(text).toContain('    label "Age"\n    name "Age"\n')
    expect(text).toContain('    label "Age_group"\n    name "Age group"\n')
    expect(text).toContain('    label "Age_group_2"\n    name "Age-group"\n')
  })

  it('escapes " and & and everything beyond ASCII as networkx does', () => {
    const graph = graphOf(['say "hi"', 'A & B', 'Größe', 'tab\there', '😀'])
    graph.name = 'Ünïcode'
    const text = toGml(graph)
    expect(text).toContain('  name "&#220;n&#239;code"\n')
    expect(text).toContain('    name "say &#34;hi&#34;"\n')
    expect(text).toContain('    name "A &#38; B"\n')
    expect(text).toContain('    name "Gr&#246;&#223;e"\n')
    expect(text).toContain('    name "tab&#9;here"\n')
    expect(text).toContain('    name "&#128512;"\n')
    expect(text).not.toMatch(/[^\n -~]/)
  })

  it('writes at most two decimals, never -0, and skips dangling edges', () => {
    const graph = graphOf(['A', 'B'], [[0, 1]])
    const r = nodeDiameter('A') / 2
    graph.nodes[0].pos = { x: -r - 0.001, y: 1.23456 - r }
    graph.edges.push({ id: 'e9', source: 'n1', target: 'nX', evidence: [] })
    const text = toGml(graph)
    expect(text).toContain('      x 0\n      y 1.23\n')
    expect(text).not.toContain('-0')
    expect(text.match(/edge \[/g)).toHaveLength(1)
    expect(text.endsWith(']\n')).toBe(true)
  })

  it('writes no name line for a graph without a name', () => {
    expect(toGml({ nodes: [], edges: [] })).toBe('graph [\n  directed 1\n]\n')
  })
})

describe('parseGml round trip', () => {
  const graphs: [string, Graph][] = []
  for (const [path, text] of Object.entries(yamlFixtures)) {
    // GML leaves the simulation details out (spec 4.16).
    if (path.endsWith('/simulation.dag.yaml')) continue
    const result = parseYaml(text)
    if (result.ok) graphs.push([path, result.value])
  }
  for (const [path, text] of Object.entries(dagittyFixtures)) {
    const result = parseDagitty(text)
    if (result.ok) graphs.push([path, result.value])
  }

  it('covers the valid fixtures', () => {
    // 2 YAML (smoking, minimal) + 5 dagitty + the analysis gallery.
    expect(graphs.length).toBeGreaterThanOrEqual(15)
  })

  it.each(graphs)('keeps everything in %s', (label, graph) => {
    const back = ok(parseGml(toGml(graph))).graph
    expectSameGraph(back, graph, label)
  })

  it('keeps quotes, ampersands, non-ASCII text and evidence', () => {
    const graph = graphOf(
      ['say "hi"', 'A & B', 'Größe 😀', 'x &#34; y'],
      [
        [0, 1],
        [1, 2],
      ],
    )
    graph.name = 'Ä & "B"'
    graph.nodes[2].varType = 'ordinal'
    graph.nodes[2].levels = ['<5', '5–10', '>10 & "more"']
    graph.nodes[1].varType = 'continuous'
    graph.nodes[1].unit = 'µg/m³'
    graph.nodes[0].description = 'Line one\nline two'
    graph.edges[0].evidence = ['doi:10.1/x"y', 'PMID:1']
    graph.edges[0].note = 'Café'
    const back = ok(parseGml(toGml(graph))).graph
    expectSameGraph(back, graph, 'escaping')
    expect(back.nodes.map((n) => n.name)).toEqual([
      'say "hi"',
      'A & B',
      'Größe 😀',
      'x &#34; y',
    ])
  })
})

describe('parseGml', () => {
  it('reads the 4.15 example back into the 4.1 graph', () => {
    const { graph, warnings } = ok(parseGml(SMOKING_GML))
    expect(toYaml(graph)).toBe(toYaml(smoking))
    // No ignored keys and no layout: only validateGraph's warnings.
    expect(warnings).toEqual(ok(parseYaml(toYaml(smoking))).warnings)
  })

  it('decodes numeric, hexadecimal and named character references', () => {
    const { graph } = ok(
      parseGml(`graph [ directed 1 name "&quot;Q&quot; &amp; &lt;R&gt; &apos;s&apos;"
  node [ id 1 label "&#34;a&#x22; &#X26; &#246; &#128512; &nbsp; &#99999999;" ]
]`),
    )
    expect(graph.name).toBe(`"Q" & <R> 's'`)
    expect(graph.nodes[0].name).toBe('"a" & ö 😀 &nbsp; &#99999999;')
  })

  it('opens a networkx-written GML without name keys, with the labels as names', () => {
    const text = `graph [
  directed 1
  node [
    id 0
    label "smoking"
  ]
  node [
    id 1
    label "birth_weight"
  ]
  node [
    id 2
    label "SES"
  ]
  edge [
    source 2
    target 0
  ]
  edge [
    source 0
    target 1
  ]
]
`
    const { graph, warnings } = ok(parseGml(text))
    expect(graph.nodes.map((n) => n.name)).toEqual([
      'smoking',
      'birth_weight',
      'SES',
    ])
    expect(graph.edges.map((e) => [e.source, e.target])).toEqual([
      ['n3', 'n1'],
      ['n1', 'n2'],
    ])
    expect(messages(warnings)[0]).toBe(
      'Some nodes had no position, so the graph was laid out automatically.',
    )
  })

  it('uses the id as the name when there is no name or label, and the graph label as its name', () => {
    const { graph } = ok(
      parseGml('graph [ directed 1 label "G" node [ id 7 ] node [ id "b" ] ]'),
    )
    expect(graph.name).toBe('G')
    expect(graph.nodes.map((n) => n.name)).toEqual(['7', 'b'])
  })

  it('takes the centre from graphics and converts it to the top-left position', () => {
    const { graph } = ok(
      parseGml(
        'graph [ directed 1 node [ id 0 name "A" graphics [ x 100.5 y -20 ] ] ]',
      ),
    )
    const r = nodeDiameter('A') / 2
    expect(graph.nodes[0].pos).toEqual({ x: 100.5 - r, y: -20 - r })
  })

  it('reads repeated keys as lists and single ones as one item', () => {
    const { graph } = ok(
      parseGml(`graph [ directed 1
  node [ id 0 name "A" var_type "ordinal" levels "x" levels 2 ]
  node [ id 1 name "B" var_type "categorical" levels "only" ]
  edge [ source 0 target 1 evidence "e1" ]
]`),
    )
    expect(graph.nodes[0].levels).toEqual(['x', '2'])
    expect(graph.nodes[1].levels).toEqual(['only'])
    expect(graph.edges[0].evidence).toEqual(['e1'])
  })

  it("keeps yEd's graphics keys and edge id, label and graphics silent", () => {
    const text = `Creator "yFiles"
Version "2.22"
graph
[
  hierarchic 1
  label ""
  directed 1
  node
  [
    id 0
    label "A"
    graphics
    [
      x 10.0
      y 20.0
      w 30.0
      h 30.0
      type "ellipse"
      fill "#FFCC00"
      outline "#000000"
    ]
  ]
  node
  [
    id 1
    label "B"
    graphics [ x 110.0 y 20.0 w 30.0 h 30.0 type "ellipse" ]
  ]
  edge
  [
    id 5
    label "ab"
    source 0
    target 1
    graphics [ fill "#000000" targetArrow "standard" ]
  ]
]`
    const { warnings } = ok(parseGml(text))
    expect(messages(warnings).filter((m) => m.startsWith('Ignored'))).toEqual([
      'Ignored GML attribute "hierarchic" (not used by GraphCreator).',
    ])
  })

  it('warns once per unknown key, with the line of its first use', () => {
    const result = parseGml(`graph [
  directed 1
  node [ id 0 name "A" weight 1 ]
  node [ id 1 name "B" weight 2 colour "red" ]
  edge [ source 0 target 1 weight 0.5 ]
]`)
    const { warnings } = ok(result)
    expect(warnings.slice(0, 2)).toEqual([
      {
        message: 'Ignored GML attribute "weight" (not used by GraphCreator).',
        line: 3,
      },
      {
        message: 'Ignored GML attribute "colour" (not used by GraphCreator).',
        line: 4,
      },
    ])
  })

  it('skips comments and accepts reals with exponents', () => {
    const { graph } = ok(
      parseGml(`# written by hand
graph [ # the graph
  directed 1
  node [ id 0 name "A # not a comment" graphics [ x 1.5e2 y -.5 ] ]
]`),
    )
    expect(graph.nodes[0].name).toBe('A # not a comment')
    const r = nodeDiameter('A # not a comment') / 2
    expect(graph.nodes[0].pos).toEqual({ x: 150 - r, y: -0.5 - r })
  })

  it('opens an empty directed graph', () => {
    const { graph } = ok(parseGml('graph [ directed 1 ]'))
    expect(graph).toEqual({ nodes: [], edges: [] })
  })
})

describe('parseGml errors', () => {
  it('rejects a missing graph', () => {
    for (const text of ['', '# nothing', 'Creator "x"', 'graph 1']) {
      expect(errors(parseGml(text))).toEqual([
        { message: 'This text is not a GML graph (graph [ … ] is missing).' },
      ])
    }
  })

  it('rejects undirected graphs', () => {
    for (const text of ['graph [ directed 0 ]', 'graph [ node [ id 0 ] ]']) {
      expect(messages(errors(parseGml(text)))).toEqual([
        'This GML graph is not directed. GraphCreator reads directed graphs (directed 1) only.',
      ])
    }
  })

  it('rejects multigraphs', () => {
    expect(
      messages(errors(parseGml('graph [ directed 1 multigraph 1 ]'))),
    ).toEqual(['GML multigraphs are not supported.'])
    expect(parseGml('graph [ directed 1 multigraph 0 ]').ok).toBe(true)
  })

  it('rejects a second graph', () => {
    expect(
      errors(parseGml('graph [ directed 1 ]\ngraph [ directed 1 ]')),
    ).toEqual([
      {
        message:
          'Line 2: this text has more than one GML graph; GraphCreator reads one.',
        line: 2,
      },
    ])
  })

  it('reports an unclosed list at the line that opens it', () => {
    expect(
      errors(parseGml('graph [\n  directed 1\n  node [\n    id 0\n')),
    ).toEqual([
      { message: 'Line 3: a list [ … ] is not closed (missing ]).', line: 3 },
    ])
  })

  it('stops at the first syntax error, with its line', () => {
    expect(
      messages(errors(parseGml('graph [\n  directed 1\n  % x\n]'))),
    ).toEqual(['Line 3: "%" is not valid GML syntax.'])
    expect(
      messages(errors(parseGml('graph [\n  directed 1\n  name "open\n]'))),
    ).toEqual(['Line 3: a quoted name or value is not closed (missing ").'])
    expect(messages(errors(parseGml('graph [ directed ]')))).toEqual([
      'Line 1: "]" is not valid here.',
    ])
    expect(messages(errors(parseGml('graph [ directed 1\n 5 ]')))).toEqual([
      'Line 2: "5" is not valid here.',
    ])
    expect(messages(errors(parseGml('graph [ ] ]')))).toEqual([
      'Line 1: "]" is not valid here.',
    ])
    expect(messages(errors(parseGml('graph [ directed 1 ] name')))).toEqual([
      'Line 1: the text ends too early.',
    ])
    expect(messages(errors(parseGml('graph [ label abc ]')))).toEqual([
      'Line 1: "abc" is not valid here.',
    ])
  })

  it('reports an edge to an unknown id', () => {
    expect(
      errors(
        parseGml(`graph [
  directed 1
  node [ id 0 name "A" ]
  edge [ source 0 target 9 ]
]`),
      ),
    ).toEqual([
      {
        message:
          'The edge from "0" to "9" refers to "9", but there is no node with that id.',
        line: 4,
      },
    ])
  })

  it('collects missing ids, sources and targets with the checks of buildGraph', () => {
    expect(
      errors(
        parseGml(`graph [
  directed 1
  node [ name "A" ]
  node [ id 1 id 2 name "B" ]
  node [ id 3 name "C" role "boss" graphics [ x "1" y 2 ] ]
  node [ id 4 name [ a 1 ] ]
  edge [ target 3 ]
  edge 1
]`),
      ),
    ).toEqual([
      { message: 'Line 3: a node has no id.', line: 3 },
      { message: 'Line 4: id must be one number or text.', line: 4 },
      { message: 'Line 5: graphics x and y must be numbers.', line: 5 },
      { message: 'Line 6: name must be one number or text.', line: 6 },
      { message: 'Line 7: an edge has no source.', line: 7 },
      {
        message:
          'Line 8: edge must be a list, as in edge [ source 0 target 1 ].',
        line: 8,
      },
      {
        message:
          'Node "C": role must be one of exposure, outcome, latent, adjusted, selected, other.',
        line: 5,
      },
    ])
  })

  it('passes duplicate ids, cycles and wrong field types through buildGraph', () => {
    expect(
      messages(
        errors(
          parseGml(`graph [ directed 1
  node [ id 0 name "A" ]
  node [ id 0 name "B" ]
]`),
        ),
      ),
    ).toEqual(['Two nodes have the id "0".'])
    const cycle = errors(
      parseGml(`graph [ directed 1
  node [ id 0 name "A" ] node [ id 1 name "B" ]
  edge [ source 0 target 1 ] edge [ source 1 target 0 ]
]`),
    )
    expect(cycle).toHaveLength(1)
    expect(cycle[0].message).toMatch(/cycle/i)
    expect(
      messages(
        errors(
          parseGml(`graph [ directed 1
  node [ id 0 name "A" description [ x 1 ] var_type "continuous" levels "a" ]
]`),
        ),
      ),
    ).toEqual([
      'Node "A": description must be text.',
      expect.stringContaining('levels'),
    ])
  })
})
