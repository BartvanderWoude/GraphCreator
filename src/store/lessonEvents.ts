import { create } from 'zustand'

/**
 * A small log of app events that lesson steps check (spec 4.8, phase 41). This module imports
 * none of the other stores, so any module can record events without an import cycle.
 */

/** What happened in the app. */
export type LessonEventKind =
  // CodeDialog; `format`: the ExportFormat ('yaml', 'dagitty', 'gml', …).
  | 'code-opened'
  | 'code-copied'
  | 'code-downloaded'
  // ExportDialog; `format`: 'svg' | 'png' | 'pdf' | 'tikz'.
  | 'export-copied'
  | 'export-downloaded'
  // Share, after the clipboard write succeeded.
  | 'link-copied'
  // `graphStore.undo`, when it changed the graph.
  | 'undo'
  // Canvas refused a connection; `format`: the EdgeCheck reason ('self' | 'duplicate' | 'cycle').
  | 'edge-refused'

export interface LessonEvent {
  kind: LessonEventKind
  format?: string
}

export interface LessonEventsState {
  /** True while a lesson runs. */
  recording: boolean
  /** Events recorded since the current step began, oldest first. */
  events: LessonEvent[]
}

export const useLessonEvents = create<LessonEventsState>()(() => ({
  recording: false,
  events: [],
}))

/** Appends `event` while recording; a no-op otherwise. */
export function lessonEvent(event: LessonEvent): void {
  const { recording, events } = useLessonEvents.getState()
  if (!recording) return
  useLessonEvents.setState({ events: [...events, event] })
}

/** `recording = true`, `events = []`. */
export function startRecording(): void {
  useLessonEvents.setState({ recording: true, events: [] })
}

/** `events = []`; recording goes on. */
export function clearEvents(): void {
  useLessonEvents.setState({ events: [] })
}

/** `recording = false`, `events = []`. */
export function stopRecording(): void {
  useLessonEvents.setState({ recording: false, events: [] })
}
