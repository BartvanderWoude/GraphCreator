import { EdgeEditor } from '@/components/EdgeEditor'
import { NodeEditor } from '@/components/NodeEditor'
import { PANEL_HELP } from '@/lib/copy'
import { useGraphStore } from '@/store/graphStore'

/**
 * Right-hand panel (spec 5.1): editor for the single selected node or edge, else the cheat
 * sheet (`PANEL_HELP`, spec 5.7.8).
 */
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
      className="w-80 shrink-0 overflow-y-auto border-l border-border bg-background p-4 text-sm text-foreground"
    >
      {node ? (
        <NodeEditor key={node.id} node={node} />
      ) : edge ? (
        <EdgeEditor key={edge.id} edge={edge} />
      ) : (
        <PanelHelp />
      )}
    </aside>
  )
}

/** Cheat sheet shown when nothing is selected. */
function PanelHelp() {
  return (
    <section aria-label="Help" className="flex flex-col gap-4">
      <h2 className="text-[15px] leading-[1.4] font-semibold">
        {PANEL_HELP.title}
      </h2>
      <dl className="flex flex-col gap-3">
        {PANEL_HELP.rows.map((row) => (
          <div key={row.action} className="flex flex-col gap-0.5">
            <dt className="font-medium">{row.action}</dt>
            <dd className="text-[13px] leading-[1.4] text-muted-foreground">
              {row.how}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
