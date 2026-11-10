import { edgeNamed, practiceGraph } from './helpers'
import type { Lesson } from './types'

/** The practice graph of lesson 13 (docs/LESSONS.md). */
const YAML = `schema: graphcreator/0.1
name: A cigarette tax as instrument
nodes:
  - { name: Cigarette tax, var_type: continuous, unit: "%", pos: [0, 0] }
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [220, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [440, 0] }
  - { name: Lifestyle, role: latent, var_type: continuous, pos: [330, -160] }
edges:
  - { from: Cigarette tax, to: Maternal smoking }
  - { from: Maternal smoking, to: Birth weight }
  - { from: Lifestyle, to: Maternal smoking }
  - { from: Lifestyle, to: Birth weight }
`

/** Lesson 13, Instrumental variables (docs/LESSONS.md). */
export const instrumentsLesson: Lesson = {
  id: 'instruments',
  title: 'Instrumental variables',
  summary: 'Estimating an effect despite unmeasured confounding.',
  track: 'causal',
  sample: () => practiceGraph(YAML),
  steps: [
    {
      title: 'When adjustment fails',
      body: 'Lifestyle affects both smoking and birth weight, but it was not measured. The Adjustment sets section finds no sufficient set.',
      task: 'Open the Analysis tab.',
      pointer: [{ node: 'Lifestyle', label: 'Not measured' }],
      check: (ctx) => ctx.sidePanelTab === 'analysis',
    },
    {
      title: 'An instrument',
      body: 'An instrument affects the exposure, shares no causes with the outcome, and affects the outcome only through the exposure. A cigarette tax changes how much people smoke, but should not change birth weight in any other way.',
      keyIdea:
        'With an instrument, instrumental variable methods can estimate the effect without measuring the confounder.',
      pointer: [{ node: 'Cigarette tax', label: 'Instrument?' }],
    },
    {
      title: 'Find instruments',
      body: 'The Instruments section lists the instruments implied by this DAG.',
      task: 'Switch on Instruments.',
      check: (ctx) => ctx.analysisOn.instruments,
    },
    {
      title: 'Pick the instrument',
      task: 'Click the instrument.',
      pick: {
        answers: ['Cigarette tax'],
        hints: {
          Lifestyle:
            'Not quite. Lifestyle is the unmeasured confounder; it affects the outcome directly.',
          'Maternal smoking':
            'That is the exposure. Pick the variable that affects it from outside.',
          'Birth weight':
            'That is the outcome. Pick the variable that affects the exposure from outside.',
        },
        reveal:
          'Cigarette tax: it affects Maternal smoking and reaches Birth weight only through it.',
      },
    },
    {
      title: 'Breaking the instrument',
      body: 'Suppose a higher tax also changed diets, and so birth weight, not through smoking.',
      task: 'Draw an arrow from Cigarette tax to Birth weight.',
      check: (ctx) =>
        edgeNamed(ctx.graph, 'Cigarette tax', 'Birth weight') !== undefined,
    },
    {
      title: 'Done',
      body: 'Cigarette tax is no longer an instrument, as implied by this DAG. Not all the conditions for an instrument can be tested in data, so they need the same care as any arrow.',
    },
  ],
}
