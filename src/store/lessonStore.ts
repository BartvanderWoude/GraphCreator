import { create } from 'zustand'
import { findLesson, type Lesson, type LessonContext } from '@/lessons'
import { stepDone } from '@/lessons/helpers'
import { readLessonsDone, writeLessonsDone } from '@/lib/lessonProgress'
import { safeLocalStorage } from '@/lib/welcome'
import type { Graph } from '@/model/graph'
import { useGraphStore } from './graphStore'
import {
  clearEvents,
  startRecording,
  stopRecording,
  useLessonEvents,
} from './lessonEvents'
import { useUiStore } from './uiStore'

/** The running lesson (spec 4.8, 5.7.10). */
export interface LessonState {
  active: { lessonId: string; step: number } | null
  /** Names of the wrongly picked nodes in the current step, oldest first. */
  wrongPicks: string[]
  /** Show answer was used in the current step. */
  revealed: boolean
  /** Ids of finished lessons; initial value `readLessonsDone(safeLocalStorage())`. */
  done: ReadonlySet<string>
  /**
   * Sets `active` first, then sets the user's graph aside and loads `lesson.sample()` via
   * `replaceGraph`; step 0. Exits a running lesson first. Throws on an unknown id.
   */
  start(lessonId: string): void
  /**
   * Step + 1 when the current step is done; on the last step, marks the lesson done and calls
   * `exit()`.
   */
  next(): void
  /** Step - 1, at least 0. */
  back(): void
  /** Restores the set-aside graph via `replaceGraph`, then `active = null`. */
  exit(): void
  /** Selects the node named `pick.answers[0]` and sets `revealed`. */
  revealAnswer(): void
}

/**
 * The user's graph while a lesson runs. Held here, outside the store's state, so autosave never
 * sees it.
 */
let setAside: Graph | null = null

/** Stops watching the selection for picks; set while a lesson runs. */
let unwatchPicks: (() => void) | null = null

function lessonOf(lessonId: string): Lesson {
  const lesson = findLesson(lessonId)
  if (!lesson) throw new Error(`Unknown lesson "${lessonId}".`)
  return lesson
}

/** The current step of the running lesson, if any. */
function currentStep() {
  const { active } = useLessonStore.getState()
  return active ? findLesson(active.lessonId)?.steps[active.step] : undefined
}

/**
 * Records wrong picks (spec 4.8 "Picks"): a change of selection to a node whose name is not among
 * the current step's answers, unless the step was already done before the change.
 */
function watchPicks(): () => void {
  return useGraphStore.subscribe((state, prev) => {
    const { selection } = state
    if (selection?.kind !== 'node') return
    if (prev.selection?.kind === 'node' && prev.selection.id === selection.id) {
      return
    }
    const step = currentStep()
    if (!step?.pick) return
    const before = {
      ...lessonContext(),
      graph: prev.graph,
      selection: prev.selection,
    }
    if (stepDone(step, before)) return
    const name = state.graph.nodes.find((n) => n.id === selection.id)?.name
    if (name === undefined || step.pick.answers.includes(name)) return
    useLessonStore.setState((s) => ({ wrongPicks: [...s.wrongPicks, name] }))
  })
}

export const useLessonStore = create<LessonState>()((set, get) => ({
  active: null,
  wrongPicks: [],
  revealed: false,
  done: readLessonsDone(safeLocalStorage()),

  start(lessonId) {
    const lesson = lessonOf(lessonId)
    if (get().active) get().exit()
    set({ active: { lessonId, step: 0 }, wrongPicks: [], revealed: false })
    startRecording()
    setAside = useGraphStore.getState().graph
    useGraphStore.getState().replaceGraph(lesson.sample())
    unwatchPicks = watchPicks()
  },

  next() {
    const { active } = get()
    if (!active || !isStepDone()) return
    const last = lessonOf(active.lessonId).steps.length - 1
    if (active.step >= last) {
      const done = new Set(get().done).add(active.lessonId)
      writeLessonsDone(safeLocalStorage(), done)
      set({ done })
      get().exit()
      return
    }
    set({
      active: { ...active, step: active.step + 1 },
      wrongPicks: [],
      revealed: false,
    })
    clearEvents()
  },

  back() {
    const { active } = get()
    if (!active || active.step === 0) return
    set({
      active: { ...active, step: active.step - 1 },
      wrongPicks: [],
      revealed: false,
    })
    clearEvents()
  },

  exit() {
    if (!get().active) return
    unwatchPicks?.()
    unwatchPicks = null
    if (setAside) useGraphStore.getState().replaceGraph(setAside)
    setAside = null
    stopRecording()
    set({ active: null, wrongPicks: [], revealed: false })
  },

  revealAnswer() {
    const answer = currentStep()?.pick?.answers[0]
    if (answer === undefined) return
    const graph = useGraphStore.getState().graph
    const node = graph.nodes.find((n) => n.name === answer)
    if (node) useGraphStore.getState().select({ kind: 'node', id: node.id })
    set({ revealed: true })
  },
}))

/** What a step's check sees (spec 4.8), built from the stores at call time. */
export function lessonContext(): LessonContext {
  const { graph, selection } = useGraphStore.getState()
  const { sidePanelTab, analysisOn } = useUiStore.getState()
  return {
    graph,
    selection,
    sidePanelTab,
    analysisOn,
    events: useLessonEvents.getState().events,
  }
}

/** `stepDone` for the current step on `lessonContext()`; true when no lesson runs. */
export function isStepDone(): boolean {
  const step = currentStep()
  return step ? stepDone(step, lessonContext()) : true
}
