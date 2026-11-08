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
import type { GraphFormat } from '@/model/fileFormat'

const COPY: Record<
  GraphFormat,
  { title: string; code: string; note: string; mime: string }
> = {
  yaml: {
    title: 'Save as GraphCreator',
    code: 'GraphCreator code',
    note: 'The GraphCreator file keeps everything: roles, variable types, levels, descriptions, units, evidence and positions.',
    mime: 'application/yaml',
  },
  dagitty: {
    title: 'Save as dagitty',
    code: 'dagitty code',
    note: 'Variable types, levels, descriptions, units and evidence are not included in dagitty files. Save as GraphCreator to keep them.',
    mime: 'text/plain',
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
  format: GraphFormat
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
      downloadText(filename, text, copy.mime)
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
