import { describe, expect, it } from 'vitest'
import { analyze } from '@/model/analysis'
import { removeEdges, removeNodes, renameNode } from '@/model/graph'
import { edgeNamed, stepDone } from './helpers'
import { LESSONS } from './index'
import {
  contextFor,
  expectNamesExist,
  expectPicksAnsweredOnlyByAnswers,
  expectPracticeGraphAsInDoc,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  idOf,
  openAnalysis,
  pathsOf,
  select,
  setRole,
  withRoles,
  type Task,
} from './lessonTestKit'
import { selectionLesson as lesson } from './selection'

/** Clicks the edge from `from` to `to` and deletes it. */
const deleteEdge =
  (from: string, to: string): Task =>
  (c) => ({
    ...c,
    graph: removeEdges(c.graph, [edgeNamed(c.graph, from, to)!.id]),
    selection: null,
    sidePanelTab: 'edit',
  })

describe('selection lesson', () => {
  const graph = lesson.sample()

  it('is registered, and its practice graph is the YAML of LESSONS.md', () => {
    expect(LESSONS).toContain(lesson)
    expectPracticeGraphAsInDoc(lesson)
  })

  it('has the texts, pointers and picks of LESSONS.md', () => {
    expectStepsAsInDoc(lesson)
  })

  it('follows the writing rules', () => {
    expectWritingRules(lesson)
  })

  it('names only nodes of the practice graph, and hints only wrong answers', () => {
    expectNamesExist(lesson)
  })

  it('each step with a task is not done when it starts, and done after its task', () => {
    expectScriptedRun(lesson, {
      2: setRole('NICU admission', 'selected'),
      3: openAnalysis(),
      4: select('Birth weight'),
      5: deleteEdge('Birth weight', 'NICU admission'),
    })
  })

  it('step 5 stays false when Birth weight is renamed or deleted', () => {
    const step = lesson.steps[4]
    const birthWeight = idOf(graph, 'Birth weight')
    const renamed = renameNode(graph, birthWeight, 'Weight')
    if (!renamed.ok) throw new Error('rename failed')
    const edge = edgeNamed(graph, 'Birth weight', 'NICU admission')!
    const withoutEdge = removeEdges(renamed.value, [edge.id])
    expect(stepDone(step, contextFor(withoutEdge))).toBe(false)
    expect(stepDone(step, contextFor(removeNodes(graph, [birthWeight])))).toBe(
      false,
    )
  })

  it('each pick is answered by an answer node and by no other node', () => {
    expectPicksAnsweredOnlyByAnswers(lesson)
  })

  describe('claims', () => {
    const selectedGraph = withRoles(graph, { 'NICU admission': 'selected' })
    const NICU_PATH = 'Maternal smoking → NICU admission ← Birth weight'

    it('with NICU admission other, the empty set suffices and the path is closed', () => {
      expect(analyze(graph).adjustment!.sets).toEqual([[]])
      expect(pathsOf(graph)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        [NICU_PATH, 'biasing', 'closed'],
      ])
    })

    it('with NICU admission selected, no set works and the path is open', () => {
      const result = analyze(selectedGraph).adjustment!
      expect(result.selectionBias).toBe(true)
      expect(result.sets).toEqual([])
      expect(pathsOf(selectedGraph)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        [NICU_PATH, 'biasing', 'open'],
      ])
    })

    it('without the arrow from Birth weight, selection leaves no bias', () => {
      const edge = edgeNamed(selectedGraph, 'Birth weight', 'NICU admission')!
      const result = analyze(removeEdges(selectedGraph, [edge.id])).adjustment!
      expect(result.selectionBias).toBe(false)
      expect(result.sets).toEqual([[]])
      expect(result.zSufficient).toBe(true)
    })
  })
})
