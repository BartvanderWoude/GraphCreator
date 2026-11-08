import { describe, expect, it } from 'vitest'
import {
  addEdge,
  addNode,
  defaultNodeName,
  emptyGraph,
  renameNode,
  updateNode,
  type Graph,
} from '@/model/graph'
import { findLesson, LESSONS, tourLesson } from './index'

function unwrap(result: { ok: true; value: Graph } | { ok: false }): Graph {
  if (!result.ok) throw new Error('unexpected failure')
  return result.value
}

/** Graph with one default-named node. */
function oneNode(): Graph {
  return addNode(emptyGraph(), { pos: { x: 0, y: 0 } }).graph
}

/** Graph with two default-named nodes. */
function twoNodes(): Graph {
  const g = oneNode()
  return addNode(g, { pos: { x: 200, y: 0 }, name: defaultNodeName(g) }).graph
}

describe('tour lesson', () => {
  const steps = tourLesson.steps

  it('is registered and has the spec metadata', () => {
    expect(LESSONS).toEqual([tourLesson])
    expect(findLesson('tour')).toBe(tourLesson)
    expect(findLesson('nope')).toBeUndefined()
    expect(tourLesson.id).toBe('tour')
    expect(tourLesson.title).toBe('Drawing your first DAG')
    expect(tourLesson.sample()).toEqual(emptyGraph())
    expect(steps.map((s) => s.title)).toEqual([
      'Add a variable',
      'Name it',
      'Draw a cause',
      'Give it a role',
      'Done',
    ])
    expect(steps.slice(0, 4).every((s) => s.task)).toBe(true)
    expect(steps[4].task).toBeUndefined()
  })

  it('step 1 is done once a node is added', () => {
    expect(steps[0].isDone(emptyGraph())).toBe(false)
    expect(steps[0].isDone(oneNode())).toBe(true)
  })

  it('step 2 is done once a node is renamed to Smoking', () => {
    const before = oneNode()
    expect(before.nodes[0].name).toBe('Node 1')
    expect(steps[1].isDone(before)).toBe(false)
    expect(steps[1].isDone(twoNodes())).toBe(false)
    const after = unwrap(renameNode(before, before.nodes[0].id, 'Smoking'))
    expect(steps[1].isDone(after)).toBe(true)
  })

  it('step 3 is done once there is an edge', () => {
    const before = twoNodes()
    expect(steps[2].isDone(before)).toBe(false)
    const [a, b] = before.nodes
    expect(steps[2].isDone(unwrap(addEdge(before, a.id, b.id)))).toBe(true)
  })

  it('step 4 is done once a node is an exposure', () => {
    const before = twoNodes()
    expect(steps[3].isDone(before)).toBe(false)
    const outcome = updateNode(before, before.nodes[1].id, { role: 'outcome' })
    expect(steps[3].isDone(outcome)).toBe(false)
    const after = updateNode(before, before.nodes[0].id, { role: 'exposure' })
    expect(steps[3].isDone(after)).toBe(true)
  })

  it('the last step is always done', () => {
    expect(steps[4].isDone(emptyGraph())).toBe(true)
  })
})
