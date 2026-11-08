import { useMemo, useRef, useState, type ReactElement } from 'react'
import {
  BookOpen,
  ChevronDown,
  Download,
  FilePlus,
  FolderOpen,
  Moon,
  Sun,
  TriangleAlert,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { DagittyExportDialog } from '@/components/DagittyExportDialog'
import { DagittyImportDialog } from '@/components/DagittyImportDialog'
import { IssuesDialog } from '@/components/IssuesDialog'
import { useCanvasActions } from '@/components/useToolShortcuts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { downloadText } from '@/lib/download'
import { toDagitty } from '@/model/dagitty'
import { emptyGraph, type Graph } from '@/model/graph'
import type { Issue } from '@/model/result'
import { validateGraph } from '@/model/validate'
import { fileSlug, parseYaml, toYaml } from '@/model/yaml'
import { useGraphStore } from '@/store/graphStore'
import { useLessonStore } from '@/store/lessonStore'
import { useUiStore } from '@/store/uiStore'

/** What the IssuesDialog shows: the live warnings of the graph, or a fixed list. */
type IssuesView =
  { kind: 'warnings' } | { kind: 'fixed'; title: string; issues: Issue[] }

const LESSON_LOCK = 'Not available during a lesson.'

const ICON = { className: 'size-4', strokeWidth: 1.75, 'aria-hidden': true }

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Two circles joined by an arrow, in teal. */
function Logo() {
  return (
    <svg
      role="img"
      aria-label="GraphCreator"
      viewBox="0 0 36 20"
      className="h-5 w-9 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="6" cy="10" r="5" />
      <circle cx="30" cy="10" r="5" />
      <path d="M11 10h11" strokeLinecap="round" />
      <path
        d="M21 6.5 25 10l-4 3.5z"
        fill="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Wraps a control that is disabled during a lesson. While `locked`, the control sits in a
 * focusable span that shows the tooltip "Not available during a lesson." (spec 5.4), because a
 * disabled button gets no pointer or focus events itself.
 */
function LessonLock({
  locked,
  focusable = true,
  children,
}: {
  locked: boolean
  /** False inside a menu, where the menu handles focus; the tooltip then opens to the right. */
  focusable?: boolean
  children: ReactElement
}) {
  if (!locked) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={focusable ? 0 : undefined}
          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={focusable ? 'bottom' : 'right'} sideOffset={6}>
        {LESSON_LOCK}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Switches between the light and dark theme (spec 5.1, 5.7.2). Light is the default; next-themes
 * keeps the choice in localStorage. The name stays "Dark mode" and `aria-pressed` gives the state.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-md"
          aria-label="Dark mode"
          aria-pressed={isDark}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun {...ICON} /> : <Moon {...ICON} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        Dark mode
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The top bar (spec 5.1, 5.4): logo, graph name, New, Open…, Save, the dagitty menu, the
 * warnings badge, Lessons and the Dark mode toggle, plus their dialogs and toasts. New, Open… and Import… are
 * disabled during a lesson. Must be rendered inside App's `<ReactFlowProvider>`.
 */
export function TopBar() {
  const graph = useGraphStore((s) => s.graph)
  const replaceGraph = useGraphStore((s) => s.replaceGraph)
  const setGraphName = useGraphStore((s) => s.setGraphName)
  const inLesson = useLessonStore((s) => s.active !== null)
  const openWelcome = useUiStore((s) => s.openWelcome)
  const view = useCanvasActions()

  const warnings = useMemo(() => validateGraph(graph).warnings, [graph])

  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const cancelNameEdit = useRef(false)
  const openInput = useRef<HTMLInputElement>(null)

  const [issuesView, setIssuesView] = useState<IssuesView | null>(null)
  const [confirm, setConfirm] = useState<{
    action: string
    onConfirm: () => void
  } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importKey, setImportKey] = useState(0)
  const [exportView, setExportView] = useState<{
    text: string
    filename: string
  } | null>(null)

  /** Runs `action` right away for an empty graph, otherwise after the New confirmation. */
  function confirmReplace(actionLabel: string, action: () => void) {
    if (useGraphStore.getState().graph.nodes.length === 0) action()
    else setConfirm({ action: actionLabel, onConfirm: action })
  }

  /** Toasts `<verb> with N warnings`; the toast's button opens them in the IssuesDialog. */
  function toastWarnings(verb: string, list: Issue[]) {
    if (list.length === 0) return
    toast(`${verb} with ${plural(list.length, 'warning')}`, {
      action: {
        label: 'Show',
        onClick: () =>
          setIssuesView({ kind: 'fixed', title: 'Warnings', issues: list }),
      },
    })
  }

  function commitName() {
    if (nameDraft !== null && !cancelNameEdit.current) setGraphName(nameDraft)
    cancelNameEdit.current = false
    setNameDraft(null)
  }

  function newGraph() {
    confirmReplace('New graph', () => replaceGraph(emptyGraph()))
  }

  async function openFile(file: File) {
    let result
    try {
      result = parseYaml(await file.text())
    } catch (e) {
      result = {
        ok: false as const,
        errors: [{ message: `Something went wrong: ${errorMessage(e)}` }],
      }
    }
    if (!result.ok) {
      setIssuesView({
        kind: 'fixed',
        title: `Could not open ${file.name}`,
        issues: result.errors,
      })
      return
    }
    replaceGraph(result.value)
    view.fitView()
    toastWarnings('Opened', result.warnings)
  }

  function save() {
    try {
      const g = useGraphStore.getState().graph
      downloadText(
        `${fileSlug(g.name)}.dag.yaml`,
        toYaml(g),
        'application/yaml',
      )
    } catch (e) {
      toast.error(`Could not save the graph: ${errorMessage(e)}`)
    }
  }

  function openExport() {
    try {
      const g = useGraphStore.getState().graph
      setExportView({
        text: toDagitty(g),
        filename: `${fileSlug(g.name)}.dagitty.txt`,
      })
    } catch (e) {
      toast.error(`Could not export the graph: ${errorMessage(e)}`)
    }
  }

  function importGraph(imported: Graph, importWarnings: Issue[]) {
    confirmReplace('Import', () => {
      replaceGraph(imported)
      setImportOpen(false)
      setImportKey((k) => k + 1)
      view.fitView()
      toastWarnings('Imported', importWarnings)
    })
  }

  return (
    <TooltipProvider delayDuration={300}>
      <header
        role="toolbar"
        aria-label="Toolbar"
        className="flex h-12 shrink-0 items-center gap-1 border-b bg-background px-3"
      >
        <Logo />
        <Input
          aria-label="Graph name"
          placeholder="Untitled graph"
          className="ml-2 w-56 rounded-md"
          value={nameDraft ?? graph.name ?? ''}
          onFocus={() => setNameDraft(graph.name ?? '')}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              cancelNameEdit.current = true
              e.currentTarget.blur()
            }
          }}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          className="mx-2 h-6 w-px bg-border"
        />
        <LessonLock locked={inLesson}>
          <Button
            variant="ghost"
            className="rounded-md"
            disabled={inLesson}
            onClick={newGraph}
          >
            <FilePlus {...ICON} />
            New
          </Button>
        </LessonLock>
        <LessonLock locked={inLesson}>
          <Button
            variant="ghost"
            className="rounded-md"
            disabled={inLesson}
            onClick={() => openInput.current?.click()}
          >
            <FolderOpen {...ICON} />
            Open…
          </Button>
        </LessonLock>
        <input
          ref={openInput}
          type="file"
          accept=".yaml,.yml"
          className="hidden"
          aria-label="Open file"
          disabled={inLesson}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void openFile(file)
          }}
        />
        <Button variant="ghost" className="rounded-md" onClick={save}>
          <Download {...ICON} />
          Save
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="rounded-md">
              dagitty
              <ChevronDown data-icon="inline-end" {...ICON} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <LessonLock locked={inLesson} focusable={false}>
              <DropdownMenuItem
                disabled={inLesson}
                onSelect={() => setImportOpen(true)}
              >
                Import…
              </DropdownMenuItem>
            </LessonLock>
            <DropdownMenuItem onSelect={openExport}>Export…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {warnings.length > 0 && (
            <button
              type="button"
              onClick={() => setIssuesView({ kind: 'warnings' })}
              className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-warning-border bg-warning-bg px-2 text-[13px] font-medium text-warning-fg transition-[filter] duration-120 outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <TriangleAlert {...ICON} />
              {plural(warnings.length, 'warning')}
            </button>
          )}
          <Button
            variant="ghost"
            className="rounded-md bg-accent text-accent-foreground hover:bg-[color-mix(in_oklch,var(--accent),var(--foreground)_6%)] hover:text-accent-foreground dark:hover:bg-[color-mix(in_oklch,var(--accent),var(--foreground)_10%)]"
            onClick={openWelcome}
          >
            <BookOpen {...ICON} />
            Lessons
          </Button>
          <ThemeToggle />
        </div>

        <IssuesDialog
          open={issuesView !== null}
          onOpenChange={(open) => {
            if (!open) setIssuesView(null)
          }}
          title={issuesView?.kind === 'fixed' ? issuesView.title : 'Warnings'}
          issues={issuesView?.kind === 'fixed' ? issuesView.issues : warnings}
        />
        <DagittyImportDialog
          key={importKey}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={importGraph}
        />
        <DagittyExportDialog
          open={exportView !== null}
          onOpenChange={(open) => {
            if (!open) setExportView(null)
          }}
          text={exportView?.text ?? ''}
          filename={exportView?.filename ?? ''}
        />
        <Dialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open) setConfirm(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a new graph?</DialogTitle>
              <DialogDescription>
                Unsaved changes to the current graph will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  confirm?.onConfirm()
                  setConfirm(null)
                }}
              >
                {confirm?.action ?? 'Continue'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>
    </TooltipProvider>
  )
}
