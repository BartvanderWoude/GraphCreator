import { describe, expect, it } from 'vitest'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import { collidersLesson as lesson } from './colliders'
import { stepDone } from './helpers'
import { LESSONS } from './index'
import {
  adjusted,
  adjustmentOf,
  contextFor,
  expectNamesExist,
  expectPicksAnsweredOnlyByAnswers,
  expectPracticeGraphAsInDoc,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  openAnalysis,
  pathsOf,
  select,
  setRole,
} from './lessonTestKit'

describe('colliders lesson', () => {
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
      2: openAnalysis('paths'),
      3: select('Prenatal visits'),
      4: setRole('Prenatal visits', 'adjusted'),
      5: setRole('Prenatal visits', 'other'),
    })
  })

  it('step 2 needs both the Analysis tab and Paths', () => {
    const step = lesson.steps[1]
    const paths = { ...ANALYSIS_DEFAULTS, paths: true }
    expect(
      stepDone(step, { ...contextFor(graph), sidePanelTab: 'analysis' }),
    ).toBe(false)
    expect(stepDone(step, { ...contextFor(graph), analysisOn: paths })).toBe(
      false,
    )
  })

  it('each pick is answered by an answer node and by no other node', () => {
    expectPicksAnsweredOnlyByAnswers(lesson)
  })

  describe('claims', () => {
    const M_PATH =
      'Maternal smoking ← Health awareness → Prenatal visits ← Clinic access → Birth weight'

    it('with no adjusted nodes, the empty set suffices and the M path is closed', () => {
      const result = adjustmentOf(graph)
      expect(result.sets).toEqual([[]])
      expect(result.zSufficient).toBe(true)
      expect(pathsOf(graph)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        [M_PATH, 'biasing', 'closed'],
      ])
    })

    it('adjusting for Prenatal visits opens the M path', () => {
      const withVisits = adjusted(graph, 'Prenatal visits')
      expect(adjustmentOf(withVisits).zSufficient).toBe(false)
      expect(pathsOf(withVisits)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        [M_PATH, 'biasing', 'open'],
      ])
    })
  })
})
