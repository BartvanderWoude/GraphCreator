import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type OnDelete,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'
import { DagNode, type DagFlowNode } from '@/components/DagNode'
import { canAddEdge, type Graph } from '@/model/graph'
import { NODE_HEIGHT, NODE_WIDTH } from '@/model/layout'
import { useGraphStore, type GraphState } from '@/store/graphStore'

const nodeTypes = { dag: DagNode }

const EDGE_COLOUR = '#737373'
const EDGE_SELECTED_COLOUR = '#2563eb'

type Selection = GraphState['selection']

/**
 * React Flow's view of the graph. It is rebuilt from the store's `graph` and `selection`, but kept
 * in local state so React Flow can apply its own transient changes (in-drag positions, measured
 * sizes, multi-selection flags) between store commits.
 */
interface Flow {
  nodes: DagFlowNode[]
  edges: Edge[]
  /** The store values this flow was last synced from. */
  graph: Graph | null
  selection: Selection
}

function sameSelection(a: Selection, b: Selection): boolean {
  return (
    a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id)
  )
}

/** The store selection implied by React Flow's flags: the one selected item, or null. */
function impliedSelection(
  nodes: { id: string; selected?: boolean }[],
  edges: { id: string; selected?: boolean }[],
): Selection {
  const n = nodes.filter((x) => x.selected)
  const e = edges.filter((x) => x.selected)
  if (n.length + e.length !== 1) return null
  return n.length === 1
    ? { kind: 'node', id: n[0].id }
    : { kind: 'edge', id: e[0].id }
}

/** Rebuilds the flow from the store, keeping React Flow's transient state where it still applies. */
function syncFlow(prev: Flow, graph: Graph, selection: Selection): Flow {
  const oldNodes = new Map(prev.nodes.map((n) => [n.id, n]))
  const oldEdges = new Map(prev.edges.map((e) => [e.id, e]))

  let nodes: DagFlowNode[] = graph.nodes.map((g) => {
    const old = oldNodes.get(g.id)
    const position = old?.dragging ? old.position : g.pos
    const untyped = g.varType === undefined
    if (
      old &&
      old.position.x === position.x &&
      old.position.y === position.y &&
      old.data.name === g.name &&
      old.data.role === g.role &&
      old.data.untyped === untyped
    ) {
      return old
    }
    return {
      id: g.id,
      type: 'dag',
      position,
      data: { name: g.name, role: g.role, untyped },
      measured: old?.measured,
      dragging: old?.dragging,
      selected: old?.selected ?? false,
    }
  })
  let edges: Edge[] = graph.edges.map((g) => {
    const old = oldEdges.get(g.id)
    if (old && old.source === g.source && old.target === g.target) return old
    return {
      id: g.id,
      source: g.source,
      target: g.target,
      selected: old?.selected ?? false,
    }
  })

  // The store's selection changed from elsewhere (e.g. a new node, or IssuesDialog): mirror it.
  if (!sameSelection(impliedSelection(nodes, edges), selection)) {
    const isSel = (kind: 'node' | 'edge', id: string) =>
      selection?.kind === kind && selection.id === id
    nodes = nodes.map((n) =>
      !!n.selected === isSel('node', n.id)
        ? n
        : { ...n, selected: isSel('node', n.id) },
    )
    edges = edges.map((e) =>
      !!e.selected === isSel('edge', e.id)
        ? e
        : { ...e, selected: isSel('edge', e.id) },
    )
  }
  return { nodes, edges, graph, selection }
}

function hasNodes(graph: Graph, ...ids: string[]): boolean {
  return ids.every((id) => graph.nodes.some((n) => n.id === id))
}

/** The React Flow canvas (spec 5.2). Must be rendered inside a `<ReactFlowProvider>`. */
export function Canvas() {
  const graph = useGraphStore((s) => s.graph)
  const selection = useGraphStore((s) => s.selection)
  const { screenToFlowPosition } = useReactFlow()
  const [flow, setFlow] = useState<Flow>(() =>
    syncFlow(
      { nodes: [], edges: [], graph: null, selection: null },
      graph,
      selection,
    ),
  )
  // Re-derive during render when the store changed (React's "adjust state on prop change" pattern).
  if (flow.graph !== graph || flow.selection !== selection) {
    setFlow(syncFlow(flow, graph, selection))
  }

  const onNodesChange = useCallback((changes: NodeChange<DagFlowNode>[]) => {
    // Removals go through onDelete → store; the next sync drops the nodes.
    const local = changes.filter((c) => c.type !== 'remove')
    setFlow((f) => ({ ...f, nodes: applyNodeChanges(local, f.nodes) }))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const local = changes.filter((c) => c.type !== 'remove')
    setFlow((f) => ({ ...f, edges: applyEdgeChanges(local, f.edges) }))
  }, [])

  const onSelectionChange: OnSelectionChangeFunc<DagFlowNode> = useCallback(
    ({ nodes, edges }) => {
      const next = impliedSelection(nodes, edges)
      const { selection: current, select } = useGraphStore.getState()
      if (!sameSelection(next, current)) select(next)
    },
    [],
  )

  const onNodeDragStop: OnNodeDrag<DagFlowNode> = useCallback(
    (_event, _node, dragged) => {
      const { moveNode } = useGraphStore.getState()
      for (const n of dragged) moveNode(n.id, n.position)
    },
    [],
  )

  const onDelete: OnDelete<DagFlowNode> = useCallback(({ nodes, edges }) => {
    useGraphStore.getState().removeSelection(
      nodes.map((n) => n.id),
      edges.map((e) => e.id),
    )
  }, [])

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const { graph } = useGraphStore.getState()
    if (!c.source || !c.target || !hasNodes(graph, c.source, c.target)) {
      return false
    }
    return canAddEdge(graph, c.source, c.target).ok
  }, [])

  const onConnect = useCallback((c: Connection) => {
    const check = useGraphStore.getState().connect(c.source, c.target)
    if (!check.ok) toast(check.message)
  }, [])

  const onConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid !== false) return
      if (!state.fromNode || !state.toNode || !state.fromHandle) return
      const [source, target] =
        state.fromHandle.type === 'source'
          ? [state.fromNode.id, state.toNode.id]
          : [state.toNode.id, state.fromNode.id]
      const { graph } = useGraphStore.getState()
      if (!hasNodes(graph, source, target)) return
      const check = canAddEdge(graph, source, target)
      if (!check.ok) toast(check.message)
    },
    [],
  )

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      if (!target.classList.contains('react-flow__pane')) return
      const p = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      useGraphStore.getState().addNodeAt({
        x: Math.round(p.x - NODE_WIDTH / 2),
        y: Math.round(p.y - NODE_HEIGHT / 2),
      })
    },
    [screenToFlowPosition],
  )

  const edges = useMemo(
    () =>
      flow.edges.map((e) => {
        const color = e.selected ? EDGE_SELECTED_COLOUR : EDGE_COLOUR
        return {
          ...e,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 18,
            height: 18,
          },
        }
      }),
    [flow.edges],
  )

  return (
    <div className="h-full min-h-0 w-full min-w-0 flex-1">
      <ReactFlow<DagFlowNode>
        nodes={flow.nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={onNodeDragStop}
        onDelete={onDelete}
        isValidConnection={isValidConnection}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onDoubleClick={onDoubleClick}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
