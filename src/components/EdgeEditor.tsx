import { useId, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { InfoTip } from '@/components/InfoTip'
import { ListEditor } from '@/components/ListEditor'
import { SignEditor } from '@/components/SignEditor'
import { SimulationSection } from '@/components/SimulationSection'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FIELD_TIPS, STRENGTH_DESCRIPTIONS, STRENGTH_LABELS } from '@/lib/copy'
import type { GEdge } from '@/model/graph'
import { STRENGTHS, type Strength } from '@/model/schema'
import { hasSimulationDetails } from '@/model/simulation'
import { useGraphStore } from '@/store/graphStore'

/** Select value standing for "no strength" (Radix Select items cannot have an empty value). */
const NO_STRENGTH = 'none'

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

      <SimulationSection marked={hasSimulationDetails(edge)}>
        <SignEditor edge={edge} />
        <StrengthField
          id={`${id}-strength`}
          strength={edge.strength}
          onChange={(strength) => updateEdge(edge.id, { strength })}
        />
      </SimulationSection>

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

/**
 * The Strength select of the Simulation section (spec 5.9): `—` and the three bands. Each option
 * shows its label and its `STRENGTH_DESCRIPTIONS` line, as in `RolePicker`.
 */
function StrengthField({
  id,
  strength,
  onChange,
}: {
  id: string
  strength: Strength | undefined
  onChange(strength: Strength | undefined): void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>Strength</Label>
        <InfoTip label="Strength" text={FIELD_TIPS.strength} />
      </div>
      <Select
        value={strength ?? NO_STRENGTH}
        onValueChange={(value) =>
          onChange(value === NO_STRENGTH ? undefined : (value as Strength))
        }
      >
        <SelectTrigger
          id={id}
          aria-label="Strength"
          className="w-full rounded-md"
        >
          <SelectValue>
            {strength ? STRENGTH_LABELS[strength] : '—'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="w-(--radix-select-trigger-width)"
        >
          <SelectItem value={NO_STRENGTH}>—</SelectItem>
          {STRENGTHS.map((band) => (
            <SelectItem
              key={band}
              value={band}
              aria-describedby={`${id}-${band}`}
              className="py-1.5 *:[span]:last:items-start"
            >
              <span className="flex flex-col gap-0.5">
                <span>{STRENGTH_LABELS[band]}</span>
                {/* Hidden from the option's name; read out as its description instead. */}
                <span
                  id={`${id}-${band}`}
                  aria-hidden
                  className="text-[13px] leading-[1.4] whitespace-normal text-muted-foreground"
                >
                  {STRENGTH_DESCRIPTIONS[band]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
