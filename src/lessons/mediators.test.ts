import { describe, expect, it } from 'vitest'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
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
import { mediatorsLesson as lesson } from './mediators'

describe('mediators lesson', () => {
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
      2: select('Gestational age'),
      3: openAnalysis('paths'),
      4: setRole('Gestational age', 'adjusted'),
      5: setRole('Gestational age', 'other'),
    })
  })

  it('step 3 needs both the Analysis tab and Paths', () => {
    const step = lesson.steps[2]
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
    it('with SES adjusted, the set suffices and only the back-door path is closed', () => {
      expect(adjustmentOf(graph).zSufficient).toBe(true)
      expect(pathsOf(graph)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        ['Maternal smoking → Gestational age → Birth weight', 'causal', 'open'],
        ['Maternal smoking ← SES → Birth weight', 'biasing', 'closed'],
      ])
    })

    it('adjusting for Gestational age as well is overadjustment', () => {
      const both = adjusted(graph, 'Gestational age')
      const result = adjustmentOf(both)
      expect(result.zSufficient).toBe(false)
      expect(result.zForbidden).toEqual(['Gestational age'])
      expect(result.sets).toEqual([['SES']])
      expect(pathsOf(both)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        [
          'Maternal smoking → Gestational age → Birth weight',
          'causal',
          'closed',
        ],
        ['Maternal smoking ← SES → Birth weight', 'biasing', 'closed'],
      ])
    })
  })
})
