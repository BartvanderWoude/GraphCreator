import { describe, expect, it } from 'vitest'
import { ancestors, descendants } from '@/model/analysis/dsep'
import { ANALYSIS_DEFAULTS } from '@/store/uiStore'
import { dagBasicsLesson as lesson } from './dag-basics'
import { stepDone } from './helpers'
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
  independenciesOf,
  names,
  openAnalysis,
  pathsOf,
  select,
} from './lessonTestKit'

describe('dag-basics lesson', () => {
  const graph = lesson.sample()
  const id = (name: string) => idOf(graph, name)

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
      3: openAnalysis('paths'),
      4: select('Gestational age'),
      5: select('SES'),
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
    it('with no adjusted nodes there are three paths', () => {
      expect(pathsOf(graph)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        ['Maternal smoking → Gestational age → Birth weight', 'causal', 'open'],
        ['Maternal smoking ← SES → Birth weight', 'biasing', 'open'],
      ])
    })

    it('ancestors and descendants of Maternal smoking', () => {
      expect(names(graph, ancestors(graph, [id('Maternal smoking')]))).toEqual([
        'Maternal smoking',
        'SES',
      ])
      expect(
        names(graph, descendants(graph, [id('Maternal smoking')])),
      ).toEqual(['Maternal smoking', 'Birth weight', 'Gestational age'])
    })

    it('implies exactly SES ⫫ Gestational age | Maternal smoking', () => {
      expect(independenciesOf(graph)).toEqual([
        'SES ⫫ Gestational age | Maternal smoking',
      ])
    })
  })
})
