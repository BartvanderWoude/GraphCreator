import type { Graph } from '@/model/graph'
import { adjustedIs, practiceGraph } from './helpers'
import type { Lesson } from './types'

/**
 * The extended running example (docs/LESSONS.md, lesson 11): the practice graph of lessons 11
 * and 12, and the base of lesson 14's.
 */
export const EXTENDED_EXAMPLE_YAML = `schema: graphcreator/0.1
name: Smoking and birth weight, extended
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [400, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [100, -180] }
  - { name: Diet, var_type: ordinal, levels: [poor, fair, good], pos: [300, -180] }
  - { name: Maternal age, var_type: continuous, unit: years, pos: [200, -70] }
  - { name: Gestational age, var_type: continuous, unit: weeks, pos: [200, 130] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Diet }
  - { from: Diet, to: Birth weight }
  - { from: Maternal age, to: Maternal smoking }
  - { from: Maternal age, to: Birth weight }
  - { from: Maternal smoking, to: Gestational age }
  - { from: Gestational age, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
`

/** The extended running example as a graph. */
export function extendedExample(): Graph {
  return practiceGraph(EXTENDED_EXAMPLE_YAML)
}

/** Lesson 11, Adjustment sets (docs/LESSONS.md). */
export const adjustmentLesson: Lesson = {
  id: 'adjustment',
  title: 'Adjustment sets',
  summary: 'Finding and using sufficient adjustment sets.',
  track: 'causal',
  sample: extendedExample,
  steps: [
    {
      title: 'Two back doors',
      body: 'This DAG has two back-door paths: one through SES and Diet, one through Maternal age. A sufficient adjustment set must close both.',
      task: 'Open the Analysis tab and switch on Paths.',
      check: (ctx) => ctx.sidePanelTab === 'analysis' && ctx.analysisOn.paths,
    },
    {
      title: 'Minimal sufficient sets',
      body: 'The Adjustment sets section lists the minimal sufficient sets, as implied by this DAG. Minimal means no variable can be left out of the set.',
      keyIdea: 'SES, Maternal age and Diet, Maternal age close the same paths.',
    },
    {
      title: 'The variable you cannot skip',
      body: 'One variable is in every sufficient set.',
      task: 'Click the variable that must be in every sufficient set.',
      pick: {
        answers: ['Maternal age'],
        hints: {
          SES: 'Not quite. SES can be swapped for Diet: both close the same back-door path.',
          Diet: 'Not quite. Diet can be swapped for SES: both close the same back-door path.',
          'Gestational age':
            'Not quite. Gestational age is a mediator, so it is in no sufficient set.',
          'Maternal smoking':
            'That is the exposure. Pick a variable on a back-door path.',
          'Birth weight':
            'That is the outcome. Pick a variable on a back-door path.',
        },
        reveal:
          'Maternal age: it is the only variable on the path Maternal smoking ← Maternal age → Birth weight, so every sufficient set must contain it.',
      },
    },
    {
      title: 'Use a set',
      body: "Use this set marks the set's variables as Adjusted and clears the others. The Report then checks the set.",
      task: 'Click Use this set next to Diet, Maternal age.',
      check: (ctx) => adjustedIs(ctx, ['Diet', 'Maternal age']),
    },
    {
      title: 'Larger sets',
      body: 'Adding SES as well still gives a sufficient set. But adding a mediator, such as Gestational age, would break it.',
      task: 'Set the role of SES to Adjusted too, and read the Report.',
      check: (ctx) =>
        adjustedIs(ctx, ['SES', 'Diet', 'Maternal age']) &&
        ctx.sidePanelTab === 'analysis',
    },
    {
      title: 'Done',
      body: 'Every listed set removes confounding equally well, as implied by this DAG. Choose the one whose variables were measured best.',
      keyIdea: 'Adjustment sets are only as good as the DAG they come from.',
    },
  ],
}
