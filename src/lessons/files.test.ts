import { describe, expect, it } from 'vitest'
import { moveNode } from '@/model/graph'
import { toYaml } from '@/model/yaml'
import smokingYaml from '@/model/__fixtures__/smoking.dag.yaml?raw'
import type { LessonEvent } from '@/store/lessonEvents'
import { filesLesson as lesson } from './files'
import { stepDone } from './helpers'
import { findLesson, LESSONS } from './index'
import {
  event,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  idOf,
  inOrder,
  practiceYaml,
  stepStart,
  withEvent,
  type Tasks,
} from './lessonTestKit'
import type { LessonContext } from './types'

/**
 * Each checked step's scripted task, by step number, as the events the app records (spec 4.8).
 * Opening a dialog records `code-opened` first, which no check accepts on its own.
 */
const TASKS: Tasks = {
  // Save opens the GraphCreator dialog; Download.
  2: inOrder(event('code-opened', 'yaml'), event('code-downloaded', 'yaml')),
  // Save as… → dagitty…; Copy.
  3: inOrder(event('code-opened', 'dagitty'), event('code-copied', 'dagitty')),
  4: event('export-downloaded', 'pdf'),
  5: event('link-copied'),
  // Move a circle, then Ctrl+Z: the graph is back as it was.
  6: event('undo'),
}

const startOf = (n: number) => stepStart(lesson, TASKS, n)
const done = (n: number, c: LessonContext) => stepDone(lesson.steps[n - 1], c)

describe('files lesson', () => {
  it('is registered with its metadata', () => {
    expect(LESSONS[3]).toBe(lesson)
    expect(findLesson('files')).toBe(lesson)
    expect(lesson.title).toBe('Saving, sharing and exporting')
    expect(lesson.summary).toBe(
      'Files for other tools, images, links and undo.',
    )
    expect(lesson.track).toBe('app')
  })

  it('loads the smoking fixture as its practice graph', () => {
    expect(practiceYaml('files')).toBeUndefined()
    const graph = lesson.sample()
    expect(toYaml(graph)).toBe(smokingYaml)
    expect(graph.name).toBe('Smoking and birth weight')
    expect(graph.nodes.map((n) => [n.name, n.role, n.varType])).toEqual([
      ['Maternal smoking', 'exposure', 'categorical'],
      ['Birth weight', 'outcome', 'continuous'],
      ['SES', 'other', 'ordinal'],
      ['Genetic factors', 'latent', undefined],
    ])
    const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name
    expect(graph.edges.map((e) => [name(e.source), name(e.target)])).toEqual([
      ['SES', 'Maternal smoking'],
      ['Maternal smoking', 'Birth weight'],
      ['SES', 'Birth weight'],
      ['Genetic factors', 'Birth weight'],
    ])
  })

  it('has the step texts of LESSONS.md', () => {
    expect(lesson.steps).toHaveLength(7)
    expectStepsAsInDoc(lesson)
  })

  it('keeps bodies to three sentences, key ideas and tasks to one', () => {
    expectWritingRules(lesson)
  })

  it('has no pointers and no picks', () => {
    for (const step of lesson.steps) {
      expect(step.pick).toBeUndefined()
      expect(step.pointer).toBeUndefined()
    }
  })

  it('each checked step is not done at its start and done after its task', () => {
    expectScriptedRun(lesson, TASKS)
  })

  it('step 2 needs a GraphCreator download', () => {
    const start = startOf(2)
    const after = (e: LessonEvent) => done(2, withEvent(start, e))
    expect(after({ kind: 'code-opened', format: 'yaml' })).toBe(false)
    expect(after({ kind: 'code-copied', format: 'yaml' })).toBe(false)
    expect(after({ kind: 'code-downloaded', format: 'dagitty' })).toBe(false)
  })

  it('step 3 needs a dagitty copy or download', () => {
    const start = startOf(3)
    const after = (e: LessonEvent) => done(3, withEvent(start, e))
    expect(after({ kind: 'code-downloaded', format: 'dagitty' })).toBe(true)
    expect(after({ kind: 'code-opened', format: 'dagitty' })).toBe(false)
    expect(after({ kind: 'code-copied', format: 'gml' })).toBe(false)
    expect(after({ kind: 'code-downloaded', format: 'yaml' })).toBe(false)
  })

  it('step 4 needs a PDF download', () => {
    const start = startOf(4)
    const after = (e: LessonEvent) => done(4, withEvent(start, e))
    expect(after({ kind: 'export-downloaded', format: 'png' })).toBe(false)
    expect(after({ kind: 'export-copied', format: 'svg' })).toBe(false)
  })

  it('step 6 needs an undo, not just a move', () => {
    const start = startOf(6)
    const moved = {
      ...start,
      graph: moveNode(start.graph, idOf(start.graph, 'SES'), { x: 0, y: 0 }),
    }
    expect(done(6, moved)).toBe(false)
    expect(done(6, withEvent(moved, { kind: 'undo' }))).toBe(true)
  })
})
