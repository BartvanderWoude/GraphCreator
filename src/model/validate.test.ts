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
  extra: Partial<GEdge> = {},
): GEdge {
  return { id, source, target, evidence: [], ...extra }
}

const cat = (...levels: string[]): Partial<GNode> => ({
  varType: 'categorical',
  levels,
})

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

  it('sets nodeId on node-specific warnings', () => {
    const g: Graph = {
      nodes: [
        node('n1', { name: 'SES', varType: undefined }),
        node('n2', { name: 'Smoking', varType: 'categorical' }),
        node('n3', { name: 'Edu', varType: 'ordinal', levels: ['a', 'a'] }),
      ],
      edges: [],
    }
    expect(validateGraph(g).warnings.map((w) => w.nodeId)).toEqual([
      'n1',
      'n2',
      'n3',
    ])
  })
})

describe('validateGraph: simulation details (spec 4.16)', () => {
  // The 4.16 file example as an in-memory graph.
  const example: Graph = {
    name: 'Surgical site infection',
    nodes: [
      node('n1', {
        name: 'Diabetes',
        ...cat('no', 'yes'),
        shares: [0.88, 0.12],
      }),
      node('n2', {
        name: 'Wound class',
        ...cat('clean', 'clean-contaminated', 'contaminated'),
        shares: [0.6, 0.3, 0.1],
        form: 'threshold',
      }),
      node('n3', {
        name: 'SSI',
        role: 'outcome',
        ...cat('no', 'yes'),
        shares: [0.92, 0.08],
        form: 'linear',
      }),
    ],
    edges: [
      edge('n1', 'n3', 'e1', { sign: 'positive', strength: 'medium' }),
      edge('n1', 'n2', 'e2', {
        sign: { clean: 'negative', contaminated: 'positive' },
        strength: 'small',
      }),
      edge('n2', 'n3', 'e3', {
        sign: { 'clean-contaminated': 'positive', contaminated: 'positive' },
        strength: 'large',
      }),
    ],
  }

  it('reports nothing for the fully specified 4.16 example', () => {
    expect(validateGraph(example)).toEqual({ errors: [], warnings: [] })
  })

  it('allows shares on ordinal nodes and strength alone on any edge', () => {
    const g: Graph = {
      nodes: [
        node('A', {
          varType: 'ordinal',
          levels: ['low', 'mid', 'high'],
          shares: [0.2, 0.5, 0.3],
        }),
        node('B', cat('x', 'y', 'z')),
        node('C', cat('p', 'q', 'r')),
      ],
      edges: [
        edge('A', 'B', 'e1', { sign: { y: 'positive' } }),
        edge('B', 'C', 'e2', { strength: 'large' }),
      ],
    }
    expect(validateGraph(g)).toEqual({ errors: [], warnings: [] })
  })

  describe('share errors', () => {
    it('reports shares on a node without a leveled type or without levels', () => {
      const g: Graph = {
        nodes: [
          node('A', { shares: [1] }),
          node('B', { varType: undefined, shares: [1] }),
          node('C', { varType: 'categorical', shares: [1] }),
          node('D', { varType: 'ordinal', levels: [], shares: [] }),
        ],
        edges: [],
      }
      expect(messages(validateGraph(g).errors)).toEqual([
        'Node "A" has shares, but only categorical and ordinal variables with levels can have shares.',
        'Node "B" has shares, but only categorical and ordinal variables with levels can have shares.',
        'Node "C" has shares, but only categorical and ordinal variables with levels can have shares.',
        'Node "D" has shares, but only categorical and ordinal variables with levels can have shares.',
      ])
    })

    it('reports a share count that does not match the levels', () => {
      const g: Graph = {
        nodes: [
          node('SES', { ...cat('low', 'mid', 'high'), shares: [0.5, 0.5] }),
          node('B', { ...cat('no', 'yes'), shares: [1] }),
          node('C', { ...cat('only'), shares: [0.5, 0.5] }),
        ],
        edges: [],
      }
      expect(messages(validateGraph(g).errors)).toEqual([
        'Node "SES" has 2 shares for 3 levels.',
        'Node "B" has 1 share for 2 levels.',
        'Node "C" has 2 shares for 1 level.',
      ])
    })

    it('reports negative and non-finite shares once per node', () => {
      const g: Graph = {
        nodes: [
          node('A', { ...cat('x', 'y', 'z'), shares: [-0.1, -0.2, 1.3] }),
          node('B', { ...cat('x', 'y'), shares: [Number.NaN, 1] }),
          node('C', { ...cat('x', 'y'), shares: [Infinity, 0] }),
          node('D', { ...cat('x', 'y'), shares: [-0, 1] }),
        ],
        edges: [],
      }
      const result = validateGraph(g)
      expect(messages(result.errors)).toEqual([
        'Node "A" has a negative share.',
        'Node "B" has a negative share.',
        'Node "C" has a negative share.',
      ])
      // The total of non-finite shares is not reported.
      expect(result.warnings).toEqual([])
    })

    it('puts the share errors after the unit error, in node order', () => {
      const g: Graph = {
        nodes: [
          node('A', {
            varType: 'ordinal',
            levels: ['x', 'y'],
            unit: 'g',
            shares: [-1, 1, 1],
          }),
          node('B', { levels: ['x'], shares: [1] }),
          node('C', { name: 'A' }),
        ],
        edges: [edge('A', 'A')],
      }
      expect(messages(validateGraph(g).errors)).toEqual([
        'Node "A" has a unit, but only continuous and discrete variables can have a unit.',
        'Node "A" has 3 shares for 2 levels.',
        'Node "A" has a negative share.',
        'Node "B" has levels, but only categorical and ordinal variables can have levels.',
        'Node "B" has shares, but only categorical and ordinal variables with levels can have shares.',
        'Node name "A" is used more than once.',
        'Node "A" points to itself.',
      ])
    })

    it('sets neither nodeId nor edgeId on share errors', () => {
      const g: Graph = { nodes: [node('A', { shares: [1] })], edges: [] }
      expect(validateGraph(g).errors).toEqual([
        {
          message:
            'Node "A" has shares, but only categorical and ordinal variables with levels can have shares.',
        },
      ])
    })
  })

  describe('node warnings', () => {
    it('warns when the shares do not add up to 1 within 0.001', () => {
      const g: Graph = {
        nodes: [
          node('n1', {
            name: 'SES',
            ...cat('a', 'b', 'c'),
            shares: [0.5, 0.3, 0.1],
          }),
          node('n2', { name: 'B', ...cat('a', 'b'), shares: [0.5, 0.495] }),
          node('n3', { name: 'C', ...cat('a', 'b'), shares: [0.5, 0.5009] }),
          node('n4', { name: 'D', ...cat('a', 'b'), shares: [0.5, 0.4991] }),
          node('n5', { name: 'E', ...cat('a', 'b'), shares: [0.75, 0.75] }),
          node('n6', { name: 'F', ...cat('a', 'b'), shares: [0, 0] }),
          node('n7', {
            name: 'G',
            ...cat('a', 'b', 'c'),
            shares: [0.3333, 0.3333, 0.3334],
          }),
          node('n8', { name: 'H', ...cat('a', 'b'), shares: [0.5, 0.5012] }),
        ],
        edges: [],
      }
      expect(validateGraph(g).warnings).toEqual([
        {
          message: 'The shares of "SES" add up to 90%, not 100%.',
          nodeId: 'n1',
        },
        {
          message: 'The shares of "B" add up to 99.5%, not 100%.',
          nodeId: 'n2',
        },
        {
          message: 'The shares of "E" add up to 150%, not 100%.',
          nodeId: 'n5',
        },
        { message: 'The shares of "F" add up to 0%, not 100%.', nodeId: 'n6' },
        {
          message: 'The shares of "H" add up to 100.1%, not 100%.',
          nodeId: 'n8',
        },
      ])
    })

    it('warns about a form on a node without causes', () => {
      const g: Graph = {
        nodes: [
          node('n1', { name: 'Age', form: 'linear' }),
          node('n2', { name: 'BMI', form: 'smooth' }),
          node('n3', { name: 'Loop', form: 'threshold' }),
          node('n4', { name: 'Orphan', form: 'threshold' }),
        ],
        edges: [edge('n1', 'n2'), edge('n3', 'n3'), edge('gone', 'n4')],
      }
      expect(validateGraph(g).warnings).toEqual([
        {
          message: 'Node "Age" has a functional form but no causes.',
          nodeId: 'n1',
        },
        {
          message: 'Node "Loop" has a functional form but no causes.',
          nodeId: 'n3',
        },
        {
          message: 'Node "Orphan" has a functional form but no causes.',
          nodeId: 'n4',
        },
      ])
    })

    it('puts node warnings after the existing ones, shares before form', () => {
      const g: Graph = {
        nodes: [
          node('n1', {
            name: 'A',
            ...cat('x', 'y'),
            shares: [0.2, 0.2],
            form: 'linear',
          }),
          node('n2', { name: 'B', varType: undefined, form: 'smooth' }),
          node('n3', {
            name: 'C',
            varType: 'ordinal',
            levels: ['x'],
            shares: [0.5],
          }),
        ],
        edges: [],
      }
      expect(validateGraph(g).warnings).toEqual([
        { message: 'Node "B" has no variable type.', nodeId: 'n2' },
        {
          message: 'Node "C" is ordinal but has fewer than two levels.',
          nodeId: 'n3',
        },
        { message: 'The shares of "A" add up to 40%, not 100%.', nodeId: 'n1' },
        {
          message: 'Node "A" has a functional form but no causes.',
          nodeId: 'n1',
        },
        {
          message: 'Node "B" has a functional form but no causes.',
          nodeId: 'n2',
        },
        { message: 'The shares of "C" add up to 50%, not 100%.', nodeId: 'n3' },
      ])
    })
  })

  describe('edge warnings', () => {
    // A and B are nominal (categorical with three levels); Y and Z are binary; O is ordinal.
    const nodes = [
      node('A', cat('a1', 'a2', 'a3')),
      node('B', cat('O', 'b2', 'b3')),
      node('Y', cat('no', 'yes')),
      node('Z', cat('no', 'yes')),
      node('O', { varType: 'ordinal', levels: ['low', 'mid', 'high'] }),
    ]
    const warningsFor = (...edges: GEdge[]) =>
      validateGraph({ nodes, edges }).warnings

    it('warns about any sign on an edge between two nominal nodes', () => {
      expect(
        warningsFor(
          edge('A', 'B', 'e1', { sign: 'positive', strength: 'small' }),
          edge('B', 'A', 'e2', { sign: { a2: 'negative' } }),
          edge('A', 'B', 'e3', { strength: 'large' }),
        ),
      ).toEqual([
        {
          message:
            'The edge from "A" to "B" has a sign, but "A" and "B" are both categorical with more than two levels, so a sign has no clear meaning.',
          edgeId: 'e1',
        },
        {
          message:
            'The edge from "B" to "A" has a sign, but "B" and "A" are both categorical with more than two levels, so a sign has no clear meaning.',
          edgeId: 'e2',
        },
      ])
    })

    it('warns about one sign on an edge with a nominal end, naming that end', () => {
      expect(
        warningsFor(
          edge('Y', 'A', 'e1', { sign: 'positive' }),
          edge('B', 'Z', 'e2', { sign: 'negative' }),
        ),
      ).toEqual([
        {
          message:
            'The edge from "Y" to "A" has one sign, but "A" is categorical with more than two levels. Give a sign per level instead.',
          edgeId: 'e1',
        },
        {
          message:
            'The edge from "B" to "Z" has one sign, but "B" is categorical with more than two levels. Give a sign per level instead.',
          edgeId: 'e2',
        },
      ])
    })

    it('warns about a sign per level on an edge without a nominal end', () => {
      expect(
        warningsFor(
          edge('Y', 'Z', 'e1', { sign: { yes: 'positive' } }),
          edge('Y', 'O', 'e2', {
            sign: { high: 'negative', nope: 'positive' },
          }),
          edge('O', 'Z', 'e3', { sign: 'positive' }),
        ),
      ).toEqual([
        {
          message:
            'The edge from "Y" to "Z" has a sign per level, but neither "Y" nor "Z" is categorical with more than two levels. Give one sign instead.',
          edgeId: 'e1',
        },
        {
          message:
            'The edge from "Y" to "O" has a sign per level, but neither "Y" nor "O" is categorical with more than two levels. Give one sign instead.',
          edgeId: 'e2',
        },
      ])
    })

    it('warns once per map key that is not a level of the nominal end', () => {
      expect(
        warningsFor(
          edge('Y', 'A', 'e1', {
            sign: { X: 'positive', a1: 'negative', W: 'negative' },
          }),
          edge('A', 'Z', 'e2', { sign: { a2: 'positive', A3: 'negative' } }),
        ),
      ).toEqual([
        {
          message:
            'The edge from "Y" to "A" has a sign for level "X", but "A" has no such level.',
          edgeId: 'e1',
        },
        {
          message:
            'The edge from "Y" to "A" has a sign for level "W", but "A" has no such level.',
          edgeId: 'e1',
        },
        {
          message:
            'The edge from "A" to "Z" has a sign for level "A3", but "A" has no such level.',
          edgeId: 'e2',
        },
      ])
    })

    it('warns about a sign for the reference level of a nominal parent', () => {
      expect(
        warningsFor(
          edge('B', 'Y', 'e1', {
            sign: { O: 'positive', b2: 'negative', nope: 'positive' },
          }),
          // On a child-levels edge the first level is an ordinary level.
          edge('Z', 'B', 'e2', { sign: { O: 'positive', b2: 'negative' } }),
        ),
      ).toEqual([
        {
          message:
            'The edge from "B" to "Y" has a sign for level "nope", but "B" has no such level.',
          edgeId: 'e1',
        },
        {
          message:
            'The edge from "B" to "Y" has a sign for "O", but "O" is the reference level of "B" and cannot have a sign.',
          edgeId: 'e1',
        },
      ])
    })

    it('warns when a child-levels map raises or lowers every child level', () => {
      expect(
        warningsFor(
          edge('Y', 'A', 'e1', {
            sign: { a1: 'positive', a2: 'positive', a3: 'positive' },
          }),
          edge('Z', 'A', 'e2', {
            sign: {
              a3: 'negative',
              a1: 'negative',
              a2: 'negative',
              extra: 'positive',
            },
          }),
          // Not every level, or not one sign: no warning.
          edge('O', 'A', 'e3', { sign: { a1: 'positive', a2: 'positive' } }),
          edge('Y', 'B', 'e4', {
            sign: { O: 'positive', b2: 'positive', b3: 'negative' },
          }),
          // Every compared parent level with one sign is fine.
          edge('A', 'Z', 'e5', { sign: { a2: 'positive', a3: 'positive' } }),
        ),
      ).toEqual([
        {
          message:
            'The edge from "Y" to "A" makes every level of "A" more likely, but their chances add up to 100%, so at least one must become less likely.',
          edgeId: 'e1',
        },
        {
          message:
            'The edge from "Z" to "A" has a sign for level "extra", but "A" has no such level.',
          edgeId: 'e2',
        },
        {
          message:
            'The edge from "Z" to "A" makes every level of "A" less likely, but their chances add up to 100%, so at least one must become more likely.',
          edgeId: 'e2',
        },
      ])
    })

    it('ignores signs on dangling edges and self-edges', () => {
      const result = validateGraph({
        nodes,
        edges: [
          edge('A', 'gone', 'e1', { sign: 'positive' }),
          edge('A', 'A', 'e2', { sign: 'positive' }),
        ],
      })
      expect(result.warnings).toEqual([])
    })

    it('puts edge warnings after the node warnings, in edge order', () => {
      const g: Graph = {
        nodes: [
          node('n1', { name: 'A', ...cat('a1', 'a2', 'a3'), form: 'linear' }),
          node('n2', { name: 'Y', varType: undefined }),
          node('n3', { name: 'Z', ...cat('no', 'yes'), shares: [0.5, 0.6] }),
        ],
        edges: [
          edge('n3', 'n1', 'e1', { sign: { a9: 'positive' } }),
          edge('n2', 'n3', 'e2', { sign: { yes: 'positive' } }),
        ],
      }
      expect(
        validateGraph(g).warnings.map((w) => [w.nodeId, w.edgeId]),
      ).toEqual([
        ['n2', undefined],
        ['n3', undefined],
        [undefined, 'e1'],
        [undefined, 'e2'],
      ])
    })
  })
})
