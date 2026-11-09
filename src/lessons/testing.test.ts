import { describe, expect, it } from 'vitest'
import { analyze } from '@/model/analysis'
import { dConnected } from '@/model/analysis/dsep'
import { extendedExample } from './adjustment'
import {
  contextFor,
  docSection,
  drawEdge,
  expectNamesExist,
  expectPicksAnsweredOnlyByAnswers,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  idOf,
  independenciesOf,
  nameOf,
  openAnalysis,
  select,
  withRoles,
} from './lessonTestKit'
import { testingLesson as lesson } from './testing'

describe('testing lesson', () => {
  const sample = lesson.sample()

  it('has the metadata of LESSONS.md', () => {
    expect([lesson.id, lesson.title, lesson.summary, lesson.track]).toEqual([
      'testing',
      'Testing your DAG',
      'Independencies you can check in your data.',
      'causal',
    ])
  })

  it('loads the practice graph of lesson 11', () => {
    expect(docSection('testing')).toContain(
      'Practice graph: the lesson 11 graph.',
    )
    expect(sample).toEqual(extendedExample())
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
      2: openAnalysis('independencies'),
      4: select('Maternal smoking'),
      5: drawEdge('SES', 'Maternal age'),
    })
  })

  describe('claims', () => {
    const ses = idOf(sample, 'SES')
    const age = idOf(sample, 'Maternal age')

    it('lists SES ⫫ Maternal age and Maternal smoking ⫫ Diet | SES', () => {
      const rows = independenciesOf(sample)
      expect(rows).toContain('SES ⫫ Maternal age')
      expect(rows).toContain('Maternal smoking ⫫ Diet | SES')
    })

    it('every path between SES and Maternal age has Maternal smoking or Birth weight as a collider', () => {
      // The Paths section's paths, with SES as the exposure and Maternal age as the outcome.
      const pair = withRoles(sample, {
        'Maternal smoking': 'other',
        'Birth weight': 'other',
        SES: 'exposure',
        'Maternal age': 'outcome',
      })
      const paths = analyze(pair).paths?.paths ?? []
      expect(paths.length).toBeGreaterThan(1)
      const into = (from: string, to: string) =>
        pair.edges.some((e) => e.source === from && e.target === to)
      for (const { nodes, open } of paths) {
        const colliders = nodes
          .slice(1, -1)
          .filter((v, i) => into(nodes[i], v) && into(nodes[i + 2], v))
          .map((id) => nameOf(pair, id))
        expect(
          colliders.some(
            (c) => c === 'Maternal smoking' || c === 'Birth weight',
          ),
        ).toBe(true)
        expect(open).toBe(false)
      }
    })

    it('SES and Maternal age are d-separated given nothing', () => {
      expect(dConnected(sample, [ses], [age], [])).toBe(false)
    })

    it('with SES → Maternal age, no independence pairs SES with Maternal age', () => {
      const joined = drawEdge('SES', 'Maternal age')(contextFor(sample)).graph
      expect(dConnected(joined, [ses], [age], [])).toBe(true)
      const pairs = analyze(joined).independencies.map((i) => [i.a, i.b])
      expect(pairs.length).toBeGreaterThan(0)
      expect(pairs).not.toContainEqual([ses, age])
      expect(pairs).not.toContainEqual([age, ses])
      expect(independenciesOf(joined)).not.toContain('SES ⫫ Maternal age')
    })
  })
})
