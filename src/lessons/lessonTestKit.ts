import { expect } from 'vitest'
import doc from '../../docs/LESSONS.md?raw'
import { analyze } from '@/model/analysis'
import { addEdge, updateNode, type Graph } from '@/model/graph'
import type { Role } from '@/model/schema'
import { useGraphStore } from '@/store/graphStore'
import type { LessonEvent, LessonEventKind } from '@/store/lessonEvents'
import { ANALYSIS_DEFAULTS, type AnalysisKey } from '@/store/uiStore'
import { nodeNamed, practiceGraph, stepDone } from './helpers'
import type {
  Lesson,
  LessonContext,
  LessonPick,
  LessonPointer,
  LessonStep,
} from './types'

/**
 * Shared helpers for the lesson tests (`src/lessons/<id>.test.ts`, spec section 9). Only tests
 * import this module, so it is not part of the app bundle.
 */

// --- docs/LESSONS.md, the source of the lessons' texts ---

/** The part of LESSONS.md about lesson `id`, up to the next rule. */
export function docSection(id: string): string {
  const start = doc.indexOf(`(\`${id}\`)\n`)
  if (start < 0) throw new Error(`LESSONS.md has no lesson "${id}".`)
  const end = doc.indexOf('\n---\n', start)
  return doc.slice(start, end < 0 ? undefined : end)
}

/** The practice graph YAML in lesson `id`'s section; undefined when the section has none. */
export function practiceYaml(id: string): string | undefined {
  return /```yaml\n([\s\S]*?)```/.exec(docSection(id))?.[1]
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

type StepKind = 'reading' | 'check' | 'pick'

/** A step as LESSONS.md writes it: its texts, pointer, pick and kind. */
interface DocStep {
  title: string
  body?: string
  keyIdea?: string
  task?: string
  pointer?: LessonPointer[]
  pick?: LessonPick
  kind: StepKind
}

/** Lesson `id`'s step table, with each pick from its picks table. */
function docSteps(id: string): DocStep[] {
  const section = docSection(id)
  const rows = tableRows(section, '| # | Title | Body |')
  const pickRows = tableRows(section, '| Step | Answers |')
  for (const row of rows) expect(row, `step row ${row[0]}`).toHaveLength(7)
  for (const row of pickRows) {
    expect(row, `pick row ${row[0]}`).toHaveLength(4)
    expect(row[3], `pick ${row[0]} reveal`).toMatch(/^".*"$/)
  }
  const picks = new Map(
    pickRows.map(([step, answers, hints, reveal]): [string, LessonPick] => [
      step,
      {
        answers: answers.split(', '),
        hints: Object.fromEntries(namedTexts(hints)),
        reveal: reveal.slice(1, -1),
      },
    ]),
  )
  expect(picks.size).toBe(rows.filter((r) => r[5] === 'pick').length)
  return rows.map(([n, title, body, keyIdea, task, check, pointer]) => ({
    title,
    body: orNone(body),
    keyIdea: orNone(keyIdea),
    task: orNone(task),
    pointer: pointer
      ? namedTexts(pointer).map(([node, label]) => ({ node, label }))
      : undefined,
    pick: check === 'pick' ? picks.get(n) : undefined,
    kind: check === 'pick' ? 'pick' : check === '' ? 'reading' : 'check',
  }))
}

/**
 * The step table of LESSONS.md numbers the lesson's steps 1, 2, … and each step's texts, pointer,
 * pick and kind (reading, check or pick; a pick step has no check) equal it.
 */
export function expectStepsAsInDoc(lesson: Lesson): void {
  const section = docSection(lesson.id)
  const numbers = tableRows(section, '| # | Title | Body |').map((r) => r[0])
  expect(numbers.length).toBeGreaterThan(0)
  expect(numbers).toEqual(lesson.steps.map((_, i) => String(i + 1)))
  const kind = (step: LessonStep) =>
    step.pick
      ? step.check
        ? 'pick and check'
        : 'pick'
      : step.check
        ? 'check'
        : 'reading'
  expect(
    lesson.steps.map(({ check, ...texts }) => ({
      ...texts,
      kind: kind({ ...texts, check }),
    })),
  ).toEqual(docSteps(lesson.id))
}

/** The practice graph is the YAML of LESSONS.md, parsed afresh on every `sample()` call. */
export function expectPracticeGraphAsInDoc(lesson: Lesson): void {
  const yaml = practiceYaml(lesson.id)
  expect(yaml).toMatch(/^schema: graphcreator\/0\.1\n/)
  const sample = lesson.sample()
  expect(sample).toEqual(practiceGraph(yaml!))
  expect(lesson.sample()).not.toBe(sample)
}

// --- Writing rules and names ---

/** Sentences in `text`: ends of `.`, `?` or `!` before a space or the end; "et al." ends none. */
export function sentenceCount(text: string): number {
  return (
    text.replaceAll('et al.', 'et al').match(/[.?!]["”’)]*(?=\s|$)/g) ?? []
  ).length
}

/** Bodies of at most three sentences, one-sentence key ideas and tasks, labels of three words at most. */
export function expectWritingRules(lesson: Lesson): void {
  for (const step of lesson.steps) {
    if (step.body) expect(sentenceCount(step.body)).toBeLessThanOrEqual(3)
    if (step.keyIdea) expect(sentenceCount(step.keyIdea)).toBe(1)
    if (step.task) expect(sentenceCount(step.task)).toBe(1)
    for (const p of step.pointer ?? []) {
      expect(p.label.split(' ').length).toBeLessThanOrEqual(3)
    }
  }
}

/** Every pointer, answer and hint names a practice node; no hint is for an answer. */
export function expectNamesExist(lesson: Lesson): void {
  const names = lesson.sample().nodes.map((n) => n.name)
  for (const step of lesson.steps) {
    for (const p of step.pointer ?? []) expect(names).toContain(p.node)
    if (!step.pick) continue
    for (const a of step.pick.answers) expect(names).toContain(a)
    for (const h of Object.keys(step.pick.hints)) {
      expect(names).toContain(h)
      expect(step.pick.answers).not.toContain(h)
    }
  }
}

/** Each pick is answered by selecting one of its answers, and not by another node, an edge or nothing. */
export function expectPicksAnsweredOnlyByAnswers(lesson: Lesson): void {
  const graph = lesson.sample()
  const start = contextFor(graph)
  for (const step of lesson.steps) {
    if (!step.pick) continue
    for (const { name } of graph.nodes) {
      expect(stepDone(step, select(name)(start)), name).toBe(
        step.pick.answers.includes(name),
      )
    }
    const edge = { kind: 'edge' as const, id: graph.edges[0].id }
    expect(stepDone(step, { ...start, selection: edge })).toBe(false)
    expect(stepDone(step, start)).toBe(false)
  }
}

// --- Nodes by name ---

/** The id of the node named `name`; throws when there is none. */
export function idOf(graph: Graph, name: string): string {
  const node = nodeNamed(graph, name)
  if (!node) throw new Error(`No node named "${name}".`)
  return node.id
}

/** The name of the node with id `id`; throws when there is none. */
export function nameOf(graph: Graph, id: string): string {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`No node with id "${id}".`)
  return node.name
}

/** Names of the nodes in `ids`, in graph order. */
export function names(graph: Graph, ids: Iterable<string>): string[] {
  const set = new Set(ids)
  return graph.nodes.filter((n) => set.has(n.id)).map((n) => n.name)
}

/** `graph` with the named nodes given these roles. */
export function withRoles(graph: Graph, roles: Record<string, Role>): Graph {
  return Object.entries(roles).reduce(
    (g, [name, role]) => updateNode(g, idOf(g, name), { role }),
    graph,
  )
}

/** `graph` with the named nodes adjusted. */
export function adjusted(graph: Graph, ...nodes: string[]): Graph {
  return withRoles(
    graph,
    Object.fromEntries(nodes.map((name) => [name, 'adjusted' as Role])),
  )
}

// --- The scripted run: each step's task, applied as the user would ---

/** What a step check sees right after the lesson loads `graph`: nothing selected, the Edit tab, the default Analysis switches, no events. */
export function contextFor(graph: Graph): LessonContext {
  return {
    graph,
    selection: null,
    sidePanelTab: 'edit',
    analysisOn: { ...ANALYSIS_DEFAULTS },
    events: [],
  }
}

/** One thing the user does. */
export type Task = (ctx: LessonContext) => LessonContext

/** Each checked step's task, by step number (1-based); reading steps have none. */
export type Tasks = Record<number, Task>

/** The tasks one after the other. */
export const inOrder =
  (...tasks: Task[]): Task =>
  (ctx) =>
    tasks.reduce((c, task) => task(c), ctx)

/** Clicking a node selects it, and the side panel switches to Edit (spec 5.8). */
export const select =
  (name: string): Task =>
  (ctx) => ({
    ...ctx,
    selection: { kind: 'node', id: idOf(ctx.graph, name) },
    sidePanelTab: 'edit',
  })

/** Selects a node and sets its role in the Edit tab. */
export const setRole =
  (name: string, role: Role): Task =>
  (ctx) => {
    const selected = select(name)(ctx)
    return {
      ...selected,
      graph: updateNode(selected.graph, idOf(selected.graph, name), { role }),
    }
  }

/** Opens the Analysis tab and switches on `keys`. */
export const openAnalysis =
  (...keys: AnalysisKey[]): Task =>
  (ctx) => ({
    ...ctx,
    sidePanelTab: 'analysis',
    analysisOn: {
      ...ctx.analysisOn,
      ...Object.fromEntries(keys.map((key) => [key, true])),
    },
  })

/** Draws the edge from `from` to `to`; throws when the canvas would refuse it. */
export const drawEdge =
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

/** Clicks Use this set next to `names` in the Analysis tab: the store's `setAdjustedSet`. */
export const useSet =
  (names: string[]): Task =>
  (ctx) => {
    const listed = analyze(ctx.graph).adjustment?.sets ?? []
    const set = listed.find(
      (s) =>
        s.map((id) => nameOf(ctx.graph, id)).join(', ') === names.join(', '),
    )
    if (!set) throw new Error(`No Use this set next to ${names.join(', ')}.`)
    useGraphStore.getState().replaceGraph(ctx.graph)
    useGraphStore.getState().setAdjustedSet(set)
    return {
      ...ctx,
      sidePanelTab: 'analysis',
      graph: useGraphStore.getState().graph,
    }
  }

/** `ctx` with `event` recorded. */
export const withEvent = (
  ctx: LessonContext,
  event: LessonEvent,
): LessonContext => ({ ...ctx, events: [...ctx.events, event] })

/** Records a lesson event, as the dialogs, the canvas and undo do. */
export const event =
  (kind: LessonEventKind, format?: string): Task =>
  (ctx) =>
    withEvent(ctx, format === undefined ? { kind } : { kind, format })

/** The context at the start of step `n` (1-based): the practice graph with every earlier task applied, no events. */
export function stepStart(
  lesson: Lesson,
  tasks: Tasks,
  n: number,
): LessonContext {
  let ctx = contextFor(lesson.sample())
  for (let m = 1; m < n; m++) ctx = tasks[m]?.(ctx) ?? ctx
  return { ...ctx, events: [] }
}

/**
 * Runs the steps in order. Exactly the steps with a check or a pick have a scripted task, and
 * exactly those show a task text; each is not done at its start and done after its task. Reading
 * steps are done at once.
 */
export function expectScriptedRun(lesson: Lesson, tasks: Tasks): void {
  expect(Object.keys(tasks), 'steps with a scripted task').toEqual(
    lesson.steps.flatMap((s, i) => (s.check || s.pick ? [String(i + 1)] : [])),
  )
  let ctx = contextFor(lesson.sample())
  lesson.steps.forEach((step, i) => {
    const n = i + 1
    const task = tasks[n]
    ctx = { ...ctx, events: [] }
    expect(step.task !== undefined, `step ${n} shows a task`).toBe(
      task !== undefined,
    )
    expect(stepDone(step, ctx), `step ${n} at its start`).toBe(!task)
    if (task) ctx = task(ctx)
    expect(stepDone(step, ctx), `step ${n} after its task`).toBe(true)
  })
}

// --- The analysis, by name ---

/** The adjustment result of `analyze`, with node names: `sets` in their order, `zForbidden` in graph order. */
export function adjustmentOf(graph: Graph) {
  const result = analyze(graph).adjustment
  if (!result) throw new Error('No adjustment result.')
  return {
    ...result,
    sets: result.sets.map((s) => s.map((id) => nameOf(graph, id))),
    zForbidden: names(graph, result.zForbidden),
  }
}

/** The minimal sufficient adjustment sets, by name. */
export const setsOf = (graph: Graph): string[][] => adjustmentOf(graph).sets

/** Each path as the Paths section writes it (`A → B ← C`), with its kind and `open` or `closed`. */
export function pathsOf(graph: Graph): [string, string, 'open' | 'closed'][] {
  const result = analyze(graph).paths
  if (!result) throw new Error('No paths result.')
  return result.paths.map(({ nodes, kind, open }) => {
    let text = nameOf(graph, nodes[0])
    for (let i = 1; i < nodes.length; i++) {
      const forward = graph.edges.some(
        (e) => e.source === nodes[i - 1] && e.target === nodes[i],
      )
      text += `${forward ? ' → ' : ' ← '}${nameOf(graph, nodes[i])}`
    }
    return [text, kind, open ? 'open' : 'closed']
  })
}

/** The Independencies section's rows: `A ⫫ B` or `A ⫫ B | C, D`. */
export function independenciesOf(graph: Graph): string[] {
  return analyze(graph).independencies.map(({ a, b, given }) => {
    const pair = `${nameOf(graph, a)} ⫫ ${nameOf(graph, b)}`
    if (given.length === 0) return pair
    return `${pair} | ${given.map((id) => nameOf(graph, id)).join(', ')}`
  })
}
