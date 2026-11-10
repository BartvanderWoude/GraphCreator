import { describe, expect, it } from 'vitest'
import bidirected from './__fixtures__/bidirected.dagitty.txt?raw'
import confounding from './__fixtures__/confounding.dagitty.txt?raw'
import groupsAndChains from './__fixtures__/groups-and-chains.dagitty.txt?raw'
import mBias from './__fixtures__/m-bias.dagitty.txt?raw'
import noPositions from './__fixtures__/no-positions.dagitty.txt?raw'
import pdag from './__fixtures__/pdag.dagitty.txt?raw'
import quotedNames from './__fixtures__/quoted-names.dagitty.txt?raw'
import twoRoles from './__fixtures__/two-roles.dagitty.txt?raw'
import { DAGITTY_SCALE, parseDagitty, toDagitty, toDagittyIds } from './dagitty'
import type { GNode, Graph } from './graph'
import type { Issue, Result } from './result'
import { parseYaml, toYaml } from './yaml'

/** Every fixture that opens without errors, YAML and dagitty, including the analysis gallery. */
const validFixtures: Record<string, string> = import.meta.glob(
  [
    './__fixtures__/smoking.dag.yaml',
    './__fixtures__/minimal.dag.yaml',
    './__fixtures__/confounding.dagitty.txt',
    './__fixtures__/groups-and-chains.dagitty.txt',
    './__fixtures__/m-bias.dagitty.txt',
    './__fixtures__/no-positions.dagitty.txt',
    './__fixtures__/quoted-names.dagitty.txt',
    './__fixtures__/analysis/*.dagitty.txt',
  ],
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

/** Edges as "source name -> target name", in graph order. */
function edgeNames(graph: Graph): string[] {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)!.name
  return graph.edges.map((e) => `${name(e.source)} -> ${name(e.target)}`)
}

function nodeSummary(graph: Graph) {
  return graph.nodes.map((n) => ({ name: n.name, role: n.role, pos: n.pos }))
}

describe('parseDagitty fixtures', () => {
  it('parses the confounding triangle (headerless, with groups)', () => {
    const { graph, warnings } = ok(parseDagitty(confounding))
    expect(nodeSummary(graph)).toEqual([
      { name: 'A', role: 'other', pos: { x: -220, y: -152 } },
      { name: 'B', role: 'other', pos: { x: 140, y: -146 } },
      { name: 'D', role: 'outcome', pos: { x: 140, y: 162.1 } },
      { name: 'E', role: 'exposure', pos: { x: -220, y: 159.7 } },
      { name: 'Z', role: 'other', pos: { x: -30, y: -8.2 } },
    ])
    expect(edgeNames(graph)).toEqual([
      'A -> E',
      'A -> Z',
      'B -> D',
      'B -> Z',
      'E -> D',
      'Z -> D',
      'Z -> E',
    ])
    // Imported nodes are untyped.
    expect(messages(warnings)).toEqual(
      ['A', 'B', 'D', 'E', 'Z'].map((n) => `Node "${n}" has no variable type.`),
    )
    expect(graph.edges.every((e) => e.evidence.length === 0)).toBe(true)
    expect(graph.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
  })

  it('parses the M-bias graph with latent nodes', () => {
    const { graph } = ok(parseDagitty(mBias))
    expect(nodeSummary(graph)).toEqual([
      { name: 'D', role: 'outcome', pos: { x: 100, y: 100 } },
      { name: 'E', role: 'exposure', pos: { x: -200, y: 100 } },
      { name: 'U1', role: 'latent', pos: { x: -200, y: -50 } },
      { name: 'U2', role: 'latent', pos: { x: 100, y: -50 } },
      { name: 'Z', role: 'other', pos: { x: -50, y: 50 } },
    ])
    expect(edgeNames(graph)).toEqual([
      'E -> D',
      'U1 -> E',
      'U1 -> Z',
      'U2 -> D',
      'U2 -> Z',
    ])
  })

  it('turns quoted ids and labels into names', () => {
    const { graph, warnings } = ok(parseDagitty(quotedNames))
    expect(nodeSummary(graph)).toEqual([
      { name: 'Maternal smoking', role: 'exposure', pos: { x: 0, y: 0 } },
      { name: 'Birth weight', role: 'outcome', pos: { x: 300, y: 0 } },
      {
        name: 'Socio-economic status',
        role: 'other',
        pos: { x: 150, y: -120 },
      },
      { name: 'say "hi"', role: 'latent', pos: { x: 150, y: 120 } },
    ])
    expect(edgeNames(graph)).toEqual([
      'Maternal smoking -> Birth weight',
      'Socio-economic status -> Maternal smoking',
      'Socio-economic status -> Birth weight',
      'say "hi" -> Birth weight',
    ])
    // The dagitty graph name is not used.
    expect(graph.name).toBeUndefined()
    expect(
      warnings.every((w) => w.message.endsWith('has no variable type.')),
    ).toBe(true)
  })

  it('expands chains, <- and groups, and merges duplicate edges', () => {
    const { graph } = ok(parseDagitty(groupsAndChains))
    expect(edgeNames(graph)).toEqual([
      'A -> B',
      'B -> C',
      'C -> D',
      'E -> A',
      'F -> A',
      'B -> G',
      'B -> H',
      'E -> G',
      'E -> H',
      'F -> G',
      'F -> H',
    ])
    expect(graph.nodes.map((n) => n.name)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
    ])
  })

  it('lays out a graph without positions and warns', () => {
    const { graph, warnings } = ok(parseDagitty(noPositions))
    expect(
      nodeSummary(graph).map(({ name, role }) => ({ name, role })),
    ).toEqual([
      { name: 'X', role: 'exposure' },
      { name: 'Y', role: 'outcome' },
      { name: 'Z', role: 'other' },
    ])
    expect(edgeNames(graph)).toEqual(['Z -> X', 'Z -> Y', 'X -> Y'])
    expect(messages(warnings)).toEqual([
      'Some nodes had no position, so the graph was laid out automatically.',
      'Node "X" has no variable type.',
      'Node "Y" has no variable type.',
      'Node "Z" has no variable type.',
    ])
    const pos = Object.fromEntries(graph.nodes.map((n) => [n.name, n.pos]))
    // rankdir LR: parents are left of children.
    expect(pos.Z.x).toBeLessThan(pos.X.x)
    expect(pos.X.x).toBeLessThan(pos.Y.x)
    for (const n of graph.nodes) {
      expect(Number.isInteger(n.pos.x) && Number.isInteger(n.pos.y)).toBe(true)
    }
  })

  it('lays out the whole graph when only some nodes have a position', () => {
    const { graph, warnings } = ok(
      parseDagitty('dag {\na [pos="5,5"]\na -> b\n}'),
    )
    expect(messages(warnings)).toContain(
      'Some nodes had no position, so the graph was laid out automatically.',
    )
    expect(graph.nodes[0].pos).not.toEqual({ x: 500, y: 500 })
  })

  it('rejects bidirected edges with the line number', () => {
    expect(errors(parseDagitty(bidirected))).toEqual([
      {
        message:
          'Line 5: bidirected edges (<->) are not supported yet. GraphCreator v1 supports directed edges only.',
        line: 5,
      },
    ])
  })

  it('rejects a pdag with the line number', () => {
    expect(errors(parseDagitty(pdag))).toEqual([
      {
        message:
          'Line 1: graph type "pdag" is not supported. GraphCreator v1 supports dag graphs only.',
        line: 1,
      },
    ])
  })

  it('rejects a node with two roles', () => {
    expect(errors(parseDagitty(twoRoles))).toEqual([
      {
        message:
          'Node "x" has more than one role (exposure, adjusted); GraphCreator allows one role per node.',
        line: 2,
      },
    ])
  })
})

describe('parseDagitty syntax', () => {
  const firstError = (text: string) => errors(parseDagitty(text))[0]

  it.each([
    ['--', 'undirected edges (--)'],
    ['@-@', 'edges with circle marks (@-@)'],
    ['@->', 'edges with circle marks (@->)'],
    ['-@', 'edges with circle marks (-@)'],
    ['o->', 'edges with circle marks (o->)'],
    ['o-o', 'edges with circle marks (o-o)'],
    ['<->', 'bidirected edges (<->)'],
  ])('rejects %s edges with the line number', (op, what) => {
    expect(firstError(`dag {\na\nb\na ${op} b\n}`)).toEqual({
      message: `Line 4: ${what} are not supported yet. GraphCreator v1 supports directed edges only.`,
      line: 4,
    })
  })

  it.each(['mag', 'pag', 'graph', 'digraph'])(
    'rejects graph type %s',
    (type) => {
      expect(firstError(`\n${type} {\na -> b\n}`)).toEqual({
        message: `Line 2: graph type "${type}" is not supported. GraphCreator v1 supports dag graphs only.`,
        line: 2,
      })
    },
  )

  it('rejects tokens the grammar does not allow, naming the line', () => {
    expect(firstError('dag {\na -> b\nc % d\n}')).toEqual({
      message: 'Line 3: "%" is not valid dagitty syntax.',
      line: 3,
    })
    expect(firstError('dag {\na -> b c\n}')).toEqual({
      message: 'Line 2: "c" is not valid here.',
      line: 2,
    })
    expect(firstError('dag {\na [exposure\n}')).toEqual({
      message: 'Line 3: "}" is not valid here.',
      line: 3,
    })
    expect(firstError('a ->')).toEqual({
      message: 'Line 1: the text ends too early.',
      line: 1,
    })
    expect(firstError('a -> b\n} x')).toEqual({
      message: 'Line 2: "x" is not valid here.',
      line: 2,
    })
    expect(firstError('a > b')).toEqual({
      message: 'Line 1: ">" is not valid dagitty syntax.',
      line: 1,
    })
    expect(firstError('dag {\n"open\n}')).toEqual({
      message: 'Line 2: a quoted name or value is not closed (missing ").',
      line: 2,
    })
    expect(firstError('{a b}')).toEqual({
      message:
        'Line 1: a group { … } must be part of an edge, as in { a b } -> c.',
      line: 1,
    })
    expect(firstError('a [pos="1"]')).toEqual({
      message:
        'Line 1: pos="1" is not a valid position; dagitty positions look like pos="1.5,-0.3".',
      line: 1,
    })
    expect(firstError('a [label]')).toEqual({
      message: 'Line 1: label needs a value, as in label="Age".',
      line: 1,
    })
  })

  it('accepts the optional header forms and separators', () => {
    for (const text of [
      'a -> b',
      'dag { a -> b }',
      'dag G { a -> b }',
      'dag "My graph" {\na -> b\n}',
      'dag {\na -> b',
      'a -> b; b -> c;',
      'dag {\n  bb="0,0,1,1"\n  a -> b\n}',
    ]) {
      const { graph } = ok(parseDagitty(text))
      expect(edgeNames(graph)[0]).toBe('a -> b')
    }
    expect(ok(parseDagitty('')).graph).toEqual({ nodes: [], edges: [] })
  })

  it('treats graph-type words as node ids outside the header position', () => {
    const { graph } = ok(parseDagitty('dag -> graph'))
    expect(edgeNames(graph)).toEqual(['dag -> graph'])
  })

  it('merges repeated vertex statements', () => {
    const { graph } = ok(
      parseDagitty(
        'a [exposure]\na [pos="1,2"]\na [label="Age"]\na -> b [pos="0,0"]\nb [pos="0,0"]',
      ),
    )
    expect(graph.nodes[0]).toMatchObject({
      name: 'Age',
      role: 'exposure',
      pos: { x: 100, y: 200 },
    })
  })

  it('trims labels and quoted ids', () => {
    const { graph } = ok(parseDagitty('" a " [label=" Age ",pos="0,0"]'))
    expect(graph.nodes[0].name).toBe('Age')
  })

  it('warns once per ignored attribute key', () => {
    const { warnings } = ok(
      parseDagitty(
        'dag {\na [beta=0.5,pos="0,0"]\nb [beta=-0.3,pos="1,0",color=red]\na -> b [beta="2",pos="0.5,0"]\n}',
      ),
    )
    expect(messages(warnings).filter((m) => m.startsWith('Ignored'))).toEqual([
      'Ignored dagitty attribute "beta" (not used by GraphCreator).',
      'Ignored dagitty attribute "color" (not used by GraphCreator).',
      'Ignored dagitty attribute "pos" (not used by GraphCreator).',
    ])
    expect(warnings[0].line).toBe(2)
  })

  it('reports self-edges and cycles', () => {
    expect(messages(errors(parseDagitty('a -> a')))).toEqual([
      'Node "a" points to itself.',
    ])
    expect(messages(errors(parseDagitty('a -> b -> c -> a')))).toEqual([
      'The graph has a cycle: a → b → c → a.',
    ])
  })

  it('reports label collisions and empty labels', () => {
    expect(
      messages(
        errors(
          parseDagitty('a [label="Age"]\nb [label="Age"]\nc [label="  "]'),
        ),
      ),
    ).toEqual([
      'Two dagitty nodes have the label "Age".',
      'A node has no name.',
    ])
  })

  it('reports all role conflicts at once', () => {
    expect(
      messages(
        errors(parseDagitty('a [latent,adjusted]\nb [outcome]\nb [selected]')),
      ),
    ).toEqual([
      'Node "a" has more than one role (latent, adjusted); GraphCreator allows one role per node.',
      'Node "b" has more than one role (outcome, selected); GraphCreator allows one role per node.',
    ])
  })

  it('parses real dagitty output with edge attributes (Didelez et al., 2010)', () => {
    const text = `dag {
Age [adjusted,pos="-1.973,-0.123"]
HRT [exposure,pos="-0.536,-0.016"]
Occ [pos="-1.645,0.432"]
S [selected,pos="0.925,-0.500"]
Smo [adjusted,pos="-0.879,0.441"]
TCI [outcome,pos="0.488,0.090"]
Thist [pos="-0.569,1.027"]
Age -> HRT
Age -> Occ
Age -> S [pos="-0.945,-0.571"]
Age -> TCI [pos="-0.264,-0.456"]
HRT -> TCI
Occ -> Smo
Occ -> Thist
Smo -> HRT
Smo -> TCI
TCI -> S
Thist -> TCI
}`
    const { graph, warnings } = ok(parseDagitty(text))
    expect(graph.nodes.map((n) => n.role)).toEqual([
      'adjusted',
      'exposure',
      'other',
      'selected',
      'adjusted',
      'outcome',
      'other',
    ])
    expect(graph.edges).toHaveLength(11)
    expect(warnings[0]).toEqual({
      message: 'Ignored dagitty attribute "pos" (not used by GraphCreator).',
      line: 11,
    })
  })
})

describe('toDagittyIds', () => {
  const nodes = (...names: string[]): GNode[] =>
    names.map((name, i) => ({
      id: `n${i + 1}`,
      name,
      role: 'other',
      pos: { x: 0, y: 0 },
    }))
  const ids = (...names: string[]) => [
    ...toDagittyIds(nodes(...names)).values(),
  ]

  it('replaces whitespace runs and punctuation', () => {
    expect(
      ids('Maternal  smoking', 'a\tb\nc', 'Smoking & BW', 'x.y_z9'),
    ).toEqual(['Maternal_smoking', 'a_b_c', 'Smoking___BW', 'x.y_z9'])
  })

  it('replaces each non-ASCII character with one underscore', () => {
    expect(ids('Größe', 'café 😀')).toEqual(['Gr__e', 'caf___'])
  })

  it('uses "node" for empty results, suffixed like a collision', () => {
    expect(ids('')).toEqual(['node_2'])
  })

  it('never uses graph or node, which dagitty refuses as variable names', () => {
    expect(ids('graph', 'node', 'Node', 'node_2')).toEqual([
      'graph_2',
      'node_2',
      'Node',
      'node_2_2',
    ])
  })

  it('suffixes collisions in node order', () => {
    expect(ids('a b', 'a_b')).toEqual(['a_b', 'a_b_2'])
    expect(ids('a b', 'a_b', 'a-b', '', '')).toEqual([
      'a_b',
      'a_b_2',
      'a_b_3',
      'node_2',
      'node_3',
    ])
  })

  it('keys the map by internal node id', () => {
    const map = toDagittyIds(nodes('x', 'y'))
    expect(map.get('n1')).toBe('x')
    expect(map.get('n2')).toBe('y')
  })
})

/** The 4.1 example graph. */
function smokingGraph(): Graph {
  return {
    name: 'Smoking and birth weight',
    nodes: [
      {
        id: 'n1',
        name: 'Maternal smoking',
        role: 'exposure',
        varType: 'categorical',
        levels: ['never', 'former', 'current'],
        description: 'Self-reported during pregnancy',
        pos: { x: 0, y: 0 },
      },
      {
        id: 'n2',
        name: 'Birth weight',
        role: 'outcome',
        varType: 'continuous',
        unit: 'g',
        pos: { x: 300, y: 0 },
      },
      {
        id: 'n3',
        name: 'SES',
        role: 'other',
        varType: 'ordinal',
        levels: ['low', 'mid', 'high'],
        pos: { x: 150, y: -120 },
      },
      {
        id: 'n4',
        name: 'Genetic factors',
        role: 'latent',
        pos: { x: 150, y: 120 },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'n3',
        target: 'n1',
        evidence: ['PMID:123', 'doi:10.1000/xyz'],
        note: 'Well established',
      },
      { id: 'e2', source: 'n1', target: 'n2', evidence: [] },
      { id: 'e3', source: 'n3', target: 'n2', evidence: [] },
      { id: 'e4', source: 'n4', target: 'n2', evidence: [] },
    ],
  }
}

describe('toDagitty', () => {
  it('writes the 4.2 example for the 4.1 graph', () => {
    expect(toDagitty(smokingGraph())).toBe(`dag {
Maternal_smoking [exposure,label="Maternal smoking",pos="0.000,0.000"]
Birth_weight [outcome,label="Birth weight",pos="3.000,0.000"]
SES [pos="1.500,-1.200"]
Genetic_factors [latent,label="Genetic factors",pos="1.500,1.200"]
SES -> Maternal_smoking
Maternal_smoking -> Birth_weight
SES -> Birth_weight
Genetic_factors -> Birth_weight
}
`)
  })

  it('writes an empty graph', () => {
    expect(toDagitty({ nodes: [], edges: [] })).toBe('dag {\n}\n')
  })

  it('escapes quotes in labels and never writes -0.000', () => {
    const g: Graph = {
      nodes: [
        {
          id: 'n1',
          name: 'say "hi"',
          role: 'other',
          pos: { x: -0.01, y: 12.34 },
        },
      ],
      edges: [],
    }
    expect(toDagitty(g)).toBe(
      'dag {\nsay__hi_ [label="say \\"hi\\"",pos="0.000,0.123"]\n}\n',
    )
  })
})

describe('round trip', () => {
  function expectRoundTrip(g: Graph) {
    const { graph } = ok(parseDagitty(toDagitty(g)))
    expect(graph.nodes.map((n) => [n.name, n.role])).toEqual(
      g.nodes.map((n) => [n.name, n.role]),
    )
    expect(edgeNames(graph)).toEqual(edgeNames(g))
    graph.nodes.forEach((n, i) => {
      expect(Math.abs(n.pos.x - g.nodes[i].pos.x)).toBeLessThanOrEqual(0.1)
      expect(Math.abs(n.pos.y - g.nodes[i].pos.y)).toBeLessThanOrEqual(0.1)
    })
    return graph
  }

  it('preserves names, roles, edges and positions; drops metadata', () => {
    const graph = expectRoundTrip(smokingGraph())
    expect(graph.nodes[0].varType).toBeUndefined()
    expect(graph.nodes[0].levels).toBeUndefined()
    expect(graph.edges[0].evidence).toEqual([])
    expect(graph.edges[0].note).toBeUndefined()
  })

  it('handles awkward names, every role and fractional positions', () => {
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
      '',
    ]
    const g: Graph = {
      nodes: roles.map((role, i) => ({
        id: `n${i + 1}`,
        name: names[i] || 'x  y',
        role,
        pos: { x: i * 33.333, y: -i * 17.77 },
      })),
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', evidence: [] },
        { id: 'e2', source: 'n3', target: 'n2', evidence: [] },
        { id: 'e3', source: 'n4', target: 'n6', evidence: [] },
      ],
    }
    expectRoundTrip(g)
  })

  it('round-trips the fixtures', () => {
    for (const text of [confounding, mBias, quotedNames, groupsAndChains]) {
      const { graph } = ok(parseDagitty(text))
      expectRoundTrip(graph)
    }
  })

  it('uses a scale of 100', () => {
    expect(DAGITTY_SCALE).toBe(100)
  })
})

describe('GraphCreator details in dagitty (phase 32)', () => {
  const smokingDetails = `dag {
Maternal_smoking [exposure,label="Maternal smoking",pos="0.000,0.000",gc.var_type="categorical",gc.levels="never;former;current",gc.description="Self-reported during pregnancy"]
Birth_weight [outcome,label="Birth weight",pos="3.000,0.000",gc.var_type="continuous",gc.unit="g"]
SES [pos="1.500,-1.200",gc.var_type="ordinal",gc.levels="low;mid;high"]
Genetic_factors [latent,label="Genetic factors",pos="1.500,1.200"]
SES -> Maternal_smoking [gc.evidence="PMID:123;doi:10.1000/xyz",gc.note="Well established"]
Maternal_smoking -> Birth_weight
SES -> Birth_weight
Genetic_factors -> Birth_weight
}
`

  /** The graph without its name, which dagitty does not carry (spec 4.2). */
  const unnamed = (g: Graph): Graph => ({ nodes: g.nodes, edges: g.edges })

  it('writes the 4.2 details example for the 4.1 graph', () => {
    expect(toDagitty(smokingGraph(), { details: true })).toBe(smokingDetails)
  })

  it('writes plain dagitty without the option or with details: false', () => {
    const plain = toDagitty(smokingGraph())
    expect(plain).not.toContain('gc.')
    expect(toDagitty(smokingGraph(), {})).toBe(plain)
    expect(toDagitty(smokingGraph(), { details: false })).toBe(plain)
  })

  it('reads the details back from the 4.2 example without warnings about them', () => {
    const { graph, warnings } = ok(parseDagitty(smokingDetails))
    expect(graph).toEqual(unnamed(smokingGraph()))
    // Only validateGraph's warning for the untyped latent node.
    expect(messages(warnings)).toEqual([
      'Node "Genetic factors" has no variable type.',
    ])
  })

  it('round-trips items with ";", "\\" and quotes, and quotes in text', () => {
    const g: Graph = {
      nodes: [
        {
          id: 'n1',
          name: 'A',
          role: 'other',
          varType: 'categorical',
          levels: ['a;b', 'back\\slash', 'say "hi"', 'end\\', '\\;'],
          description: 'He said "x" \\ then; left',
          pos: { x: 0, y: 0 },
        },
        {
          id: 'n2',
          name: 'B',
          role: 'other',
          varType: 'discrete',
          unit: 'm"\\s',
          pos: { x: 100, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          evidence: ['doi:10.1/a;b', 'C:\\path', '"quoted"'],
          note: 'a "note"; with \\ backslash',
        },
      ],
    }
    const text = toDagitty(g, { details: true })
    // encodeList first (`\` → `\\`, `;` → `\;`), then dagitty escaping (`\` → `\\`, `"` → `\"`).
    expect(text).toContain(
      String.raw`gc.levels="a\\;b;back\\\\slash;say \"hi\";end\\\\;\\\\\\;"`,
    )
    expect(ok(parseDagitty(text)).graph).toEqual(g)
  })

  it('gives the attributes after a chain or group to every edge of the statement', () => {
    const { graph, warnings } = ok(
      parseDagitty(
        'a -> b -> c [gc.note="x",gc.evidence="PMID:1"]\n{a b} -> d [gc.note="y"]\nc -> d',
      ),
    )
    expect(edgeNames(graph)).toEqual([
      'a -> b',
      'b -> c',
      'a -> d',
      'b -> d',
      'c -> d',
    ])
    expect(graph.edges.map((e) => e.note)).toEqual([
      'x',
      'x',
      'y',
      'y',
      undefined,
    ])
    expect(graph.edges.map((e) => e.evidence)).toEqual([
      ['PMID:1'],
      ['PMID:1'],
      [],
      [],
      [],
    ])
    expect(messages(warnings).some((m) => m.startsWith('Ignored'))).toBe(false)
  })

  it('merges the details of repeated vertex and edge statements', () => {
    const { graph } = ok(
      parseDagitty(
        'a [pos="0,0",gc.var_type="ordinal"]\na [gc.levels="lo;hi"]\nb [pos="1,0"]\na -> b\na -> b [gc.note="n"]',
      ),
    )
    expect(graph.nodes[0].varType).toBe('ordinal')
    expect(graph.nodes[0].levels).toEqual(['lo', 'hi'])
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].note).toBe('n')
  })

  it('reads unquoted detail values', () => {
    const { graph } = ok(
      parseDagitty('a [pos="0,0",gc.var_type=continuous,gc.unit=kg]'),
    )
    expect(graph.nodes[0]).toMatchObject({ varType: 'continuous', unit: 'kg' })
  })

  it('treats empty and whitespace-only values as absent', () => {
    const { graph, warnings } = ok(
      parseDagitty(
        'a [pos="0,0",gc.var_type="",gc.levels="",gc.description="  ",gc.unit=""]\nb [pos="1,0",gc.var_type]\na -> b [gc.evidence=";",gc.note=" "]',
      ),
    )
    expect(graph.nodes.map((n) => Object.keys(n).sort())).toEqual([
      ['id', 'name', 'pos', 'role'],
      ['id', 'name', 'pos', 'role'],
    ])
    expect(graph.edges[0]).toEqual({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      evidence: [],
    })
    expect(messages(warnings).some((m) => m.startsWith('Ignored'))).toBe(false)
  })

  it('warns about unknown gc.* keys and about details in the wrong place', () => {
    const { warnings } = ok(
      parseDagitty(
        'dag {\na [pos="0,0",gc.foo="1"]\nb [pos="1,0",gc.note="n"]\na -> b [gc.unit="g"]\n}',
      ),
    )
    expect(warnings.filter((w) => w.message.startsWith('Ignored'))).toEqual([
      {
        message:
          'Ignored dagitty attribute "gc.foo" (not used by GraphCreator).',
        line: 2,
      },
      {
        message:
          'Ignored dagitty attribute "gc.note" (not used by GraphCreator).',
        line: 3,
      },
      {
        message:
          'Ignored dagitty attribute "gc.unit" (not used by GraphCreator).',
        line: 4,
      },
    ])
  })

  it('rejects an unknown gc.var_type with its line', () => {
    expect(
      errors(
        parseDagitty(
          'dag {\na [pos="0,0"]\nb [pos="1,0",gc.var_type="number"]\n}',
        ),
      ),
    ).toEqual([
      {
        message:
          'Line 3: gc.var_type must be one of categorical, ordinal, continuous, discrete.',
        line: 3,
      },
    ])
  })

  it("gives validateGraph's errors for levels and units on the wrong type", () => {
    expect(
      messages(
        errors(
          parseDagitty(
            'a [pos="0,0",gc.var_type="continuous",gc.levels="low;high"]\nb [pos="1,0",gc.unit="g"]',
          ),
        ),
      ),
    ).toEqual([
      'Node "a" has levels, but only categorical and ordinal variables can have levels.',
      'Node "b" has a unit, but only continuous and discrete variables can have a unit.',
    ])
  })

  it("gives validateGraph's warnings for typed nodes", () => {
    const { warnings } = ok(
      parseDagitty(
        'a [pos="0,0",gc.var_type="ordinal",gc.levels="x;x"]\nb [pos="1,0",gc.var_type="categorical",gc.levels="y"]',
      ),
    )
    expect(messages(warnings)).toEqual([
      'Node "a" has duplicate levels ("x").',
      'Node "b" is categorical but has fewer than two levels.',
    ])
  })

  it('round-trips the 4.1 graph to the same YAML', () => {
    const g = smokingGraph()
    const { graph } = ok(parseDagitty(toDagitty(g, { details: true })))
    expect(toYaml(graph)).toBe(toYaml(unnamed(g)))
  })

  it('round-trips every valid fixture to the same YAML', () => {
    const names = Object.keys(validFixtures)
    expect(names.length).toBeGreaterThanOrEqual(20)
    for (const name of names) {
      const text = validFixtures[name]
      const g = ok(
        name.endsWith('.yaml') ? parseYaml(text) : parseDagitty(text),
      ).graph
      const { graph } = ok(parseDagitty(toDagitty(g, { details: true })))
      expect(toYaml(graph), name).toBe(toYaml(unnamed(g)))
      graph.nodes.forEach((n, i) => {
        expect(Math.abs(n.pos.x - g.nodes[i].pos.x)).toBeLessThanOrEqual(0.1)
        expect(Math.abs(n.pos.y - g.nodes[i].pos.y)).toBeLessThanOrEqual(0.1)
      })
    }
  })
})
