import type { Graph } from '@/model/graph'

/** One step of a lesson (spec 5.7.10). */
export interface LessonStep {
  title: string
  /** At most three short sentences. */
  body: string
  /** Shown as "Try it: <task>"; omitted on the last step. */
  task?: string
  /** The Next button is enabled when this returns true. */
  isDone(graph: Graph): boolean
}

export interface Lesson {
  id: string
  title: string
  /** The practice graph loaded when the lesson starts. */
  sample(): Graph
  steps: LessonStep[]
}
