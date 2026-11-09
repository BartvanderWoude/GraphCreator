import { adjustedIs, edgeNamed, practiceGraph, roleIs } from './helpers'
import type { Lesson, LessonContext } from './types'

/** The practice graph of lesson 10 (docs/LESSONS.md). */
const YAML = `schema: graphcreator/0.1
name: An unmeasured confounder
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [0, -180] }
  - { name: Diet, var_type: ordinal, levels: [poor, fair, good], pos: [300, -180] }
  - { name: Genetic factors, role: latent, var_type: continuous, pos: [300, 160] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Diet }
  - { from: Diet, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
  - { from: Genetic factors, to: Birth weight }
`

/** `edge(A, B)`: an edge from A to B exists. */
function hasEdge(ctx: LessonContext, from: string, to: string): boolean {
  return edgeNamed(ctx.graph, from, to) !== undefined
}

/** Lesson 10, Unmeasured variables (docs/LESSONS.md). */
export const latentLesson: Lesson = {
  id: 'latent',
  title: 'Unmeasured variables',
  summary: 'Latent variables, and when no adjustment works.',
  track: 'causal',
  sample: () => practiceGraph(YAML),
  steps: [
    {
      title: 'Measured or not',
      body: 'A latent variable is one you did not or cannot measure. Draw it anyway: the DAG should include every common cause, measured or not.',
      pointer: [{ node: 'Genetic factors', label: 'Latent' }],
    },
    {
      title: 'An unmeasured confounder',
      body: 'Suppose this study did not record SES.',
      task: 'Set the role of SES to Latent.',
      pointer: [{ node: 'SES', label: 'Not recorded' }],
      check: (ctx) => roleIs(ctx, 'SES', 'latent'),
    },
    {
      title: 'Another way to close the path',
      body: 'The back-door path Maternal smoking ← SES → Diet → Birth weight can be closed at any variable on it that is not a collider. Diet was measured, so adjusting for Diet closes the path.',
      keyIdea: 'Adjustment sets only ever contain measured variables.',
      task: 'In the Analysis tab, click Use this set next to Diet.',
      pointer: [{ node: 'Diet', label: 'Measured' }],
      check: (ctx) => adjustedIs(ctx, ['Diet']),
    },
    {
      title: 'A harmless latent',
      body: 'Not every unmeasured variable causes bias.',
      task: 'Click the latent variable that does not bias the effect.',
      pick: {
        answers: ['Genetic factors'],
        hints: {
          SES: 'Not quite. SES causes the exposure and, through Diet, the outcome; it would bias the effect if Diet were not adjusted for.',
          Diet: 'Diet was measured: its role is Adjusted, not Latent.',
          'Maternal smoking': 'That is the exposure. Pick a latent variable.',
          'Birth weight': 'That is the outcome. Pick a latent variable.',
        },
        reveal:
          'Genetic factors: it affects only Birth weight, so it opens no back-door path.',
      },
    },
    {
      title: 'When nothing works',
      body: 'Now suppose SES also affects birth weight directly, not only through diet.',
      task: 'Draw an arrow from SES to Birth weight.',
      check: (ctx) => hasEdge(ctx, 'SES', 'Birth weight'),
    },
    {
      title: 'Done',
      body: 'The new back-door path runs only through SES, which was not measured, so no set of observed variables is sufficient, as implied by this DAG. You would need to measure SES, find an instrument, or report a sensitivity analysis.',
      keyIdea:
        'The Report always asks whether there are unmeasured common causes you should add.',
    },
  ],
}
