import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { downloadText } from '@/lib/download'
import {
  EXPORT_FILES,
  exportFileName,
  exportText,
  type ExportFormat,
} from '@/model/fileFormat'
import type { Graph } from '@/model/graph'
import { useGraphStore } from '@/store/graphStore'
import { useUiStore } from '@/store/uiStore'

/** Each format's dialog texts (spec 5.4); file names and MIME types are in `EXPORT_FILES`. */
const COPY: Record<
  ExportFormat,
  { title: string; code: string; note: string; detailsNote?: string }
> = {
  yaml: {
    title: 'Save as GraphCreator',
    code: 'GraphCreator code',
    note: 'The GraphCreator file keeps everything: roles, variable types, levels, descriptions, units, evidence and positions.',
  },
  dagitty: {
    title: 'Save as dagitty',
    code: 'dagitty code',
    note: 'Variable types, levels, descriptions, units and evidence are not included in dagitty files. Save as GraphCreator to keep them.',
    detailsNote:
      'Variable types, levels, descriptions, units and evidence are added as gc.* attributes. dagitty keeps them but does not use them.',
  },
  gml: {
    title: 'Save as GML',
    code: 'GML code',
    note: 'The GML file keeps roles, variable types, levels, descriptions, units, evidence and positions. Node labels are names safe for R and Python, such as Maternal_smoking; DoWhy and networkx use them as variable names.',
  },
  dot: {
    title: 'Save as DOT',
    code: 'DOT code',
    note: 'The DOT file keeps roles, variable types, levels, descriptions, units, evidence and positions as attributes, and the role colors for Graphviz. Node ids are names safe for R and Python, such as Maternal_smoking.',
  },
  networkx: {
    title: 'Save as networkx JSON',
    code: 'networkx JSON code',
    note: 'The networkx JSON keeps everything. Read it in Python with networkx.node_link_graph(data, edges="edges"). Node ids are names safe for R and Python, such as Maternal_smoking.',
  },
  bnlearn: {
    title: 'Save as bnlearn',
    code: 'bnlearn code',
    note: 'The bnlearn model string keeps the structure only: no roles, types or positions. Read it in R with bnlearn::model2network().',
  },
  tetrad: {
    title: 'Save as Tetrad',
    code: 'Tetrad code',
    note: 'The Tetrad text keeps the structure only: roles (latent included), types and positions are not included.',
  },
  mermaid: {
    title: 'Save as Mermaid',
    code: 'Mermaid code',
    note: 'Mermaid code draws the graph with its role colors in Markdown, GitHub and Notion. Mermaid lays the graph out itself, so positions are not kept, and types and evidence are not included.',
  },
}

/**
 * Shows the graph as text in one of the `ExportFormat`s, with Copy and Download buttons (spec
 * 5.4, Save and its "Save as…" menu). The text and file name are computed from the store's graph
 * when the dialog opens. Save as dagitty adds the "Include GraphCreator details" checkbox, whose
 * choice is kept in `uiStore.dagittyDetails`.
 */
export function CodeDialog({
  open,
  onOpenChange,
  format,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  format: ExportFormat
}) {
  const details = useUiStore((s) => s.dagittyDetails)
  const setDetails = useUiStore((s) => s.setDagittyDetails)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [wasOpen, setWasOpen] = useState(false)

  // Read the graph each time the dialog opens, not on every change while it is open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setGraph(useGraphStore.getState().graph)
  }

  const copy = COPY[format]
  const label = EXPORT_FILES[format].label
  const withDetails = format === 'dagitty' && details
  const output = useMemo(() => {
    if (!graph) return { text: '', filename: '', error: null }
    try {
      return {
        text: exportText(graph, format, { details: withDetails }),
        filename: exportFileName(graph.name, format),
        error: null,
      }
    } catch (e) {
      return { text: '', filename: '', error: errorMessage(e) }
    }
  }, [graph, format, withDetails])
  const failed = output.error !== null

  async function copyText() {
    try {
      await navigator.clipboard.writeText(output.text)
      toast(`Copied ${label} code to the clipboard.`)
    } catch {
      toast.error(
        'Could not copy to the clipboard. Select the text and copy it instead.',
      )
    }
  }

  function download() {
    try {
      downloadText(output.filename, output.text, EXPORT_FILES[format].mime)
    } catch (e) {
      toast.error(`Could not download the file: ${errorMessage(e)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {withDetails && copy.detailsNote ? copy.detailsNote : copy.note}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label={copy.code}
          readOnly
          value={output.text}
          spellCheck={false}
          className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        {format === 'dagitty' && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="dagitty-details"
              checked={details}
              onCheckedChange={(checked) => setDetails(checked === true)}
            />
            <Label htmlFor="dagitty-details">
              Include GraphCreator details
            </Label>
          </div>
        )}
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            Could not export the graph: {output.error}
          </p>
        )}
        <DialogFooter showCloseButton>
          <Button
            variant="outline"
            disabled={failed}
            onClick={() => void copyText()}
          >
            Copy
          </Button>
          <Button disabled={failed} onClick={download}>
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
