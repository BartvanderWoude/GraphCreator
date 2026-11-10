import { useEffect } from 'react'
import { AnalysisPanel } from '@/components/AnalysisPanel'
import { EdgeEditor } from '@/components/EdgeEditor'
import { NodeEditor } from '@/components/NodeEditor'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PANEL_HELP } from '@/lib/copy'
import { useGraphStore } from '@/store/graphStore'
import { useUiStore, type SidePanelTab } from '@/store/uiStore'

/**
 * Right-hand panel (spec 5.1, 5.8): the Edit and Analysis tabs. Edit shows the editor for the
 * single selected node or edge, else the cheat sheet (`PANEL_HELP`, spec 5.7.8).
 */
export function SidePanel() {
  const tab = useUiStore((s) => s.sidePanelTab)
  const setTab = useUiStore((s) => s.setSidePanelTab)

  // Selecting a node or edge (canvas, new node, double-click rename, IssuesDialog) shows Edit.
  // Clearing the selection leaves the tab as it is.
  useEffect(
    () =>
      useGraphStore.subscribe((state, prev) => {
        if (state.selection !== null && state.selection !== prev.selection) {
          useUiStore.getState().setSidePanelTab('edit')
        }
      }),
    [],
  )

  return (
    <aside
      aria-label="Side panel"
      className="w-80 shrink-0 overflow-y-auto border-l border-border bg-background p-4 text-sm text-foreground"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SidePanelTab)}
        className="gap-4"
      >
        <TabsList aria-label="Side panel view" className="w-full">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <EditView />
        </TabsContent>
        <TabsContent value="analysis">
          <AnalysisPanel />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

/** The Edit tab: the selected node's or edge's editor, or the cheat sheet. */
function EditView() {
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
  // An undo or redo remounts the editor, so its local fields show the restored values.
  const revision = useGraphStore((s) => s.revision)

  if (node) return <NodeEditor key={`${node.id}:${revision}`} node={node} />
  if (edge) return <EdgeEditor key={`${edge.id}:${revision}`} edge={edge} />
  return <PanelHelp />
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
