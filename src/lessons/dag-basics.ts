import { practiceGraph } from './helpers'
import type { Lesson } from './types'

/** The practice graph of lesson 5, as in docs/LESSONS.md. */
const PRACTICE = `schema: graphcreator/0.1
name: Smoking and birth weight
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
  - { name: Gestational age, var_type: continuous, unit: weeks, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Gestational age }
  - { from: Gestational age, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
`

/** Lesson 5 (docs/LESSONS.md). */
export const dagBasicsLesson: Lesson = {
  id: 'dag-basics',
  title: 'What a DAG says',
  summary: 'Arrows, paths, ancestors and descendants.',
  track: 'causal',
  sample: () => practiceGraph(PRACTICE),
  steps: [
    {
      title: 'Directed acyclic graph',
      body: 'A DAG is a set of variables joined by arrows. Directed: every arrow has one direction. Acyclic: you can never follow the arrows back to where you started.',
      keyIdea:
        'These DAGs are teaching examples, not claims about the real epidemiology.',
    },
    {
      title: 'An arrow is a direct cause',
      body: 'Maternal smoking → Gestational age says that smoking may affect how long the pregnancy lasts. Direct means: not through another variable in this DAG.',
      keyIdea:
        'An arrow says an effect may exist; it says nothing about how strong it is.',
      pointer: [
        { node: 'Maternal smoking', label: 'Cause' },
        { node: 'Gestational age', label: 'Effect' },
      ],
    },
    {
      title: 'Paths',
      body: 'A path is any route between two variables along arrows, whichever way they point. Maternal smoking and Birth weight are joined by three paths here.',
      keyIdea:
        'Association travels along paths; the next lessons are about which ones to block.',
      task: 'Open the Analysis tab and switch on Paths.',
      check: (ctx) => ctx.sidePanelTab === 'analysis' && ctx.analysisOn.paths,
    },
    {
      title: 'Causal paths',
      body: 'A path that follows the arrows from the exposure to the outcome is causal. The thick lines on the canvas mark the causal paths.',
      task: 'Click the variable that lies on a causal path from Maternal smoking to Birth weight.',
      pick: {
        answers: ['Gestational age'],
        hints: {
          SES: 'Not quite. The path through SES runs against the arrow into Maternal smoking, so it is not causal.',
          'Maternal smoking':
            'That is the exposure itself. Pick a variable between the exposure and the outcome.',
          'Birth weight':
            'That is the outcome. Pick a variable between the exposure and the outcome.',
        },
        reveal:
          'Gestational age: Maternal smoking → Gestational age → Birth weight follows the arrows, so it is a causal path.',
      },
    },
    {
      title: 'Ancestors and descendants',
      body: 'Everything you can reach by following the arrows forward is a descendant; everything that leads to a variable is an ancestor. Gestational age and Birth weight are descendants of Maternal smoking.',
      task: 'Click an ancestor of Maternal smoking.',
      pointer: [{ node: 'Maternal smoking', label: 'Its ancestors?' }],
      pick: {
        answers: ['SES'],
        hints: {
          'Gestational age':
            'Not quite. The arrow runs from Maternal smoking to Gestational age, so Gestational age is a descendant.',
          'Birth weight':
            'Not quite. Birth weight is a descendant of Maternal smoking.',
          'Maternal smoking':
            'Pick another variable: one with an arrow leading into Maternal smoking.',
        },
        reveal: 'SES: the arrow SES → Maternal smoking makes SES an ancestor.',
      },
    },
    {
      title: 'What the DAG leaves out',
      body: 'Every missing arrow is an assumption. Here, SES does not affect gestational age directly. The lesson Testing your DAG shows how such assumptions can be checked in data.',
      pointer: [
        { node: 'SES', label: 'No arrow' },
        { node: 'Gestational age', label: 'No arrow' },
      ],
    },
    {
      title: 'Done',
      body: 'Variables, arrows and paths are all you need to read any DAG. The next lessons use them to decide what to adjust for.',
    },
  ],
}
