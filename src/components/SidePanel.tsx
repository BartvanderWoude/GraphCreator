import { EdgeEditor } from '@/components/EdgeEditor'
import { NodeEditor } from '@/components/NodeEditor'
import { useGraphStore } from '@/store/graphStore'

/** Right-hand panel (spec 5.1): editor for the single selected node or edge, else help text. */
export function SidePanel() {
  const node = useGraphStore((s) =>
    s.selection?.kind === 'node'
      ? s.graph.nodes.find((n) => n.id === s.selection?.id)
      : undefined,
  )
  const edge = useGraphStore((s) =>
    s.selection?.kind === 'edge'
      ? s.graph.edges.find((e) => e.id === s.selection?.id)
      : undefined,
  )

  return (
    <aside
      aria-label="Side panel"
      className="w-80 shrink-0 overflow-y-auto border-l p-4 text-sm"
    >
      {node ? (
        <NodeEditor key={node.id} node={node} />
      ) : edge ? (
        <EdgeEditor key={edge.id} edge={edge} />
      ) : (
        <div className="flex flex-col gap-2 text-muted-foreground">
          <p>Nothing selected.</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Double-click the canvas to add a node.</li>
            <li>
              Drag from a node&apos;s right edge to another node to connect
              them.
            </li>
            <li>Select a node or edge and press Delete to remove it.</li>
          </ul>
        </div>
      )}
    </aside>
  )
}
