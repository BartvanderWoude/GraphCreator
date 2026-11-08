import { useEffect, useId, useRef, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { ListEditor } from '@/components/ListEditor'
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
import type { GNode } from '@/model/graph'
import {
  isLeveledType,
  isNumericType,
  ROLES,
  VAR_TYPES,
  type Role,
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
      <h2 className="text-base font-semibold">Node</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          ref={nameRef}
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
            className="text-sm text-destructive"
          >
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-role`}>Role</Label>
        <Select
          value={node.role}
          onValueChange={(role) => updateNode(node.id, { role: role as Role })}
        >
          <SelectTrigger id={`${id}-role`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-type`}>Type</Label>
        <Select
          value={node.varType ?? UNTYPED}
          onValueChange={(value) =>
            updateNode(node.id, {
              varType: value === UNTYPED ? undefined : (value as VarType),
            })
          }
        >
          <SelectTrigger id={`${id}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNTYPED}>—</SelectItem>
            {VAR_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLeveledType(node.varType) && (
        <div
          role="group"
          aria-labelledby={`${id}-levels`}
          className="flex flex-col gap-1.5"
        >
          <span
            id={`${id}-levels`}
            className="text-sm leading-none font-medium"
          >
            Levels
          </span>
          {node.varType === 'ordinal' && (
            <p className="text-xs text-muted-foreground">
              Order matters: lowest first
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        className="self-start"
        onClick={() => removeSelection([node.id], [])}
      >
        <Trash2Icon data-icon="inline-start" />
        Delete node
      </Button>
    </section>
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Unit</Label>
      <Input
        id={id}
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
