import { useId, useRef, type KeyboardEvent } from 'react'
import { cn } from 'cn'
import { InfoTip } from '@/components/InfoTip'
import { Button } from '@/components/ui/button'
import { FIELD_TIPS, SIGN_LABELS } from '@/lib/copy'
import type { GEdge } from '@/model/graph'
import type { EdgeSign, Sign } from '@/model/schema'
import {
  signFits,
  signLevelMap,
  signLevelsNode,
  signShape,
} from '@/model/simulation'
import { useGraphStore } from '@/store/graphStore'

/** The three choices of a sign control, in order: none, positive, negative. */
const OPTIONS: readonly {
  value: Sign | undefined
  name: string
  glyph?: string
}[] = [
  { value: undefined, name: 'No sign' },
  { value: 'positive', name: SIGN_LABELS.positive, glyph: '+' },
  { value: 'negative', name: SIGN_LABELS.negative, glyph: '−' },
]

const HINT = 'text-[13px] leading-[1.4] text-muted-foreground'

/** The map's sign for `level`; own keys only, so a level such as `constructor` reads safely. */
function mapSign(
  map: Record<string, Sign> | undefined,
  level: string,
): Sign | undefined {
  if (map === undefined) return undefined
  return Object.hasOwn(map, level) ? map[level] : undefined
}

/** The map with `level` set to `value`, or removed for `undefined`. Other keys keep their order. */
function withMapSign(
  map: Record<string, Sign> | undefined,
  level: string,
  value: Sign | undefined,
): Record<string, Sign> {
  const next = new Map<string, Sign>(
    map !== undefined ? Object.entries(map) : [],
  )
  if (value === undefined) next.delete(level)
  else next.set(level, value)
  return Object.fromEntries(next)
}

/**
 * The Sign field of the edge editor's Simulation section (spec 5.9). What it shows depends on
 * `signShape`: one control, one control per level of the end whose levels key the map, or a line
 * saying no sign is available. A stored sign that does not fit the shape can only be cleared.
 */
export function SignEditor({
  edge,
  disabled = false,
}: {
  edge: GEdge
  /** Locked graph (spec 5.10): the sign is shown but cannot be changed or cleared. */
  disabled?: boolean
}) {
  const id = useId()
  const updateEdge = useGraphStore((s) => s.updateEdge)
  // Read from the live graph, so a type or level change on an end (or an undo) shows at once. The
  // whole graph, not a selector per helper: `signLevelMap` builds a fresh object for the two-level
  // shorthand, which a Zustand selector would see as a new value on every render.
  const graph = useGraphStore((s) => s.graph)
  const shape = signShape(graph, edge)
  const levelsNode = signLevelsNode(graph, edge)
  const fits = signFits(graph, edge)
  // A word on a two-level cause reads as a sign on its second level (spec 4.16), so editing one
  // row of such an edge keeps it.
  const levelMap = signLevelMap(graph, edge)
  const sign = edge.sign
  const labelId = `${id}-sign`

  const setSign = (next: EdgeSign | undefined) =>
    updateEdge(edge.id, { sign: next })

  let body
  let perLevel = false
  if (!fits) {
    body = (
      <>
        <p className={HINT}>
          This sign does not fit the variable types any more.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="-ml-2 self-start rounded-md px-2"
          disabled={disabled}
          onClick={() => setSign(undefined)}
        >
          Clear sign
        </Button>
      </>
    )
  } else if (shape === 'none') {
    body = (
      <p className={HINT}>
        A sign is not available, because both variables are categorical with
        more than two levels.
      </p>
    )
  } else if (shape === 'single' || levelsNode === undefined) {
    body = (
      <SignControl
        labelledBy={labelId}
        value={typeof sign === 'string' ? sign : undefined}
        disabled={disabled}
        onChange={setSign}
      />
    )
  } else {
    const rows = levelsNode.levels ?? []
    perLevel = true
    body = (
      <>
        <p className={HINT}>
          {shape === 'child-levels'
            ? `Effect on each level of ${levelsNode.name}:`
            : `Each level of ${levelsNode.name} compared with the average:`}
        </p>
        <ul className="flex flex-col gap-3">
          {rows.map((level, i) => (
            <li key={i} className="flex min-w-0 flex-col gap-1">
              <span aria-hidden title={level} className="truncate">
                {level}
              </span>
              <SignControl
                label={`Sign for ${level}`}
                value={mapSign(levelMap, level)}
                disabled={disabled}
                onChange={(value) =>
                  setSign(withMapSign(levelMap, level, value))
                }
              />
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div
      role={perLevel ? 'group' : undefined}
      aria-labelledby={perLevel ? labelId : undefined}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-1">
        <span id={labelId} className="text-sm leading-none font-medium">
          Sign
        </span>
        <InfoTip label="Sign" text={FIELD_TIPS.sign} />
      </div>
      {body}
    </div>
  )
}

/**
 * A segmented radio group of three toggle buttons: `—`, `+ Positive` and `− Negative`. Arrow keys
 * move between them and choose, as in any radio group; only the chosen one is in the tab order.
 */
function SignControl({
  label,
  labelledBy,
  value,
  disabled,
  onChange,
}: {
  /** The group's accessible name, when no visible label names it. */
  label?: string
  /** Id of the visible label that names the group. */
  labelledBy?: string
  value: Sign | undefined
  /** Locked graph (spec 5.10): the buttons are disabled and the arrow keys do nothing. */
  disabled: boolean
  onChange(value: Sign | undefined): void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = OPTIONS.findIndex((o) => o.value === value)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return
    e.preventDefault()
    const next = (current + step + OPTIONS.length) % OPTIONS.length
    refs.current[next]?.focus()
    onChange(OPTIONS[next].value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="inline-flex shrink-0 gap-0.5 self-start rounded-md border border-input bg-background p-0.5"
    >
      {OPTIONS.map((option, i) => {
        const checked = i === current
        return (
          <button
            key={option.name}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.glyph ? undefined : option.name}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (!checked) onChange(option.value)
            }}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-sm px-2 text-sm font-medium whitespace-nowrap transition-colors duration-120 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none',
              // A chosen sign is teal; a chosen "no sign" stays quiet, so unset rows recede.
              !checked
                ? cn('text-foreground', !disabled && 'hover:bg-muted')
                : option.value === undefined
                  ? 'bg-muted text-foreground'
                  : cn(
                      'bg-primary text-primary-foreground',
                      !disabled && 'hover:bg-primary-hover',
                    ),
              // Locked: the sign stays readable, so it is dimmed only a little.
              disabled && 'cursor-default opacity-80',
            )}
          >
            {option.glyph ? (
              <>
                <span aria-hidden className="w-2.5 text-center">
                  {option.glyph}
                </span>
                {option.name}
              </>
            ) : (
              <span aria-hidden>—</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
