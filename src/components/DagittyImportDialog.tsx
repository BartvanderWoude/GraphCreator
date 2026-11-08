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
import { parseDagitty } from '@/model/dagitty'
import type { Graph } from '@/model/graph'
import type { Issue } from '@/model/result'

/**
 * Paste or load dagitty code and import it (spec 5.4). Errors are listed inside the dialog and
 * nothing changes; on success `onImport` gets the graph and its warnings, and the caller
 * confirms, replaces the graph and closes the dialog.
 */
export function DagittyImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (graph: Graph, warnings: Issue[]) => void
}) {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<Issue[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  async function loadFile(file: File) {
    try {
      setText(await file.text())
      setErrors([])
    } catch (e) {
      setErrors([
        { message: `Could not read ${file.name}: ${errorMessage(e)}` },
      ])
    }
  }

  function runImport() {
    let result
    try {
      result = parseDagitty(text)
    } catch (e) {
      setErrors([
        { message: `Something went wrong while importing: ${errorMessage(e)}` },
      ])
      return
    }
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    onImport(result.value, result.warnings)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from dagitty</DialogTitle>
          <DialogDescription>
            Paste dagitty code below or choose a file. Importing replaces the
            current graph.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="dagitty code"
          value={text}
          spellCheck={false}
          placeholder={'dag {\n  A -> B\n}'}
          className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
          onChange={(e) => {
            setText(e.target.value)
            setErrors([])
          }}
        />
        {errors.length > 0 && (
          <div role="alert" className="flex flex-col gap-1 text-destructive">
            <p className="font-medium">Could not import:</p>
            <IssueList issues={errors} />
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          aria-label="Choose dagitty file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void loadFile(file)
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            Choose file…
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={runImport} disabled={text.trim() === ''}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
