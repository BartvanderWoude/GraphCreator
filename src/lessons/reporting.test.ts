import { describe, expect, it } from 'vitest'
import doc from '../../docs/LESSONS.md?raw'
import { analyze, rolesOf } from '@/model/analysis'
import type { Graph } from '@/model/graph'
import { toYaml } from '@/model/yaml'
import type { LessonEventKind } from '@/store/lessonEvents'
import { ANALYSIS_DEFAULTS, type AnalysisKey } from '@/store/uiStore'
import { nodeNamed, practiceGraph, stepDone } from './helpers'
import { reportingLesson as lesson } from './reporting'
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

function setsOf(graph: Graph): string[][] {
  const result = analyze(graph).adjustment
  if (!result) throw new Error('No adjustment result.')
  return result.sets.map((s) => s.map((id) => nameOf(graph, id)))
}

/** Records a lesson event, as the dialogs do. */
const event =
  (kind: LessonEventKind, format?: string): Task =>
  (ctx) => ({ ...ctx, events: [...ctx.events, { kind, format }] })

/** Nodes and edges by name, with every field the file keeps. */
function described(graph: Graph) {
  return {
    nodes: graph.nodes.map(({ id: _id, ...rest }) => rest),
    edges: graph.edges.map(({ id: _id, source, target, ...rest }) => ({
      from: nameOf(graph, source),
      to: nameOf(graph, target),
      ...rest,
    })),
  }
}

// --- Lesson 14 ---

describe('reporting lesson', () => {
  const sample = lesson.sample()

  it('has the metadata of LESSONS.md', () => {
    expect([lesson.id, lesson.title, lesson.summary, lesson.track]).toEqual([
      'reporting',
      'Reporting your DAG',
      'What to show and say in a paper.',
      'causal',
    ])
  })

  it('loads lesson 11’s graph with the roles, evidence, note and latent node of LESSONS.md', () => {
    const yaml = /```yaml\n([\s\S]*?)```/.exec(docSection('adjustment'))?.[1]
    const base = described(practiceGraph(yaml ?? ''))
    expect(docSection('reporting')).toContain(
      'Practice graph: the lesson 11 graph with SES and Maternal age `adjusted`, evidence `["PMID:123"]` and note `Well established` on SES → Maternal smoking, and a latent `Genetic factors` (`var_type: continuous`, `pos: [400, 160]`) with an arrow to Birth weight.',
    )
    expect(described(sample)).toEqual({
      nodes: [
        ...base.nodes.map((n) =>
          n.name === 'SES' || n.name === 'Maternal age'
            ? { ...n, role: 'adjusted' }
            : n,
        ),
        {
          name: 'Genetic factors',
          role: 'latent',
          varType: 'continuous',
          pos: { x: 400, y: 160 },
        },
      ],
      edges: [
        ...base.edges.map((e) =>
          e.from === 'SES' && e.to === 'Maternal smoking'
            ? { ...e, evidence: ['PMID:123'], note: 'Well established' }
            : e,
        ),
        { from: 'Genetic factors', to: 'Birth weight', evidence: [] },
      ],
    })
    expect(practiceGraph(toYaml(sample))).toEqual(sample)
    expect(lesson.sample()).not.toBe(sample)
  })

  it('has the texts and pointers of LESSONS.md', () => {
    expectStepsAsInDoc(lesson)
    expectWritingRules(lesson)
  })

  it('names only nodes of the practice graph', () => {
    expectNamesExist(lesson)
  })

  it('completes each step with its task, and not before', () => {
    expectScriptedRun(lesson, {
      2: openAnalysis(),
      3: event('export-downloaded', 'pdf'),
      5: event('code-downloaded', 'yaml'),
    })
  })

  it('needs the Report switched on, and a picture or the GraphCreator file downloaded', () => {
    const [, report, picture, , file] = lesson.steps
    const start = begin(sample)
    const analysis = openAnalysis()(start)
    expect(
      report.check?.({
        ...analysis,
        analysisOn: { ...analysis.analysisOn, report: false },
      }),
    ).toBe(false)
    for (const format of ['pdf', 'png', 'svg']) {
      expect(picture.check?.(event('export-downloaded', format)(start))).toBe(
        true,
      )
    }
    expect(picture.check?.(event('export-downloaded', 'tikz')(start))).toBe(
      false,
    )
    expect(picture.check?.(event('export-copied', 'png')(start))).toBe(false)
    expect(file.check?.(event('code-downloaded', 'dagitty')(start))).toBe(false)
    expect(file.check?.(event('code-copied', 'yaml')(start))).toBe(false)
  })

  describe('claims (SES and Maternal age adjusted)', () => {
    const result = analyze(sample)

    it('the adjusted set is sufficient', () => {
      expect(rolesOf(sample).z.map((id) => nameOf(sample, id))).toEqual([
        'SES',
        'Maternal age',
      ])
      expect(result.adjustment?.zSufficient).toBe(true)
    })

    it('the Report’s latent line lists Genetic factors', () => {
      expect(rolesOf(sample).latent.map((id) => nameOf(sample, id))).toEqual([
        'Genetic factors',
      ])
    })

    it('Genetic factors is on no biasing path', () => {
      const gf = idOf(sample, 'Genetic factors')
      const paths = result.paths?.paths ?? []
      expect(paths.some((p) => p.kind === 'biasing')).toBe(true)
      expect(
        paths.some((p) => p.kind === 'biasing' && p.nodes.includes(gf)),
      ).toBe(false)
    })

    it('the minimal sets are still those of lesson 11', () => {
      expect(setsOf(sample)).toEqual([
        ['SES', 'Maternal age'],
        ['Diet', 'Maternal age'],
      ])
    })
  })
})
