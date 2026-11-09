import { describe, expect, it } from 'vitest'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import { confoundingLesson as lesson } from './confounding'
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

describe('confounding lesson', () => {
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
      3: select('SES'),
      4: setRole('SES', 'adjusted'),
      5: openAnalysis(),
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
