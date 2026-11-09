import { describe, expect, it } from 'vitest'
import doc from '../../docs/LESSONS.md?raw'
import { analyze } from '@/model/analysis'
import { dConnected } from '@/model/analysis/dsep'
import { addEdge, updateNode, type Graph } from '@/model/graph'
import type { Role } from '@/model/schema'
import { ANALYSIS_DEFAULTS, type AnalysisKey } from '@/store/uiStore'
import { extendedExample } from './adjustment'
import { nodeNamed, stepDone } from './helpers'
import { testingLesson as lesson } from './testing'
import type { Lesson, LessonContext } from './types'

// --- LESSONS.md, the source of the lesson's texts (the same block is in each lesson test) ---

/** The part of LESSONS.md about lesson `id`, up to the next rule. */
function docSection(id: string): string {
  const start = doc.indexOf(`(\`${id}\`)\n`)
  if (start < 0) throw new Error(`LESSONS.md has no lesson "${id}".`)
  const end = doc.indexOf('\n---\n', start)
  return doc.slice(start, end < 0 ? undefined : end)
}

/** The cells of a Markdown table row; `\|` is a literal bar. */
function cells(row: string): string[] {
  return row
    .trim()
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll('\\|', '|'))
}

/** The body rows of the first table whose header starts with `header`. */
function tableRows(section: string, header: string): string[][] {
  const lines = section.split('\n')
  const at = lines.findIndex((line) => line.startsWith(header))
  if (at < 0) return []
  const rows: string[][] = []
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break
    rows.push(cells(line))
  }
  return rows
}

/** `Name: "text"` pairs, as in the Pointer and Wrong-pick hints columns. */
function namedTexts(cell: string): [string, string][] {
  return [...cell.matchAll(/([^";]+?): "([^"]*)"/g)].map((m) => [
    m[1].trim(),
    m[2],
  ])
}

const orNone = (cell: string) => (cell === '' ? undefined : cell)

function sentenceCount(text: string): number {
  return text
    .replaceAll('et al.', 'et al')
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s !== '').length
}

/** Texts, pointers, picks and the kind of each step equal LESSONS.md. */
function expectStepsAsInDoc(l: Lesson): void {
  const section = docSection(l.id)
  const rows = tableRows(section, '| # | Title | Body |')
  expect(rows.map((r) => r[0])).toEqual(l.steps.map((_, i) => String(i + 1)))
  expect(
    l.steps.map((s) => [
      s.title,
      s.body,
      s.keyIdea,
      s.task,
      s.pointer?.map((p) => [p.node, p.label]) ?? [],
    ]),
  ).toEqual(
    rows.map((r) => [
      r[1],
      orNone(r[2]),
      orNone(r[3]),
      orNone(r[4]),
      namedTexts(r[6]),
    ]),
  )
  expect(
    l.steps.map((s) => (s.pick ? 'pick' : s.check ? 'check' : 'reading')),
  ).toEqual(
    rows.map((r) =>
      r[5] === 'pick' ? 'pick' : r[5] === '' ? 'reading' : 'check',
    ),
  )
  const picks = tableRows(section, '| Step | Answers |')
  expect(picks.length).toBe(l.steps.filter((s) => s.pick).length)
  for (const [step, answers, hints, reveal] of picks) {
    expect(reveal).toMatch(/^".*"$/)
    expect(l.steps[Number(step) - 1].pick).toEqual({
      answers: answers.split(', '),
      hints: Object.fromEntries(namedTexts(hints)),
      reveal: reveal.slice(1, -1),
    })
  }
}

/** Bodies of at most three sentences, one-sentence key ideas, pointer labels of three words at most. */
function expectWritingRules(l: Lesson): void {
  for (const step of l.steps) {
    if (step.body) expect(sentenceCount(step.body)).toBeLessThanOrEqual(3)
    if (step.keyIdea) expect(sentenceCount(step.keyIdea)).toBe(1)
    if (step.task) expect(sentenceCount(step.task)).toBe(1)
    for (const p of step.pointer ?? []) {
      expect(p.label.split(' ').length).toBeLessThanOrEqual(3)
    }
  }
}

/** Every pointer, answer and hint names a practice node; no hint is for an answer. */
function expectNamesExist(l: Lesson): void {
  const names = new Set(l.sample().nodes.map((n) => n.name))
  for (const step of l.steps) {
    for (const p of step.pointer ?? []) expect(names).toContain(p.node)
    if (!step.pick) continue
    for (const a of step.pick.answers) expect(names).toContain(a)
    for (const h of Object.keys(step.pick.hints)) {
      expect(names).toContain(h)
      expect(step.pick.answers).not.toContain(h)
    }
  }
}

/** Each pick is answered by selecting one of its answers and by no other node. */
function expectPicksAnsweredOnlyByAnswers(l: Lesson): void {
  const graph = l.sample()
  for (const step of l.steps) {
    if (!step.pick) continue
    for (const n of graph.nodes) {
      const ctx: LessonContext = {
        ...begin(graph),
        selection: { kind: 'node', id: n.id },
      }
      expect(stepDone(step, ctx), n.name).toBe(
        step.pick.answers.includes(n.name),
      )
    }
  }
}

// --- The scripted run: each step's task, applied as the user would ---

type Task = (ctx: LessonContext) => LessonContext

function begin(graph: Graph): LessonContext {
  return {
    graph,
    selection: null,
    sidePanelTab: 'edit',
    analysisOn: { ...ANALYSIS_DEFAULTS },
    events: [],
  }
}

function idOf(graph: Graph, name: string): string {
  const node = nodeNamed(graph, name)
  if (!node) throw new Error(`No node named "${name}".`)
  return node.id
}

function nameOf(graph: Graph, id: string): string {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`No node with id "${id}".`)
  return node.name
}

/** Clicking a node selects it, and the side panel switches to Edit (spec 5.8). */
const select =
  (name: string): Task =>
  (ctx) => ({
    ...ctx,
    selection: { kind: 'node', id: idOf(ctx.graph, name) },
    sidePanelTab: 'edit',
  })

const drawEdge =
  (from: string, to: string): Task =>
  (ctx) => {
    const result = addEdge(
      ctx.graph,
      idOf(ctx.graph, from),
      idOf(ctx.graph, to),
    )
    if (!result.ok) throw new Error(result.errors[0].message)
    return { ...ctx, graph: result.value }
  }

/** Opens the Analysis tab and switches on `keys`. */
const openAnalysis =
  (...keys: AnalysisKey[]): Task =>
  (ctx) => ({
    ...ctx,
    sidePanelTab: 'analysis',
    analysisOn: {
      ...ctx.analysisOn,
      ...Object.fromEntries(keys.map((key) => [key, true])),
    },
  })

/** Runs the steps in order: each checked step is not done at its start and done after its task. */
function expectScriptedRun(l: Lesson, tasks: Record<number, Task>): void {
  let ctx = begin(l.sample())
  l.steps.forEach((step, i) => {
    const n = i + 1
    ctx = { ...ctx, events: [] }
    if (!step.check && !step.pick) {
      expect(tasks[n], `step ${n} is a reading step`).toBeUndefined()
      expect(stepDone(step, ctx), `step ${n}`).toBe(true)
      return
    }
    expect(stepDone(step, ctx), `step ${n} at its start`).toBe(false)
    ctx = tasks[n](ctx)
    expect(stepDone(step, ctx), `step ${n} after its task`).toBe(true)
  })
}

// --- The analysis, by name ---

function withRoles(graph: Graph, roles: Record<string, Role>): Graph {
  return Object.entries(roles).reduce(
    (g, [name, role]) => updateNode(g, idOf(g, name), { role }),
    graph,
  )
}

/** The Independencies section's rows: `A ⫫ B` or `A ⫫ B | C, D`. */
function independenciesOf(graph: Graph): string[] {
  return analyze(graph).independencies.map(({ a, b, given }) => {
    const pair = `${nameOf(graph, a)} ⫫ ${nameOf(graph, b)}`
    if (given.length === 0) return pair
    return `${pair} | ${given.map((id) => nameOf(graph, id)).join(', ')}`
  })
}

// --- Lesson 12 ---

describe('testing lesson', () => {
  const sample = lesson.sample()

  it('has the metadata of LESSONS.md', () => {
    expect([lesson.id, lesson.title, lesson.summary, lesson.track]).toEqual([
      'testing',
      'Testing your DAG',
      'Independencies you can check in your data.',
      'causal',
    ])
  })

  it('loads the practice graph of lesson 11', () => {
    expect(docSection('testing')).toContain(
      'Practice graph: the lesson 11 graph.',
    )
    expect(sample).toEqual(extendedExample())
  })

  it('has the texts, pointers and picks of LESSONS.md', () => {
    expectStepsAsInDoc(lesson)
    expectWritingRules(lesson)
  })

  it('names only nodes of the practice graph', () => {
    expectNamesExist(lesson)
  })

  it('answers each pick only with an answer node', () => {
    expectPicksAnsweredOnlyByAnswers(lesson)
  })

  it('completes each step with its task, and not before', () => {
    expectScriptedRun(lesson, {
      2: openAnalysis('independencies'),
      4: select('Maternal smoking'),
      5: drawEdge('SES', 'Maternal age'),
    })
  })

  describe('claims', () => {
    const ses = idOf(sample, 'SES')
    const age = idOf(sample, 'Maternal age')

    it('lists SES ⫫ Maternal age and Maternal smoking ⫫ Diet | SES', () => {
      const rows = independenciesOf(sample)
      expect(rows).toContain('SES ⫫ Maternal age')
      expect(rows).toContain('Maternal smoking ⫫ Diet | SES')
    })

    it('every path between SES and Maternal age has Maternal smoking or Birth weight as a collider', () => {
      // The Paths section's paths, with SES as the exposure and Maternal age as the outcome.
      const pair = withRoles(sample, {
        'Maternal smoking': 'other',
        'Birth weight': 'other',
        SES: 'exposure',
        'Maternal age': 'outcome',
      })
      const paths = analyze(pair).paths?.paths ?? []
      expect(paths.length).toBeGreaterThan(1)
      const into = (from: string, to: string) =>
        pair.edges.some((e) => e.source === from && e.target === to)
      for (const { nodes, open } of paths) {
        const colliders = nodes
          .slice(1, -1)
          .filter((v, i) => into(nodes[i], v) && into(nodes[i + 2], v))
          .map((id) => nameOf(pair, id))
        expect(
          colliders.some(
            (c) => c === 'Maternal smoking' || c === 'Birth weight',
          ),
        ).toBe(true)
        expect(open).toBe(false)
      }
    })

    it('SES and Maternal age are d-separated given nothing', () => {
      expect(dConnected(sample, [ses], [age], [])).toBe(false)
    })

    it('with SES → Maternal age, no independence pairs SES with Maternal age', () => {
      const joined = drawEdge('SES', 'Maternal age')(begin(sample)).graph
      expect(dConnected(joined, [ses], [age], [])).toBe(true)
      const pairs = analyze(joined).independencies.map((i) => [i.a, i.b])
      expect(pairs.length).toBeGreaterThan(0)
      expect(pairs).not.toContainEqual([ses, age])
      expect(pairs).not.toContainEqual([age, ses])
      expect(independenciesOf(joined)).not.toContain('SES ⫫ Maternal age')
    })
  })
})
