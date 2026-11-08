import { useEffect, useId, useRef, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { InfoTip } from '@/components/InfoTip'
import { ListEditor } from '@/components/ListEditor'
import { RolePicker } from '@/components/RolePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FIELD_TIPS, VAR_TYPE_LABELS } from '@/lib/copy'
import type { GNode } from '@/model/graph'
import {
  isLeveledType,
  isNumericType,
  VAR_TYPES,
  type VarType,
} from '@/model/schema'
import { useGraphStore } from '@/store/graphStore'

/** Select value standing for "untyped" (Radix Select items cannot have an empty value). */
const UNTYPED = 'untyped'

/**
 * Edits one node (spec 5.3). Local field state is read from `node` on mount, so the parent
 * keys this editor by node id.
 */
export function NodeEditor({ node }: { node: GNode }) {
  const id = useId()
  const renameNode = useGraphStore((s) => s.renameNode)
  const updateNode = useGraphStore((s) => s.updateNode)
  const removeSelection = useGraphStore((s) => s.removeSelection)
  const focusNameOf = useGraphStore((s) => s.focusNameOf)
  const clearFocusName = useGraphStore((s) => s.clearFocusName)

  const [name, setName] = useState(node.name)
  const [nameError, setNameError] = useState<string | null>(null)
  const [description, setDescription] = useState(node.description ?? '')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusNameOf !== node.id) return
    nameRef.current?.focus()
    nameRef.current?.select()
    clearFocusName()
  }, [focusNameOf, node.id, clearFocusName])

  const commitName = () => {
    if (name === node.name) {
      setNameError(null)
      return
    }
    const result = renameNode(node.id, name)
    if (result.ok) {
      setName(name.trim())
      setNameError(null)
    } else {
      setNameError(result.errors[0]?.message ?? 'Invalid name.')
    }
  }

  const revertName = () => {
    setName(node.name)
    setNameError(null)
  }

  const commitDescription = () => {
    if (description !== (node.description ?? ''))
      updateNode(node.id, { description })
  }

  return (
    <section aria-label="Node" className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold tracking-[0.06em] text-accent-foreground uppercase">
        Node
      </h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          ref={nameRef}
          className="rounded-md"
          value={name}
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitName()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              revertName()
            }
          }}
        />
        {nameError && (
          <p
            id={`${id}-name-error`}
            role="alert"
            className="text-[13px] leading-[1.4] text-destructive"
          >
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={`${id}-role`} label="Role" tip={FIELD_TIPS.role} />
        <RolePicker
          id={`${id}-role`}
          value={node.role}
          onChange={(role) => updateNode(node.id, { role })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel
          htmlFor={`${id}-type`}
          label="Type"
          tipLabel="Variable type"
          tip={FIELD_TIPS.varType}
        />
        <Select
          value={node.varType ?? UNTYPED}
          onValueChange={(value) =>
            updateNode(node.id, {
              varType: value === UNTYPED ? undefined : (value as VarType),
            })
          }
        >
          <SelectTrigger id={`${id}-type`} className="w-full rounded-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNTYPED}>—</SelectItem>
            {VAR_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {VAR_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLeveledType(node.varType) && (
        <div
          role="group"
          aria-labelledby={`${id}-levels`}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-1">
            <span
              id={`${id}-levels`}
              className="text-sm leading-none font-medium"
            >
              Levels
            </span>
            <InfoTip label="Levels" text={FIELD_TIPS.levels} />
          </div>
          {node.varType === 'ordinal' && (
            <p className="text-[13px] leading-[1.4] text-muted-foreground">
              Order matters: lowest first.
            </p>
          )}
          <ListEditor
            items={node.levels ?? []}
            onCommit={(levels) => updateNode(node.id, { levels })}
            itemLabel="Level"
            addLabel="Add level"
          />
        </div>
      )}

      {isNumericType(node.varType) && (
        <UnitField
          id={`${id}-unit`}
          unit={node.unit}
          onCommit={(unit) => updateNode(node.id, { unit })}
        />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          className="rounded-md"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        className="self-start rounded-md"
        onClick={() => removeSelection([node.id], [])}
      >
        <Trash2Icon data-icon="inline-start" strokeWidth={1.75} />
        Delete node
      </Button>
    </section>
  )
}

/**
 * A field label followed by its info tip. The tip sits outside the `<label>`, so the field's
 * accessible name stays the label alone.
 */
function FieldLabel({
  htmlFor,
  label,
  tipLabel = label,
  tip,
}: {
  htmlFor: string
  label: string
  /** The field name the tip is about, when it differs from the label. */
  tipLabel?: string
  tip: string
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      <InfoTip label={tipLabel} text={tip} />
    </div>
  )
}

/** Unit input; its own component so the draft resets when the field is hidden and shown again. */
function UnitField({
  id,
  unit,
  onCommit,
}: {
  id: string
  unit: string | undefined
  onCommit(unit: string): void
}) {
  const [draft, setDraft] = useState(unit ?? '')
  const commit = () => {
    if (draft !== (unit ?? '')) onCommit(draft)
  }
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id} label="Unit" tip={FIELD_TIPS.unit} />
      <Input
        id={id}
        className="rounded-md"
        value={draft}
        placeholder="e.g. g, years"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}
