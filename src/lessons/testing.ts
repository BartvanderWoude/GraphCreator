import { emptyGraph } from '@/model/graph'
import type { Lesson } from './types'

/** Lesson 12 (docs/LESSONS.md). A stub until its lesson phase writes the steps (spec 8, phase 41). */
export const testingLesson: Lesson = {
  id: 'testing',
  title: 'Testing your DAG',
  summary: 'Independencies you can check in your data.',
  track: 'causal',
  sample: emptyGraph,
  steps: [{ title: 'Coming soon' }],
}
