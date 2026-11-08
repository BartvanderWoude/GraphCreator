import { useId, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { ListEditor } from '@/components/ListEditor'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { GEdge } from '@/model/graph'
import { useGraphStore } from '@/store/graphStore'

/**
 * Edits one edge (spec 5.3). Local field state is read from `edge` on mount, so the parent
 * keys this editor by edge id.
 */
export function EdgeEditor({ edge }: { edge: GEdge }) {
  const id = useId()
  const updateEdge = useGraphStore((s) => s.updateEdge)
  const removeSelection = useGraphStore((s) => s.removeSelection)
  const sourceName = useGraphStore(
    (s) => s.graph.nodes.find((n) => n.id === edge.source)?.name ?? '?',
  )
  const targetName = useGraphStore(
    (s) => s.graph.nodes.find((n) => n.id === edge.target)?.name ?? '?',
  )
  const [note, setNote] = useState(edge.note ?? '')

  const commitNote = () => {
    if (note !== (edge.note ?? '')) updateEdge(edge.id, { note })
  }

  return (
    <section aria-label="Edge" className="flex flex-col gap-4">
      <h2 className="text-base font-semibold break-words">
        {sourceName} → {targetName}
      </h2>

      <div
        role="group"
        aria-labelledby={`${id}-evidence`}
        className="flex flex-col gap-1.5"
      >
        <span
          id={`${id}-evidence`}
          className="text-sm leading-none font-medium"
        >
          Evidence
        </span>
        <ListEditor
          items={edge.evidence}
          onCommit={(evidence) => updateEdge(edge.id, { evidence })}
          itemLabel="Evidence"
          addLabel="Add evidence"
          placeholder="e.g. PMID:123, doi:10.1000/xyz"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        className="self-start"
        onClick={() => removeSelection([], [edge.id])}
      >
        <Trash2Icon data-icon="inline-start" />
        Delete edge
      </Button>
    </section>
  )
}
