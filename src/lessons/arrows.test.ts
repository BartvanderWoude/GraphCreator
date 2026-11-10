import { describe, expect, it } from 'vitest'
import { canAddEdge, updateEdge, type GEdge, type Graph } from '@/model/graph'
import { arrowsLesson as lesson } from './arrows'
import { edgeNamed, stepDone } from './helpers'
import { findLesson, LESSONS } from './index'
import {
  event,
  expectNamesExist,
  expectPracticeGraphAsInDoc,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  idOf,
  select,
  stepStart,
  withEvent,
  type Tasks,
} from './lessonTestKit'
import type { LessonContext } from './types'

/** The edge from `from` to `to`; throws when there is none. */
function edge(graph: Graph, from: string, to: string): GEdge {
  const found = edgeNamed(graph, from, to)
  if (!found) throw new Error(`no edge ${from} → ${to}`)
  return found
}

/** `c` with the edge from `from` to `to` patched. */
function patchEdge(
  c: LessonContext,
  from: string,
  to: string,
  patch: Partial<Pick<GEdge, 'evidence' | 'note'>>,
): LessonContext {
  return {
    ...c,
    graph: updateEdge(c.graph, edge(c.graph, from, to).id, patch),
  }
}

const selectEdge = (
  c: LessonContext,
  from: string,
  to: string,
): LessonContext => ({
  ...c,
  selection: { kind: 'edge', id: edge(c.graph, from, to).id },
})

/** Each checked step's scripted task, by step number. */
const TASKS: Tasks = {
  1: (c) => selectEdge(c, 'SES', 'Maternal smoking'),
  2: (c) => patchEdge(c, 'SES', 'Maternal smoking', { evidence: ['PMID:123'] }),
  3: (c) =>
    patchEdge(c, 'SES', 'Maternal smoking', { note: 'Well established' }),
  // What the canvas records when it refuses Birth weight → SES.
  5: event('edge-refused', 'cycle'),
}

const startOf = (n: number) => stepStart(lesson, TASKS, n)
const done = (n: number, c: LessonContext) => stepDone(lesson.steps[n - 1], c)

describe('arrows lesson', () => {
  it('is registered with its metadata', () => {
    expect(LESSONS[2]).toBe(lesson)
    expect(findLesson('arrows')).toBe(lesson)
    expect(lesson.title).toBe('Documenting your arrows')
    expect(lesson.summary).toBe(
      'Evidence and notes, and why missing arrows matter.',
    )
    expect(lesson.track).toBe('app')
  })

  it('loads the practice graph of LESSONS.md, with roles and types but no evidence or notes', () => {
    expectPracticeGraphAsInDoc(lesson)
    const graph = lesson.sample()
    expect(graph.name).toBe('Smoking and birth weight')
    expect(graph.nodes.map((n) => [n.name, n.role, n.varType])).toEqual([
      ['Maternal smoking', 'exposure', 'categorical'],
      ['Birth weight', 'outcome', 'continuous'],
      ['SES', 'other', 'ordinal'],
      ['Genetic factors', 'latent', 'continuous'],
    ])
    const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name
    expect(graph.edges.map((e) => [name(e.source), name(e.target)])).toEqual([
      ['SES', 'Maternal smoking'],
      ['SES', 'Birth weight'],
      ['Maternal smoking', 'Birth weight'],
      ['Genetic factors', 'Birth weight'],
    ])
    expect(graph.edges.every((e) => e.evidence.length === 0 && !e.note)).toBe(
      true,
    )
  })

  it('has the step texts and pointers of LESSONS.md', () => {
    expect(lesson.steps).toHaveLength(6)
    expectStepsAsInDoc(lesson)
  })

  it('keeps bodies to three sentences, key ideas and tasks to one, labels to three words', () => {
    expectWritingRules(lesson)
  })

  it('points only at nodes of the practice graph and has no picks', () => {
    expectNamesExist(lesson)
    for (const step of lesson.steps) expect(step.pick).toBeUndefined()
  })

  it('each checked step is not done at its start and done after its task', () => {
    expectScriptedRun(lesson, TASKS)
  })

  it('step 1 needs exactly the edge SES → Maternal smoking selected', () => {
    const start = startOf(1)
    expect(done(1, selectEdge(start, 'SES', 'Birth weight'))).toBe(false)
    expect(done(1, select('SES')(start))).toBe(false)
  })

  it('steps 2 and 3 look at the edge SES → Maternal smoking only', () => {
    expect(
      done(
        2,
        patchEdge(startOf(2), 'SES', 'Birth weight', { evidence: ['x'] }),
      ),
    ).toBe(false)
    expect(
      done(3, patchEdge(startOf(3), 'SES', 'Birth weight', { note: 'Strong' })),
    ).toBe(false)
    const blank = startOf(3)
    const blankNote: LessonContext = {
      ...blank,
      graph: {
        ...blank.graph,
        edges: blank.graph.edges.map((e) =>
          e.id === edge(blank.graph, 'SES', 'Maternal smoking').id
            ? { ...e, note: '   ' }
            : e,
        ),
      },
    }
    expect(done(3, blankNote)).toBe(false)
  })

  it('step 5 needs a refusal because of a cycle', () => {
    const start = startOf(5)
    expect(
      done(5, withEvent(start, { kind: 'edge-refused', format: 'duplicate' })),
    ).toBe(false)
    expect(done(5, withEvent(start, { kind: 'edge-refused' }))).toBe(false)
    expect(done(5, withEvent(start, { kind: 'undo' }))).toBe(false)
  })

  describe('claims', () => {
    const graph = lesson.sample()
    const id = (name: string) => idOf(graph, name)

    it('step 4: there is no edge from Genetic factors to Maternal smoking', () => {
      expect(edgeNamed(graph, 'Genetic factors', 'Maternal smoking')).toBe(
        undefined,
      )
      expect(
        canAddEdge(graph, id('Genetic factors'), id('Maternal smoking')).ok,
      ).toBe(true)
    })

    it('step 5: the arrow Birth weight → SES is refused because of a cycle', () => {
      const result = canAddEdge(graph, id('Birth weight'), id('SES'))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('cycle')
    })
  })
})
