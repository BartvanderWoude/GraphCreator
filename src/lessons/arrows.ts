import { edgeNamed, hasEvent, practiceGraph, selectedEdgeIs } from './helpers'
import type { Lesson, LessonContext } from './types'

/** The running example with roles and types, but no evidence or notes (docs/LESSONS.md, lesson 3). */
const PRACTICE = `schema: graphcreator/0.1
name: Smoking and birth weight
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [never, former, current], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
  - { name: Genetic factors, role: latent, var_type: continuous, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
  - { from: Genetic factors, to: Birth weight }
`

/** `evidence(A, B) ≥ 1`: the edge A → B has at least one evidence item. */
function hasEvidence(ctx: LessonContext, from: string, to: string): boolean {
  return (edgeNamed(ctx.graph, from, to)?.evidence.length ?? 0) >= 1
}

/** `note(A, B)`: the edge A → B has a note that is not blank. */
function hasNote(ctx: LessonContext, from: string, to: string): boolean {
  return Boolean(edgeNamed(ctx.graph, from, to)?.note?.trim())
}

/** Lesson 3 (docs/LESSONS.md). */
export const arrowsLesson: Lesson = {
  id: 'arrows',
  title: 'Documenting your arrows',
  summary: 'Evidence and notes, and why missing arrows matter.',
  track: 'app',
  sample: () => practiceGraph(PRACTICE),
  steps: [
    {
      title: 'What an arrow claims',
      body: 'An arrow says that one variable directly affects another. It is a claim about the world, so it needs a reason.',
      task: 'Click the arrow from SES to Maternal smoking.',
      check: (ctx) => selectedEdgeIs(ctx, 'SES', 'Maternal smoking'),
      pointer: [
        { node: 'SES', label: 'From here' },
        { node: 'Maternal smoking', label: 'To here' },
      ],
    },
    {
      title: 'Evidence',
      body: 'Evidence lists the references that support an arrow, one per line. A small chip on the arrow shows how many there are.',
      task: 'Add a reference to this arrow, such as PMID:123.',
      check: (ctx) => hasEvidence(ctx, 'SES', 'Maternal smoking'),
    },
    {
      title: 'Notes',
      body: 'A note says why you drew the arrow, or what is uncertain about it.',
      task: 'Add a note to the arrow, such as Well established.',
      check: (ctx) => hasNote(ctx, 'SES', 'Maternal smoking'),
    },
    {
      title: 'Missing arrows are claims too',
      body: 'There is no arrow from Genetic factors to Maternal smoking. That says genes do not affect smoking at all, which is a strong claim.',
      keyIdea:
        'Draw an arrow whenever an effect is plausible; leave it out only when you are confident there is none.',
      pointer: [{ node: 'Genetic factors', label: 'No arrow out' }],
    },
    {
      title: 'No cycles',
      body: 'A DAG has no cycles: following the arrows never leads back to where you started. GraphCreator refuses an arrow that would close a cycle and says why.',
      task: 'Try to draw an arrow from Birth weight to SES.',
      check: (ctx) => hasEvent(ctx, 'edge-refused', ['cycle']),
      pointer: [{ node: 'Birth weight', label: 'Start here' }],
    },
    {
      title: 'Done',
      body: 'Evidence and notes are kept in the GraphCreator file, and in GML, DOT and networkx JSON. A dagitty file keeps them only when you include GraphCreator details.',
    },
  ],
}
