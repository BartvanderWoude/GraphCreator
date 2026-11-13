import { describe, expect, it } from 'vitest'
import {
  addEdge,
  addNode,
  canAddEdge,
  defaultNodeName,
  emptyGraph,
  moveNode,
  newId,
  removeEdges,
  removeNodes,
  renameNode,
  updateEdge,
  updateNode,
  type Graph,
} from './graph'

/** Builds a graph with nodes A, B, C, … (ids n1, n2, …) and edges given as name pairs. */
function build(names: string[], edges: [string, string][] = []): Graph {
  let g = emptyGraph()
  for (const name of names) g = addNode(g, { pos: { x: 0, y: 0 }, name }).graph
  for (const [from, to] of edges) {
    const s = g.nodes.find((n) => n.name === from)!.id
    const t = g.nodes.find((n) => n.name === to)!.id
    const r = addEdge(g, s, t)
    if (!r.ok) throw new Error(r.errors[0].message)
    g = r.value
  }
  return g
}

const id = (g: Graph, name: string) => g.nodes.find((n) => n.name === name)!.id

describe('newId', () => {
  it('picks the smallest unused number', () => {
    expect(newId('n', [])).toBe('n1')
    expect(newId('n', ['n1', 'n3'])).toBe('n2')
    expect(newId('e', ['e1', 'e2'])).toBe('e3')
    expect(newId('e', ['n1'])).toBe('e1')
  })
})

describe('defaultNodeName', () => {
  it('picks the smallest unused "Node N"', () => {
    expect(defaultNodeName(emptyGraph())).toBe('Node 1')
    expect(defaultNodeName(build(['Node 1', 'Node 3']))).toBe('Node 2')
    expect(defaultNodeName(build(['node 1']))).toBe('Node 1')
  })
})

describe('addNode', () => {
  it('returns a new graph and leaves the input unchanged', () => {
    const g = emptyGraph()
    const { graph, node } = addNode(g, { pos: { x: 5, y: 7 } })
    expect(g.nodes).toEqual([])
    expect(graph.nodes).toEqual([node])
    expect(node).toEqual({
      id: 'n1',
      name: 'Node 1',
      role: 'other',
      pos: { x: 5, y: 7 },
    })
  })

  it('trims a given name and falls back to the default for blank names', () => {
    expect(
      addNode(emptyGraph(), { pos: { x: 0, y: 0 }, name: '  Age ' }).node.name,
    ).toBe('Age')
    expect(
      addNode(emptyGraph(), { pos: { x: 0, y: 0 }, name: '  ' }).node.name,
    ).toBe('Node 1')
  })
})

describe('renameNode', () => {
  const g = build(['Age', 'Sex'], [['Age', 'Sex']])

  it('trims and keeps edges', () => {
    const r = renameNode(g, id(g, 'Age'), '  Age at baseline ')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.nodes[0].name).toBe('Age at baseline')
    expect(r.value.edges).toEqual(g.edges)
    expect(g.nodes[0].name).toBe('Age')
  })

  it('refuses empty names', () => {
    const r = renameNode(g, id(g, 'Age'), '   ')
    expect(r).toEqual({
      ok: false,
      errors: [{ message: 'A node needs a name.' }],
    })
  })

  it('refuses duplicate names, case-sensitively', () => {
    const r = renameNode(g, id(g, 'Age'), ' Sex ')
    expect(r).toEqual({
      ok: false,
      errors: [{ message: 'There is already a node called "Sex".' }],
    })
    expect(renameNode(g, id(g, 'Age'), 'sex').ok).toBe(true)
  })

  it('allows renaming to the same name', () => {
    expect(renameNode(g, id(g, 'Age'), 'Age').ok).toBe(true)
  })
})

describe('updateNode', () => {
  const g = build(['SES'])
  const n = id(g, 'SES')

  it('sets role, type and levels', () => {
    const next = updateNode(g, n, {
      role: 'exposure',
      varType: 'ordinal',
      levels: ['low', 'high'],
    })
    expect(next.nodes[0]).toMatchObject({
      role: 'exposure',
      varType: 'ordinal',
      levels: ['low', 'high'],
    })
    expect(g.nodes[0].role).toBe('other')
  })

  it('drops levels when switching to a numeric type or untyped', () => {
    const ordinal = updateNode(g, n, {
      varType: 'ordinal',
      levels: ['low', 'high'],
    })
    expect(
      updateNode(ordinal, n, { varType: 'continuous' }).nodes[0].levels,
    ).toBeUndefined()
    const untyped = updateNode(ordinal, n, { varType: undefined }).nodes[0]
    expect(untyped.levels).toBeUndefined()
    expect('varType' in untyped).toBe(false)
  })

  it('drops the unit when switching to a leveled type or untyped', () => {
    const cont = updateNode(g, n, { varType: 'continuous', unit: 'g' })
    expect(cont.nodes[0].unit).toBe('g')
    expect(updateNode(cont, n, { varType: 'discrete' }).nodes[0].unit).toBe('g')
    expect(
      updateNode(cont, n, { varType: 'categorical' }).nodes[0].unit,
    ).toBeUndefined()
    expect(
      updateNode(cont, n, { varType: undefined }).nodes[0].unit,
    ).toBeUndefined()
  })

  it('turns empty description and unit into undefined', () => {
    const next = updateNode(g, n, {
      varType: 'continuous',
      unit: ' ',
      description: '',
    }).nodes[0]
    expect('unit' in next).toBe(false)
    expect('description' in next).toBe(false)
  })
})

describe('removeNodes', () => {
  it('removes incident edges', () => {
    const g = build(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['A', 'C'],
      ],
    )
    const next = removeNodes(g, [id(g, 'B')])
    expect(next.nodes.map((n) => n.name)).toEqual(['A', 'C'])
    expect(next.edges.map((e) => [e.source, e.target])).toEqual([
      [id(g, 'A'), id(g, 'C')],
    ])
    expect(g.nodes).toHaveLength(3)
  })
})

describe('moveNode', () => {
  it('updates the position only of that node', () => {
    const g = build(['A', 'B'])
    const next = moveNode(g, id(g, 'A'), { x: 10, y: 20 })
    expect(next.nodes[0].pos).toEqual({ x: 10, y: 20 })
    expect(next.nodes[1].pos).toEqual({ x: 0, y: 0 })
    expect(g.nodes[0].pos).toEqual({ x: 0, y: 0 })
  })
})

describe('canAddEdge', () => {
  const g = build(
    ['A', 'B', 'C'],
    [
      ['A', 'B'],
      ['B', 'C'],
    ],
  )

  it('accepts a valid edge', () => {
    expect(canAddEdge(g, id(g, 'A'), id(g, 'C'))).toEqual({ ok: true })
  })

  it('refuses self edges', () => {
    expect(canAddEdge(g, id(g, 'A'), id(g, 'A'))).toEqual({
      ok: false,
      reason: 'self',
      message: 'A node cannot point to itself.',
    })
  })

  it('refuses duplicate edges', () => {
    expect(canAddEdge(g, id(g, 'A'), id(g, 'B'))).toEqual({
      ok: false,
      reason: 'duplicate',
      message: 'This edge already exists.',
    })
  })

  it('refuses cycles and names the path', () => {
    expect(canAddEdge(g, id(g, 'C'), id(g, 'A'))).toEqual({
      ok: false,
      reason: 'cycle',
      message: 'C → A → B → C would form a cycle.',
      cycle: [id(g, 'C'), id(g, 'A'), id(g, 'B'), id(g, 'C')],
    })
    expect(canAddEdge(g, id(g, 'B'), id(g, 'A'))).toMatchObject({
      message: 'B → A → B would form a cycle.',
    })
  })

  it('throws on unknown node ids', () => {
    expect(() => canAddEdge(g, 'nope', id(g, 'A'))).toThrow()
  })
})

describe('addEdge', () => {
  it('creates an edge with empty evidence', () => {
    const g = build(['A', 'B'])
    const r = addEdge(g, id(g, 'A'), id(g, 'B'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.edges).toEqual([
      { id: 'e1', source: 'n1', target: 'n2', evidence: [] },
    ])
    expect(g.edges).toEqual([])
  })

  it('returns the check message as an error', () => {
    const g = build(['A'])
    expect(addEdge(g, id(g, 'A'), id(g, 'A'))).toEqual({
      ok: false,
      errors: [{ message: 'A node cannot point to itself.' }],
    })
  })
})

describe('updateEdge and removeEdges', () => {
  const g = build(
    ['A', 'B', 'C'],
    [
      ['A', 'B'],
      ['B', 'C'],
    ],
  )

  it('sets evidence and note, and clears an empty note', () => {
    const withNote = updateEdge(g, 'e1', {
      evidence: ['PMID:1'],
      note: 'Known',
    })
    expect(withNote.edges[0]).toMatchObject({
      evidence: ['PMID:1'],
      note: 'Known',
    })
    expect('note' in updateEdge(withNote, 'e1', { note: '  ' }).edges[0]).toBe(
      false,
    )
    expect(g.edges[0].evidence).toEqual([])
  })

  it('removes the given edges', () => {
    expect(removeEdges(g, ['e1']).edges.map((e) => e.id)).toEqual(['e2'])
  })
})

describe('simulation details in updateNode (phase 49)', () => {
  const base = updateNode(build(['A']), 'n1', {
    varType: 'categorical',
    levels: ['no', 'yes'],
    shares: [0.88, 0.12],
    form: 'threshold',
  })

  it('keeps shares and form on a leveled node, unrounded', () => {
    expect(base.nodes[0]).toMatchObject({
      levels: ['no', 'yes'],
      shares: [0.88, 0.12],
      form: 'threshold',
    })
    const odd = updateNode(base, 'n1', { shares: [0.123456, 1.5] })
    expect(odd.nodes[0].shares).toEqual([0.123456, 1.5])
  })

  it('drops shares with levels when the type has none', () => {
    for (const varType of ['continuous', 'discrete', undefined] as const) {
      const node = updateNode(base, 'n1', { varType }).nodes[0]
      expect('levels' in node).toBe(false)
      expect('shares' in node).toBe(false)
      expect(node.form).toBe('threshold')
    }
    const ordinal = updateNode(base, 'n1', { varType: 'ordinal' }).nodes[0]
    expect(ordinal.shares).toEqual([0.88, 0.12])
  })

  it('drops shares when a patch sets levels alone', () => {
    const node = updateNode(base, 'n1', { levels: ['no', 'yes', 'maybe'] })
      .nodes[0]
    expect(node.levels).toEqual(['no', 'yes', 'maybe'])
    expect('shares' in node).toBe(false)
    const removed = updateNode(base, 'n1', { levels: undefined }).nodes[0]
    expect('levels' in removed).toBe(false)
    expect('shares' in removed).toBe(false)
    const both = updateNode(base, 'n1', {
      levels: ['a', 'b', 'c'],
      shares: [0.2, 0.3, 0.5],
    }).nodes[0]
    expect(both.shares).toEqual([0.2, 0.3, 0.5])
  })

  it('removes shares and form given as undefined', () => {
    const node = updateNode(base, 'n1', { shares: undefined, form: undefined })
      .nodes[0]
    expect('shares' in node).toBe(false)
    expect('form' in node).toBe(false)
    expect(node.levels).toEqual(['no', 'yes'])
  })

  it('keeps unrelated patches from touching the details', () => {
    const node = updateNode(base, 'n1', { description: 'Self-reported' })
      .nodes[0]
    expect(node).toMatchObject({
      shares: [0.88, 0.12],
      form: 'threshold',
      description: 'Self-reported',
    })
  })
})

describe('simulation details in updateEdge (phase 49)', () => {
  const g = build(['A', 'B'], [['A', 'B']])

  it('sets and removes sign and strength', () => {
    const set = updateEdge(g, 'e1', { sign: 'negative', strength: 'large' })
    expect(set.edges[0]).toMatchObject({ sign: 'negative', strength: 'large' })
    const cleared = updateEdge(set, 'e1', {
      sign: undefined,
      strength: undefined,
    }).edges[0]
    expect('sign' in cleared).toBe(false)
    expect('strength' in cleared).toBe(false)
    expect(g.edges[0]).toEqual({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      evidence: [],
    })
  })

  it('stores a sign map as a copy, and an empty map as no sign', () => {
    const map = { x: 'positive' as const, y: 'negative' as const }
    const withMap = updateEdge(g, 'e1', { sign: map })
    expect(withMap.edges[0].sign).toEqual(map)
    expect(withMap.edges[0].sign).not.toBe(map)
    const emptied = updateEdge(withMap, 'e1', { sign: {} }).edges[0]
    expect('sign' in emptied).toBe(false)
  })

  it('leaves sign and strength alone when the patch does not name them', () => {
    const set = updateEdge(g, 'e1', { sign: 'positive', strength: 'small' })
    expect(updateEdge(set, 'e1', { note: 'Known' }).edges[0]).toMatchObject({
      sign: 'positive',
      strength: 'small',
      note: 'Known',
    })
  })
})
