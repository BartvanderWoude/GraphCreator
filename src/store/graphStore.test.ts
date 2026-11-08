import { beforeEach, describe, expect, it } from 'vitest'
import { emptyGraph, type Graph } from '@/model/graph'
import { autoLayout } from '@/model/layout'
import { useGraphStore } from './graphStore'

const store = () => useGraphStore.getState()

/** Two nodes n1 → n2 plus an unconnected n3. */
function sample(): Graph {
  return {
    name: 'Sample',
    nodes: [
      { id: 'n1', name: 'A', role: 'exposure', pos: { x: 0, y: 0 } },
      { id: 'n2', name: 'B', role: 'outcome', pos: { x: 300, y: 0 } },
      { id: 'n3', name: 'C', role: 'other', pos: { x: 150, y: 100 } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', evidence: [] }],
  }
}

/** Runs `action` and checks that it replaced `graph` without mutating the previous one. */
function expectReplaced(action: () => void): Graph {
  const before = store().graph
  const snapshot = structuredClone(before)
  action()
  const after = store().graph
  expect(after).not.toBe(before)
  expect(before).toEqual(snapshot)
  return after
}

beforeEach(() => {
  useGraphStore.setState({
    graph: emptyGraph(),
    selection: null,
    focusNameOf: null,
  })
})

describe('graphStore', () => {
  it('starts with an empty graph and no selection', () => {
    expect(store().graph).toEqual(emptyGraph())
    expect(store().selection).toBeNull()
    expect(store().focusNameOf).toBeNull()
  })

  it('addNodeAt adds a default-named node, selects it and sets focusNameOf', () => {
    let id = ''
    const graph = expectReplaced(() => {
      id = store().addNodeAt({ x: 10, y: 20 })
    })
    expect(graph.nodes).toEqual([
      { id, name: 'Node 1', role: 'other', pos: { x: 10, y: 20 } },
    ])
    expect(store().selection).toEqual({ kind: 'node', id })
    expect(store().focusNameOf).toBe(id)
    expect(store().addNodeAt({ x: 0, y: 0 })).not.toBe(id)
    expect(store().graph.nodes[1].name).toBe('Node 2')
  })

  it('renameNode applies a valid rename and returns the result', () => {
    store().replaceGraph(sample())
    let result!: ReturnType<ReturnType<typeof store>['renameNode']>
    const graph = expectReplaced(() => {
      result = store().renameNode('n1', '  Smoking ')
    })
    expect(result.ok).toBe(true)
    expect(graph.nodes[0].name).toBe('Smoking')
  })

  it('renameNode leaves the graph unchanged on error', () => {
    store().replaceGraph(sample())
    const before = store().graph
    const result = store().renameNode('n1', 'B')
    expect(result).toEqual({
      ok: false,
      errors: [{ message: 'There is already a node called "B".' }],
    })
    expect(store().graph).toBe(before)
  })

  it('renameNode keeps the circle centre when the diameter changes', () => {
    store().replaceGraph({
      nodes: [{ id: 'n1', name: 'Age', role: 'other', pos: { x: 100, y: 50 } }],
      edges: [],
    })
    // 64 px → 132 px: pos shifts by (64 - 132) / 2 = -34 on both axes.
    const result = store().renameNode('n1', 'Maternal smoking during pregnancy')
    expect(result.ok).toBe(true)
    expect(store().graph.nodes[0].pos).toEqual({ x: 66, y: 16 })
    expect(result.ok && result.value).toBe(store().graph)
    // And back again.
    store().renameNode('n1', 'Age')
    expect(store().graph.nodes[0].pos).toEqual({ x: 100, y: 50 })
    // Same diameter: no shift.
    store().renameNode('n1', 'Sex')
    expect(store().graph.nodes[0].pos).toEqual({ x: 100, y: 50 })
  })

  it('renameNode leaves pos unchanged when the rename fails', () => {
    store().replaceGraph(sample())
    store().renameNode('n2', 'Maternal smoking during pregnancy')
    const before = store().graph
    // A longer name that is taken, and a blank one: both refused, nothing moves.
    expect(
      store().renameNode('n1', 'Maternal smoking during pregnancy').ok,
    ).toBe(false)
    expect(store().renameNode('n1', '   ').ok).toBe(false)
    expect(store().graph).toBe(before)
    expect(store().graph.nodes[0].pos).toEqual({ x: 0, y: 0 })
  })

  it('updateNode delegates to the model', () => {
    store().replaceGraph(sample())
    const graph = expectReplaced(() =>
      store().updateNode('n1', {
        varType: 'ordinal',
        levels: ['low', 'high'],
        description: ' ',
      }),
    )
    expect(graph.nodes[0]).toEqual({
      id: 'n1',
      name: 'A',
      role: 'exposure',
      varType: 'ordinal',
      levels: ['low', 'high'],
      pos: { x: 0, y: 0 },
    })
  })

  it('moveNode delegates to the model', () => {
    store().replaceGraph(sample())
    const graph = expectReplaced(() => store().moveNode('n2', { x: 5, y: 6 }))
    expect(graph.nodes[1].pos).toEqual({ x: 5, y: 6 })
  })

  it('connect adds valid edges and returns the check', () => {
    store().replaceGraph(sample())
    let check!: ReturnType<ReturnType<typeof store>['connect']>
    const graph = expectReplaced(() => {
      check = store().connect('n2', 'n3')
    })
    expect(check).toEqual({ ok: true })
    expect(graph.edges).toHaveLength(2)
    expect(graph.edges[1]).toMatchObject({ source: 'n2', target: 'n3' })
  })

  it('connect refuses invalid edges and leaves the graph unchanged', () => {
    store().replaceGraph(sample())
    const before = store().graph
    expect(store().connect('n1', 'n1')).toMatchObject({
      ok: false,
      reason: 'self',
    })
    expect(store().connect('n1', 'n2')).toMatchObject({
      ok: false,
      reason: 'duplicate',
    })
    expect(store().connect('n2', 'n1')).toEqual({
      ok: false,
      reason: 'cycle',
      message: 'B → A → B would form a cycle.',
      cycle: ['n2', 'n1', 'n2'],
    })
    expect(store().graph).toBe(before)
  })

  it('updateEdge delegates to the model', () => {
    store().replaceGraph(sample())
    const graph = expectReplaced(() =>
      store().updateEdge('e1', { evidence: ['PMID:1'], note: 'Known' }),
    )
    expect(graph.edges[0]).toEqual({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      evidence: ['PMID:1'],
      note: 'Known',
    })
  })

  it('removeSelection removes nodes with their edges and clears a removed selection', () => {
    store().replaceGraph(sample())
    store().select({ kind: 'node', id: 'n1' })
    const graph = expectReplaced(() => store().removeSelection(['n1'], []))
    expect(graph.nodes.map((n) => n.id)).toEqual(['n2', 'n3'])
    expect(graph.edges).toEqual([])
    expect(store().selection).toBeNull()
  })

  it('removeSelection clears a selected edge removed with its node', () => {
    store().replaceGraph(sample())
    store().select({ kind: 'edge', id: 'e1' })
    store().removeSelection(['n2'], [])
    expect(store().selection).toBeNull()
  })

  it('removeSelection keeps a selection that was not removed', () => {
    store().replaceGraph(sample())
    store().select({ kind: 'node', id: 'n3' })
    const graph = expectReplaced(() => store().removeSelection([], ['e1']))
    expect(graph.edges).toEqual([])
    expect(store().selection).toEqual({ kind: 'node', id: 'n3' })
  })

  it('select and clearFocusName set their fields', () => {
    store().select({ kind: 'edge', id: 'e1' })
    expect(store().selection).toEqual({ kind: 'edge', id: 'e1' })
    store().select(null)
    expect(store().selection).toBeNull()
    store().addNodeAt({ x: 0, y: 0 })
    store().clearFocusName()
    expect(store().focusNameOf).toBeNull()
  })

  it('replaceGraph clears selection and focusNameOf', () => {
    store().addNodeAt({ x: 0, y: 0 })
    const next = sample()
    store().replaceGraph(next)
    expect(store().graph).toBe(next)
    expect(store().selection).toBeNull()
    expect(store().focusNameOf).toBeNull()
  })

  it('setGraphName sets the name and clears it when blank', () => {
    store().replaceGraph(sample())
    const graph = expectReplaced(() => store().setGraphName('Birth weight'))
    expect(graph.name).toBe('Birth weight')
    const cleared = expectReplaced(() => store().setGraphName('  '))
    expect(cleared.name).toBeUndefined()
    expect('name' in cleared).toBe(false)
  })

  it('layout applies autoLayout', () => {
    store().replaceGraph(sample())
    const graph = expectReplaced(() => store().layout())
    expect(graph).toEqual(autoLayout(sample()))
  })
})
