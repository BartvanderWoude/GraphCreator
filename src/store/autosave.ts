import { toast } from 'sonner'
import { parseYaml, toYaml } from '@/model/yaml'
import { useGraphStore } from '@/store/graphStore'
import { useLessonStore } from '@/store/lessonStore'
import { useUiStore, type AutosaveStatus } from '@/store/uiStore'

/** localStorage key holding the current graph as YAML text (spec 5.5). */
export const AUTOSAVE_KEY = 'graphcreator:current'

/** Delay between the last change and the write (spec 5.5). */
export const AUTOSAVE_DELAY_MS = 500

export const RESTORE_FAILED_MESSAGE = 'Could not restore the previous graph.'

type AutosaveStorage = Pick<Storage, 'getItem' | 'setItem'>

const inLesson = () => useLessonStore.getState().active !== null

/**
 * Restores the graph saved in `storage`, then keeps writing the store's graph back to it as
 * `toYaml` text, debounced by 500 ms (spec 5.5). If the stored text cannot be parsed, the app
 * keeps the empty graph and shows a toast; the stored text is only overwritten after the next
 * change. Every storage access is guarded, so a blocked or full storage only disables autosave.
 *
 * While a lesson runs, the practice graph is never written: a write that comes due is skipped,
 * and a pending write of the user's graph is made at once when the lesson starts (the lesson
 * store sets `active` before it loads the practice graph). The user's graph, restored when the
 * lesson ends, is written again by the usual debounce.
 *
 * Keeps `useUiStore().autosave` up to date: `paused` during a lesson, otherwise `blocked` when
 * `storage` is null or the last write threw, otherwise `on`. `storage === null` disables saving.
 *
 * Returns a function that stops autosaving and cancels a pending write.
 */
export function startAutosave(storage: AutosaveStorage | null): () => void {
  let writeFailed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const updateStatus = () => {
    const status: AutosaveStatus = inLesson()
      ? 'paused'
      : storage === null || writeFailed
        ? 'blocked'
        : 'on'
    if (useUiStore.getState().autosave !== status) {
      useUiStore.getState().setAutosave(status)
    }
  }

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  /** Writes the store's graph now, whatever is running. */
  const writeNow = () => {
    cancelTimer()
    if (storage === null) return
    try {
      storage.setItem(AUTOSAVE_KEY, toYaml(useGraphStore.getState().graph))
      writeFailed = false
    } catch {
      // Storage full or blocked: this write is skipped, and the indicator says so.
      writeFailed = true
    }
    updateStatus()
  }

  /** The debounced write: skipped while a lesson runs, so the practice graph is never stored. */
  const writeDue = () => {
    timer = null
    if (!inLesson()) writeNow()
  }

  if (storage !== null) restore(storage)
  updateStatus()

  const unsubscribeGraph = useGraphStore.subscribe((state, prev) => {
    if (storage === null || state.graph === prev.graph) return
    cancelTimer()
    timer = setTimeout(writeDue, AUTOSAVE_DELAY_MS)
  })

  const unsubscribeLesson = useLessonStore.subscribe((state, prev) => {
    const started = state.active !== null && prev.active === null
    // Still the user's graph: the practice graph is loaded after `active` is set.
    if (started && timer !== null) writeNow()
    updateStatus()
  })

  return () => {
    unsubscribeGraph()
    unsubscribeLesson()
    cancelTimer()
  }
}

/** Loads the stored graph into the store; toasts when stored text cannot be parsed. */
function restore(storage: AutosaveStorage): void {
  let text: string | null
  try {
    text = storage.getItem(AUTOSAVE_KEY)
  } catch {
    return
  }
  if (text === null || text.trim() === '') return

  let restored = false
  try {
    const result = parseYaml(text)
    if (result.ok) {
      useGraphStore.getState().replaceGraph(result.value)
      restored = true
    }
  } catch {
    // Treated like unparseable text below.
  }
  if (!restored) toast(RESTORE_FAILED_MESSAGE)
}
