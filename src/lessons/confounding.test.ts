import { describe, expect, it } from 'vitest'
import lessonsMd from '../../docs/LESSONS.md?raw'
import { analyze } from '@/model/analysis'
import { updateNode, type Graph } from '@/model/graph'
import type { Role } from '@/model/schema'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import { nodeNamed, practiceGraph, stepDone } from './helpers'
import { LESSONS } from './index'
import { confoundingLesson as lesson } from './confounding'
import type { LessonContext } from './types'

/** Lesson `id`'s practice graph and steps, read from LESSONS.md (the source of the texts). */
function fromLessonsMd(id: string) {
  const start = lessonsMd.indexOf(`(\`${id}\`)\n`)
  const section = lessonsMd.slice(start, lessonsMd.indexOf('\n---\n', start))
  const yaml = /```yaml\n([\s\S]*?)```/.exec(section)?.[1] ?? ''
  const rows = section
    .split('\n')
    .filter((line) => /^\| \d+ \|/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
  const pairs = (cell: string) =>
    [...cell.matchAll(/([^";]+?): "([^"]*)"/g)].map(
      (m) => [m[1].trim(), m[2]] as const,
    )
  const picks = new Map(
    rows
      .filter((row) => row.length === 4)
      .map(([n, answers, hints, reveal]) => [
        n,
        {
          answers: answers.split(', '),
          hints: Object.fromEntries(pairs(hints)),
          reveal: reveal.slice(1, -1),
        },
      ]),
  )
  const steps = rows
    .filter((row) => row.length === 7)
    .map(([n, title, body, keyIdea, task, check, pointer]) => ({
      title,
      body: body || undefined,
      keyIdea: keyIdea || undefined,
      task: task || undefined,
      pointer: pointer
        ? pairs(pointer).map(([node, label]) => ({ node, label }))
        : undefined,
      pick: check === 'pick' ? picks.get(n) : undefined,
      checked: check !== '' && check !== 'pick',
    }))
  return { yaml, steps }
}

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).length

/** The context of a step check: nothing selected, the Edit tab, the default Analysis switches. */
function ctx(graph: Graph): LessonContext {
  return {
    graph,
    selection: null,
    sidePanelTab: 'edit',
    analysisOn: { ...ANALYSIS_DEFAULTS },
    events: [],
  }
}

type Task = (c: LessonContext) => LessonContext

/** Clicks a node: it is selected, and the side panel shows Edit (SidePanel). */
const select =
  (name: string): Task =>
  (c) => ({
    ...c,
    selection: { kind: 'node', id: nodeNamed(c.graph, name)!.id },
    sidePanelTab: 'edit',
  })

/** Opens the Analysis tab and switches on Paths. */
const showPaths: Task = (c) => ({
  ...c,
  sidePanelTab: 'analysis',
  analysisOn: { ...c.analysisOn, paths: true },
})

/** Selects a node and sets its role in the Edit tab. */
const setRole =
  (name: string, role: Role): Task =>
  (c) => {
    const selected = select(name)(c)
    const node = nodeNamed(selected.graph, name)!
    return { ...selected, graph: updateNode(selected.graph, node.id, { role }) }
  }

/** Opens the Analysis tab. */
const openAnalysis: Task = (c) => ({ ...c, sidePanelTab: 'analysis' })

/** Each step's task as the user does it; undefined for steps without a task. */
const TASKS: (Task | undefined)[] = [
  undefined,
  showPaths,
  select('SES'),
  setRole('SES', 'adjusted'),
  openAnalysis,
  undefined,
]

/** `graph` with the named nodes adjusted. */
function adjusted(graph: Graph, ...nodes: string[]): Graph {
  return nodes.reduce(
    (g, name) => updateNode(g, nodeNamed(g, name)!.id, { role: 'adjusted' }),
    graph,
  )
}

/** The adjustment result of `analyze`, with node names. */
function adjustmentOf(graph: Graph) {
  const result = analyze(graph).adjustment!
  return {
    ...result,
    sets: result.sets.map((set) => names(graph, set)),
    zForbidden: names(graph, result.zForbidden),
  }
}

/** Names of the nodes in `ids`, in graph order. */
function names(graph: Graph, ids: Iterable<string>): string[] {
  const set = new Set(ids)
  return graph.nodes.filter((n) => set.has(n.id)).map((n) => n.name)
}

/** The paths of `analyze`, written as in LESSONS.md, with their kind and open flag. */
function pathsOf(graph: Graph): [string, string, string][] {
  const name = (id: string) => names(graph, [id])[0]
  return (analyze(graph).paths?.paths ?? []).map(({ nodes, kind, open }) => [
    nodes
      .map((id, i) => {
        if (i === 0) return name(id)
        const forward = graph.edges.some(
          (e) => e.source === nodes[i - 1] && e.target === id,
        )
        return `${forward ? '→' : '←'} ${name(id)}`
      })
      .join(' '),
    kind,
    open ? 'open' : 'closed',
  ])
}

describe('confounding lesson', () => {
  const md = fromLessonsMd('confounding')
  const graph = lesson.sample()

  it('is registered, and its practice graph is the YAML of LESSONS.md', () => {
    expect(LESSONS).toContain(lesson)
    expect(md.yaml).toMatch(/^schema: graphcreator\/0\.1\n/)
    expect(graph).toEqual(practiceGraph(md.yaml))
    expect(lesson.sample()).not.toBe(graph)
  })

  it('has the texts, pointers and picks of LESSONS.md', () => {
    expect(md.steps.length).toBeGreaterThan(0)
    expect(
      lesson.steps.map(({ check, ...texts }) => ({
        ...texts,
        checked: check !== undefined,
      })),
    ).toEqual(md.steps)
  })

  it('follows the writing rules', () => {
    for (const step of lesson.steps) {
      if (step.body) expect(sentences(step.body)).toBeLessThanOrEqual(3)
      if (step.keyIdea) expect(sentences(step.keyIdea)).toBe(1)
      if (step.task) expect(sentences(step.task)).toBe(1)
      for (const { label } of step.pointer ?? [])
        expect(label.split(' ').length).toBeLessThanOrEqual(3)
    }
  })

  it('names only nodes of the practice graph, and hints only wrong answers', () => {
    const all = graph.nodes.map((n) => n.name)
    for (const step of lesson.steps) {
      for (const { node } of step.pointer ?? []) expect(all).toContain(node)
      if (!step.pick) continue
      for (const answer of step.pick.answers) expect(all).toContain(answer)
      for (const name of Object.keys(step.pick.hints)) {
        expect(all).toContain(name)
        expect(step.pick.answers).not.toContain(name)
      }
    }
  })

  it('each step with a task is not done when it starts, and done after its task', () => {
    expect(TASKS).toHaveLength(lesson.steps.length)
    let state = ctx(lesson.sample())
    lesson.steps.forEach((step, i) => {
      const task = TASKS[i]
      expect(task !== undefined, `step ${i + 1} task`).toBe(
        step.task !== undefined,
      )
      expect(stepDone(step, state), `step ${i + 1} at its start`).toBe(!task)
      state = task?.(state) ?? state
      expect(stepDone(step, state), `step ${i + 1} after its task`).toBe(true)
    })
  })

  it('step 2 needs both the Analysis tab and Paths', () => {
    const step = lesson.steps[1]
    const paths = { ...ANALYSIS_DEFAULTS, paths: true }
    expect(stepDone(step, { ...ctx(graph), sidePanelTab: 'analysis' })).toBe(
      false,
    )
    expect(stepDone(step, { ...ctx(graph), analysisOn: paths })).toBe(false)
  })

  it('each pick is answered by an answer node and by no other node', () => {
    const start = ctx(graph)
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
  })

  describe('claims', () => {
    it('with no adjusted nodes, SES is needed and both paths are open', () => {
      const result = adjustmentOf(graph)
      expect(result.sets).toEqual([['SES']])
      expect(result.zSufficient).toBe(false)
      expect(pathsOf(graph)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        ['Maternal smoking ← SES → Birth weight', 'biasing', 'open'],
      ])
    })

    it('adjusting for SES suffices and closes the biasing path only', () => {
      const withSes = adjusted(graph, 'SES')
      expect(adjustmentOf(withSes).zSufficient).toBe(true)
      expect(pathsOf(withSes)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        ['Maternal smoking ← SES → Birth weight', 'biasing', 'closed'],
      ])
    })
  })
})
