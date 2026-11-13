import { useEffect, useMemo } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'
import { NODE_DIAMETER } from '@/model/nodeSize'
import { useGraphStore } from '@/store/graphStore'
import { useUiStore } from '@/store/uiStore'

/** Fit view and auto-layout animate for 300 ms, or not at all with reduced motion (5.7.5). */
const FIT_DURATION = 300

function fitDuration(): number {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : FIT_DURATION
  } catch {
    return FIT_DURATION
  }
}

/** View actions shared by the top bar, the tool rail and the shortcuts (spec 5.1, 5.2, 5.4). */
export interface CanvasActions {
  /** Fits the view once React Flow has rendered the store's current graph. */
  fitView(): void
  zoomIn(): void
  zoomOut(): void
  /** `layout()`, then fit the view. */
  autoLayout(): void
  /** Adds a node centred on the centre of the visible canvas. */
  addNodeAtCentre(): void
}

/**
 * The actions of the most recently mounted `useCanvasActions` user. `useToolShortcuts` runs
 * these, so that it works without a React Flow provider above it: App calls it in its own body,
 * outside the `<ReactFlowProvider>` it renders (redesign contracts, spec section 8).
 */
let registered: CanvasActions | null = null

/**
 * The view actions of the surrounding `<ReactFlowProvider>`. Must be called inside it. While the
 * caller is mounted, the actions are also what the L, F, + and − shortcuts run.
 */
export function useCanvasActions(): CanvasActions {
  const flow = useReactFlow()
  const flowStore = useStoreApi()

  const actions = useMemo<CanvasActions>(() => {
    function fitView() {
      requestAnimationFrame(
        () => void flow.fitView({ duration: fitDuration() }),
      )
    }
    return {
      fitView,
      zoomIn: () => void flow.zoomIn(),
      zoomOut: () => void flow.zoomOut(),
      autoLayout() {
        useGraphStore.getState().layout()
        fitView()
      },
      addNodeAtCentre() {
        const rect = flowStore.getState().domNode?.getBoundingClientRect()
        const centre = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        const pos = flow.screenToFlowPosition(centre)
        const { addNodeAt } = useGraphStore.getState()
        const half = NODE_DIAMETER / 2
        addNodeAt({ x: Math.round(pos.x - half), y: Math.round(pos.y - half) })
      },
    }
  }, [flow, flowStore])

  useEffect(() => {
    registered = actions
    return () => {
      if (registered === actions) registered = null
    }
  }, [actions])

  return actions
}

/** Elements whose keys belong to them: text fields, selects and open pop-up lists. */
const KEY_OWNERS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="listbox"], [role="menu"]'

function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest(KEY_OWNERS) !== null
}

/**
 * The history action of an undo or redo key (spec 5.2): Ctrl+Z or ⌘+Z undoes; Ctrl+Shift+Z,
 * ⌘+Shift+Z and Ctrl+Y redo. Null for any other key, or with Alt held.
 */
function historyKey(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey) return 'redo'
  return null
}

/**
 * Canvas tool shortcuts (spec 5.2): V, N and C set the tool; L runs auto-layout and fits the
 * view; F fits the view; + and − zoom; Escape returns to Select and clears the picked source;
 * Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z and Ctrl+Y redo. The tool keys are ignored with Ctrl, Meta or
 * Alt held. All are ignored while focus is in a text field, select or contenteditable (so Ctrl+Z
 * there is the browser's own text undo), and while a dialog is open. One `keydown` listener on
 * `window`.
 */
export function useToolShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return
      if (ownsKeys(e.target)) return
      if (document.querySelector('[role="dialog"]')) return

      const history = historyKey(e)
      if (history) {
        e.preventDefault()
        useGraphStore.getState()[history]()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const { setTool } = useUiStore.getState()
      const view = registered
      switch (e.key) {
        case 'v':
        case 'V':
          setTool('select')
          break
        case 'n':
        case 'N':
          setTool('add')
          break
        case 'c':
        case 'C':
          setTool('connect')
          break
        case 'Escape':
          setTool('select')
          break
        case 'l':
        case 'L':
          if (!view) return
          view.autoLayout()
          break
        case 'f':
        case 'F':
          if (!view) return
          view.fitView()
          break
        case '+':
        case '=':
          if (!view) return
          view.zoomIn()
          break
        case '-':
        case '−':
          if (!view) return
          view.zoomOut()
          break
        default:
          return
      }
      e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
