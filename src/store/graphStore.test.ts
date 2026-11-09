import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyGraph, type Graph } from '@/model/graph'
import { autoLayout } from '@/model/layout'
import { HISTORY_LIMIT, useGraphStore } from './graphStore'
import { startRecording, stopRecording, useLessonEvents } from './lessonEvents'

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
    past: [],
    future: [],
    revision: 0,
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

  it('focusName selects the node and sets focusNameOf without changing the graph', () => {
    store().replaceGraph(sample())
    const before = store().graph
    store().focusName('n3')
    expect(store().selection).toEqual({ kind: 'node', id: 'n3' })
    expect(store().focusNameOf).toBe('n3')
    expect(store().graph).toBe(before)
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

describe('graphStore undo history', () => {
  /** Loads `sample()` with an empty history. */
  function load(): Graph {
    store().replaceGraph(sample())
    return store().graph
  }

  it('starts with empty stacks and revision 0', () => {
    expect(store().past).toEqual([])
    expect(store().future).toEqual([])
    expect(store().revision).toBe(0)
  })

  const recording: [string, () => void][] = [
    ['addNodeAt', () => void store().addNodeAt({ x: 1, y: 2 })],
    ['renameNode', () => void store().renameNode('n1', 'Smoking')],
    ['updateNode', () => store().updateNode('n1', { varType: 'continuous' })],
    ['moveNode', () => store().moveNode('n1', { x: 9, y: 9 })],
    [
      'moveNodes',
      () =>
        store().moveNodes([
          { id: 'n1', pos: { x: 9, y: 9 } },
          { id: 'n2', pos: { x: 8, y: 8 } },
        ]),
    ],
    ['connect', () => void store().connect('n2', 'n3')],
    ['updateEdge', () => store().updateEdge('e1', { note: 'Known' })],
    ['removeSelection', () => store().removeSelection(['n3'], [])],
    ['setGraphName', () => store().setGraphName('Other name')],
    ['layout', () => store().layout()],
    ['setAdjustedSet', () => store().setAdjustedSet(['n3'])],
  ]

  it.each(recording)(
    '%s pushes exactly one entry and clears future',
    (_name, action) => {
      const before = load()
      // Give `future` an entry first, so clearing it shows.
      store().setGraphName('Temporary')
      store().undo()
      expect(store().future).toHaveLength(1)
      expect(store().graph).toBe(before)

      action()
      expect(store().graph).not.toBe(before)
      expect(store().past).toEqual([before])
      expect(store().past[0]).toBe(before)
      expect(store().future).toEqual([])
    },
  )

  const noOps: [string, () => void][] = [
    ['a failed rename', () => void store().renameNode('n1', 'B')],
    ['a blank rename', () => void store().renameNode('n1', '  ')],
    ['a rename to the same name', () => void store().renameNode('n1', ' A ')],
    ['a refused connect', () => void store().connect('n2', 'n1')],
    [
      'an equal node patch',
      () => store().updateNode('n1', { role: 'exposure' }),
    ],
    [
      'an equal patch after normalising',
      () => store().updateNode('n3', { description: '  ', unit: 'g' }),
    ],
    [
      'equal levels, item by item',
      () => store().updateNode('n4', { levels: ['low', 'high'] }),
    ],
    ['an equal edge patch', () => store().updateEdge('e1', { evidence: [] })],
    [
      'moveNode to the same place',
      () => store().moveNode('n2', { x: 300, y: 0 }),
    ],
    [
      'moveNodes to the same places',
      () =>
        store().moveNodes([
          { id: 'n1', pos: { x: 0, y: 0 } },
          { id: 'n3', pos: { x: 150, y: 100 } },
        ]),
    ],
    ['moveNodes with no moves', () => store().moveNodes([])],
    ['removing nothing', () => store().removeSelection([], [])],
    ['removing unknown ids', () => store().removeSelection(['n9'], ['e9'])],
    [
      'setGraphName with the current name',
      () => store().setGraphName('Sample'),
    ],
  ]

  it.each(noOps)(
    '%s pushes nothing and keeps the same graph object',
    (_name, action) => {
      store().replaceGraph({
        ...sample(),
        nodes: [
          ...sample().nodes,
          {
            id: 'n4',
            name: 'D',
            role: 'other',
            varType: 'ordinal',
            levels: ['low', 'high'],
            pos: { x: 0, y: 200 },
          },
        ],
      })
      store().select({ kind: 'node', id: 'n1' })
      const before = store().graph
      action()
      expect(store().graph).toBe(before)
      expect(store().past).toEqual([])
      expect(store().selection).toEqual({ kind: 'node', id: 'n1' })
    },
  )

  it('setGraphName with a blank name on an unnamed graph pushes nothing', () => {
    store().replaceGraph({ nodes: [], edges: [] })
    const before = store().graph
    store().setGraphName('  ')
    expect(store().graph).toBe(before)
    expect(store().past).toEqual([])
  })

  it('a no-op leaves future in place', () => {
    load()
    store().moveNode('n1', { x: 5, y: 5 })
    store().undo()
    const future = store().future
    store().removeSelection([], [])
    expect(store().future).toBe(future)
  })

  it('undo then redo returns the identical graph objects', () => {
    const g0 = load()
    store().renameNode('n1', 'Smoking')
    const g1 = store().graph
    store().connect('n2', 'n3')
    const g2 = store().graph

    store().undo()
    expect(store().graph).toBe(g1)
    expect(store().past).toEqual([g0])
    expect(store().future).toEqual([g2])
    store().undo()
    expect(store().graph).toBe(g0)
    expect(store().past).toEqual([])
    expect(store().future[1]).toBe(g1)
    expect(store().future[0]).toBe(g2)

    store().redo()
    expect(store().graph).toBe(g1)
    store().redo()
    expect(store().graph).toBe(g2)
    expect(store().past[0]).toBe(g0)
    expect(store().past[1]).toBe(g1)
    expect(store().future).toEqual([])
  })

  it('a new edit after an undo discards the redo stack', () => {
    load()
    store().moveNode('n1', { x: 5, y: 5 })
    store().undo()
    store().moveNode('n2', { x: 7, y: 7 })
    expect(store().future).toEqual([])
    store().redo()
    expect(store().graph.nodes[1].pos).toEqual({ x: 7, y: 7 })
  })

  it('past stops at HISTORY_LIMIT and drops the oldest entry', () => {
    load()
    const graphs: Graph[] = []
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) {
      graphs.push(store().graph)
      store().moveNode('n1', { x: i, y: 0 })
    }
    expect(store().past).toHaveLength(HISTORY_LIMIT)
    expect(store().past[0]).toBe(graphs[5])
    expect(store().past[HISTORY_LIMIT - 1]).toBe(graphs[HISTORY_LIMIT + 4])

    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store().undo()
    expect(store().graph).toBe(graphs[5])
    expect(store().future).toHaveLength(HISTORY_LIMIT)
  })

  it('replaceGraph empties both stacks and leaves revision alone', () => {
    load()
    store().moveNode('n1', { x: 5, y: 5 })
    store().moveNode('n1', { x: 6, y: 6 })
    store().undo()
    expect(store().past).toHaveLength(1)
    expect(store().future).toHaveLength(1)
    const revision = store().revision
    store().replaceGraph(sample())
    expect(store().past).toEqual([])
    expect(store().future).toEqual([])
    expect(store().revision).toBe(revision)
  })

  it('moveNodes with three moves is one step', () => {
    const before = load()
    store().moveNodes([
      { id: 'n1', pos: { x: 10, y: 11 } },
      { id: 'n2', pos: { x: 20, y: 21 } },
      { id: 'n3', pos: { x: 30, y: 31 } },
    ])
    expect(store().graph.nodes.map((n) => n.pos)).toEqual([
      { x: 10, y: 11 },
      { x: 20, y: 21 },
      { x: 30, y: 31 },
    ])
    expect(store().past).toEqual([before])
    store().undo()
    expect(store().graph).toBe(before)
  })

  it('moveNodes does not mutate the previous graph', () => {
    load()
    const graph = expectReplaced(() =>
      store().moveNodes([{ id: 'n2', pos: { x: 1, y: 2 } }]),
    )
    expect(graph.nodes[1].pos).toEqual({ x: 1, y: 2 })
  })

  it('undo keeps a selection that still exists, clears focusNameOf and increments revision', () => {
    load()
    store().renameNode('n1', 'Smoking')
    store().focusName('n1')
    store().undo()
    expect(store().graph.nodes[0].name).toBe('A')
    expect(store().selection).toEqual({ kind: 'node', id: 'n1' })
    expect(store().focusNameOf).toBeNull()
    expect(store().revision).toBe(1)
    store().redo()
    expect(store().graph.nodes[0].name).toBe('Smoking')
    expect(store().selection).toEqual({ kind: 'node', id: 'n1' })
    expect(store().revision).toBe(2)
  })

  it('undo and redo clear a selection that no longer exists', () => {
    load()
    const id = store().addNodeAt({ x: 0, y: 0 })
    expect(store().focusNameOf).toBe(id)
    store().undo()
    expect(store().graph.nodes.some((n) => n.id === id)).toBe(false)
    expect(store().selection).toBeNull()
    expect(store().focusNameOf).toBeNull()

    store().connect('n2', 'n3')
    const edge = store().graph.edges[1].id
    store().select({ kind: 'edge', id: edge })
    store().undo()
    expect(store().selection).toBeNull()
    store().select({ kind: 'node', id: 'n3' })
    store().redo()
    expect(store().selection).toEqual({ kind: 'node', id: 'n3' })
    store().removeSelection(['n3'], [])
    store().undo()
    store().select({ kind: 'node', id: 'n3' })
    store().redo()
    expect(store().selection).toBeNull()
  })

  it('undo and redo on empty stacks change nothing', () => {
    load()
    store().select({ kind: 'node', id: 'n1' })
    store().focusName('n1')
    const before = store()
    store().undo()
    store().redo()
    expect(store()).toBe(before)
    expect(store().revision).toBe(0)
    expect(store().focusNameOf).toBe('n1')
  })
})

describe('graphStore undo lesson event (phase 41)', () => {
  afterEach(() => {
    stopRecording()
  })

  it('records an undo event while recording, only when undo changed the graph', () => {
    store().replaceGraph(sample())
    startRecording()
    store().undo()
    expect(useLessonEvents.getState().events).toEqual([])
    store().moveNode('n1', { x: 5, y: 5 })
    store().undo()
    expect(useLessonEvents.getState().events).toEqual([{ kind: 'undo' }])
    store().redo()
    store().undo()
    expect(useLessonEvents.getState().events).toEqual([
      { kind: 'undo' },
      { kind: 'undo' },
    ])
  })

  it('records nothing outside a lesson', () => {
    store().replaceGraph(sample())
    store().moveNode('n1', { x: 5, y: 5 })
    store().undo()
    expect(useLessonEvents.getState()).toEqual({ recording: false, events: [] })
  })
})

describe('graphStore setAdjustedSet', () => {
  /** One node of every role, plus a second `other` and an `adjusted` node. */
  function rolesGraph(): Graph {
    const roles = [
      'exposure',
      'outcome',
      'latent',
      'selected',
      'other',
      'other',
      'adjusted',
    ] as const
    return {
      nodes: roles.map((role, i) => ({
        id: `n${i + 1}`,
        name: `N${i + 1}`,
        role,
        pos: { x: i * 100, y: 0 },
      })),
      edges: [],
    }
  }
  const rolesNow = () => store().graph.nodes.map((n) => n.role)

  beforeEach(() => {
    store().replaceGraph(rolesGraph())
  })

  it('marks the given nodes and returns other adjusted nodes to other', () => {
    const before = store().graph
    store().setAdjustedSet(['n5'])
    expect(rolesNow()).toEqual([
      'exposure',
      'outcome',
      'latent',
      'selected',
      'adjusted',
      'other',
      'other',
    ])
    expect(store().graph.nodes[5]).toBe(before.nodes[5])
    expect(before.nodes[4].role).toBe('other')
  })

  it('never changes exposure, outcome, latent or selected nodes', () => {
    store().setAdjustedSet(['n1', 'n2', 'n3', 'n4', 'n6'])
    expect(rolesNow()).toEqual([
      'exposure',
      'outcome',
      'latent',
      'selected',
      'other',
      'adjusted',
      'other',
    ])
    store().setAdjustedSet([])
    expect(rolesNow().slice(0, 4)).toEqual([
      'exposure',
      'outcome',
      'latent',
      'selected',
    ])
    expect(rolesNow().filter((r) => r === 'adjusted')).toEqual([])
  })

  it('is one undo step', () => {
    const before = store().graph
    store().setAdjustedSet(['n5', 'n6'])
    expect(store().past).toEqual([before])
    expect(store().future).toEqual([])
    store().undo()
    expect(store().graph).toBe(before)
  })

  it('records nothing when nothing changes', () => {
    const before = store().graph
    store().setAdjustedSet(['n7'])
    store().setAdjustedSet(['n7', 'n1', 'n3', 'unknown'])
    expect(store().graph).toBe(before)
    expect(store().past).toEqual([])
  })
})
