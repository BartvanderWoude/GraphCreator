import { toast } from 'sonner'
import { parseYaml, toYaml } from '@/model/yaml'
import { useGraphStore } from '@/store/graphStore'

/** localStorage key holding the current graph as YAML text (spec 5.5). */
export const AUTOSAVE_KEY = 'graphcreator:current'

/** Delay between the last change and the write (spec 5.5). */
export const AUTOSAVE_DELAY_MS = 500

export const RESTORE_FAILED_MESSAGE = 'Could not restore the previous graph.'

type AutosaveStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Restores the graph saved in `storage`, then keeps writing the store's graph back to it as
 * `toYaml` text, debounced by 500 ms (spec 5.5). If the stored text cannot be parsed, the app
 * keeps the empty graph and shows a toast; the stored text is only overwritten after the next
 * change. Every storage access is guarded, so a blocked or full storage only disables autosave.
 * `storage === null` disables autosave entirely.
 *
 * Returns a function that stops autosaving and cancels a pending write.
 */
export function startAutosave(storage: AutosaveStorage | null): () => void {
  if (storage === null) return () => {}

  restore(storage)

  let timer: ReturnType<typeof setTimeout> | null = null

  const write = () => {
    timer = null
    try {
      storage.setItem(AUTOSAVE_KEY, toYaml(useGraphStore.getState().graph))
    } catch {
      // Storage full or blocked: this write is skipped.
    }
  }

  const unsubscribe = useGraphStore.subscribe((state, prev) => {
    if (state.graph === prev.graph) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(write, AUTOSAVE_DELAY_MS)
  })

  return () => {
    unsubscribe()
    if (timer !== null) clearTimeout(timer)
    timer = null
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
