import { describe, expect, it } from 'vitest'
import { canAddEdge, updateEdge, type GEdge, type Graph } from '@/model/graph'
import type { LessonEvent } from '@/store/lessonEvents'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import doc from '../../docs/LESSONS.md?raw'
import { arrowsLesson as lesson } from './arrows'
import { edgeNamed, nodeNamed, practiceGraph, stepDone } from './helpers'
import { findLesson, LESSONS } from './index'
import type { LessonContext, LessonPointer } from './types'

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

const withEvent = (c: LessonContext, event: LessonEvent): LessonContext => ({
  ...c,
  events: [...c.events, event],
})

const selectEdge = (
  c: LessonContext,
  from: string,
  to: string,
): LessonContext => ({
  ...c,
  selection: { kind: 'edge', id: edge(c.graph, from, to).id },
})

/** Each step's scripted task; null for a reading step. */
const TASKS: (((c: LessonContext) => LessonContext) | null)[] = [
  (c) => selectEdge(c, 'SES', 'Maternal smoking'),
  (c) => patchEdge(c, 'SES', 'Maternal smoking', { evidence: ['PMID:123'] }),
  (c) => patchEdge(c, 'SES', 'Maternal smoking', { note: 'Well established' }),
  null,
  // What the canvas records when it refuses Birth weight → SES.
  (c) => withEvent(c, { kind: 'edge-refused', format: 'cycle' }),
  null,
]

/** The context at the start of step `i` (0-based): every earlier task applied, no events. */
function startOf(i: number): LessonContext {
  let c = ctx(lesson.sample())
  for (const task of TASKS.slice(0, i)) if (task) c = task(c)
  return { ...c, events: [] }
}

const done = (i: number, c: LessonContext) => stepDone(lesson.steps[i], c)

describe('arrows lesson', () => {
  const fromDoc = lessonDoc('arrows')

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
    expect(fromDoc.yaml).toBeDefined()
    const graph = lesson.sample()
    expect(graph).toEqual(practiceGraph(fromDoc.yaml!))
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
    expect(fromDoc.steps).toHaveLength(6)
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

  it('step 1 needs exactly the edge SES → Maternal smoking selected', () => {
    const start = startOf(0)
    expect(done(0, selectEdge(start, 'SES', 'Birth weight'))).toBe(false)
    const ses = nodeNamed(start.graph, 'SES')!
    expect(done(0, { ...start, selection: { kind: 'node', id: ses.id } })).toBe(
      false,
    )
  })

  it('steps 2 and 3 look at the edge SES → Maternal smoking only', () => {
    expect(
      done(
        1,
        patchEdge(startOf(1), 'SES', 'Birth weight', { evidence: ['x'] }),
      ),
    ).toBe(false)
    expect(
      done(2, patchEdge(startOf(2), 'SES', 'Birth weight', { note: 'Strong' })),
    ).toBe(false)
    const blank = startOf(2)
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
    expect(done(2, blankNote)).toBe(false)
  })

  it('step 5 needs a refusal because of a cycle', () => {
    const start = startOf(4)
    expect(
      done(4, withEvent(start, { kind: 'edge-refused', format: 'duplicate' })),
    ).toBe(false)
    expect(done(4, withEvent(start, { kind: 'edge-refused' }))).toBe(false)
    expect(done(4, withEvent(start, { kind: 'undo' }))).toBe(false)
  })

  describe('claims', () => {
    const graph = lesson.sample()
    const id = (name: string) => nodeNamed(graph, name)!.id

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
