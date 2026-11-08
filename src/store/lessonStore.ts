import { create } from 'zustand'
import { findLesson, type Lesson } from '@/lessons'
import type { Graph } from '@/model/graph'
import { useGraphStore } from './graphStore'

/** The running lesson (spec 4.8, 5.7.10). */
export interface LessonState {
  active: { lessonId: string; step: number } | null
  /**
   * Sets `active` first, then sets the user's graph aside and loads `lesson.sample()` via
   * `replaceGraph`; step 0. Exits a running lesson first. Throws on an unknown id.
   */
  start(lessonId: string): void
  /** Step + 1 when the current step is done; on the last step, `exit()`. */
  next(): void
  /** Step - 1, at least 0. */
  back(): void
  /** Restores the set-aside graph via `replaceGraph`, then `active = null`. */
  exit(): void
}

/**
 * The user's graph while a lesson runs. Held here, outside the store's state, so autosave never
 * sees it.
 */
let setAside: Graph | null = null

function lessonOf(lessonId: string): Lesson {
  const lesson = findLesson(lessonId)
  if (!lesson) throw new Error(`Unknown lesson "${lessonId}".`)
  return lesson
}

export const useLessonStore = create<LessonState>()((set, get) => ({
  active: null,

  start(lessonId) {
    const lesson = lessonOf(lessonId)
    if (get().active) get().exit()
    set({ active: { lessonId, step: 0 } })
    setAside = useGraphStore.getState().graph
    useGraphStore.getState().replaceGraph(lesson.sample())
  },

  next() {
    const { active } = get()
    if (!active || !isStepDone()) return
    const last = lessonOf(active.lessonId).steps.length - 1
    if (active.step >= last) get().exit()
    else set({ active: { ...active, step: active.step + 1 } })
  },

  back() {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, step: Math.max(0, active.step - 1) } })
  },

  exit() {
    if (!get().active) return
    if (setAside) useGraphStore.getState().replaceGraph(setAside)
    setAside = null
    set({ active: null })
  },
}))

/** The current step's `isDone` on the store's graph; true when no lesson runs. */
export function isStepDone(): boolean {
  const { active } = useLessonStore.getState()
  if (!active) return true
  const step = findLesson(active.lessonId)?.steps[active.step]
  return step ? step.isDone(useGraphStore.getState().graph) : true
}
