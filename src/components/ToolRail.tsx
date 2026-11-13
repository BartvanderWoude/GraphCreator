import {
  CirclePlus,
  Lock,
  LockOpen,
  Maximize,
  Minus,
  MousePointer2,
  Network,
  Plus,
  Redo2,
  Spline,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from 'cn'
import { useCanvasActions } from '@/components/useToolShortcuts'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { GRAPH_LOCK } from '@/lib/copy'
import { useGraphStore } from '@/store/graphStore'
import { useLessonStore } from '@/store/lessonStore'
import { useUiStore } from '@/store/uiStore'

/** Shown in a tooltip when a control is disabled because a lesson is running (spec 5.10). */
const LESSON_LOCK = 'Not available during a lesson.'

/** The modifier shown in the Undo and Redo tooltips: ⌘ on a Mac, else Ctrl (spec 5.1). */
function modKey(): string {
  try {
    return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
  } catch {
    return 'Ctrl'
  }
}

/**
 * One 40 × 40 icon button of the rail, with an accessible name, `aria-keyshortcuts` and a
 * tooltip "Name  Key". `active` is only passed for tools and the lock toggle; an active one is
 * solid teal. `disabled` greys the button out (Undo and Redo with nothing to undo or redo, and
 * the buttons a locked graph or a running lesson rules out). `reason` adds a line to the
 * tooltip saying why a button is disabled; as in `TopBar`'s `LessonLock`, the disabled button
 * then sits in a focusable span, because it gets no pointer or focus events itself (spec 5.10).
 */
function RailButton({
  label,
  shortcut,
  keyLabel,
  icon: Icon,
  active,
  disabled,
  reason,
  onClick,
}: {
  label: string
  /** The `aria-keyshortcuts` value; absent for the lock toggle, which has no shortcut. */
  shortcut?: string
  /** The key as shown in the tooltip. */
  keyLabel?: string
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  /** Why the button is disabled; shown under the name in the tooltip. */
  reason?: string
  onClick: () => void
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-md text-foreground transition-colors duration-120 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        active && 'bg-primary text-primary-foreground hover:bg-primary-hover',
      )}
    >
      <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
  const showReason = disabled === true && reason !== undefined
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {showReason ? (
          <span
            tabIndex={0}
            className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <span>{label}</span>
        {keyLabel !== undefined && (
          <kbd
            data-slot="kbd"
            className="ml-2 rounded-sm bg-background/15 px-1.5 font-mono text-[11px] leading-5"
          >
            {keyLabel}
          </kbd>
        )}
        {showReason && <span className="block max-w-56">{reason}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The vertical tool rail left of the canvas (spec 5.1, 5.2, 5.10): Select, Add node and Connect,
 * then Auto-layout, Fit view, Zoom in and Zoom out, then Undo and Redo, then the Lock graph
 * toggle. While the graph is locked, Add node, Connect and Auto-layout are disabled; Undo and
 * Redo stay enabled, because the first undo after locking unlocks the graph. Must be rendered
 * inside App's `<ReactFlowProvider>`.
 */
export function ToolRail() {
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const view = useCanvasActions()
  const canUndo = useGraphStore((s) => s.past.length > 0)
  const canRedo = useGraphStore((s) => s.future.length > 0)
  const undo = useGraphStore((s) => s.undo)
  const redo = useGraphStore((s) => s.redo)
  const locked = useGraphStore((s) => s.graph.locked === true)
  const setLocked = useGraphStore((s) => s.setLocked)
  const inLesson = useLessonStore((s) => s.active !== null)
  const mod = modKey()

  function addNode() {
    if (tool !== 'add') {
      setTool('add')
      return
    }
    // The add tool is already active: add a node in the middle of the view.
    view.addNodeAtCentre()
    setTool('select')
  }

  /** Locking leaves the Add and Connect tools, which do nothing on a locked graph (5.10). */
  function toggleLock() {
    const on = !locked
    setLocked(on)
    // setTool also clears any picked connect source (4.7).
    if (on && (tool === 'add' || tool === 'connect')) setTool('select')
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Canvas tools"
        aria-orientation="vertical"
        className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-background py-2"
      >
        <RailButton
          label="Select"
          shortcut="V"
          keyLabel="V"
          icon={MousePointer2}
          active={tool === 'select'}
          onClick={() => setTool('select')}
        />
        <RailButton
          label="Add node"
          shortcut="N"
          keyLabel="N"
          icon={CirclePlus}
          active={tool === 'add'}
          disabled={locked}
          reason={GRAPH_LOCK.reason}
          onClick={addNode}
        />
        <RailButton
          label="Connect"
          shortcut="C"
          keyLabel="C"
          icon={Spline}
          active={tool === 'connect'}
          disabled={locked}
          reason={GRAPH_LOCK.reason}
          onClick={() => setTool('connect')}
        />
        <div
          role="separator"
          aria-orientation="horizontal"
          className="my-1 h-px w-8 bg-border"
        />
        <RailButton
          label="Auto-layout"
          shortcut="L"
          keyLabel="L"
          icon={Network}
          disabled={locked}
          reason={GRAPH_LOCK.reason}
          onClick={view.autoLayout}
        />
        <RailButton
          label="Fit view"
          shortcut="F"
          keyLabel="F"
          icon={Maximize}
          onClick={view.fitView}
        />
        <RailButton
          label="Zoom in"
          shortcut="+"
          keyLabel="+"
          icon={Plus}
          onClick={view.zoomIn}
        />
        <RailButton
          label="Zoom out"
          shortcut="-"
          keyLabel="−"
          icon={Minus}
          onClick={view.zoomOut}
        />
        <div
          role="separator"
          aria-orientation="horizontal"
          className="my-1 h-px w-8 bg-border"
        />
        <RailButton
          label="Undo"
          shortcut="Control+Z Meta+Z"
          keyLabel={`${mod}+Z`}
          icon={Undo2}
          disabled={!canUndo}
          onClick={undo}
        />
        <RailButton
          label="Redo"
          shortcut="Control+Shift+Z Meta+Shift+Z Control+Y"
          keyLabel={`${mod}+Shift+Z`}
          icon={Redo2}
          disabled={!canRedo}
          onClick={redo}
        />
        <div
          role="separator"
          aria-orientation="horizontal"
          className="my-1 h-px w-8 bg-border"
        />
        <RailButton
          label={GRAPH_LOCK.label}
          icon={locked ? Lock : LockOpen}
          active={locked}
          disabled={inLesson}
          reason={LESSON_LOCK}
          onClick={toggleLock}
        />
      </div>
    </TooltipProvider>
  )
}
