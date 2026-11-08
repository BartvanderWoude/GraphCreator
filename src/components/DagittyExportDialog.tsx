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

/**
 * Shows the dagitty text of the graph with Copy and Download buttons (spec 5.4). The caller
 * computes `text` (with `toDagitty`) and `filename` (`<slug>.dagitty.txt`) when opening it.
 */
export function DagittyExportDialog({
  open,
  onOpenChange,
  text,
  filename,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: string
  filename: string
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied dagitty code to the clipboard.')
    } catch {
      toast.error(
        'Could not copy to the clipboard. Select the text and copy it instead.',
      )
    }
  }

  function download() {
    try {
      downloadText(filename, text, 'text/plain')
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
          <DialogTitle>Export to dagitty</DialogTitle>
          <DialogDescription>
            Variable types, levels, descriptions, units and evidence are not
            included in dagitty files. Save as YAML to keep them.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="dagitty code"
          readOnly
          value={text}
          spellCheck={false}
          className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <DialogFooter showCloseButton>
          <Button variant="outline" onClick={() => void copy()}>
            Copy
          </Button>
          <Button onClick={download}>Download</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
