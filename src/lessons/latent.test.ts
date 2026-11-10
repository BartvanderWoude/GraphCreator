import { describe, expect, it } from 'vitest'
import { analyze } from '@/model/analysis'
import { latentLesson as lesson } from './latent'
import {
  adjustmentOf,
  contextFor,
  drawEdge,
  expectNamesExist,
  expectPicksAnsweredOnlyByAnswers,
  expectPracticeGraphAsInDoc,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  idOf,
  pathsOf,
  select,
  setRole,
  setsOf,
  useSet,
  withRoles,
} from './lessonTestKit'

describe('latent lesson', () => {
  const sample = lesson.sample()

  it('has the metadata of LESSONS.md', () => {
    expect([lesson.id, lesson.title, lesson.summary, lesson.track]).toEqual([
      'latent',
      'Unmeasured variables',
      'Latent variables, and when no adjustment works.',
      'causal',
    ])
  })

  it('loads the practice graph of LESSONS.md', () => {
    expectPracticeGraphAsInDoc(lesson)
    expect(sample.nodes.map((n) => [n.name, n.role])).toEqual([
      ['Maternal smoking', 'exposure'],
      ['Birth weight', 'outcome'],
      ['SES', 'other'],
      ['Diet', 'other'],
      ['Genetic factors', 'latent'],
    ])
    expect(sample.edges).toHaveLength(5)
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
      2: setRole('SES', 'latent'),
      3: useSet(['Diet']),
      4: select('Genetic factors'),
      5: drawEdge('SES', 'Birth weight'),
    })
  })

  describe('claims', () => {
    const sesLatent = withRoles(sample, { SES: 'latent' })
    const dietAdjusted = withRoles(sesLatent, { Diet: 'adjusted' })
    const direct = drawEdge(
      'SES',
      'Birth weight',
    )(contextFor(dietAdjusted)).graph

    it('with SES other, the sets are SES and Diet', () => {
      expect(setsOf(sample)).toEqual([['SES'], ['Diet']])
    })

    it('with SES latent, Diet is the only set and is sufficient', () => {
      expect(setsOf(sesLatent)).toEqual([['Diet']])
      expect(adjustmentOf(dietAdjusted).zSufficient).toBe(true)
    })

    it('with SES → Birth weight, no set works and the new back door is open', () => {
      expect(setsOf(direct)).toEqual([])
      expect(adjustmentOf(direct).zSufficient).toBe(false)
      expect(pathsOf(direct)).toContainEqual([
        'Maternal smoking ← SES → Birth weight',
        'biasing',
        'open',
      ])
    })

    it('Genetic factors is on no biasing path', () => {
      for (const graph of [sample, sesLatent, dietAdjusted, direct]) {
        const paths = analyze(graph).paths?.paths ?? []
        expect(paths.length).toBeGreaterThan(0)
        const gf = idOf(graph, 'Genetic factors')
        expect(
          paths.some((p) => p.kind === 'biasing' && p.nodes.includes(gf)),
        ).toBe(false)
      }
    })
  })
})
