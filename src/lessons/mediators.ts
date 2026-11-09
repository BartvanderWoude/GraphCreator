import { practiceGraph, roleIs } from './helpers'
import type { Lesson } from './types'

/** The practice graph of lesson 7, as in docs/LESSONS.md. */
const PRACTICE = `schema: graphcreator/0.1
name: Smoking, gestational age and birth weight
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, role: adjusted, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
  - { name: Gestational age, var_type: continuous, unit: weeks, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Gestational age }
  - { from: Gestational age, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
`

/** Lesson 7 (docs/LESSONS.md). */
export const mediatorsLesson: Lesson = {
  id: 'mediators',
  title: 'Mediators',
  summary: 'Why you do not adjust for a step on the causal path.',
  track: 'causal',
  sample: () => practiceGraph(PRACTICE),
  steps: [
    {
      title: 'A variable in between',
      body: 'Smoking can shorten pregnancy, and shorter pregnancies give lighter babies. A variable on a causal path between the exposure and the outcome is called a mediator.',
    },
    {
      title: 'Find the mediator',
      body: 'SES is already adjusted for, so its back-door path is closed.',
      task: 'Click the mediator.',
      pick: {
        answers: ['Gestational age'],
        hints: {
          SES: 'Not quite. SES causes the exposure, so it sits on a back-door path, not on a causal path.',
          'Maternal smoking':
            'That is the exposure. Pick a variable between the exposure and the outcome.',
          'Birth weight':
            'That is the outcome. Pick a variable between the exposure and the outcome.',
        },
        reveal:
          'Gestational age: it lies on Maternal smoking → Gestational age → Birth weight.',
      },
    },
    {
      title: 'The total effect',
      body: 'GraphCreator analyses the total effect: everything smoking does to birth weight, along every causal path. Here there are two, and both are marked on the canvas.',
      task: 'Open the Analysis tab and switch on Paths.',
      pointer: [{ node: 'Gestational age', label: 'Mediator' }],
      check: (ctx) => ctx.sidePanelTab === 'analysis' && ctx.analysisOn.paths,
    },
    {
      title: 'Adjusting for the mediator',
      body: 'Many analyses adjust for every variable that predicts the outcome. See what happens when you adjust for Gestational age.',
      task: 'Set the role of Gestational age to Adjusted.',
      check: (ctx) => roleIs(ctx, 'Gestational age', 'adjusted'),
    },
    {
      title: 'Overadjustment',
      body: 'The Report now says the set is not sufficient: Gestational age lies on a causal path, and adjusting for it blocks part of the effect. This is called overadjustment.',
      keyIdea:
        'Do not adjust for mediators, or anything they cause, when you want the total effect.',
      task: 'Set the role of Gestational age back to Other.',
      check: (ctx) => roleIs(ctx, 'Gestational age', 'other'),
    },
    {
      title: 'Done',
      body: 'Confounders are adjusted for; mediators are not. The direct effect, the part not through the mediator, is a different question that GraphCreator does not analyse yet.',
    },
  ],
}
