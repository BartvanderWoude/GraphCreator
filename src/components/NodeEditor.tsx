import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { LockIcon, Trash2Icon } from 'lucide-react'
import { cn } from 'cn'
import { InfoTip } from '@/components/InfoTip'
import { ListEditor } from '@/components/ListEditor'
import { RolePicker } from '@/components/RolePicker'
import { SharesEditor } from '@/components/SharesEditor'
import { SimulationSection } from '@/components/SimulationSection'
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
import {
  FIELD_TIPS,
  FORM_DESCRIPTIONS,
  FORM_LABELS,
  GRAPH_LOCK,
  VAR_TYPE_LABELS,
} from '@/lib/copy'
import type { GNode } from '@/model/graph'
import {
  FORMS,
  isLeveledType,
  isNumericType,
  VAR_TYPES,
  type Form,
  type VarType,
} from '@/model/schema'
import { equalShares, hasSimulationDetails } from '@/model/simulation'
import { useGraphStore } from '@/store/graphStore'
import { useUiStore } from '@/store/uiStore'

/** Select value standing for "untyped" (Radix Select items cannot have an empty value). */
const UNTYPED = 'untyped'
/** Select value standing for "no functional form". */
const NO_FORM = 'none'
/** The quiet look of a read-only field while the graph is locked (spec 5.10). */
const READ_ONLY = 'cursor-default bg-input/50 dark:bg-input/80'

/**
 * Edits one node (spec 5.3). Local field state is read from `node` on mount, so the parent
 * keys this editor by node id.
 */
export function NodeEditor({ node }: { node: GNode }) {
  const id = useId()
  const renameNode = useGraphStore((s) => s.renameNode)
  const updateNode = useGraphStore((s) => s.updateNode)
  const setLevels = useGraphStore((s) => s.setLevels)
  const removeSelection = useGraphStore((s) => s.removeSelection)
  const focusNameOf = useGraphStore((s) => s.focusNameOf)
  const clearFocusName = useGraphStore((s) => s.clearFocusName)
  const locked = useGraphStore((s) => s.graph.locked === true)
  const setNamePreview = useUiStore((s) => s.setNamePreview)

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

  // The editor is keyed by node and revision, so leaving it (or an undo) takes the preview with it.
  useEffect(() => () => useUiStore.getState().setNamePreview(null), [])

  /** Shows the draft on the circle while it differs from the stored name (spec 5.3). */
  const previewName = (draft: string) => {
    setNamePreview(draft === node.name ? null : { id: node.id, name: draft })
  }

  const commitName = () => {
    if (name === node.name) {
      setNamePreview(null)
      setNameError(null)
      return
    }
    const result = renameNode(node.id, name)
    if (result.ok) {
      setName(name.trim())
      setNamePreview(null)
      setNameError(null)
    } else {
      // The rename did not happen, so the circle goes back to the stored name; the draft and
      // the error stay in the field until the name is fixed (spec 5.3).
      setNamePreview(null)
      setNameError(result.errors[0]?.message ?? 'Invalid name.')
    }
  }

  const revertName = () => {
    setName(node.name)
    setNamePreview(null)
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

      {locked && <LockNote />}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          ref={nameRef}
          className={cn('rounded-md', locked && READ_ONLY)}
          value={name}
          readOnly={locked}
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
          onChange={(e) => {
            setName(e.target.value)
            previewName(e.target.value)
          }}
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
          disabled={locked}
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
          disabled={locked}
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
            onCommit={(levels, origin) => setLevels(node.id, levels, origin)}
            itemLabel="Level"
            addLabel="Add level"
            disabled={locked}
          />
        </div>
      )}

      {isNumericType(node.varType) && (
        <UnitField
          id={`${id}-unit`}
          unit={node.unit}
          readOnly={locked}
          onCommit={(unit) => updateNode(node.id, { unit })}
        />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          className={cn('rounded-md', locked && READ_ONLY)}
          value={description}
          readOnly={locked}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
        />
      </div>

      <SimulationSection marked={hasSimulationDetails(node)}>
        <NodeSimulation id={`${id}-sim`} node={node} disabled={locked} />
      </SimulationSection>

      <LockTip locked={locked} className="self-start">
        <Button
          type="button"
          variant="destructive"
          className="self-start rounded-md"
          disabled={locked}
          onClick={() => removeSelection([node.id], [])}
        >
          <Trash2Icon data-icon="inline-start" strokeWidth={1.75} />
          Delete node
        </Button>
      </LockTip>
    </section>
  )
}

/** The locked-graph line under the editor's header (spec 5.10). */
export function LockNote() {
  return (
    <p className="flex items-start gap-1.5 text-[13px] leading-[1.4] text-muted-foreground">
      <LockIcon
        aria-hidden
        strokeWidth={1.75}
        className="size-4 shrink-0 translate-y-px"
      />
      {GRAPH_LOCK.note}
    </p>
  )
}

/**
 * Wraps a control disabled by the lock so its reason shows on hover: a disabled button takes no
 * pointer events of its own (spec 5.10).
 */
export function LockTip({
  locked,
  className,
  children,
}: {
  locked: boolean
  /** Layout classes the wrapper takes over from the control it wraps, e.g. `self-start`. */
  className?: string
  children: ReactNode
}) {
  if (!locked) return children
  return (
    <span className={className} title={GRAPH_LOCK.reason}>
      {children}
    </span>
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
  readOnly,
  onCommit,
}: {
  id: string
  unit: string | undefined
  /** Locked graph (spec 5.10). */
  readOnly: boolean
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
        className={cn('rounded-md', readOnly && READ_ONLY)}
        value={draft}
        readOnly={readOnly}
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

/**
 * The node's simulation fields (spec 5.9): Shares for a categorical or ordinal node with at least
 * two levels (or shares already), Form for a node with causes (or a form already), else a hint.
 */
function NodeSimulation({
  id,
  node,
  disabled,
}: {
  id: string
  node: GNode
  /** Locked graph (spec 5.10): the values are shown but cannot be changed. */
  disabled: boolean
}) {
  const updateNode = useGraphStore((s) => s.updateNode)
  const hasCauses = useGraphStore((s) =>
    s.graph.edges.some((e) => e.target === node.id),
  )
  const levels = node.levels ?? []
  const showShares =
    isLeveledType(node.varType) &&
    (levels.length >= 2 || (node.shares !== undefined && levels.length > 0))
  const showForm = hasCauses || node.form !== undefined

  if (!showShares && !showForm) {
    return (
      <p className="text-[13px] leading-[1.4] text-muted-foreground">
        Add causes or levels to describe how to simulate this variable.
      </p>
    )
  }

  return (
    <>
      {showShares && (
        <div
          role="group"
          aria-labelledby={`${id}-shares`}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-1">
            <span
              id={`${id}-shares`}
              className="text-sm leading-none font-medium"
            >
              Shares
            </span>
            <InfoTip label="Shares" text={FIELD_TIPS.shares} />
          </div>
          {node.shares === undefined ? (
            <>
              <p className="text-[13px] leading-[1.4] text-muted-foreground">
                No shares yet.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start rounded-md"
                disabled={disabled}
                onClick={() =>
                  updateNode(node.id, { shares: equalShares(levels.length) })
                }
              >
                Add shares
              </Button>
            </>
          ) : (
            <>
              <SharesEditor
                levels={levels}
                shares={node.shares}
                disabled={disabled}
                onCommit={(shares) => updateNode(node.id, { shares })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 self-start rounded-md px-2"
                disabled={disabled}
                onClick={() => updateNode(node.id, { shares: undefined })}
              >
                Remove shares
              </Button>
            </>
          )}
        </div>
      )}

      {showForm && (
        <FormField
          id={`${id}-form`}
          form={node.form}
          disabled={disabled}
          onChange={(form) => updateNode(node.id, { form })}
        />
      )}
    </>
  )
}

/**
 * Functional form select (spec 5.9): `—` plus `FORMS`, each option with its label and its
 * `FORM_DESCRIPTIONS` line, as in `RolePicker`.
 */
function FormField({
  id,
  form,
  disabled,
  onChange,
}: {
  id: string
  form: Form | undefined
  /** Locked graph (spec 5.10). */
  disabled: boolean
  onChange(form: Form | undefined): void
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel
        htmlFor={id}
        label="Form"
        tipLabel="Functional form"
        tip={FIELD_TIPS.form}
      />
      <Select
        value={form ?? NO_FORM}
        disabled={disabled}
        onValueChange={(value) =>
          onChange(value === NO_FORM ? undefined : (value as Form))
        }
      >
        <SelectTrigger
          id={id}
          aria-label="Functional form"
          className="w-full rounded-md"
        >
          <SelectValue>{form ? FORM_LABELS[form] : '—'}</SelectValue>
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="w-(--radix-select-trigger-width)"
        >
          <SelectItem value={NO_FORM}>—</SelectItem>
          {FORMS.map((f) => (
            <SelectItem
              key={f}
              value={f}
              aria-describedby={`${id}-${f}`}
              className="py-1.5"
            >
              <span className="flex flex-col gap-0.5">
                <span>{FORM_LABELS[f]}</span>
                {/* Hidden from the option's name; read out as its description instead. */}
                <span
                  id={`${id}-${f}`}
                  aria-hidden
                  className="text-[13px] leading-[1.4] whitespace-normal text-muted-foreground"
                >
                  {FORM_DESCRIPTIONS[f]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
