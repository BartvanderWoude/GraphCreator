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

/**
 * A list of errors or warnings. Issues with a `nodeId` are buttons that call `onSelectNode`.
 * Used by IssuesDialog and OpenDialog.
 */
export function IssueList({
  issues,
  onSelectNode,
}: {
  issues: Issue[]
  onSelectNode?: (nodeId: string) => void
}) {
  if (issues.length === 0) {
    return <p className="text-muted-foreground">No issues.</p>
  }
  return (
    <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
      {issues.map((issue, i) => {
        const { nodeId } = issue
        return (
          <li key={i}>
            {nodeId !== undefined && onSelectNode ? (
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => onSelectNode(nodeId)}
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
 * Lists errors (e.g. `Could not open <file>`) or warnings (spec 5.1, 5.4). Clicking a warning
 * that belongs to a node selects that node and closes the dialog.
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
  const hasNodeLinks = issues.some((issue) => issue.nodeId !== undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        {...(hasNodeLinks ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {hasNodeLinks && (
            <DialogDescription>
              Click an item to select its node.
            </DialogDescription>
          )}
        </DialogHeader>
        <IssueList
          issues={issues}
          onSelectNode={(id) => {
            select({ kind: 'node', id })
            onOpenChange(false)
          }}
        />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
