import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { downloadText } from '@/lib/download'
import { EXPORT_FILES, type ExportFormat } from '@/model/fileFormat'

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
 * Shows the graph as GraphCreator YAML or dagitty text, with Copy and Download buttons (spec
 * 5.4, Save's "Save as…" menu). The caller computes `text` (`toYaml` or `toDagitty`) and
 * `filename` (`<slug>.dag.yaml` or `<slug>.dagitty.txt`) when opening it.
 */
export function CodeDialog({
  open,
  onOpenChange,
  format,
  text,
  filename,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  format: ExportFormat
  text: string
  filename: string
}) {
  const copy = COPY[format]

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      toast(`Copied ${copy.code} to the clipboard.`)
    } catch {
      toast.error(
        'Could not copy to the clipboard. Select the text and copy it instead.',
      )
    }
  }

  function download() {
    try {
      downloadText(filename, text, EXPORT_FILES[format].mime)
    } catch (e) {
      toast.error(
        `Could not download the file: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.note}</DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label={copy.code}
          readOnly
          value={text}
          spellCheck={false}
          className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <DialogFooter showCloseButton>
          <Button variant="outline" onClick={() => void copyText()}>
            Copy
          </Button>
          <Button onClick={download}>Download</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
