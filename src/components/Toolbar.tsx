import { useMemo, useRef, useState } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'
import { ChevronDownIcon } from 'lucide-react'
import { toast } from 'sonner'
import { DagittyExportDialog } from '@/components/DagittyExportDialog'
import { DagittyImportDialog } from '@/components/DagittyImportDialog'
import { IssuesDialog } from '@/components/IssuesDialog'
import { Badge } from '@/components/ui/badge'
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
import { downloadText } from '@/lib/download'
import { toDagitty } from '@/model/dagitty'
import { emptyGraph, type Graph } from '@/model/graph'
import { NODE_HEIGHT, NODE_WIDTH } from '@/model/layout'
import type { Issue } from '@/model/result'
import { validateGraph } from '@/model/validate'
import { fileSlug, parseYaml, toYaml } from '@/model/yaml'
import { useGraphStore } from '@/store/graphStore'

/** What the IssuesDialog shows: the live warnings of the graph, or a fixed list. */
type IssuesView =
  { kind: 'warnings' } | { kind: 'fixed'; title: string; issues: Issue[] }

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * The toolbar (spec 5.1, 5.4): graph name, New, Open, Save, the dagitty menu, Add node,
 * Auto-layout and the warning badge, plus their dialogs. Must be rendered inside the
 * `<ReactFlowProvider>` that App provides.
 */
export function Toolbar() {
  const graph = useGraphStore((s) => s.graph)
  const replaceGraph = useGraphStore((s) => s.replaceGraph)
  const setGraphName = useGraphStore((s) => s.setGraphName)
  const addNodeAt = useGraphStore((s) => s.addNodeAt)
  const layout = useGraphStore((s) => s.layout)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const flowStore = useStoreApi()

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

  /** Fits the view once React Flow has rendered the store's new graph. */
  function fitAfterRender() {
    requestAnimationFrame(() => void fitView())
  }

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
    fitAfterRender()
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
      fitAfterRender()
      toastWarnings('Imported', importWarnings)
    })
  }

  function addNode() {
    const domNode = flowStore.getState().domNode
    const rect = domNode?.getBoundingClientRect()
    const centre = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const pos = screenToFlowPosition(centre)
    addNodeAt({
      x: Math.round(pos.x - NODE_WIDTH / 2),
      y: Math.round(pos.y - NODE_HEIGHT / 2),
    })
  }

  function autoLayout() {
    layout()
    fitAfterRender()
  }

  return (
    <header
      role="toolbar"
      aria-label="Toolbar"
      className="flex items-center gap-2 border-b px-3 py-2"
    >
      <Input
        aria-label="Graph name"
        placeholder="Untitled graph"
        className="w-56"
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
      <Button variant="ghost" onClick={newGraph}>
        New
      </Button>
      <Button variant="ghost" onClick={() => openInput.current?.click()}>
        Open
      </Button>
      <input
        ref={openInput}
        type="file"
        accept=".yaml,.yml"
        className="hidden"
        aria-label="Open file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openFile(file)
        }}
      />
      <Button variant="ghost" onClick={save}>
        Save
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost">
            dagitty
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            Import…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openExport}>Export…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" onClick={addNode}>
        Add node
      </Button>
      <Button variant="ghost" onClick={autoLayout}>
        Auto-layout
      </Button>
      {warnings.length > 0 && (
        <Badge
          asChild
          variant="secondary"
          className="ml-auto h-6 cursor-pointer"
        >
          <button
            type="button"
            aria-label={plural(warnings.length, 'warning')}
            title={plural(warnings.length, 'warning')}
            onClick={() => setIssuesView({ kind: 'warnings' })}
          >
            ⚠ {warnings.length}
          </button>
        </Badge>
      )}

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
            <Button variant="outline" onClick={() => setConfirm(null)}>
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
  )
}
