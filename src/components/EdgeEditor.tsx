import { useId, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { InfoTip } from '@/components/InfoTip'
import { ListEditor } from '@/components/ListEditor'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FIELD_TIPS } from '@/lib/copy'
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
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold tracking-[0.06em] text-accent-foreground uppercase">
          Edge
        </h2>
        <h3 className="text-[15px] leading-[1.4] font-semibold break-words">
          {sourceName} → {targetName}
        </h3>
      </div>

      <div
        role="group"
        aria-labelledby={`${id}-evidence`}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-1">
          <span
            id={`${id}-evidence`}
            className="text-sm leading-none font-medium"
          >
            Evidence
          </span>
          <InfoTip label="Evidence" text={FIELD_TIPS.evidence} />
        </div>
        <ListEditor
          items={edge.evidence}
          onCommit={(evidence) => updateEdge(edge.id, { evidence })}
          itemLabel="Evidence"
          addLabel="Add evidence"
          placeholder="e.g. PMID:123, doi:10.1000/xyz"
          mono
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <Label htmlFor={`${id}-note`}>Note</Label>
          <InfoTip label="Note" text={FIELD_TIPS.note} />
        </div>
        <Textarea
          id={`${id}-note`}
          className="rounded-md"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        className="self-start rounded-md"
        onClick={() => removeSelection([], [edge.id])}
      >
        <Trash2Icon data-icon="inline-start" strokeWidth={1.75} />
        Delete edge
      </Button>
    </section>
  )
}
