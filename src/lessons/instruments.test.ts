import { describe, expect, it } from 'vitest'
import { analyze } from '@/model/analysis'
import type { Graph } from '@/model/graph'
import { nodeNamed } from './helpers'
import { instrumentsLesson as lesson } from './instruments'
import {
  adjustmentOf,
  contextFor,
  docSection,
  drawEdge,
  expectNamesExist,
  expectPicksAnsweredOnlyByAnswers,
  expectPracticeGraphAsInDoc,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  nameOf,
  openAnalysis,
  select,
  setsOf,
} from './lessonTestKit'

/** The Instruments section's rows, as [instrument, given]. */
function instrumentsOf(graph: Graph): [string, string[]][] {
  const result = analyze(graph).instruments
  if (result === 'needs-single') throw new Error('Needs one exposure.')
  return result.map(({ instrument, given }) => [
    nameOf(graph, instrument),
    given.map((id) => nameOf(graph, id)),
  ])
}

describe('instruments lesson', () => {
  const sample = lesson.sample()

  it('has the metadata of LESSONS.md', () => {
    expect([lesson.id, lesson.title, lesson.summary, lesson.track]).toEqual([
      'instruments',
      'Instrumental variables',
      'Estimating an effect despite unmeasured confounding.',
      'causal',
    ])
  })

  it('loads the practice graph of LESSONS.md', () => {
    expectPracticeGraphAsInDoc(lesson)
    expect(sample.nodes.map((n) => [n.name, n.role])).toEqual([
      ['Cigarette tax', 'other'],
      ['Maternal smoking', 'exposure'],
      ['Birth weight', 'outcome'],
      ['Lifestyle', 'latent'],
    ])
    expect(nodeNamed(sample, 'Cigarette tax')?.unit).toBe('%')
    expect(sample.edges).toHaveLength(4)
  })

  it('has the texts, pointers and picks of LESSONS.md', () => {
    expectStepsAsInDoc(lesson)
    expectWritingRules(lesson)
    expect(docSection('instruments')).toContain('Step 4 has no body')
    expect(lesson.steps[3].body).toBeUndefined()
  })

  it('names only nodes of the practice graph', () => {
    expectNamesExist(lesson)
  })

  it('answers each pick only with an answer node', () => {
    expectPicksAnsweredOnlyByAnswers(lesson)
  })

  it('completes each step with its task, and not before', () => {
    expectScriptedRun(lesson, {
      1: openAnalysis(),
      3: openAnalysis('instruments'),
      4: select('Cigarette tax'),
      5: drawEdge('Cigarette tax', 'Birth weight'),
    })
  })

  describe('claims', () => {
    const broken = drawEdge(
      'Cigarette tax',
      'Birth weight',
    )(contextFor(sample)).graph

    it('as loaded, no set works and Cigarette tax is an instrument', () => {
      expect(setsOf(sample)).toEqual([])
      expect(adjustmentOf(sample).zSufficient).toBe(false)
      expect(instrumentsOf(sample)).toEqual([['Cigarette tax', []]])
    })

    it('with Cigarette tax → Birth weight, there is no instrument and still no set', () => {
      expect(instrumentsOf(broken)).toEqual([])
      expect(setsOf(broken)).toEqual([])
    })
  })
})
