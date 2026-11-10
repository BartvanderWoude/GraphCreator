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
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import { findLesson, LESSONS, tourLesson, type LessonContext } from './index'

/** The context of a step check on `graph`, with nothing else going on. */
function ctx(graph: Graph): LessonContext {
  return {
    graph,
    selection: null,
    sidePanelTab: 'edit',
    analysisOn: { ...ANALYSIS_DEFAULTS },
    events: [],
  }
}

/** Runs the step's check on `graph`. */
function check(step: number, graph: Graph): boolean {
  const s = tourLesson.steps[step]
  if (!s.check) throw new Error(`step ${step + 1} has no check`)
  return s.check(ctx(graph))
}

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
    expect(LESSONS[0]).toBe(tourLesson)
    expect(findLesson('tour')).toBe(tourLesson)
    expect(findLesson('nope')).toBeUndefined()
    expect(tourLesson.id).toBe('tour')
    expect(tourLesson.title).toBe('Drawing your first DAG')
    expect(tourLesson.summary).toBe(
      'Add variables, draw arrows and set a role.',
    )
    expect(tourLesson.track).toBe('app')
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
    expect(steps.every((s) => s.check && !s.pick)).toBe(true)
  })

  it('step 1 is done once a node is added', () => {
    expect(check(0, emptyGraph())).toBe(false)
    expect(check(0, oneNode())).toBe(true)
  })

  it('step 2 is done once a node is renamed to Smoking', () => {
    const before = oneNode()
    expect(before.nodes[0].name).toBe('Node 1')
    expect(check(1, before)).toBe(false)
    expect(check(1, twoNodes())).toBe(false)
    const after = unwrap(renameNode(before, before.nodes[0].id, 'Smoking'))
    expect(check(1, after)).toBe(true)
  })

  it('step 3 is done once there is an edge', () => {
    const before = twoNodes()
    expect(check(2, before)).toBe(false)
    const [a, b] = before.nodes
    expect(check(2, unwrap(addEdge(before, a.id, b.id)))).toBe(true)
  })

  it('step 4 is done once a node is an exposure', () => {
    const before = twoNodes()
    expect(check(3, before)).toBe(false)
    const outcome = updateNode(before, before.nodes[1].id, { role: 'outcome' })
    expect(check(3, outcome)).toBe(false)
    const after = updateNode(before, before.nodes[0].id, { role: 'exposure' })
    expect(check(3, after)).toBe(true)
  })

  it('the last step is always done', () => {
    expect(check(4, emptyGraph())).toBe(true)
  })
})

describe('LESSONS', () => {
  it('holds the 14 lessons of LESSONS.md in order, with their titles, summaries and tracks', () => {
    expect(
      LESSONS.map(({ id, title, summary, track }) => [
        id,
        title,
        summary,
        track,
      ]),
    ).toEqual([
      [
        'tour',
        'Drawing your first DAG',
        'Add variables, draw arrows and set a role.',
        'app',
      ],
      [
        'variables',
        'Describing your variables',
        'Roles, variable types, levels, units and descriptions.',
        'app',
      ],
      [
        'arrows',
        'Documenting your arrows',
        'Evidence and notes, and why missing arrows matter.',
        'app',
      ],
      [
        'files',
        'Saving, sharing and exporting',
        'Files for other tools, images, links and undo.',
        'app',
      ],
      [
        'dag-basics',
        'What a DAG says',
        'Arrows, paths, ancestors and descendants.',
        'causal',
      ],
      [
        'confounding',
        'Confounding',
        'Common causes, back-door paths and adjustment.',
        'causal',
      ],
      [
        'mediators',
        'Mediators',
        'Why you do not adjust for a step on the causal path.',
        'causal',
      ],
      [
        'colliders',
        'Colliders',
        'How adjusting for a common effect creates bias.',
        'causal',
      ],
      [
        'selection',
        'Selection bias',
        'What happens when the study selects on a variable.',
        'causal',
      ],
      [
        'latent',
        'Unmeasured variables',
        'Latent variables, and when no adjustment works.',
        'causal',
      ],
      [
        'adjustment',
        'Adjustment sets',
        'Finding and using sufficient adjustment sets.',
        'causal',
      ],
      [
        'testing',
        'Testing your DAG',
        'Independencies you can check in your data.',
        'causal',
      ],
      [
        'instruments',
        'Instrumental variables',
        'Estimating an effect despite unmeasured confounding.',
        'causal',
      ],
      [
        'reporting',
        'Reporting your DAG',
        'What to show and say in a paper.',
        'causal',
      ],
    ])
  })

  it('finds every lesson by id, and each one has a practice graph and steps', () => {
    for (const lesson of LESSONS) {
      expect(findLesson(lesson.id)).toBe(lesson)
      expect(lesson.sample().nodes).toBeInstanceOf(Array)
      expect(lesson.steps.length).toBeGreaterThan(0)
    }
  })
})
