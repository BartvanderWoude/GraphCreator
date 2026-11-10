import { practiceGraph, roleIs } from './helpers'
import type { Lesson } from './types'

/** The practice graph of lesson 8, as in docs/LESSONS.md. */
const PRACTICE = `schema: graphcreator/0.1
name: M-bias
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: Health awareness, role: latent, var_type: continuous, pos: [0, -220] }
  - { name: Clinic access, role: latent, var_type: categorical, levels: [no, yes], pos: [300, -220] }
  - { name: Prenatal visits, var_type: discrete, pos: [150, -110] }
edges:
  - { from: Health awareness, to: Maternal smoking }
  - { from: Health awareness, to: Prenatal visits }
  - { from: Clinic access, to: Prenatal visits }
  - { from: Clinic access, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
`

/** Lesson 8 (docs/LESSONS.md). */
export const collidersLesson: Lesson = {
  id: 'colliders',
  title: 'Colliders',
  summary: 'How adjusting for a common effect creates bias.',
  track: 'causal',
  sample: () => practiceGraph(PRACTICE),
  steps: [
    {
      title: 'Two arrows meeting',
      body: 'Health awareness and Clinic access both affect the number of prenatal visits. On a path, a variable where two arrowheads meet is called a collider.',
      pointer: [{ node: 'Prenatal visits', label: 'Arrows meet' }],
    },
    {
      title: 'Colliders block paths',
      body: 'Two causes are not associated just because they share an effect, so a path through a collider is closed. The Report says no adjustment is needed here.',
      keyIdea: 'Leave a collider alone and its path stays closed.',
      task: 'Open the Analysis tab and switch on Paths.',
      check: (ctx) => ctx.sidePanelTab === 'analysis' && ctx.analysisOn.paths,
    },
    {
      title: 'Find the collider',
      body: 'Look at the path from Maternal smoking up through Health awareness and back down to Birth weight.',
      task: 'Click the collider on that path.',
      pick: {
        answers: ['Prenatal visits'],
        hints: {
          'Health awareness':
            'Not quite. Both arrows leave Health awareness, so it is not a collider.',
          'Clinic access':
            'Not quite. Both arrows leave Clinic access, so it is not a collider.',
          'Maternal smoking':
            'That is the exposure. Pick a variable on the path where two arrowheads meet.',
          'Birth weight':
            'That is the outcome. Pick a variable on the path where two arrowheads meet.',
        },
        reveal:
          'Prenatal visits: the arrows from Health awareness and Clinic access both point into it.',
      },
    },
    {
      title: 'Adjusting for a collider',
      body: 'Some analyses adjust for every variable measured before the outcome. See what happens with Prenatal visits.',
      task: 'Set the role of Prenatal visits to Adjusted.',
      check: (ctx) => roleIs(ctx, 'Prenatal visits', 'adjusted'),
    },
    {
      title: 'M-bias',
      body: 'Adjusting for the collider opened the path: it is now dashed on the canvas, and the Report says the set is not sufficient. This shape is called M-bias.',
      keyIdea:
        'Adjusting for more variables is not always safer: adjusting for a collider can create bias.',
      task: 'Set the role of Prenatal visits back to Other.',
      check: (ctx) => roleIs(ctx, 'Prenatal visits', 'other'),
    },
    {
      title: 'Done',
      body: 'Adjust for confounders, but not for mediators or colliders. The Analysis tab checks every path for you, as implied by this DAG.',
    },
  ],
}
