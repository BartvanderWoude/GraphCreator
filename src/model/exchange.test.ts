import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  decodeList,
  encodeList,
  ignoredAttribute,
  type ExchangeEdge,
  type ExchangeNode,
} from './exchange'
import { nodeDiameter } from './nodeSize'

const LAYOUT =
  'Some nodes had no position, so the graph was laid out automatically.'

function node(key: string, extra: Partial<ExchangeNode> = {}): ExchangeNode {
  return { key, name: key, centre: { x: 100, y: 100 }, ...extra }
}

function messages(nodes: ExchangeNode[], edges: ExchangeEdge[] = []): string[] {
  const result = buildGraph({ nodes, edges }, [])
  if (result.ok) throw new Error('Expected errors.')
  return result.errors.map((e) => e.message)
}

describe('encodeList and decodeList', () => {
  it('round-trip items with ;, \\ and spaces', () => {
    const items = ['a;b', 'c\\d', ' e f ', 'g\\;h', 'end\\']
    expect(decodeList(encodeList(items))).toEqual(items)
  })

  it('join with ; and escape inside items', () => {
    expect(encodeList(['low', 'a;b', 'c\\d'])).toBe('low;a\\;b;c\\\\d')
  })

  it('drop empty items and keep a lone trailing backslash', () => {
    expect(decodeList(';a;;b;')).toEqual(['a', 'b'])
    expect(decodeList('')).toEqual([])
    expect(decodeList('a\\')).toEqual(['a\\'])
  })
})

describe('ignoredAttribute', () => {
  it('names the format and key, with the line when known', () => {
    expect(ignoredAttribute('GML', 'weight', 4)).toEqual({
      message: 'Ignored GML attribute "weight" (not used by GraphCreator).',
      line: 4,
    })
    expect(ignoredAttribute('networkx', 'w')).toEqual({
      message: 'Ignored networkx attribute "w" (not used by GraphCreator).',
    })
  })
})

describe('buildGraph', () => {
  it('builds nodes, metadata and edges with fresh ids in file order', () => {
    const result = buildGraph(
      {
        name: ' My graph ',
        nodes: [
          node('A', {
            name: 'Age',
            role: 'exposure',
            varType: 'ordinal',
            levels: ['young', 'old'],
            description: 'In years',
          }),
          node('B', { role: 'outcome', varType: 'continuous', unit: 'g' }),
        ],
        edges: [
          {
            source: 'A',
            target: 'B',
            evidence: ['PMID:1', 'doi:x'],
            note: 'Known',
          },
        ],
      },
      [],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const g = result.value
    expect(g.name).toBe('My graph')
    expect(g.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(g.nodes[0]).toMatchObject({
      name: 'Age',
      role: 'exposure',
      varType: 'ordinal',
      levels: ['young', 'old'],
      description: 'In years',
    })
    expect(g.nodes[1]).toMatchObject({ role: 'outcome', unit: 'g' })
    expect(g.edges).toEqual([
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        evidence: ['PMID:1', 'doi:x'],
        note: 'Known',
      },
    ])
  })

  it('gives every field-type error at once, with the exact messages', () => {
    expect(
      messages([
        node('S', {
          name: 'SES',
          role: 'boss',
          varType: 'nominal',
          levels: [{}],
          description: true,
          unit: [],
        }),
      ]),
    ).toEqual([
      'Node "SES": role must be one of exposure, outcome, latent, adjusted, selected, other.',
      'Node "SES": var_type must be one of categorical, ordinal, continuous, discrete.',
      'Node "SES": levels must be a list of text.',
      'Node "SES": description must be text.',
      'Node "SES": unit must be text.',
    ])
  })

  it('turns numbers into text, one text into a list, and blank text into nothing', () => {
    const result = buildGraph(
      {
        nodes: [
          node('A', {
            varType: 'categorical',
            levels: 'only',
            description: '   ',
          }),
          node('B', { varType: 'ordinal', levels: [1, 2, 3], unit: '' }),
        ],
        edges: [{ source: 'A', target: 'B', evidence: 42, note: 7 }],
      },
      [],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.nodes[0].levels).toEqual(['only'])
    expect(result.value.nodes[0].description).toBeUndefined()
    expect(result.value.nodes[1].levels).toEqual(['1', '2', '3'])
    expect(result.value.nodes[1].unit).toBeUndefined()
    expect(result.value.edges[0]).toMatchObject({
      evidence: ['42'],
      note: '7',
    })
  })

  it('merges duplicate edges, keeping the first edge’s evidence and note', () => {
    const result = buildGraph(
      {
        nodes: [node('A'), node('B')],
        edges: [
          { source: 'A', target: 'B', evidence: ['first'] },
          { source: 'A', target: 'B', evidence: ['second'], note: 'x' },
        ],
      },
      [],
    )
    expect(result.ok && result.value.edges).toEqual([
      { id: 'e1', source: 'n1', target: 'n2', evidence: ['first'] },
    ])
  })

  it('reports an edge to a missing node and a repeated node id', () => {
    const result = buildGraph(
      {
        nodes: [node('A'), node('A', { name: 'Other', line: 7 })],
        edges: [{ source: 'A', target: 'Z', line: 9 }],
      },
      [],
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      { message: 'Two nodes have the id "A".', line: 7 },
      {
        message:
          'The edge from "A" to "Z" refers to "Z", but there is no node with that id.',
        line: 9,
      },
    ])
  })

  it('places each circle on its centre', () => {
    const result = buildGraph(
      { nodes: [node('SES', { centre: { x: 182, y: -88 } })], edges: [] },
      [],
    )
    const d = nodeDiameter('SES')
    expect(result.ok && result.value.nodes[0].pos).toEqual({
      x: 182 - d / 2,
      y: -88 - d / 2,
    })
  })

  it('lays the graph out and warns when a centre is missing, after the parser’s warnings', () => {
    const own = {
      message: 'Ignored DOT attribute "w" (not used by GraphCreator).',
    }
    const result = buildGraph(
      {
        nodes: [
          node('A', { varType: 'continuous' }),
          { key: 'B', name: 'B', varType: 'continuous' },
        ],
        edges: [{ source: 'A', target: 'B' }],
      },
      [own],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([own, { message: LAYOUT }])
    const [a, b] = result.value.nodes
    expect(a.pos.x).toBeLessThan(b.pos.x)
  })

  it('adds validateGraph warnings for untyped nodes', () => {
    const result = buildGraph({ nodes: [node('A')], edges: [] }, [])
    expect(result.ok && result.warnings.length).toBe(1)
  })

  it('passes cycles, self-edges and misplaced levels through validateGraph', () => {
    const errors = messages(
      [
        node('A', { varType: 'continuous', levels: ['x'] }),
        node('B'),
        node('C'),
      ],
      [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
        { source: 'C', target: 'C' },
      ],
    )
    expect(errors).toContain(
      'Node "A" has levels, but only categorical and ordinal variables can have levels.',
    )
    expect(errors.some((m) => m.includes('cycle'))).toBe(true)
    expect(errors.some((m) => m.includes('itself'))).toBe(true)
  })
})
