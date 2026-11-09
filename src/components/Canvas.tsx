import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type ColorMode,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type NodeMouseHandler,
  type OnDelete,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './canvas/canvas.css'
import { toast } from 'sonner'
import {
  CircleConnectionLine,
  edgeTypes,
  nodeTypes,
  type CircleFlowNode,
  type FloatingFlowEdge,
} from '@/components/canvas/types'
import { useAnalysis } from '@/components/useAnalysis'
import { cn } from '@/lib/utils'
import { canAddEdge, defaultNodeName, type Graph } from '@/model/graph'
import { nodeDiameter } from '@/model/nodeSize'
import { useGraphStore, type GraphState } from '@/store/graphStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiStore } from '@/store/uiStore'

type Selection = GraphState['selection']

/** Edge id → the kind of open path it lies on (spec 4.14 `FloatingEdgeData.path`). */
type PathMarks = ReadonlyMap<string, 'causal' | 'biasing'>

const NO_MARKS: PathMarks = new Map()

/** What the flow is derived from besides the graph and the selection. */
interface Overlay {
  connectFrom: string | null
  /** Edges to mark; empty while the Paths switch is off or the paths are truncated. */
  pathMarks: PathMarks
  /** Circles an Analysis item points at (`uiStore.hoverNodeIds`). */
  hoverNodeIds: string[]
}

/**
 * React Flow's view of the graph. It is rebuilt from the store's `graph` and `selection` (and the
 * overlay: connect-mode source, path marking, highlighted circles), but kept in local state so
 * React Flow can apply its own transient changes (in-drag positions, measured sizes,
 * multi-selection flags) between store commits.
 */
interface Flow {
  nodes: CircleFlowNode[]
  edges: FloatingFlowEdge[]
  /** The store values this flow was last synced from. */
  graph: Graph | null
  selection: Selection
  overlay: Overlay
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

/** Rebuilds the flow from the stores, keeping React Flow's transient state where it still applies. */
function syncFlow(
  prev: Flow,
  graph: Graph,
  selection: Selection,
  overlay: Overlay,
): Flow {
  const { connectFrom, pathMarks } = overlay
  const hovered = new Set(overlay.hoverNodeIds)
  const oldNodes = new Map(prev.nodes.map((n) => [n.id, n]))
  const oldEdges = new Map(prev.edges.map((e) => [e.id, e]))

  let nodes: CircleFlowNode[] = graph.nodes.map((g) => {
    const old = oldNodes.get(g.id)
    const position = old?.dragging ? old.position : g.pos
    const untyped = g.varType === undefined
    const connectSource = connectFrom === g.id
    const highlighted = hovered.has(g.id)
    if (
      old &&
      old.position.x === position.x &&
      old.position.y === position.y &&
      old.data.name === g.name &&
      old.data.role === g.role &&
      old.data.untyped === untyped &&
      old.data.connectSource === connectSource &&
      !!old.data.highlighted === highlighted
    ) {
      return old
    }
    const d = nodeDiameter(g.name)
    return {
      id: g.id,
      type: 'circle',
      position,
      width: d,
      height: d,
      data: { name: g.name, role: g.role, untyped, connectSource, highlighted },
      // A renamed circle changes size; React Flow measures it again.
      measured: old && old.width === d ? old.measured : undefined,
      dragging: old?.dragging,
      selected: old?.selected ?? false,
    }
  })
  let edges: FloatingFlowEdge[] = graph.edges.map((g) => {
    const old = oldEdges.get(g.id)
    const evidenceCount = g.evidence.length
    const path = pathMarks.get(g.id)
    if (
      old &&
      old.source === g.source &&
      old.target === g.target &&
      old.data?.evidenceCount === evidenceCount &&
      old.data?.path === path
    ) {
      return old
    }
    return {
      id: g.id,
      type: 'floating',
      source: g.source,
      target: g.target,
      data: path ? { evidenceCount, path } : { evidenceCount },
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
  return { nodes, edges, graph, selection, overlay }
}

function hasNodes(graph: Graph, ...ids: string[]): boolean {
  return ids.every((id) => graph.nodes.some((n) => n.id === id))
}

/** Calls the store's `connect` and toasts the reason when the edge is not allowed. */
function connectOrExplain(source: string, target: string) {
  const check = useGraphStore.getState().connect(source, target)
  if (!check.ok) toast(check.message)
}

/** The React Flow canvas (spec 5.2). Must be rendered inside a `<ReactFlowProvider>`. */
export function Canvas() {
  const graph = useGraphStore((s) => s.graph)
  const selection = useGraphStore((s) => s.selection)
  const tool = useUiStore((s) => s.tool)
  const connectFrom = useUiStore((s) => s.connectFrom)
  const pathsOn = useUiStore((s) => s.analysisOn.paths)
  const hoverNodeIds = useUiStore((s) => s.hoverNodeIds)
  const paths = useAnalysis().paths
  // Open paths are marked only while the Paths switch is on and they are not truncated (4.14).
  const pathMarks = useMemo<PathMarks>(() => {
    if (!pathsOn || !paths || paths.truncated) return NO_MARKS
    const marks = new Map<string, 'causal' | 'biasing'>()
    for (const id of paths.causalEdges) marks.set(id, 'causal')
    for (const id of paths.biasingEdges) marks.set(id, 'biasing')
    return marks
  }, [pathsOn, paths])
  const overlay = useMemo<Overlay>(
    () => ({ connectFrom, pathMarks, hoverNodeIds }),
    [connectFrom, pathMarks, hoverNodeIds],
  )
  // React Flow's colour mode follows the theme (spec 7, "Dark theme mechanism").
  const colorMode: ColorMode = useThemeStore((s) => s.theme)
  const { screenToFlowPosition } = useReactFlow()
  const [flow, setFlow] = useState<Flow>(() =>
    syncFlow(
      {
        nodes: [],
        edges: [],
        graph: null,
        selection: null,
        overlay,
      },
      graph,
      selection,
      overlay,
    ),
  )
  // Re-derive during render when a store changed (React's "adjust state on prop change" pattern).
  if (
    flow.graph !== graph ||
    flow.selection !== selection ||
    flow.overlay !== overlay
  ) {
    setFlow(syncFlow(flow, graph, selection, overlay))
  }

  const onNodesChange = useCallback((changes: NodeChange<CircleFlowNode>[]) => {
    // Removals go through onDelete → store; the next sync drops the nodes.
    const local = changes.filter((c) => c.type !== 'remove')
    setFlow((f) => ({ ...f, nodes: applyNodeChanges(local, f.nodes) }))
  }, [])

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FloatingFlowEdge>[]) => {
      const local = changes.filter((c) => c.type !== 'remove')
      setFlow((f) => ({ ...f, edges: applyEdgeChanges(local, f.edges) }))
    },
    [],
  )

  const onSelectionChange: OnSelectionChangeFunc<
    CircleFlowNode,
    FloatingFlowEdge
  > = useCallback(({ nodes, edges }) => {
    const next = impliedSelection(nodes, edges)
    const { selection: current, select } = useGraphStore.getState()
    if (!sameSelection(next, current)) select(next)
  }, [])

  const onNodeDragStop: OnNodeDrag<CircleFlowNode> = useCallback(
    (_event, _node, dragged) => {
      // One store commit for all dragged nodes, so a multi-node drag is one undo step.
      useGraphStore
        .getState()
        .moveNodes(dragged.map((n) => ({ id: n.id, pos: n.position })))
    },
    [],
  )

  const onDelete: OnDelete<CircleFlowNode, FloatingFlowEdge> = useCallback(
    ({ nodes, edges }) => {
      useGraphStore.getState().removeSelection(
        nodes.map((n) => n.id),
        edges.map((e) => e.id),
      )
    },
    [],
  )

  const isValidConnection = useCallback((c: Connection | FloatingFlowEdge) => {
    const { graph } = useGraphStore.getState()
    if (!c.source || !c.target || !hasNodes(graph, c.source, c.target)) {
      return false
    }
    return canAddEdge(graph, c.source, c.target).ok
  }, [])

  const onConnect = useCallback((c: Connection) => {
    connectOrExplain(c.source, c.target)
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

  /** Adds a node centred on the given screen point (spec 5.2 "Add node"). */
  const addNodeAtPointer = useCallback(
    (event: ReactMouseEvent) => {
      const p = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const { graph, addNodeAt } = useGraphStore.getState()
      const half = nodeDiameter(defaultNodeName(graph)) / 2
      addNodeAt({ x: Math.round(p.x - half), y: Math.round(p.y - half) })
    },
    [screenToFlowPosition],
  )

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      if (!target.classList.contains('react-flow__pane')) return
      addNodeAtPointer(event)
    },
    [addNodeAtPointer],
  )

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      const ui = useUiStore.getState()
      if (ui.tool === 'add') {
        addNodeAtPointer(event)
        ui.setTool('select')
      } else if (ui.tool === 'connect') {
        ui.pickConnectSource(null)
      }
    },
    [addNodeAtPointer],
  )

  const onNodeClick: NodeMouseHandler<CircleFlowNode> = useCallback(
    (_event, node) => {
      const ui = useUiStore.getState()
      if (ui.tool !== 'connect') return
      const source = ui.connectFrom
      if (source === null) {
        ui.pickConnectSource(node.id)
        return
      }
      // A second click on the picked circle puts it down again.
      ui.pickConnectSource(null)
      if (source !== node.id) connectOrExplain(source, node.id)
    },
    [],
  )

  /** Double-clicking a circle opens its name for renaming (spec 5.2). */
  const onNodeDoubleClick: NodeMouseHandler<CircleFlowNode> = useCallback(
    (_event, node) => {
      if (useUiStore.getState().tool !== 'select') return
      useGraphStore.getState().focusName(node.id)
    },
    [],
  )

  return (
    <div
      className={cn(
        'h-full min-h-0 w-full min-w-0 flex-1',
        tool === 'add' && 'gc-tool-add',
        tool === 'connect' && 'gc-tool-connect',
      )}
    >
      <ReactFlow<CircleFlowNode, FloatingFlowEdge>
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={CircleConnectionLine}
        colorMode={colorMode}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={onNodeDragStop}
        onDelete={onDelete}
        isValidConnection={isValidConnection}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onDoubleClick={onDoubleClick}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        connectOnClick={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
