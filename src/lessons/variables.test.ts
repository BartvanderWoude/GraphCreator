import { describe, expect, it } from 'vitest'
import { updateNode, type GNode } from '@/model/graph'
import { nodeNamed, stepDone } from './helpers'
import { findLesson, LESSONS } from './index'
import {
  expectNamesExist,
  expectPracticeGraphAsInDoc,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  idOf,
  stepStart,
  type Tasks,
} from './lessonTestKit'
import type { LessonContext } from './types'
import { variablesLesson as lesson } from './variables'

/** `ctx` with the named node patched. */
function patchNode(
  c: LessonContext,
  name: string,
  patch: Partial<Omit<GNode, 'id' | 'name'>>,
): LessonContext {
  return { ...c, graph: updateNode(c.graph, idOf(c.graph, name), patch) }
}

/** Each checked step's scripted task, by step number. */
const TASKS: Tasks = {
  1: (c) => patchNode(c, 'Maternal smoking', { role: 'exposure' }),
  2: (c) => patchNode(c, 'Birth weight', { role: 'outcome' }),
  3: (c) => patchNode(c, 'Genetic factors', { role: 'latent' }),
  4: (c) => patchNode(c, 'Birth weight', { varType: 'continuous', unit: 'g' }),
  5: (c) =>
    patchNode(c, 'SES', { varType: 'ordinal', levels: ['low', 'mid', 'high'] }),
  6: (c) =>
    patchNode(c, 'Maternal smoking', {
      description: 'Self-reported during pregnancy',
    }),
}

const startOf = (n: number) => stepStart(lesson, TASKS, n)
const done = (n: number, c: LessonContext) => stepDone(lesson.steps[n - 1], c)

describe('variables lesson', () => {
  it('is registered with its metadata', () => {
    expect(LESSONS[1]).toBe(lesson)
    expect(findLesson('variables')).toBe(lesson)
    expect(lesson.title).toBe('Describing your variables')
    expect(lesson.summary).toBe(
      'Roles, variable types, levels, units and descriptions.',
    )
    expect(lesson.track).toBe('app')
  })

  it('loads the practice graph of LESSONS.md, with no roles and no types', () => {
    expectPracticeGraphAsInDoc(lesson)
    const graph = lesson.sample()
    expect(graph.name).toBe('Smoking and birth weight')
    expect(graph.nodes.map((n) => [n.name, n.role, n.varType])).toEqual([
      ['Maternal smoking', 'other', undefined],
      ['Birth weight', 'other', undefined],
      ['SES', 'other', undefined],
      ['Genetic factors', 'other', undefined],
    ])
    const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name
    expect(graph.edges.map((e) => [name(e.source), name(e.target)])).toEqual([
      ['SES', 'Maternal smoking'],
      ['SES', 'Birth weight'],
      ['Maternal smoking', 'Birth weight'],
      ['Genetic factors', 'Birth weight'],
    ])
  })

  it('has the step texts and pointers of LESSONS.md', () => {
    expect(lesson.steps).toHaveLength(7)
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

  it('step 1 needs Maternal smoking as the exposure', () => {
    const start = startOf(1)
    expect(
      done(1, patchNode(start, 'Birth weight', { role: 'exposure' })),
    ).toBe(false)
    expect(
      done(1, patchNode(start, 'Maternal smoking', { role: 'outcome' })),
    ).toBe(false)
  })

  it('step 4 needs both the continuous type and the unit g, trimmed and ignoring case', () => {
    const start = startOf(4)
    const continuous = patchNode(start, 'Birth weight', {
      varType: 'continuous',
    })
    expect(done(4, continuous)).toBe(false)
    expect(done(4, patchNode(continuous, 'Birth weight', { unit: 'kg' }))).toBe(
      false,
    )
    expect(
      done(4, patchNode(continuous, 'Birth weight', { unit: ' G ' })),
    ).toBe(true)
    const discrete = patchNode(start, 'Birth weight', {
      varType: 'discrete',
      unit: 'g',
    })
    expect(done(4, discrete)).toBe(false)
  })

  it('step 5 needs SES ordinal with low, mid, high in order, trimmed and ignoring case', () => {
    const start = startOf(5)
    const ses = (patch: Partial<GNode>) =>
      done(5, patchNode(start, 'SES', patch))
    expect(ses({ varType: 'ordinal' })).toBe(false)
    expect(ses({ varType: 'ordinal', levels: ['high', 'mid', 'low'] })).toBe(
      false,
    )
    expect(ses({ varType: 'ordinal', levels: ['low', 'mid'] })).toBe(false)
    expect(
      ses({ varType: 'ordinal', levels: ['low', 'mid', 'high', 'top'] }),
    ).toBe(false)
    expect(
      ses({ varType: 'categorical', levels: ['low', 'mid', 'high'] }),
    ).toBe(false)
    expect(ses({ varType: 'ordinal', levels: [' Low', 'MID ', 'High'] })).toBe(
      true,
    )
  })

  it('step 6 needs a description that is not blank', () => {
    const start = startOf(6)
    const blank: LessonContext = {
      ...start,
      graph: {
        ...start.graph,
        nodes: start.graph.nodes.map((n) =>
          n.name === 'Maternal smoking' ? { ...n, description: '  ' } : n,
        ),
      },
    }
    expect(done(6, blank)).toBe(false)
    expect(
      done(6, patchNode(start, 'SES', { description: 'Household income' })),
    ).toBe(false)
  })

  it('checks no longer match a renamed node', () => {
    const c = TASKS[1](startOf(1))
    const node = nodeNamed(c.graph, 'Maternal smoking')!
    const renamed: LessonContext = {
      ...c,
      graph: {
        ...c.graph,
        nodes: c.graph.nodes.map((n) =>
          n.id === node.id ? { ...n, name: 'Smoking' } : n,
        ),
      },
    }
    expect(done(1, renamed)).toBe(false)
  })
})
