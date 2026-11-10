import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Graph } from '@/model/graph'
import type { Issue, Result } from '@/model/result'
import { toYaml } from '@/model/yaml'
import { useGraphStore } from '@/store/graphStore'

/** Fitting the view animates for 300 ms, or not at all with reduced motion (spec 5.7.5). */
function fitDuration(): number {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : 300
  } catch {
    return 300
  }
}

interface SharedGraphState {
  /** The shared graph waiting for the user's answer in the dialog, or null. */
  pending: { graph: Graph; warnings: Issue[] } | null
  /** Increments each time a shared graph is opened, so the dialog component fits the view. */
  fitRequests: number
}

const useSharedGraphStore = create<SharedGraphState>()(() => ({
  pending: null,
  fitRequests: 0,
}))

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Replaces the graph with the shared one, asks for a fitted view and toasts (spec 5.4). */
function openShared(graph: Graph, warnings: Issue[]): void {
  useGraphStore.getState().replaceGraph(graph)
  useSharedGraphStore.setState((s) => ({
    pending: null,
    fitRequests: s.fitRequests + 1,
  }))
  toast(
    warnings.length === 0
      ? 'Opened the shared graph.'
      : `Opened the shared graph with ${plural(warnings.length, 'warning')}.`,
  )
}

/**
 * Offers the graph of a share link (spec 5.4, "Opening a share link"). A damaged link shows an
 * error toast and keeps the stored graph. When the stored graph is empty, or already equal to
 * the shared one, the shared graph opens at once; otherwise `SharedGraphDialog` asks first.
 */
// oxlint-disable-next-line react/only-export-components -- the spec places it beside the dialog (phase 23).
export function offerSharedGraph(result: Result<Graph>): void {
  if (!result.ok) {
    toast.error('Could not open the shared graph.', {
      description: result.errors[0]?.message,
    })
    return
  }
  const current = useGraphStore.getState().graph
  if (current.nodes.length === 0 || toYaml(current) === toYaml(result.value)) {
    openShared(result.value, result.warnings)
  } else {
    useSharedGraphStore.setState({
      pending: { graph: result.value, warnings: result.warnings },
    })
  }
}

/**
 * The "Open the shared graph?" dialog, and the view fit after a shared graph opens. Must be
 * rendered inside App's `<ReactFlowProvider>`. Escape and the close button keep the user's graph.
 */
export function SharedGraphDialog() {
  const pending = useSharedGraphStore((s) => s.pending)
  const fitRequests = useSharedGraphStore((s) => s.fitRequests)
  const flow = useReactFlow()

  useEffect(() => {
    if (fitRequests === 0) return
    const frame = requestAnimationFrame(
      () => void flow.fitView({ duration: fitDuration() }),
    )
    return () => cancelAnimationFrame(frame)
  }, [fitRequests, flow])

  const keep = () => useSharedGraphStore.setState({ pending: null })

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) keep()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open the shared graph?</DialogTitle>
          <DialogDescription>
            This replaces the graph saved in this browser. Save it first if you
            want to keep it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={keep}>
            Keep my graph
          </Button>
          <Button
            onClick={() => {
              if (pending) openShared(pending.graph, pending.warnings)
            }}
          >
            Open shared graph
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
