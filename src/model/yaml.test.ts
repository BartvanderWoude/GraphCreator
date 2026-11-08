import { describe, expect, it } from 'vitest'
import type { Graph } from './graph'
import type { Issue, Result } from './result'
import { fileSlug, parseYaml, toYaml } from './yaml'

const fixtures: Record<string, string> = import.meta.glob(
  './__fixtures__/*.dag.yaml',
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

describe('parseYaml', () => {
  it('reads the spec example', () => {
    const { value: g, warnings } = ok(parseYaml(fixture('smoking.dag.yaml')))
    expect(g.name).toBe('Smoking and birth weight')
    expect(g.nodes.map((n) => n.name)).toEqual([
      'Maternal smoking',
      'Birth weight',
      'SES',
      'Genetic factors',
    ])
    expect(g.nodes[0]).toEqual({
      id: 'n1',
      name: 'Maternal smoking',
      role: 'exposure',
      varType: 'categorical',
      levels: ['never', 'former', 'current'],
      description: 'Self-reported during pregnancy',
      pos: { x: 0, y: 0 },
    })
    expect(g.nodes[1]).toMatchObject({ unit: 'g', pos: { x: 300, y: 0 } })
    expect(g.nodes[2].role).toBe('other')
    expect(g.edges).toHaveLength(4)
    expect(g.edges[0]).toEqual({
      id: 'e1',
      source: 'n3',
      target: 'n1',
      evidence: ['PMID:123', 'doi:10.1000/xyz'],
      note: 'Well established',
    })
    expect(g.edges[1]).toEqual({
      id: 'e2',
      source: 'n1',
      target: 'n2',
      evidence: [],
    })
    expect(messages(warnings)).toEqual([
      'Node "Genetic factors" has no variable type.',
    ])
    expect(warnings[0].nodeId).toBe('n4')
  })

  it('applies defaults to a minimal file', () => {
    const { value: g, warnings } = ok(parseYaml(fixture('minimal.dag.yaml')))
    expect(g).toEqual({ nodes: [], edges: [] })
    expect(warnings).toEqual([])
  })

  it('defaults a missing role to other and drops empty optional text', () => {
    const { value: g } = ok(
      parseYaml(
        'schema: graphcreator/0.1\nname: ""\nnodes:\n  - name: " A "\n    var_type: continuous\n    description: ""\n    pos: [1, 2]\n',
      ),
    )
    expect(g).toEqual({
      nodes: [
        {
          id: 'n1',
          name: 'A',
          role: 'other',
          varType: 'continuous',
          pos: { x: 1, y: 2 },
        },
      ],
      edges: [],
    })
  })

  it('lays out the graph when a position is missing', () => {
    const r = ok(
      parseYaml(
        'schema: graphcreator/0.1\nnodes:\n  - name: A\n    var_type: continuous\n    pos: [500, 500]\n  - name: B\n    var_type: continuous\nedges:\n  - from: A\n    to: B\n',
      ),
    )
    expect(messages(r.warnings)).toEqual([
      'Some nodes had no position, so the graph was laid out automatically.',
    ])
    const [a, b] = r.value.nodes
    expect(Number.isInteger(a.pos.x) && Number.isInteger(b.pos.y)).toBe(true)
    expect(a.pos.x).toBeLessThan(b.pos.x)
    expect(a.pos).not.toEqual({ x: 500, y: 500 })
  })

  it('does not lay out when every node has a position', () => {
    const r = ok(parseYaml(fixture('smoking.dag.yaml')))
    expect(messages(r.warnings)).not.toContain(
      'Some nodes had no position, so the graph was laid out automatically.',
    )
  })

  it('reports YAML syntax errors with a line number', () => {
    const errs = errors(
      parseYaml('schema: graphcreator/0.1\nnodes: [a, b\nx: y: z\n'),
    )
    expect(errs.length).toBeGreaterThan(0)
    expect(errs[0].message).toMatch(/^The file is not valid YAML: .+\.$/)
    expect(errs[0].line).toBeGreaterThanOrEqual(2)
  })

  it('reports duplicate keys as syntax errors', () => {
    const errs = errors(
      parseYaml('schema: graphcreator/0.1\nname: a\nname: b\n'),
    )
    expect(errs[0].line).toBe(3)
  })

  it('rejects a file without a schema line', () => {
    for (const text of ['', 'name: x\n', '- a\n- b\n', 'just text\n']) {
      expect(messages(errors(parseYaml(text)))).toEqual([
        'This file has no "schema" line, so it is not a GraphCreator file.',
      ])
    }
  })

  it('rejects an unknown schema', () => {
    const errs = errors(parseYaml(fixture('bad-schema.dag.yaml')))
    expect(errs).toEqual([
      {
        message:
          'This file uses format "graphcreator/9.9", which this version of GraphCreator cannot read.',
        path: 'schema',
        line: 1,
      },
    ])
  })

  it('lists every unknown key and shape problem at once', () => {
    const errs = errors(parseYaml(fixture('unknown-key.dag.yaml')))
    expect(errs).toEqual(
      expect.arrayContaining([
        {
          message: 'Unknown field "nodse" at top level.',
          path: 'nodse',
          line: 2,
        },
        {
          message:
            'Node "SES": var_type must be one of categorical, ordinal, continuous, discrete.',
          path: 'nodes.0.var_type',
          line: 6,
        },
        {
          message: 'Node "SES": unknown field "colour".',
          path: 'nodes.0.colour',
          line: 7,
        },
        { message: 'Node 2: name is missing.', path: 'nodes.1.name', line: 8 },
        {
          message: 'Edge from "SES" to "A": unknown field "weight".',
          path: 'edges.0.weight',
          line: 12,
        },
      ]),
    )
    expect(errs).toHaveLength(5)
  })

  it('describes type problems in plain words', () => {
    const errs = errors(
      parseYaml(
        'schema: graphcreator/0.1\nname: 3\nnodes:\n  - name: A\n    levels: [a, 4]\n    pos: [1]\n  - 7\nedges: {}\n',
      ),
    )
    expect(messages(errs)).toEqual(
      expect.arrayContaining([
        'Name must be text.',
        'Node "A": item 2 of levels must be text.',
        'Node "A": pos must be a list of two numbers, like [0, 0].',
        'Node 2 must be a map of fields.',
        'Edges must be a list.',
      ]),
    )
  })

  it('collects all semantic problems of bad-refs', () => {
    expect(messages(errors(parseYaml(fixture('bad-refs.dag.yaml'))))).toEqual([
      'Node name "Age" is used more than once.',
      'A node has no name.',
      'Node "Smoking" points to itself.',
      'The edge from "Age" to "Smoking" appears more than once.',
      'The edge from "Age" to "Smokng" refers to "Smokng", but there is no node with that name.',
    ])
  })

  it('gives the missing name a path and line', () => {
    const missing = errors(parseYaml(fixture('bad-refs.dag.yaml'))).at(-1)!
    expect(missing.path).toBe('edges.0.to')
    expect(missing.line).toBe(18)
  })

  it('reports a cycle with its path', () => {
    expect(messages(errors(parseYaml(fixture('cycle.dag.yaml'))))).toEqual([
      'The graph has a cycle: A → B → C → A.',
    ])
  })

  it('reports levels and units on the wrong types', () => {
    expect(
      messages(errors(parseYaml(fixture('levels-on-continuous.dag.yaml')))),
    ).toEqual([
      'Node "Birth weight" has levels, but only categorical and ordinal variables can have levels.',
      'Node "SES" has a unit, but only continuous and discrete variables can have a unit.',
      'Node "Genetic factors" has levels, but only categorical and ordinal variables can have levels.',
    ])
  })
})

describe('toYaml', () => {
  it('round-trips the canonical spec example exactly', () => {
    const text = fixture('smoking.dag.yaml')
    expect(toYaml(ok(parseYaml(text)).value)).toBe(text)
  })

  it('round-trips the minimal file', () => {
    const g = ok(parseYaml(fixture('minimal.dag.yaml'))).value
    expect(toYaml(g)).toBe('schema: graphcreator/0.1\nnodes: []\nedges: []\n')
  })

  it('omits defaults, rounds positions and quotes awkward strings', () => {
    const g: Graph = {
      nodes: [
        {
          id: 'a',
          name: '1',
          role: 'other',
          pos: { x: 10.6, y: -0.2 },
        },
        {
          id: 'b',
          name: 'Age: years',
          role: 'adjusted',
          varType: 'discrete',
          unit: 'years',
          pos: { x: 0, y: 0 },
        },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', evidence: [] }],
    }
    const text = toYaml(g)
    expect(text).toBe(
      [
        'schema: graphcreator/0.1',
        'nodes:',
        '  - name: "1"',
        '    pos: [11, 0]',
        '  - name: "Age: years"',
        '    role: adjusted',
        '    var_type: discrete',
        '    unit: years',
        '    pos: [0, 0]',
        'edges:',
        '  - from: "1"',
        '    to: "Age: years"',
        '',
      ].join('\n'),
    )
    const back = ok(parseYaml(text)).value
    expect(back.nodes.map((n) => n.name)).toEqual(['1', 'Age: years'])
    expect(back.edges).toHaveLength(1)
  })

  it('keeps long and multi-line text intact', () => {
    const description = `${'word '.repeat(40).trim()}\nsecond line`
    const g: Graph = {
      name: 'Long',
      nodes: [
        {
          id: 'n1',
          name: 'A',
          role: 'other',
          varType: 'continuous',
          description,
          pos: { x: 0, y: 0 },
        },
      ],
      edges: [],
    }
    const back = ok(parseYaml(toYaml(g))).value
    expect(back).toEqual(g)
    expect(toYaml(back)).toBe(toYaml(g))
  })
})

describe('fileSlug', () => {
  it.each([
    ['Smoking & BW', 'smoking-bw'],
    ['Smoking and birth weight', 'smoking-and-birth-weight'],
    ['  --Ünïcode!!  ', 'n-code'],
    ['', 'graph'],
    ['***', 'graph'],
    [undefined, 'graph'],
  ])('%j → %s', (name, slug) => {
    expect(fileSlug(name)).toBe(slug)
  })
})
