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

describe('simulation details (spec 4.16)', () => {
  const sim = () => ok(parseYaml(fixture('simulation.dag.yaml')))

  it('reads shares, form, sign and strength', () => {
    const { value: g } = sim()
    expect(g.nodes[0]).toEqual({
      id: 'n1',
      name: 'Diabetes',
      role: 'other',
      varType: 'categorical',
      levels: ['no', 'yes'],
      shares: [0.88, 0.12],
      pos: { x: 0, y: 0 },
    })
    expect(g.nodes[1]).toMatchObject({
      shares: [0.6, 0.3, 0.1],
      form: 'threshold',
    })
    expect(g.nodes[2].form).toBe('linear')
    expect(g.edges[0]).toEqual({
      id: 'e1',
      source: 'n1',
      target: 'n3',
      evidence: [],
      sign: 'positive',
      strength: 'medium',
    })
    expect(g.edges[1]).toMatchObject({
      sign: { clean: 'negative', contaminated: 'positive' },
      strength: 'small',
    })
    expect(g.edges[2].strength).toBe('large')
  })

  it.each(['simulation.dag.yaml', 'yaml11-names.dag.yaml', 'locked.dag.yaml'])(
    'round-trips %s canonically',
    (name) => {
      const text = fixture(name)
      expect(toYaml(ok(parseYaml(text)).value)).toBe(text)
    },
  )

  it('writes every existing fixture unchanged', () => {
    let count = 0
    for (const [path, text] of Object.entries(fixtures)) {
      // minimal.dag.yaml leaves out nodes and edges, which toYaml always writes.
      if (path.endsWith('/minimal.dag.yaml')) continue
      const result = parseYaml(text)
      if (!result.ok) continue
      expect(toYaml(result.value), path).toBe(text)
      count++
    }
    expect(count).toBeGreaterThanOrEqual(3)
  })

  it('reads an empty sign map as no sign', () => {
    const { value: g } = ok(
      parseYaml(
        'schema: graphcreator/0.1\nnodes:\n  - name: A\n    var_type: continuous\n    pos: [0, 0]\n  - name: B\n    var_type: continuous\n    pos: [1, 0]\nedges:\n  - from: A\n    to: B\n    sign: {}\n',
      ),
    )
    expect(g.edges[0]).toEqual({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      evidence: [],
    })
    expect(toYaml(g)).not.toContain('sign')
  })

  it('writes a sign map in level order, other keys after', () => {
    // Diabetes → Wound class is a child-levels edge.
    const g = sim().value
    g.edges[1].sign = {
      stray: 'positive',
      contaminated: 'positive',
      clean: 'negative',
      'clean-contaminated': 'negative',
    }
    expect(toYaml(g)).toContain(
      '    sign: {clean: negative, clean-contaminated: negative, contaminated: positive, stray: positive}\n',
    )

    const parentLevels: Graph = {
      nodes: [
        {
          id: 'a',
          name: 'A',
          role: 'other',
          varType: 'categorical',
          levels: ['O', 'B', 'AB'],
          pos: { x: 0, y: 0 },
        },
        {
          id: 'b',
          name: 'B',
          role: 'other',
          varType: 'continuous',
          pos: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e',
          source: 'a',
          target: 'b',
          evidence: [],
          sign: { AB: 'positive', B: 'negative' },
        },
      ],
    }
    expect(toYaml(parentLevels)).toContain(
      '    sign: {B: negative, AB: positive}\n',
    )
    // On a single edge there are no levels to order by: the map keeps its order.
    parentLevels.nodes[0].varType = 'ordinal'
    expect(toYaml(parentLevels)).toContain(
      '    sign: {AB: positive, B: negative}\n',
    )
  })

  it('writes keys in the order of the spec and -0 as 0', () => {
    const g: Graph = {
      nodes: [
        {
          id: 'a',
          name: 'A',
          role: 'exposure',
          varType: 'ordinal',
          levels: ['low', 'high'],
          shares: [-0, 1],
          description: 'Text',
          form: 'smooth',
          pos: { x: 0, y: 0 },
        },
        {
          id: 'b',
          name: 'B',
          role: 'other',
          varType: 'continuous',
          unit: 'kg',
          form: 'linear',
          pos: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e',
          source: 'a',
          target: 'b',
          evidence: ['PMID:1'],
          note: 'Note',
          strength: 'large',
          sign: 'negative',
        },
      ],
    }
    expect(toYaml(g)).toBe(
      [
        'schema: graphcreator/0.1',
        'nodes:',
        '  - name: A',
        '    role: exposure',
        '    var_type: ordinal',
        '    levels: [low, high]',
        '    shares: [0, 1]',
        '    description: Text',
        '    form: smooth',
        '    pos: [0, 0]',
        '  - name: B',
        '    var_type: continuous',
        '    unit: kg',
        '    form: linear',
        '    pos: [0, 0]',
        'edges:',
        '  - from: A',
        '    to: B',
        '    sign: negative',
        '    strength: large',
        '    evidence: ["PMID:1"]',
        '    note: Note',
        '',
      ].join('\n'),
    )
  })

  const base = [
    'schema: graphcreator/0.1',
    'nodes:',
    '  - name: SES',
    '    var_type: ordinal',
    '    levels: [low, mid, high]',
    '    pos: [0, 0]',
    '  - name: A',
    '    var_type: continuous',
    '    pos: [1, 0]',
    'edges:',
    '  - from: SES',
    '    to: A',
  ]
  const shares = 'Node "SES": shares must be a list of numbers.'
  const sign =
    'Edge from "SES" to "A": sign must be positive or negative, or a map from levels to positive or negative.'
  const strength =
    'Edge from "SES" to "A": strength must be one of small, medium, large.'

  it.each([
    ['shares as text', 5, '    shares: many', shares, 'nodes.0.shares'],
    [
      'text items in shares',
      5,
      '    shares: [0.2, a, b]',
      shares,
      'nodes.0.shares',
    ],
    [
      'an infinite share',
      5,
      '    shares: [.inf, 0, 0]',
      shares,
      'nodes.0.shares',
    ],
    [
      'an unknown form',
      5,
      '    form: curvy',
      'Node "SES": form must be one of linear, smooth, threshold.',
      'nodes.0.form',
    ],
    [
      'a sign word that is not a sign',
      12,
      '    sign: up',
      sign,
      'edges.0.sign',
    ],
    [
      'a sign map with a bad value',
      12,
      '    sign: {low: up}',
      sign,
      'edges.0.sign',
    ],
    ['a sign list', 12, '    sign: [positive]', sign, 'edges.0.sign'],
    [
      'an unknown strength',
      12,
      '    strength: huge',
      strength,
      'edges.0.strength',
    ],
    ['a numeric strength', 12, '    strength: 3', strength, 'edges.0.strength'],
  ])('reports %s', (_label, at, line, message, path) => {
    const lines = [...base]
    lines.splice(at, 0, line)
    expect(errors(parseYaml(`${lines.join('\n')}\n`))).toEqual([
      { message, path, line: at + 1 },
    ])
  })
})

describe('YAML 1.1 safety', () => {
  const unsafe = [
    'yes',
    'No',
    'ON',
    'off',
    'y',
    'N',
    'True',
    'FALSE',
    '~',
    'null',
    'Null',
    '1_000',
    '0x1F',
    '0o17',
    '017',
    '0b101',
    '1:30',
    '190:20:30.15',
    '1_000.5',
    '.5',
    '.inf',
    '-.Inf',
    '.NaN',
    '2024-01-31',
    '2001-12-14t21:59:43.10-05:00',
    '<<',
    '=',
  ]
  const safe = [
    'yess',
    'Yes please',
    'nO',
    'oN',
    'On time',
    'never',
    '1st visit',
    'a.b',
    '1.2.3',
    '2024-01',
    'clean-contaminated',
    'x=1',
  ]

  function graphWith(text: string): Graph {
    return {
      nodes: [
        {
          id: 'a',
          name: text,
          role: 'other',
          varType: 'categorical',
          levels: [text, 'mid', 'last'],
          description: text,
          pos: { x: 0, y: 0 },
        },
        {
          id: 'b',
          name: 'Child',
          role: 'other',
          varType: 'continuous',
          pos: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e',
          source: 'a',
          target: 'b',
          evidence: [],
          sign: { [text]: 'positive' },
          note: text,
        },
      ],
    }
  }

  it.each(unsafe)('double-quotes %j everywhere', (text) => {
    const out = toYaml(graphWith(text))
    const q = `"${text}"`
    expect(out).toContain(`  - name: ${q}\n`)
    expect(out).toContain(`    levels: [${q}, mid, last]\n`)
    expect(out).toContain(`    description: ${q}\n`)
    expect(out).toContain(`  - from: ${q}\n`)
    expect(out).toContain(`    sign: {${q}: positive}\n`)
    expect(out).toContain(`    note: ${q}\n`)
    const back = ok(parseYaml(out)).value
    expect(back.nodes[0].name).toBe(text)
    expect(back.nodes[0].levels).toEqual([text, 'mid', 'last'])
    expect(back.edges[0].sign).toEqual({ [text]: 'positive' })
  })

  it.each(safe)('leaves %j plain', (text) => {
    const out = toYaml(graphWith(text))
    expect(out).toContain(`  - name: ${text}\n`)
    expect(out).toContain(`    levels: [${text}, mid, last]\n`)
    expect(out).toContain(`    sign: {${text}: positive}\n`)
    expect(out).toContain(`    note: ${text}\n`)
  })

  it('quotes the graph name and units too', () => {
    const g: Graph = {
      name: 'Off',
      nodes: [
        {
          id: 'a',
          name: 'A',
          role: 'other',
          varType: 'continuous',
          unit: '1:30',
          pos: { x: 0, y: 0 },
        },
      ],
      edges: [],
    }
    const out = toYaml(g)
    expect(out).toContain('name: "Off"\n')
    expect(out).toContain('    unit: "1:30"\n')
  })
})

describe('the graph lock (spec 4.17)', () => {
  it('reads locked: true and writes it back after the name', () => {
    const g = ok(parseYaml(fixture('locked.dag.yaml'))).value
    expect(g.locked).toBe(true)
    const lines = toYaml(g).split('\n')
    expect(lines[1]).toBe('name: Imported study variables')
    expect(lines[2]).toBe('locked: true')
  })

  it('reads locked: false as no lock, and writes nothing for it', () => {
    const text =
      'schema: graphcreator/0.1\nlocked: false\nnodes: []\nedges: []\n'
    const g = ok(parseYaml(text)).value
    expect(g.locked).toBeUndefined()
    expect(toYaml(g)).not.toContain('locked')
  })

  it('writes nothing for an unlocked graph, so older files are unchanged', () => {
    const g = ok(parseYaml(fixture('smoking.dag.yaml'))).value
    expect(toYaml(g)).toBe(fixture('smoking.dag.yaml'))
    expect(toYaml({ ...g, locked: true })).toContain('locked: true')
  })

  it('refuses a locked value that is not a boolean', () => {
    const result = parseYaml('schema: graphcreator/0.1\nlocked: yes please\n')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.errors[0].path).toBe('locked')
  })
})
