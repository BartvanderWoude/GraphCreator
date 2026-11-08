import { Check, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import { useUiStore, type AutosaveStatus } from '@/store/uiStore'

const LOOKS: Record<
  AutosaveStatus,
  { text: string; icon: LucideIcon | null; className: string }
> = {
  on: {
    text: 'Saved in this browser',
    icon: Check,
    className: 'border-transparent bg-accent text-accent-foreground',
  },
  blocked: {
    text: 'Not saved: browser storage is blocked',
    icon: TriangleAlert,
    className: 'border-warning-border bg-warning-bg text-warning-fg',
  },
  paused: {
    text: 'Practice graph: not saved',
    icon: null,
    className: 'border-border bg-muted text-muted-foreground',
  },
}

/**
 * The autosave chip in the canvas's bottom-right corner (spec 5.2), driven by
 * `useUiStore().autosave`. Positioned absolutely, so its parent (the canvas `<main>`) must be
 * `relative`. It lets pointer events through to the canvas.
 */
export function SavedIndicator() {
  const status = useUiStore((s) => s.autosave)
  const { text, icon: Icon, className } = LOOKS[status]
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none absolute right-3 bottom-3 z-10 inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[13px] leading-none shadow-[0_1px_2px_rgb(15_23_42/0.08)]',
        className,
      )}
    >
      {Icon && (
        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      )}
      {text}
    </div>
  )
}
