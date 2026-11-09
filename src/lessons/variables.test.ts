import { describe, expect, it } from 'vitest'
import { updateNode, type GNode, type Graph } from '@/model/graph'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import doc from '../../docs/LESSONS.md?raw'
import { nodeNamed, practiceGraph, stepDone } from './helpers'
import { findLesson, LESSONS } from './index'
import type { LessonContext, LessonPointer } from './types'
import { variablesLesson as lesson } from './variables'

interface DocStep {
  title: string
  body?: string
  keyIdea?: string
  task?: string
  pointer?: LessonPointer[]
}

/** Lesson `id`'s section of docs/LESSONS.md: its practice graph YAML and its step table. */
function lessonDoc(id: string): { yaml?: string; steps: DocStep[] } {
  const start = doc.indexOf(`(\`${id}\`)\n`)
  if (start < 0) throw new Error(`no section for ${id} in LESSONS.md`)
  const section = doc.slice(start, doc.indexOf('\n---\n', start))
  const yaml = /```yaml\n([\s\S]*?)```/.exec(section)?.[1]
  const steps = section
    .split('\n')
    .filter((line) => /^\| \d+ \|/.test(line))
    .map((line): DocStep => {
      const [, title, body, keyIdea, task, , pointer] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
      return {
        title,
        body: body || undefined,
        keyIdea: keyIdea || undefined,
        task: task || undefined,
        pointer: pointer
          ? [...pointer.matchAll(/([^;:]+): "([^"]+)"/g)].map(
              ([, node, label]) => ({ node: node.trim(), label }),
            )
          : undefined,
      }
    })
  return { yaml, steps }
}

const sentences = (text: string) => (text.match(/[.?!](?=\s|$)/g) ?? []).length

function ctx(graph: Graph): LessonContext {
  return {
    graph,
    selection: null,
    sidePanelTab: 'edit',
    analysisOn: { ...ANALYSIS_DEFAULTS },
    events: [],
  }
}

/** `ctx` with the named node patched. */
function patchNode(
  c: LessonContext,
  name: string,
  patch: Partial<Omit<GNode, 'id' | 'name'>>,
): LessonContext {
  const node = nodeNamed(c.graph, name)
  if (!node) throw new Error(`no node ${name}`)
  return { ...c, graph: updateNode(c.graph, node.id, patch) }
}

/** Each step's scripted task; null for a reading step. */
const TASKS: (((c: LessonContext) => LessonContext) | null)[] = [
  (c) => patchNode(c, 'Maternal smoking', { role: 'exposure' }),
  (c) => patchNode(c, 'Birth weight', { role: 'outcome' }),
  (c) => patchNode(c, 'Genetic factors', { role: 'latent' }),
  (c) => patchNode(c, 'Birth weight', { varType: 'continuous', unit: 'g' }),
  (c) =>
    patchNode(c, 'SES', { varType: 'ordinal', levels: ['low', 'mid', 'high'] }),
  (c) =>
    patchNode(c, 'Maternal smoking', {
      description: 'Self-reported during pregnancy',
    }),
  null,
]

/** The context at the start of step `i` (0-based): every earlier task applied, no events. */
function startOf(i: number): LessonContext {
  let c = ctx(lesson.sample())
  for (const task of TASKS.slice(0, i)) if (task) c = task(c)
  return { ...c, events: [] }
}

const done = (i: number, c: LessonContext) => stepDone(lesson.steps[i], c)

describe('variables lesson', () => {
  const fromDoc = lessonDoc('variables')

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
    expect(fromDoc.yaml).toBeDefined()
    const graph = lesson.sample()
    expect(graph).toEqual(practiceGraph(fromDoc.yaml!))
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
    expect(lesson.sample()).not.toBe(graph)
  })

  it('has the step texts and pointers of LESSONS.md', () => {
    expect(fromDoc.steps).toHaveLength(7)
    expect(
      lesson.steps.map(({ title, body, keyIdea, task, pointer }) => ({
        title,
        body,
        keyIdea,
        task,
        pointer,
      })),
    ).toEqual(fromDoc.steps)
  })

  it('keeps bodies to three sentences, key ideas and tasks to one, labels to three words', () => {
    for (const step of lesson.steps) {
      expect(sentences(step.body ?? '')).toBeLessThanOrEqual(3)
      if (step.keyIdea) expect(sentences(step.keyIdea)).toBe(1)
      if (step.task) expect(sentences(step.task)).toBe(1)
      for (const p of step.pointer ?? [])
        expect(p.label.split(' ').length).toBeLessThanOrEqual(3)
    }
  })

  it('points only at nodes of the practice graph and has no picks', () => {
    const graph = lesson.sample()
    for (const step of lesson.steps) {
      expect(step.pick).toBeUndefined()
      for (const p of step.pointer ?? [])
        expect(nodeNamed(graph, p.node)).toBeDefined()
    }
  })

  it('each checked step is not done at its start and done after its task', () => {
    expect(TASKS).toHaveLength(lesson.steps.length)
    lesson.steps.forEach((step, i) => {
      const start = startOf(i)
      const task = TASKS[i]
      if (!task) {
        expect(step.check).toBeUndefined()
        expect(done(i, start)).toBe(true)
        return
      }
      expect(step.check).toBeDefined()
      expect(done(i, start), `step ${i + 1} at its start`).toBe(false)
      expect(done(i, task(start)), `step ${i + 1} after its task`).toBe(true)
    })
  })

  it('step 1 needs Maternal smoking as the exposure', () => {
    const start = startOf(0)
    expect(
      done(0, patchNode(start, 'Birth weight', { role: 'exposure' })),
    ).toBe(false)
    expect(
      done(0, patchNode(start, 'Maternal smoking', { role: 'outcome' })),
    ).toBe(false)
  })

  it('step 4 needs both the continuous type and the unit g, trimmed and ignoring case', () => {
    const start = startOf(3)
    const continuous = patchNode(start, 'Birth weight', {
      varType: 'continuous',
    })
    expect(done(3, continuous)).toBe(false)
    expect(done(3, patchNode(continuous, 'Birth weight', { unit: 'kg' }))).toBe(
      false,
    )
    expect(
      done(3, patchNode(continuous, 'Birth weight', { unit: ' G ' })),
    ).toBe(true)
    const discrete = patchNode(start, 'Birth weight', {
      varType: 'discrete',
      unit: 'g',
    })
    expect(done(3, discrete)).toBe(false)
  })

  it('step 5 needs SES ordinal with low, mid, high in order, trimmed and ignoring case', () => {
    const start = startOf(4)
    const ses = (patch: Partial<GNode>) =>
      done(4, patchNode(start, 'SES', patch))
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
    const start = startOf(5)
    const blank: LessonContext = {
      ...start,
      graph: {
        ...start.graph,
        nodes: start.graph.nodes.map((n) =>
          n.name === 'Maternal smoking' ? { ...n, description: '  ' } : n,
        ),
      },
    }
    expect(done(5, blank)).toBe(false)
    expect(
      done(5, patchNode(start, 'SES', { description: 'Household income' })),
    ).toBe(false)
  })

  it('checks no longer match a renamed node', () => {
    const c = TASKS[0]!(startOf(0))
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
    expect(done(0, renamed)).toBe(false)
  })
})
