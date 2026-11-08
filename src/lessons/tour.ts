import { emptyGraph } from '@/model/graph'
import type { Lesson } from './types'

/** Names like "Node 1", which `defaultNodeName` gives new nodes. */
const DEFAULT_NAME = /^Node \d+$/

/** The tour lesson (spec 5.7.10). */
export const tourLesson: Lesson = {
  id: 'tour',
  title: 'Drawing your first DAG',
  sample: emptyGraph,
  steps: [
    {
      title: 'Add a variable',
      body: 'Each circle is a variable.',
      task: 'Double-click the canvas, or press N and click.',
      isDone: (graph) => graph.nodes.length >= 1,
    },
    {
      title: 'Name it',
      body: 'Give the variable a name in the panel on the right.',
      task: 'Rename the node to Smoking.',
      isDone: (graph) => graph.nodes.some((n) => !DEFAULT_NAME.test(n.name)),
    },
    {
      title: 'Draw a cause',
      body: 'An arrow means: this variable affects that one.',
      task: 'Add a second node, then drag from the rim of one circle to the other.',
      isDone: (graph) => graph.edges.length >= 1,
    },
    {
      title: 'Give it a role',
      body: 'A role says what the variable is in your question. The color shows it.',
      task: 'Set the role of one node to Exposure.',
      isDone: (graph) => graph.nodes.some((n) => n.role === 'exposure'),
    },
    {
      title: 'Done',
      body: 'That is all you need to start. Your own graph comes back when you finish.',
      isDone: () => true,
    },
  ],
}
