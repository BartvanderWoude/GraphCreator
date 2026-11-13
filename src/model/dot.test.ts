import { describe, expect, it } from 'vitest'
import { parseDagitty } from './dagitty'
import { parseDot, toDot } from './dot'
import type { Graph } from './graph'
import { nodeDiameter } from './nodeSize'
import type { Issue, Result } from './result'
import { parseYaml, toYaml } from './yaml'

const fixtures: Record<string, string> = import.meta.glob(
  [
    './__fixtures__/*.{dag.yaml,dagitty.txt}',
    './__fixtures__/analysis/*.dagitty.txt',
  ],
  { query: '?raw', import: 'default', eager: true },
)

function fixture(name: string): string {
  const text = fixtures[`./__fixtures__/${name}`]
  if (text === undefined) throw new Error(`No fixture ${name}.`)
  return text
}

const messages = (issues: Issue[]) => issues.map((i) => i.message)

function ok(result: Result<Graph>) {
  if (!result.ok) throw new Error(messages(result.errors).join('\n'))
  return result
}

function errors(result: Result<Graph>): Issue[] {
  if (result.ok) throw new Error('Expected parsing to fail.')
  return result.errors
}

const LAYOUT =
  'Some nodes had no position, so the graph was laid out automatically.'

const names = (g: Graph) => g.nodes.map((n) => n.name)
const edgePairs = (g: Graph) => {
  const name = new Map(g.nodes.map((n) => [n.id, n.name]))
  return g.edges.map((e) => `${name.get(e.source)}->${name.get(e.target)}`)
}

const EXAMPLE = `digraph "Smoking and birth weight" {
  node [shape=circle, style=filled, fontname="Helvetica"]
  edge [color="#64748b"]
  Maternal_smoking [label="Maternal smoking", gc_role="exposure", gc_var_type="categorical", gc_levels="never;former;current", gc_description="Self-reported during pregnancy", pos="31.5,-31.5!", fillcolor="#e3f1e8", color="#4a946a", fontcolor="#24563a"]
  Birth_weight [label="Birth weight", gc_role="outcome", gc_var_type="continuous", gc_unit="g", pos="252,-27!", fillcolor="#e2eaf8", color="#5b83cf", fontcolor="#23407a"]
  SES [gc_var_type="ordinal", gc_levels="low;mid;high", pos="136.5,66!", fillcolor="#ffffff", color="#7d8a9c", fontcolor="#0f172a"]
  Genetic_factors [label="Genetic factors", gc_role="latent", pos="141.75,-119.25!", fillcolor="#f3f4f6", color="#80868f", fontcolor="#374151"]
  SES -> Maternal_smoking [gc_evidence="PMID:123;doi:10.1000/xyz", gc_note="Well established"]
  Maternal_smoking -> Birth_weight
  SES -> Birth_weight
  Genetic_factors -> Birth_weight
}
`

/** `toYaml` with positions zeroed, so positions can be compared separately within a tolerance. */
function yamlWithoutPositions(g: Graph): string {
  return toYaml({
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, pos: { x: 0, y: 0 } })),
  })
}

function expectRoundTrip(g: Graph) {
  const back = ok(parseDot(toDot(g))).value
  expect(yamlWithoutPositions(back)).toBe(yamlWithoutPositions(g))
  back.nodes.forEach((n, i) => {
    expect(Math.abs(n.pos.x - g.nodes[i].pos.x)).toBeLessThan(0.1)
    expect(Math.abs(n.pos.y - g.nodes[i].pos.y)).toBeLessThan(0.1)
  })
}

describe('toDot', () => {
  it('writes the 4.15 example for the 4.1 graph', () => {
    const g = ok(parseYaml(fixture('smoking.dag.yaml'))).value
    expect(toDot(g)).toBe(EXAMPLE)
  })

  it('writes an unnamed, empty graph', () => {
    expect(toDot({ nodes: [], edges: [] })).toBe(
      'digraph {\n  node [shape=circle, style=filled, fontname="Helvetica"]\n  edge [color="#64748b"]\n}\n',
    )
  })

  it('escapes quotes and backslashes, quotes ids that are not plain words, never writes -0', () => {
    const d = nodeDiameter('node')
    const g: Graph = {
      name: 'Say "hi" \\ bye',
      nodes: [
        {
          id: 'n1',
          name: 'node',
          role: 'adjusted',
          pos: { x: -d / 2, y: -d / 2 },
        },
        {
          id: 'n2',
          name: '1st visit',
          role: 'selected',
          pos: { x: 0.004, y: 0 },
        },
        { id: 'n3', name: 'a.b "q"', role: 'other', pos: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', evidence: ['x;y', 'a\\b'] },
        { id: 'e2', source: 'n2', target: 'missing', evidence: [] },
      ],
    }
    const text = toDot(g)
    expect(text).toContain('digraph "Say \\"hi\\" \\\\ bye" {')
    expect(text).toContain(
      '  node_2 [label="node", gc_role="adjusted", pos="0,0!"',
    )
    expect(text).toContain(
      '  "1st_visit" [label="1st visit", gc_role="selected"',
    )
    expect(text).toContain('  "a.b__q_" [label="a.b \\"q\\"", pos=')
    expect(text).toContain(
      '  node_2 -> "1st_visit" [gc_evidence="x\\\\;y;a\\\\\\\\b"]',
    )
    expect(text).not.toContain('-0')
    expect(text).not.toContain('missing')
    expect(text.endsWith('}\n')).toBe(true)
  })

  it('writes pos as the centre in points with y up and at most two decimals', () => {
    const d = nodeDiameter('A')
    const g: Graph = {
      nodes: [
        { id: 'n1', name: 'A', role: 'other', pos: { x: 10.123, y: 20 } },
      ],
      edges: [],
    }
    const x = Math.round((10.123 + d / 2) * 0.75 * 100) / 100
    const y = -(20 + d / 2) * 0.75
    expect(toDot(g)).toContain(`pos="${x},${y}!"`)
  })
})

describe('parseDot', () => {
  it('reads the 4.15 example back to the 4.1 graph', () => {
    const result = ok(parseDot(EXAMPLE))
    expect(toYaml(result.value)).toBe(fixture('smoking.dag.yaml'))
    expect(result.warnings.map((w) => w.message)).not.toContain(LAYOUT)
    expect(
      result.warnings.filter((w) => w.message.startsWith('Ignored')),
    ).toEqual([])
  })

  it('opens a typical DoWhy string with layout', () => {
    const result = ok(parseDot('digraph { A -> B; B -> C; A -> C }'))
    expect(names(result.value)).toEqual(['A', 'B', 'C'])
    expect(edgePairs(result.value)).toEqual(['A->B', 'B->C', 'A->C'])
    expect(result.value.name).toBeUndefined()
    expect(messages(result.warnings)).toContain(LAYOUT)
  })

  it('expands groups, subgraphs and chains', () => {
    const result = ok(
      parseDot(`strict digraph G {
        A -> {B C}
        subgraph cluster_x { label = "ignored"; D; E -> F }
        cluster_link -> subgraph s { G H } -> I
        a -> b -> c
      }`),
    )
    expect(result.value.name).toBe('G')
    expect(names(result.value)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'cluster_link',
      'G',
      'H',
      'I',
      'a',
      'b',
      'c',
    ])
    expect(edgePairs(result.value)).toEqual([
      'A->B',
      'A->C',
      'E->F',
      'cluster_link->G',
      'cluster_link->H',
      'G->I',
      'H->I',
      'a->b',
      'b->c',
    ])
  })

  it('uses every node of a subgraph operand, including those of its edges', () => {
    const result = ok(parseDot('digraph { {A -> B} -> C }'))
    expect(edgePairs(result.value)).toEqual(['A->B', 'A->C', 'B->C'])
  })

  it('reads quoted ids, escapes, concatenation and comments', () => {
    const result = ok(
      parseDot(`# a preprocessor line
// a line comment
digraph {
  /* a block
     comment */
  "a b" -> c  // trailing
  "x" + "y" -> "say \\"hi\\" \\\\ \\n"
  "long \\
name"
}`),
    )
    expect(names(result.value)).toEqual([
      'a b',
      'c',
      'xy',
      'say "hi" \\ \\n',
      'long name',
    ])
    expect(edgePairs(result.value)).toEqual(['a b->c', 'xy->say "hi" \\ \\n'])
  })

  it('treats quoted and bare forms of one id as one node and accepts numerals', () => {
    const result = ok(parseDot('digraph { A -> "A2"; A2 -> 1; "1" -> -.5 }'))
    expect(names(result.value)).toEqual(['A', 'A2', '1', '-.5'])
  })

  it('uses label as the name, with \\N meaning the id', () => {
    const result = ok(
      parseDot(
        'digraph { a [label="Age"]; b [label="\\N"]; c [label=""]; d [label="\\\\N"]; a -> b }',
      ),
    )
    expect(names(result.value)).toEqual(['Age', 'b', 'c', '\\N'])
  })

  it('merges repeated node statements', () => {
    const result = ok(
      parseDot('digraph { A -> B; A [label="Age"]; A [gc_role="exposure"] }'),
    )
    expect(result.value.nodes[0]).toMatchObject({
      name: 'Age',
      role: 'exposure',
    })
  })

  it('reads the gc_* metadata, decoding lists', () => {
    const result = ok(
      parseDot(`digraph {
  A [gc_role="outcome", gc_var_type="categorical", gc_levels="a\\\\;b;c", gc_description="d"]
  B [gc_var_type=continuous, gc_unit=kg]
  A -> B -> C [gc_evidence="e1;e2", gc_note="n"]
}`),
    )
    const [a, b] = result.value.nodes
    expect(a).toMatchObject({
      role: 'outcome',
      varType: 'categorical',
      levels: ['a;b', 'c'],
      description: 'd',
    })
    expect(b).toMatchObject({ varType: 'continuous', unit: 'kg' })
    for (const edge of result.value.edges) {
      expect(edge).toMatchObject({ evidence: ['e1', 'e2'], note: 'n' })
    }
  })

  it('converts pos from points with y up to the top-left in px', () => {
    const result = ok(
      parseDot('digraph { A [pos="75,-150!"]; B [pos=" 1.5e1 , 30 "] }'),
    )
    const d = nodeDiameter('A')
    expect(result.value.nodes[0].pos).toEqual({
      x: 100 - d / 2,
      y: 200 - d / 2,
    })
    expect(result.value.nodes[1].pos).toEqual({ x: 20 - d / 2, y: -40 - d / 2 })
    expect(messages(result.warnings)).not.toContain(LAYOUT)
  })

  it('takes the graph label as the name when the header has none', () => {
    expect(ok(parseDot('digraph { label="My graph"; A }')).value.name).toBe(
      'My graph',
    )
    expect(ok(parseDot('digraph { graph [label="G2"] A }')).value.name).toBe(
      'G2',
    )
    expect(ok(parseDot('digraph H { label="L"; A }')).value.name).toBe('H')
    expect(
      ok(parseDot('digraph { subgraph { label="inner" } A }')).value.name,
    ).toBeUndefined()
  })

  it('reads styling keys and attribute statements silently and warns once for other keys', () => {
    const result = ok(
      parseDot(`digraph {
  graph [rankdir=LR, splines=true]
  node [shape=box, foo=1]
  edge [arrowhead=vee]
  rankdir = LR
  A [shape=circle, style=filled, color=red, fillcolor=blue, fontcolor=white, fontname=Arial, fontsize=12, width=1, height=1, fixedsize=true, penwidth=2, xlabel=x, tooltip=t]
  A -> B [weight=2, pos="1,2", arrowhead=normal, arrowsize=1, color=gray, penwidth=1]
  B -> C [weight=3, label="x"]
}`),
    )
    const ignored = result.warnings.filter((w) =>
      w.message.startsWith('Ignored'),
    )
    expect(ignored).toEqual([
      {
        message: 'Ignored DOT attribute "tooltip" (not used by GraphCreator).',
        line: 6,
      },
      {
        message: 'Ignored DOT attribute "weight" (not used by GraphCreator).',
        line: 7,
      },
      {
        message: 'Ignored DOT attribute "label" (not used by GraphCreator).',
        line: 8,
      },
    ])
  })

  it('reports buildGraph errors with the line', () => {
    const errs = errors(
      parseDot(
        'digraph {\n A [gc_role="boss"]\n B [gc_var_type=continuous, gc_levels="a"]\n B -> B\n}',
      ),
    )
    expect(errs[0]).toEqual({
      message:
        'Node "A": role must be one of exposure, outcome, latent, adjusted, selected, other.',
      line: 2,
    })
    expect(errs.length).toBeGreaterThan(2)
  })

  it('rejects undirected graphs and edges, HTML labels and ports', () => {
    const cases: [string, string][] = [
      [
        'graph {\n a -- b\n}',
        'Line 1: undirected graphs (graph { … }) are not supported. GraphCreator reads directed graphs (digraph) only.',
      ],
      [
        '// x\nstrict graph G { a }',
        'Line 2: undirected graphs (graph { … }) are not supported. GraphCreator reads directed graphs (digraph) only.',
      ],
      [
        'digraph {\n a -- b\n}',
        'Line 2: undirected edges (--) are not supported yet. GraphCreator v1 supports directed edges only.',
      ],
      [
        'digraph {\n\n a [label=<<b>A</b>>]\n}',
        'Line 3: HTML labels (<…>) are not supported.',
      ],
      ['digraph {\n a:n -> b\n}', 'Line 2: ports (a:n) are not supported.'],
    ]
    for (const [text, message] of cases) {
      expect(messages(errors(parseDot(text)))).toEqual([message])
    }
  })

  it('reports syntax errors with line numbers, stopping at the first', () => {
    const cases: [string, string][] = [
      ['digraph {\n a -> \n', 'Line 3: the text ends too early.'],
      [
        'digraph {\n a [label="x]\n}',
        'Line 2: a quoted name or value is not closed (missing ").',
      ],
      [
        'digraph {\n /* open\n}',
        'Line 2: a comment /* … */ is not closed (missing */).',
      ],
      ['digraph {\n a % b\n}', 'Line 2: "%" is not valid DOT syntax.'],
      ['digraph {\n a -> node\n}', 'Line 2: "node" is not valid here.'],
      ['digraph { a } b', 'Line 1: "b" is not valid here.'],
      ['dag { a -> b }', 'Line 1: "dag" is not valid here.'],
      [
        'digraph { a [pos="1"] }',
        'Line 1: pos="1" is not a valid position; DOT positions look like pos="31.5,-27!".',
      ],
      ['digraph { a + b }', 'Line 1: "+" is not valid here.'],
      ['digraph {\n 1st -> b }', 'Line 2: "1st" is not valid DOT syntax.'],
      ['digraph { a [label] }', 'Line 1: "]" is not valid here.'],
    ]
    for (const [text, message] of cases) {
      const errs = errors(parseDot(text))
      expect(messages(errs)).toEqual([message])
      expect(errs[0].line).toBe(Number(/^Line (\d+)/.exec(message)![1]))
    }
  })

  it('reports cycles from validateGraph', () => {
    const errs = errors(parseDot('digraph { a -> b -> c -> a }'))
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toMatch(/cycle/i)
  })
})

describe('round trip', () => {
  const valid = Object.keys(fixtures)
    .map((path) => path.replace('./__fixtures__/', ''))
    .sort()
    .filter((name) => {
      // DOT leaves the simulation details out (spec 4.16).
      if (name === 'simulation.dag.yaml') return false
      const text = fixture(name)
      const result = name.endsWith('.dag.yaml')
        ? parseYaml(text)
        : parseDagitty(text)
      return result.ok
    })

  it('covers the valid YAML and dagitty fixtures', () => {
    expect(valid).toContain('smoking.dag.yaml')
    expect(valid).toContain('quoted-names.dagitty.txt')
    expect(valid).toContain('analysis/m-bias.dagitty.txt')
    expect(valid.length).toBeGreaterThanOrEqual(15)
  })

  it.each(valid)('keeps %s', (name) => {
    const text = fixture(name)
    const g = ok(
      name.endsWith('.dag.yaml') ? parseYaml(text) : parseDagitty(text),
    ).value
    expectRoundTrip(g)
  })

  it('keeps the 4.1 graph exactly', () => {
    const g = ok(parseYaml(fixture('smoking.dag.yaml'))).value
    expect(toYaml(ok(parseDot(toDot(g))).value)).toBe(toYaml(g))
  })

  it('keeps awkward names, every role, metadata and fractional positions', () => {
    const g: Graph = {
      name: 'Odd "graph" \\ name',
      nodes: [
        {
          id: 'n1',
          name: 'node',
          role: 'exposure',
          pos: { x: 0.3, y: -12.7 },
          varType: 'ordinal',
          levels: ['a;b', 'c\\d', '"e"'],
        },
        { id: 'n2', name: 'Graph', role: 'outcome', pos: { x: 100.55, y: 3 } },
        { id: 'n3', name: '1st visit', role: 'latent', pos: { x: -50, y: 0 } },
        {
          id: 'n4',
          name: 'a.b',
          role: 'adjusted',
          pos: { x: 7, y: 7 },
          varType: 'continuous',
          unit: 'mg/l "x"',
        },
        {
          id: 'n5',
          name: 'a_b',
          role: 'selected',
          pos: { x: 8, y: 9 },
          description: 'line 1\nline 2 \\N',
        },
        { id: 'n6', name: 'Größe', role: 'other', pos: { x: 1, y: 2 } },
        { id: 'n7', name: '\\N', role: 'other', pos: { x: 3, y: 4 } },
        { id: 'n8', name: 'x -> y', role: 'other', pos: { x: 5, y: 6 } },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          evidence: ['PMID:1', 'x;y\\'],
          note: 'a "note"',
        },
        { id: 'e2', source: 'n3', target: 'n2', evidence: [] },
        { id: 'e3', source: 'n6', target: 'n7', evidence: [] },
        { id: 'e4', source: 'n8', target: 'n5', evidence: [] },
      ],
    }
    expectRoundTrip(g)
  })
})
