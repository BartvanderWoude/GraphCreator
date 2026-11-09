import { describe, expect, it } from 'vitest'
import {
  adjustmentLesson as lesson,
  EXTENDED_EXAMPLE_YAML,
  extendedExample,
} from './adjustment'
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
  inOrder,
  openAnalysis,
  pathsOf,
  practiceYaml,
  select,
  setRole,
  setsOf,
  useSet,
} from './lessonTestKit'

describe('adjustment lesson', () => {
  const sample = lesson.sample()

  it('has the metadata of LESSONS.md', () => {
    expect([lesson.id, lesson.title, lesson.summary, lesson.track]).toEqual([
      'adjustment',
      'Adjustment sets',
      'Finding and using sufficient adjustment sets.',
      'causal',
    ])
  })

  it('loads the practice graph of LESSONS.md, exported for lessons 12 and 14', () => {
    expectPracticeGraphAsInDoc(lesson)
    expect(EXTENDED_EXAMPLE_YAML).toBe(practiceYaml('adjustment'))
    expect(extendedExample()).toEqual(sample)
    expect(extendedExample()).not.toBe(sample)
    expect(sample.nodes.map((n) => [n.name, n.role])).toEqual([
      ['Maternal smoking', 'exposure'],
      ['Birth weight', 'outcome'],
      ['SES', 'other'],
      ['Diet', 'other'],
      ['Maternal age', 'other'],
      ['Gestational age', 'other'],
    ])
    expect(sample.edges).toHaveLength(8)
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
      1: openAnalysis('paths'),
      3: select('Maternal age'),
      4: useSet(['Diet', 'Maternal age']),
      5: inOrder(setRole('SES', 'adjusted'), openAnalysis()),
    })
  })

  describe('claims', () => {
    it('with no adjusted nodes, lists the two minimal sets and the four paths', () => {
      expect(setsOf(sample)).toEqual([
        ['SES', 'Maternal age'],
        ['Diet', 'Maternal age'],
      ])
      expect(pathsOf(sample)).toEqual([
        ['Maternal smoking → Birth weight', 'causal', 'open'],
        ['Maternal smoking → Gestational age → Birth weight', 'causal', 'open'],
        ['Maternal smoking ← Maternal age → Birth weight', 'biasing', 'open'],
        ['Maternal smoking ← SES → Diet → Birth weight', 'biasing', 'open'],
      ])
    })

    it.each([
      [['Diet', 'Maternal age'], true, []],
      [['SES', 'Diet', 'Maternal age'], true, []],
      [['Diet', 'Maternal age', 'Gestational age'], false, ['Gestational age']],
      [['SES'], false, []],
    ])(
      'with %j adjusted, zSufficient is %s',
      (names, sufficient, forbidden) => {
        const result = adjustmentOf(adjusted(sample, ...names))
        expect(result.zSufficient).toBe(sufficient)
        expect(result.zForbidden).toEqual(forbidden)
      },
    )

    it('Use this set gives the same graph as adjusting the set by hand', () => {
      const used = useSet(['Diet', 'Maternal age'])(contextFor(sample)).graph
      expect(used).toEqual(adjusted(sample, 'Diet', 'Maternal age'))
    })
  })
})
