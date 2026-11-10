import { useRef, useState } from 'react'
import { IssueList } from '@/components/IssuesDialog'
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
import { parseGraphText } from '@/model/fileFormat'
import type { Graph } from '@/model/graph'
import type { Issue } from '@/model/result'

/**
 * Opens a graph from pasted text or a file, in GraphCreator YAML, dagitty, GML, DOT or networkx
 * JSON; the format is recognised with `detectFormat` (spec 4.15, 5.4). Errors are listed inside the dialog and nothing
 * changes; on success `onOpen` gets the graph and its warnings, and the caller confirms,
 * replaces the graph and closes the dialog.
 */
export function OpenDialog({
  open,
  onOpenChange,
  onOpen,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (graph: Graph, warnings: Issue[]) => void
}) {
  const [text, setText] = useState('')
  const [failure, setFailure] = useState<{
    heading: string
    errors: Issue[]
  } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /** Parses `source` and hands the graph to `onOpen`, or shows the errors under `heading`. */
  function run(source: string, heading: string, fileName?: string) {
    let result
    try {
      result = parseGraphText(source, fileName)
    } catch (e) {
      result = {
        ok: false as const,
        errors: [{ message: `Something went wrong: ${errorMessage(e)}` }],
      }
    }
    if (!result.ok) {
      setFailure({ heading, errors: result.errors })
      return
    }
    setFailure(null)
    onOpen(result.value, result.warnings)
  }

  async function openFile(file: File) {
    let source
    try {
      source = await file.text()
    } catch (e) {
      setFailure({
        heading: `Could not open ${file.name}:`,
        errors: [
          { message: `Could not read ${file.name}: ${errorMessage(e)}` },
        ],
      })
      return
    }
    run(source, `Could not open ${file.name}:`, file.name)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Open a graph</DialogTitle>
          <DialogDescription>
            Paste GraphCreator, dagitty, GML, DOT or networkx JSON code, or open
            a file. Opening replaces the current graph.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Graph code"
          value={text}
          spellCheck={false}
          placeholder={'dag {\n  Smoking -> "Birth weight"\n}'}
          className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
          onChange={(e) => {
            setText(e.target.value)
            setFailure(null)
          }}
        />
        {failure && (
          <div role="alert" className="flex flex-col gap-1 text-destructive">
            <p className="font-medium">{failure.heading}</p>
            <IssueList issues={failure.errors} />
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          aria-label="Choose a graph file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void openFile(file)
          }}
        />
        <DialogFooter>
          <Button
            variant="outline"
            className="sm:mr-auto"
            onClick={() => fileInput.current?.click()}
          >
            Open file…
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => run(text, 'Could not open:')}
            disabled={text.trim() === ''}
          >
            Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
