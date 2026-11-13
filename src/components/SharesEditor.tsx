import { useState } from 'react'
import { cn } from 'cn'
import { Input } from '@/components/ui/input'
import { sharesTotal } from '@/model/simulation'

/** Segment colours of the bar: `--primary` at 35, 55, 75 and 95 % strength, repeating (spec 5.9). */
const SEGMENT_COLOURS = [
  'bg-primary/35',
  'bg-primary/55',
  'bg-primary/75',
  'bg-primary/95',
] as const

/** The quiet look of a read-only field while the graph is locked (spec 5.10). */
const READ_ONLY = 'cursor-default bg-input/50 dark:bg-input/80'

/** A share as the percentage its input shows: `share × 100` rounded to two decimals. */
function sharePercent(share: number): string {
  return String(Math.round(share * 10_000) / 100)
}

/** A total as a percentage rounded to one decimal, without trailing zeros (spec 4.16). */
function totalPercent(total: number): string {
  return `${Math.round(total * 1000) / 10}%`
}

export interface SharesEditorProps {
  levels: string[]
  /** The node's shares, one per level in level order. */
  shares: number[]
  /** Called with the full list when one share is committed and changed. */
  onCommit(shares: number[]): void
  /** Locked graph (spec 5.10): the inputs are read-only, so their text can still be copied. */
  disabled?: boolean
}

/**
 * The shares of a categorical or ordinal node (spec 5.9): one number input per level in percent,
 * a stacked bar and the total, with a warning when the shares do not add up to 100%. The inputs
 * show the stored shares except while being edited, so they follow levels that move.
 */
export function SharesEditor({
  levels,
  shares,
  onCommit,
  disabled = false,
}: SharesEditorProps) {
  const values = levels.map((_, i) => shares[i] ?? 0)
  const total = sharesTotal(values)
  const off = Math.abs(total - 1) > 0.001

  const commitShare = (index: number, share: number) => {
    if (share === values[index]) return
    onCommit(values.map((s, i) => (i === index ? share : s)))
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5" aria-label="Share list">
        {levels.map((level, i) => (
          <li key={i} className="flex items-center gap-2">
            <span title={level} className="min-w-0 flex-1 truncate">
              {level}
            </span>
            <ShareInput
              level={level}
              share={values[i]}
              disabled={disabled}
              onCommit={(share) => commitShare(i, share)}
            />
          </li>
        ))}
      </ul>
      <SharesBar shares={values} total={total} />
      <p
        aria-live="polite"
        className={cn(
          'text-[13px] leading-[1.4]',
          off ? 'text-warning-fg' : 'text-muted-foreground',
        )}
      >
        {off
          ? `Total ${totalPercent(total)}: shares should add up to 100%.`
          : `Total ${totalPercent(total)}`}
      </p>
    </div>
  )
}

/**
 * One share in percent. Commits on blur or Enter, reverts on Escape; the committed value is
 * clamped to 0–100 and stored as a fraction rounded to 4 decimals. Empty or non-numeric text
 * reverts.
 */
function ShareInput({
  level,
  share,
  disabled,
  onCommit,
}: {
  level: string
  share: number
  disabled: boolean
  onCommit(share: number): void
}) {
  // The text being typed, or null when the field shows the stored share.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const text = draft.trim()
    const value = Number(text)
    if (text === '' || !Number.isFinite(value)) return
    const percent = Math.min(100, Math.max(0, value))
    onCommit(Math.round(percent * 100) / 10_000)
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={0.1}
        aria-label={`Share of ${level}`}
        // No spin buttons: the 64 px field needs its width for two decimals.
        className={cn(
          'h-8 w-16 [appearance:textfield] rounded-md px-2 text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          disabled && READ_ONLY,
        )}
        readOnly={disabled}
        value={draft ?? sharePercent(share)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(null)
          }
        }}
      />
      <span aria-hidden className="text-muted-foreground">
        %
      </span>
    </div>
  )
}

/**
 * Stacked bar of the shares, 12 px high: one segment per level, proportional to the shares
 * (normalised), split by 1 px gaps. Decorative; the inputs and the total carry the numbers.
 */
function SharesBar({ shares, total }: { shares: number[]; total: number }) {
  return (
    <div
      aria-hidden
      className="flex h-3 w-full gap-px overflow-hidden rounded-sm"
    >
      {total > 0 ? (
        shares.map((share, i) =>
          share > 0 ? (
            <div
              key={i}
              className={cn(
                'h-full',
                SEGMENT_COLOURS[i % SEGMENT_COLOURS.length],
              )}
              style={{ flexGrow: share / total, flexBasis: 0 }}
            />
          ) : null,
        )
      ) : (
        <div className="h-full flex-1 bg-muted" />
      )}
    </div>
  )
}
