import {
  CirclePlus,
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
import { useGraphStore } from '@/store/graphStore'
import { useUiStore } from '@/store/uiStore'

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
 * tooltip "Name  Key". `active` is only passed for tools; the active tool is solid teal.
 * `disabled` greys the button out (Undo and Redo with nothing to undo or redo).
 */
function RailButton({
  label,
  shortcut,
  keyLabel,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  /** The `aria-keyshortcuts` value. */
  shortcut: string
  /** The key as shown in the tooltip. */
  keyLabel: string
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-keyshortcuts={shortcut}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-md text-foreground transition-colors duration-120 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
            active &&
              'bg-primary text-primary-foreground hover:bg-primary-hover',
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <span>{label}</span>
        <kbd
          data-slot="kbd"
          className="ml-2 rounded-sm bg-background/15 px-1.5 font-mono text-[11px] leading-5"
        >
          {keyLabel}
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The vertical tool rail left of the canvas (spec 5.1, 5.2): Select, Add node and Connect, then
 * Auto-layout, Fit view, Zoom in and Zoom out, then Undo and Redo. Must be rendered inside App's
 * `<ReactFlowProvider>`.
 */
export function ToolRail() {
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const view = useCanvasActions()
  const canUndo = useGraphStore((s) => s.past.length > 0)
  const canRedo = useGraphStore((s) => s.future.length > 0)
  const undo = useGraphStore((s) => s.undo)
  const redo = useGraphStore((s) => s.redo)
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
          onClick={addNode}
        />
        <RailButton
          label="Connect"
          shortcut="C"
          keyLabel="C"
          icon={Spline}
          active={tool === 'connect'}
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
      </div>
    </TooltipProvider>
  )
}
