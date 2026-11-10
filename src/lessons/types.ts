import type { Graph } from '@/model/graph'
import type { GraphState } from '@/store/graphStore'
import type { LessonEvent } from '@/store/lessonEvents'
import type { AnalysisKey, SidePanelTab } from '@/store/uiStore'

/** Shown as "Using GraphCreator" and "Causal thinking" (spec 5.7.10, 5.7.11). */
export type LessonTrack = 'app' | 'causal'

/** A canvas label above a node, found by name (spec 5.7.12). */
export interface LessonPointer {
  node: string
  /** At most three words. */
  label: string
}

/** A question answered on the canvas by selecting a node (spec 5.7.10). */
export interface LessonPick {
  /** Node names; selecting any of them answers the pick. */
  answers: string[]
  /** Node name → the text shown after picking that node wrongly. */
  hints: Record<string, string>
  /** The explanation shown once the pick is answered. */
  reveal: string
}

/** What a step's check sees (spec 4.8), built from the stores at call time. */
export interface LessonContext {
  graph: Graph
  selection: GraphState['selection']
  sidePanelTab: SidePanelTab
  analysisOn: Record<AnalysisKey, boolean>
  /** Recorded since the current step began. */
  events: readonly LessonEvent[]
}

/** One step of a lesson (spec 5.7.10). */
export interface LessonStep {
  title: string
  /** At most three short sentences. */
  body?: string
  /** One sentence, in the Key idea box. */
  keyIdea?: string
  /** Shown as "Try it: <task>". */
  task?: string
  /** Canvas labels while the step shows (spec 5.7.12). */
  pointer?: LessonPointer[]
  pick?: LessonPick
  /** With `pick`, decides when Next is enabled; a step with neither is a reading step. */
  check?(ctx: LessonContext): boolean
}

export interface Lesson {
  id: string
  title: string
  /** One line in the Lessons dialog. */
  summary: string
  track: LessonTrack
  /** The practice graph loaded when the lesson starts. */
  sample(): Graph
  steps: LessonStep[]
}
