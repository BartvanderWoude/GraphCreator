import { extendedExample } from './adjustment'
import { edgeNamed } from './helpers'
import type { Lesson } from './types'

/** Lesson 12, Testing your DAG (docs/LESSONS.md), on lesson 11's practice graph. */
export const testingLesson: Lesson = {
  id: 'testing',
  title: 'Testing your DAG',
  summary: 'Independencies you can check in your data.',
  track: 'causal',
  sample: extendedExample,
  steps: [
    {
      title: 'A DAG makes predictions',
      body: 'Every missing arrow predicts that some variables are unrelated, sometimes only after adjusting for others. You can test these predictions in your data.',
    },
    {
      title: 'Implied independencies',
      body: 'The Independencies section lists the predictions of this DAG.',
      task: 'Open the Analysis tab and switch on Independencies.',
      check: (ctx) =>
        ctx.sidePanelTab === 'analysis' && ctx.analysisOn.independencies,
    },
    {
      title: 'Reading a line',
      body: 'SES ⫫ Maternal age means that knowing one tells you nothing about the other. In Maternal smoking ⫫ Diet | SES, the variables after | are the ones to adjust for in the test.',
      keyIdea:
        'Independent means your data should show no association, for example a correlation close to zero.',
      pointer: [
        { node: 'SES', label: 'Independent' },
        { node: 'Maternal age', label: 'Independent' },
      ],
    },
    {
      title: 'Why they are independent',
      body: 'Every path between SES and Maternal age passes through a collider, so every one is closed.',
      task: 'Click a collider between SES and Maternal age.',
      pick: {
        answers: ['Maternal smoking', 'Birth weight'],
        hints: {
          Diet: 'Not quite. On the path through Diet, the arrows pass through it, so it is not a collider.',
          'Gestational age':
            'Not quite. On the path through Gestational age, one arrow goes in and one comes out, so it is not a collider.',
          SES: 'That is one of the pair. Pick a variable on a path between them.',
          'Maternal age':
            'That is one of the pair. Pick a variable on a path between them.',
        },
        reveal:
          'Maternal smoking: the arrows from SES and Maternal age both point into it. Birth weight is a collider on the other paths.',
      },
    },
    {
      title: 'When a test fails',
      body: 'Suppose your data show that SES and Maternal age are associated. Then the DAG is missing something, such as an arrow between them.',
      task: 'Draw an arrow from SES to Maternal age.',
      check: (ctx) => edgeNamed(ctx.graph, 'SES', 'Maternal age') !== undefined,
    },
    {
      title: 'Done',
      body: 'SES ⫫ Maternal age is no longer listed. A failed test shows that the DAG is wrong somewhere; a passed test does not prove it right.',
      keyIdea: 'Many different DAGs predict the same independencies.',
    },
  ],
}
