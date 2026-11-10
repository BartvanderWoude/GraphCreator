import { describe, expect, it } from 'vitest'
import type { Graph } from '@/model/graph'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import {
  adjustedIs,
  edgeNamed,
  hasEvent,
  nodeNamed,
  practiceGraph,
  roleIs,
  selectedEdgeIs,
  selectedNodeName,
  stepDone,
} from './helpers'
import type { LessonContext, LessonStep } from './types'

const YAML = `schema: graphcreator/0.1
name: Confounding by SES
nodes:
  - { name: Maternal smoking, role: exposure, pos: [0, 0] }
  - { name: Birth weight, role: outcome, pos: [300, 0] }
  - { name: SES, role: adjusted, pos: [150, -140] }
  - { name: Diet, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
`

const graph: Graph = practiceGraph(YAML)
const id = (name: string) => nodeNamed(graph, name)!.id

function ctx(patch: Partial<LessonContext> = {}): LessonContext {
  return {
    graph,
    selection: null,
    sidePanelTab: 'edit',
    analysisOn: { ...ANALYSIS_DEFAULTS },
    events: [],
    ...patch,
  }
}

const selectNode = (name: string) =>
  ctx({ selection: { kind: 'node', id: id(name) } })

describe('practiceGraph', () => {
  it('reads a YAML text', () => {
    expect(graph.name).toBe('Confounding by SES')
    expect(graph.nodes.map((n) => n.name)).toEqual([
      'Maternal smoking',
      'Birth weight',
      'SES',
      'Diet',
    ])
    expect(graph.edges).toHaveLength(3)
  })

  it('throws with the first message on a bad text', () => {
    expect(() => practiceGraph('schema: graphcreator/0.1\nnodes: 3\n')).toThrow(
      /^Practice graph does not parse: \S/,
    )
    expect(() =>
      practiceGraph(
        'schema: graphcreator/0.1\nnodes:\n  - { name: A }\nedges:\n  - { from: A, to: B }\n',
      ),
    ).toThrow('Practice graph does not parse: ')
  })
})

describe('nodeNamed and edgeNamed', () => {
  it('find nodes and edges by name', () => {
    expect(nodeNamed(graph, 'SES')?.role).toBe('adjusted')
    expect(nodeNamed(graph, 'ses')).toBeUndefined()
    expect(nodeNamed(graph, 'Nope')).toBeUndefined()
    const edge = edgeNamed(graph, 'SES', 'Birth weight')
    expect(edge?.source).toBe(id('SES'))
    expect(edge?.target).toBe(id('Birth weight'))
  })

  it('respect the direction and unknown names', () => {
    expect(edgeNamed(graph, 'Birth weight', 'SES')).toBeUndefined()
    expect(edgeNamed(graph, 'Diet', 'Birth weight')).toBeUndefined()
    expect(edgeNamed(graph, 'Nope', 'Birth weight')).toBeUndefined()
  })
})

describe('roleIs and adjustedIs', () => {
  it('roleIs compares the named node’s role', () => {
    expect(roleIs(ctx(), 'Maternal smoking', 'exposure')).toBe(true)
    expect(roleIs(ctx(), 'Maternal smoking', 'outcome')).toBe(false)
    expect(roleIs(ctx(), 'Diet', 'other')).toBe(true)
    expect(roleIs(ctx(), 'Nope', 'other')).toBe(false)
  })

  it('adjustedIs needs exactly these nodes adjusted', () => {
    expect(adjustedIs(ctx(), ['SES'])).toBe(true)
    expect(adjustedIs(ctx(), [])).toBe(false)
    expect(adjustedIs(ctx(), ['SES', 'Diet'])).toBe(false)
    expect(adjustedIs(ctx(), ['Diet'])).toBe(false)
    const two: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.name === 'Diet' ? { ...n, role: 'adjusted' } : n,
      ),
    }
    expect(adjustedIs(ctx({ graph: two }), ['Diet', 'SES'])).toBe(true)
    expect(adjustedIs(ctx({ graph: two }), ['SES'])).toBe(false)
    const none: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, role: 'other' })),
    }
    expect(adjustedIs(ctx({ graph: none }), [])).toBe(true)
  })
})

describe('hasEvent', () => {
  const events = ctx({
    events: [{ kind: 'code-downloaded', format: 'yaml' }, { kind: 'undo' }],
  })

  it('finds an event of a kind', () => {
    expect(hasEvent(events, 'undo')).toBe(true)
    expect(hasEvent(events, 'code-downloaded')).toBe(true)
    expect(hasEvent(events, 'link-copied')).toBe(false)
    expect(hasEvent(ctx(), 'undo')).toBe(false)
  })

  it('with formats, needs one of them', () => {
    expect(hasEvent(events, 'code-downloaded', ['yaml'])).toBe(true)
    expect(hasEvent(events, 'code-downloaded', ['dagitty', 'yaml'])).toBe(true)
    expect(hasEvent(events, 'code-downloaded', ['dagitty'])).toBe(false)
    expect(hasEvent(events, 'undo', ['yaml'])).toBe(false)
  })
})

describe('selectedNodeName and selectedEdgeIs', () => {
  it('selectedNodeName names the selected node only', () => {
    expect(selectedNodeName(selectNode('SES'))).toBe('SES')
    expect(selectedNodeName(ctx())).toBeUndefined()
    const edgeId = edgeNamed(graph, 'SES', 'Birth weight')!.id
    expect(
      selectedNodeName(ctx({ selection: { kind: 'edge', id: edgeId } })),
    ).toBeUndefined()
    expect(
      selectedNodeName(ctx({ selection: { kind: 'node', id: 'gone' } })),
    ).toBeUndefined()
  })

  it('selectedEdgeIs checks the selected edge and its direction', () => {
    const edgeId = edgeNamed(graph, 'SES', 'Maternal smoking')!.id
    const selected = ctx({ selection: { kind: 'edge', id: edgeId } })
    expect(selectedEdgeIs(selected, 'SES', 'Maternal smoking')).toBe(true)
    expect(selectedEdgeIs(selected, 'Maternal smoking', 'SES')).toBe(false)
    expect(selectedEdgeIs(selected, 'SES', 'Birth weight')).toBe(false)
    expect(selectedEdgeIs(selectNode('SES'), 'SES', 'Maternal smoking')).toBe(
      false,
    )
    expect(selectedEdgeIs(ctx(), 'SES', 'Maternal smoking')).toBe(false)
  })
})

describe('stepDone', () => {
  const pick = { answers: ['SES', 'Diet'], hints: {}, reveal: 'SES.' }

  it('a step with neither pick nor check is done', () => {
    expect(stepDone({ title: 'Read' }, ctx())).toBe(true)
  })

  it('a check alone decides', () => {
    const step: LessonStep = {
      title: 'Analysis',
      check: (c) => c.sidePanelTab === 'analysis',
    }
    expect(stepDone(step, ctx())).toBe(false)
    expect(stepDone(step, ctx({ sidePanelTab: 'analysis' }))).toBe(true)
  })

  it('a pick alone is answered by selecting any answer node', () => {
    const step: LessonStep = { title: 'Pick', pick }
    expect(stepDone(step, ctx())).toBe(false)
    expect(stepDone(step, selectNode('Birth weight'))).toBe(false)
    expect(stepDone(step, selectNode('SES'))).toBe(true)
    expect(stepDone(step, selectNode('Diet'))).toBe(true)
  })

  it('a pick and a check must both hold', () => {
    const step: LessonStep = {
      title: 'Both',
      pick,
      check: (c) => c.analysisOn.paths,
    }
    const paths = { ...ANALYSIS_DEFAULTS, paths: true }
    expect(stepDone(step, selectNode('SES'))).toBe(false)
    expect(stepDone(step, ctx({ analysisOn: paths }))).toBe(false)
    expect(
      stepDone(step, {
        ...selectNode('SES'),
        analysisOn: paths,
      }),
    ).toBe(true)
  })
})
