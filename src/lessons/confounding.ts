import { practiceGraph, roleIs } from './helpers'
import type { Lesson } from './types'

/** The practice graph of lesson 6, as in docs/LESSONS.md. */
const PRACTICE = `schema: graphcreator/0.1
name: Confounding by SES
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
`

/** Lesson 6 (docs/LESSONS.md). */
export const confoundingLesson: Lesson = {
  id: 'confounding',
  title: 'Confounding',
  summary: 'Common causes, back-door paths and adjustment.',
  track: 'causal',
  sample: () => practiceGraph(PRACTICE),
  steps: [
    {
      title: 'A common cause',
      body: "SES affects both whether a mother smokes and the baby's birth weight. Because of that, babies of smokers and non-smokers would differ in birth weight even if smoking did nothing.",
      pointer: [{ node: 'SES', label: 'Common cause' }],
    },
    {
      title: 'A back-door path',
      body: 'The path Maternal smoking ← SES → Birth weight starts with an arrow into the exposure. It is called a back-door path, and the association it carries is not an effect of smoking.',
      task: 'Open the Analysis tab and switch on Paths.',
      check: (ctx) => ctx.sidePanelTab === 'analysis' && ctx.analysisOn.paths,
    },
    {
      title: 'Find the confounder',
      body: 'The dashed lines on the canvas mark the open back-door path. A variable that opens a back-door path like this is called a confounder.',
      task: 'Click the confounder.',
      pick: {
        answers: ['SES'],
        hints: {
          'Maternal smoking':
            'That is the exposure. A confounder causes both the exposure and the outcome.',
          'Birth weight':
            'That is the outcome. A confounder causes both the exposure and the outcome.',
        },
        reveal:
          'SES: it causes both Maternal smoking and Birth weight, so the back-door path runs through it.',
      },
    },
    {
      title: 'Adjusting closes the path',
      body: 'Adjusting for a variable means comparing like with like: mothers with the same SES. That closes the back-door path through SES.',
      task: 'Set the role of SES to Adjusted.',
      pointer: [{ node: 'SES', label: 'Adjust here' }],
      check: (ctx) => roleIs(ctx, 'SES', 'adjusted'),
    },
    {
      title: 'Check the result',
      body: 'Only the causal path is still marked. The Report now says the adjusted set is sufficient, as implied by this DAG.',
      task: 'Open the Analysis tab and read the Report.',
      check: (ctx) => ctx.sidePanelTab === 'analysis',
    },
    {
      title: 'Done',
      body: 'Confounding is association through a common cause. Adjustment closes every back-door path without opening new ones.',
      keyIdea:
        'The analysis knows only the DAG: a common cause you leave out cannot be adjusted for.',
    },
  ],
}
