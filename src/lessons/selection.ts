import { edgeNamed, nodeNamed, practiceGraph, roleIs } from './helpers'
import type { Lesson, LessonContext } from './types'

/**
 * `no edge(A, B)`: nodes A and B exist and there is no edge from A to B. A renamed or deleted node
 * keeps the check false (spec 5.7.10).
 */
export function noEdge(ctx: LessonContext, from: string, to: string): boolean {
  return (
    nodeNamed(ctx.graph, from) !== undefined &&
    nodeNamed(ctx.graph, to) !== undefined &&
    edgeNamed(ctx.graph, from, to) === undefined
  )
}

/** The practice graph of lesson 9, as in docs/LESSONS.md. */
const PRACTICE = `schema: graphcreator/0.1
name: Selection on NICU admission
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: NICU admission, var_type: categorical, levels: [no, yes], pos: [150, 140] }
edges:
  - { from: Maternal smoking, to: Birth weight }
  - { from: Maternal smoking, to: NICU admission }
  - { from: Birth weight, to: NICU admission }
`

/** Lesson 9 (docs/LESSONS.md). */
export const selectionLesson: Lesson = {
  id: 'selection',
  title: 'Selection bias',
  summary: 'What happens when the study selects on a variable.',
  track: 'causal',
  sample: () => practiceGraph(PRACTICE),
  steps: [
    {
      title: 'Who is in the study',
      body: 'Suppose a study recruits only babies admitted to neonatal intensive care (NICU). Smoking and low birth weight both make admission more likely.',
      pointer: [{ node: 'NICU admission', label: 'Only these babies' }],
    },
    {
      title: 'Mark the selection',
      body: 'The Selected role marks a variable the study population was selected on. The analysis then treats it as always conditioned on.',
      task: 'Set the role of NICU admission to Selected.',
      check: (ctx) => roleIs(ctx, 'NICU admission', 'selected'),
    },
    {
      title: 'Selection on a collider',
      body: 'NICU admission is a collider on the path Maternal smoking → NICU admission ← Birth weight. Selecting on it opens that path, just as adjusting for it would.',
      task: 'Open the Analysis tab and read the Report.',
      check: (ctx) => ctx.sidePanelTab === 'analysis',
    },
    {
      title: 'Where the bias comes from',
      body: 'The Report says no adjustment set can remove this bias. The trouble is that the outcome itself affects who is selected.',
      task: 'Click the variable whose arrow into NICU admission makes the bias impossible to remove.',
      pick: {
        answers: ['Birth weight'],
        hints: {
          'Maternal smoking':
            'Not quite. In this DAG, selection that depends only on the exposure leaves the effect estimable. Look at the other arrow into NICU admission.',
          'NICU admission':
            "That is the selected variable itself. Which variable's arrow into it causes the trouble?",
        },
        reveal:
          'Birth weight: the outcome affects who is admitted, so the data show only some outcomes, and no adjustment can recover the rest.',
      },
    },
    {
      title: 'A different design',
      body: 'Imagine a study where admission depends on smoking but not on birth weight.',
      task: 'Delete the arrow from Birth weight to NICU admission.',
      check: (ctx) => noEdge(ctx, 'Birth weight', 'NICU admission'),
    },
    {
      title: 'Done',
      body: 'Without that arrow, the Report finds no selection bias. Whether the arrow exists is a question about how people entered the study, not something the data can tell you.',
      keyIdea:
        'When the outcome affects who is selected, adjustment cannot remove the bias, as implied by this DAG.',
    },
  ],
}
