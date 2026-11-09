import { describe, expect, it } from 'vitest'
import { moveNode, type Graph } from '@/model/graph'
import { toYaml } from '@/model/yaml'
import smokingYaml from '@/model/__fixtures__/smoking.dag.yaml?raw'
import type { LessonEvent } from '@/store/lessonEvents'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import doc from '../../docs/LESSONS.md?raw'
import { filesLesson as lesson } from './files'
import { nodeNamed, stepDone } from './helpers'
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

const withEvent = (c: LessonContext, event: LessonEvent): LessonContext => ({
  ...c,
  events: [...c.events, event],
})

/**
 * Each step's scripted task, as the events the app records (spec 4.8); null for a reading step.
 * Opening a dialog records `code-opened` first, which no check accepts on its own.
 */
const TASKS: (((c: LessonContext) => LessonContext) | null)[] = [
  null,
  // Save opens the GraphCreator dialog; Download.
  (c) =>
    withEvent(withEvent(c, { kind: 'code-opened', format: 'yaml' }), {
      kind: 'code-downloaded',
      format: 'yaml',
    }),
  // Save as… → dagitty…; Copy.
  (c) =>
    withEvent(withEvent(c, { kind: 'code-opened', format: 'dagitty' }), {
      kind: 'code-copied',
      format: 'dagitty',
    }),
  (c) => withEvent(c, { kind: 'export-downloaded', format: 'pdf' }),
  (c) => withEvent(c, { kind: 'link-copied' }),
  // Move a circle, then Ctrl+Z: the graph is back as it was.
  (c) => withEvent(c, { kind: 'undo' }),
  null,
]

/** The context at the start of step `i` (0-based): every earlier task applied, no events. */
function startOf(i: number): LessonContext {
  let c = ctx(lesson.sample())
  for (const task of TASKS.slice(0, i)) if (task) c = task(c)
  return { ...c, events: [] }
}

const done = (i: number, c: LessonContext) => stepDone(lesson.steps[i], c)

describe('files lesson', () => {
  const fromDoc = lessonDoc('files')

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
    expect(fromDoc.yaml).toBeUndefined()
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

  it('keeps bodies to three sentences, key ideas and tasks to one', () => {
    for (const step of lesson.steps) {
      expect(sentences(step.body ?? '')).toBeLessThanOrEqual(3)
      if (step.keyIdea) expect(sentences(step.keyIdea)).toBe(1)
      if (step.task) expect(sentences(step.task)).toBe(1)
    }
  })

  it('has no pointers and no picks', () => {
    for (const step of lesson.steps) {
      expect(step.pick).toBeUndefined()
      expect(step.pointer).toBeUndefined()
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

  it('step 2 needs a GraphCreator download', () => {
    const start = startOf(1)
    const after = (event: LessonEvent) => done(1, withEvent(start, event))
    expect(after({ kind: 'code-opened', format: 'yaml' })).toBe(false)
    expect(after({ kind: 'code-copied', format: 'yaml' })).toBe(false)
    expect(after({ kind: 'code-downloaded', format: 'dagitty' })).toBe(false)
  })

  it('step 3 needs a dagitty copy or download', () => {
    const start = startOf(2)
    const after = (event: LessonEvent) => done(2, withEvent(start, event))
    expect(after({ kind: 'code-downloaded', format: 'dagitty' })).toBe(true)
    expect(after({ kind: 'code-opened', format: 'dagitty' })).toBe(false)
    expect(after({ kind: 'code-copied', format: 'gml' })).toBe(false)
    expect(after({ kind: 'code-downloaded', format: 'yaml' })).toBe(false)
  })

  it('step 4 needs a PDF download', () => {
    const start = startOf(3)
    const after = (event: LessonEvent) => done(3, withEvent(start, event))
    expect(after({ kind: 'export-downloaded', format: 'png' })).toBe(false)
    expect(after({ kind: 'export-copied', format: 'svg' })).toBe(false)
  })

  it('step 6 needs an undo, not just a move', () => {
    const start = startOf(5)
    const ses = nodeNamed(start.graph, 'SES')!
    const moved = {
      ...start,
      graph: moveNode(start.graph, ses.id, { x: 0, y: 0 }),
    }
    expect(done(5, moved)).toBe(false)
    expect(done(5, withEvent(moved, { kind: 'undo' }))).toBe(true)
  })
})
