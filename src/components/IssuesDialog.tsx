import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Issue } from '@/model/result'
import { useGraphStore } from '@/store/graphStore'

/** An issue's text, prefixed with its line number when known and not already in the message. */
function issueText(issue: Issue): string {
  if (issue.line === undefined || /^Line \d+/.test(issue.message)) {
    return issue.message
  }
  return `Line ${issue.line}: ${issue.message}`
}

/** What clicking the issue does: select its node, else its edge, when that callback is given. */
function issueAction(
  issue: Issue,
  onSelectNode: ((nodeId: string) => void) | undefined,
  onSelectEdge: ((edgeId: string) => void) | undefined,
): (() => void) | undefined {
  const { nodeId, edgeId } = issue
  if (nodeId !== undefined && onSelectNode) return () => onSelectNode(nodeId)
  if (edgeId !== undefined && onSelectEdge) return () => onSelectEdge(edgeId)
  return undefined
}

/** The dialog's hint, naming what its clickable items select; undefined when none is. */
function linkHint(nodeLinks: boolean, edgeLinks: boolean): string | undefined {
  if (nodeLinks && edgeLinks) return 'Click an item to select its node or edge.'
  if (nodeLinks) return 'Click an item to select its node.'
  if (edgeLinks) return 'Click an item to select its edge.'
  return undefined
}

/**
 * A list of errors or warnings. Issues with a `nodeId` are buttons that call `onSelectNode`, and
 * issues with an `edgeId` are buttons that call `onSelectEdge`; without the callback they are
 * plain text. Used by IssuesDialog and OpenDialog.
 */
export function IssueList({
  issues,
  onSelectNode,
  onSelectEdge,
}: {
  issues: Issue[]
  onSelectNode?: (nodeId: string) => void
  onSelectEdge?: (edgeId: string) => void
}) {
  if (issues.length === 0) {
    return <p className="text-muted-foreground">No issues.</p>
  }
  return (
    <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
      {issues.map((issue, i) => {
        const onClick = issueAction(issue, onSelectNode, onSelectEdge)
        return (
          <li key={i}>
            {onClick ? (
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={onClick}
              >
                {issueText(issue)}
              </button>
            ) : (
              <p className="px-2 py-1">{issueText(issue)}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Lists errors (e.g. `Could not open <file>`) or warnings (spec 5.1, 5.4, 5.9). Clicking a
 * warning that belongs to a node or an edge selects it and closes the dialog.
 */
export function IssuesDialog({
  open,
  onOpenChange,
  title,
  issues,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  issues: Issue[]
}) {
  const select = useGraphStore((s) => s.select)
  const hint = linkHint(
    issues.some((issue) => issue.nodeId !== undefined),
    issues.some(
      (issue) => issue.nodeId === undefined && issue.edgeId !== undefined,
    ),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        {...(hint !== undefined ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {hint !== undefined && <DialogDescription>{hint}</DialogDescription>}
        </DialogHeader>
        <IssueList
          issues={issues}
          onSelectNode={(id) => {
            select({ kind: 'node', id })
            onOpenChange(false)
          }}
          onSelectEdge={(id) => {
            select({ kind: 'edge', id })
            onOpenChange(false)
          }}
        />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
