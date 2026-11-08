import { create } from 'zustand'
import {
  addEdge,
  addNode,
  canAddEdge,
  emptyGraph,
  moveNode,
  removeEdges,
  removeNodes,
  renameNode,
  updateEdge,
  updateNode,
  type EdgeCheck,
  type GEdge,
  type GNode,
  type Graph,
  type Position,
} from '@/model/graph'
import { autoLayout } from '@/model/layout'
import { nodeDiameter } from '@/model/nodeSize'
import type { Result } from '@/model/result'

/** The app's single store (spec 4.6). Every action delegates to the pure model and replaces `graph`. */
export interface GraphState {
  graph: Graph
  selection: { kind: 'node' | 'edge'; id: string } | null
  /** Node whose name field should be focused next. */
  focusNameOf: string | null
  /** Adds a node with `defaultNodeName`, selects it and sets `focusNameOf`; returns its id. */
  addNodeAt(pos: Position): string
  /**
   * Applies the rename on success and returns the model result. The circle keeps its centre: `pos`
   * shifts by half the change in `nodeDiameter`, so `result.value` is the graph as stored.
   */
  renameNode(nodeId: string, name: string): Result<Graph>
  updateNode(nodeId: string, patch: Partial<Omit<GNode, 'id' | 'name'>>): void
  moveNode(nodeId: string, pos: Position): void
  /** Adds the edge when `canAddEdge` allows it; returns the check either way. */
  connect(source: string, target: string): EdgeCheck
  updateEdge(
    edgeId: string,
    patch: Partial<Pick<GEdge, 'evidence' | 'note'>>,
  ): void
  /** Removes nodes (with their incident edges) and edges; clears the selection if it was removed. */
  removeSelection(nodeIds: string[], edgeIds: string[]): void
  select(selection: GraphState['selection']): void
  /** Selects the node and sets `focusNameOf`, so its name field is focused for renaming. */
  focusName(nodeId: string): void
  clearFocusName(): void
  /** Replaces the whole graph and clears selection and `focusNameOf`. */
  replaceGraph(graph: Graph): void
  /** Sets the graph title; a blank name clears it. */
  setGraphName(name: string): void
  /** `graph = autoLayout(graph)` */
  layout(): void
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  graph: emptyGraph(),
  selection: null,
  focusNameOf: null,

  addNodeAt(pos) {
    const { graph, node } = addNode(get().graph, { pos })
    set({
      graph,
      selection: { kind: 'node', id: node.id },
      focusNameOf: node.id,
    })
    return node.id
  },

  renameNode(nodeId, name) {
    const before = get().graph
    const result = renameNode(before, nodeId, name)
    if (!result.ok) return result
    const oldNode = before.nodes.find((n) => n.id === nodeId)
    let graph = result.value
    if (oldNode) {
      const shift = Math.round(
        (nodeDiameter(oldNode.name) - nodeDiameter(name)) / 2,
      )
      if (shift !== 0) {
        graph = moveNode(graph, nodeId, {
          x: oldNode.pos.x + shift,
          y: oldNode.pos.y + shift,
        })
      }
    }
    set({ graph })
    return { ...result, value: graph }
  },

  updateNode(nodeId, patch) {
    set({ graph: updateNode(get().graph, nodeId, patch) })
  },

  moveNode(nodeId, pos) {
    set({ graph: moveNode(get().graph, nodeId, pos) })
  },

  connect(source, target) {
    const graph = get().graph
    const check = canAddEdge(graph, source, target)
    if (check.ok) {
      const result = addEdge(graph, source, target)
      if (result.ok) set({ graph: result.value })
    }
    return check
  },

  updateEdge(edgeId, patch) {
    set({ graph: updateEdge(get().graph, edgeId, patch) })
  },

  removeSelection(nodeIds, edgeIds) {
    const { graph: before, selection } = get()
    const graph = removeEdges(removeNodes(before, nodeIds), edgeIds)
    const stillThere =
      selection === null ||
      (selection.kind === 'node'
        ? graph.nodes.some((n) => n.id === selection.id)
        : graph.edges.some((e) => e.id === selection.id))
    set({ graph, selection: stillThere ? selection : null })
  },

  select(selection) {
    set({ selection })
  },

  focusName(nodeId) {
    set({ selection: { kind: 'node', id: nodeId }, focusNameOf: nodeId })
  },

  clearFocusName() {
    set({ focusNameOf: null })
  },

  replaceGraph(graph) {
    set({ graph, selection: null, focusNameOf: null })
  },

  setGraphName(name) {
    const { name: _old, ...rest } = get().graph
    void _old
    set({ graph: name.trim() === '' ? rest : { ...rest, name } })
  },

  layout() {
    set({ graph: autoLayout(get().graph) })
  },
}))
