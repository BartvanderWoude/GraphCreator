import { describe, expect, it } from 'vitest'
import { analyze, rolesOf } from '@/model/analysis'
import type { Graph } from '@/model/graph'
import { toYaml } from '@/model/yaml'
import { practiceGraph } from './helpers'
import {
  contextFor,
  docSection,
  event,
  expectNamesExist,
  expectScriptedRun,
  expectStepsAsInDoc,
  expectWritingRules,
  idOf,
  nameOf,
  openAnalysis,
  practiceYaml,
  setsOf,
} from './lessonTestKit'
import { reportingLesson as lesson } from './reporting'

/** Nodes and edges by name, with every field the file keeps. */
function described(graph: Graph) {
  return {
    nodes: graph.nodes.map(({ id: _id, ...rest }) => rest),
    edges: graph.edges.map(({ id: _id, source, target, ...rest }) => ({
      from: nameOf(graph, source),
      to: nameOf(graph, target),
      ...rest,
    })),
  }
}

describe('reporting lesson', () => {
  const sample = lesson.sample()

  it('has the metadata of LESSONS.md', () => {
    expect([lesson.id, lesson.title, lesson.summary, lesson.track]).toEqual([
      'reporting',
      'Reporting your DAG',
      'What to show and say in a paper.',
      'causal',
    ])
  })

  it('loads lesson 11’s graph with the roles, evidence, note and latent node of LESSONS.md', () => {
    const base = described(practiceGraph(practiceYaml('adjustment') ?? ''))
    expect(docSection('reporting')).toContain(
      'Practice graph: the lesson 11 graph with SES and Maternal age `adjusted`, evidence `["PMID:123"]` and note `Well established` on SES → Maternal smoking, and a latent `Genetic factors` (`var_type: continuous`, `pos: [400, 160]`) with an arrow to Birth weight.',
    )
    expect(described(sample)).toEqual({
      nodes: [
        ...base.nodes.map((n) =>
          n.name === 'SES' || n.name === 'Maternal age'
            ? { ...n, role: 'adjusted' }
            : n,
        ),
        {
          name: 'Genetic factors',
          role: 'latent',
          varType: 'continuous',
          pos: { x: 400, y: 160 },
        },
      ],
      edges: [
        ...base.edges.map((e) =>
          e.from === 'SES' && e.to === 'Maternal smoking'
            ? { ...e, evidence: ['PMID:123'], note: 'Well established' }
            : e,
        ),
        { from: 'Genetic factors', to: 'Birth weight', evidence: [] },
      ],
    })
    expect(practiceGraph(toYaml(sample))).toEqual(sample)
    expect(lesson.sample()).not.toBe(sample)
  })

  it('has the texts and pointers of LESSONS.md', () => {
    expectStepsAsInDoc(lesson)
    expectWritingRules(lesson)
  })

  it('names only nodes of the practice graph', () => {
    expectNamesExist(lesson)
  })

  it('completes each step with its task, and not before', () => {
    expectScriptedRun(lesson, {
      2: openAnalysis(),
      3: event('export-downloaded', 'pdf'),
      5: event('code-downloaded', 'yaml'),
    })
  })

  it('needs the Report switched on, and a picture or the GraphCreator file downloaded', () => {
    const [, report, picture, , file] = lesson.steps
    const start = contextFor(sample)
    const analysis = openAnalysis()(start)
    expect(
      report.check?.({
        ...analysis,
        analysisOn: { ...analysis.analysisOn, report: false },
      }),
    ).toBe(false)
    for (const format of ['pdf', 'png', 'svg']) {
      expect(picture.check?.(event('export-downloaded', format)(start))).toBe(
        true,
      )
    }
    expect(picture.check?.(event('export-downloaded', 'tikz')(start))).toBe(
      false,
    )
    expect(picture.check?.(event('export-copied', 'png')(start))).toBe(false)
    expect(file.check?.(event('code-downloaded', 'dagitty')(start))).toBe(false)
    expect(file.check?.(event('code-copied', 'yaml')(start))).toBe(false)
  })

  describe('claims (SES and Maternal age adjusted)', () => {
    const result = analyze(sample)

    it('the adjusted set is sufficient', () => {
      expect(rolesOf(sample).z.map((id) => nameOf(sample, id))).toEqual([
        'SES',
        'Maternal age',
      ])
      expect(result.adjustment?.zSufficient).toBe(true)
    })

    it('the Report’s latent line lists Genetic factors', () => {
      expect(rolesOf(sample).latent.map((id) => nameOf(sample, id))).toEqual([
        'Genetic factors',
      ])
    })

    it('Genetic factors is on no biasing path', () => {
      const gf = idOf(sample, 'Genetic factors')
      const paths = result.paths?.paths ?? []
      expect(paths.some((p) => p.kind === 'biasing')).toBe(true)
      expect(
        paths.some((p) => p.kind === 'biasing' && p.nodes.includes(gf)),
      ).toBe(false)
    })

    it('the minimal sets are still those of lesson 11', () => {
      expect(setsOf(sample)).toEqual([
        ['SES', 'Maternal age'],
        ['Diet', 'Maternal age'],
      ])
    })
  })
})
