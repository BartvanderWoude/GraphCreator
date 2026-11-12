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
import type { Role } from '@/model/schema'
import { setLevels } from '@/model/simulation'
import { lessonEvent } from './lessonEvents'

/** Most graphs kept on `past` and on `future` (spec 4.10). */
export const HISTORY_LIMIT = 100

type Selection = { kind: 'node' | 'edge'; id: string } | null

/**
 * The app's single store (spec 4.6). Every action delegates to the pure model and replaces
 * `graph`. Each action that changes the graph records the previous one for undo (spec 4.10); an
 * action that leaves it as it was records nothing and keeps the same `graph` object.
 */
export interface GraphState {
  graph: Graph
  selection: Selection
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
  /** Moves any number of nodes as one undo step. */
  moveNodes(moves: { id: string; pos: Position }[]): void
  /** Adds the edge when `canAddEdge` allows it; returns the check either way. */
  connect(source: string, target: string): EdgeCheck
  /**
   * Replaces a node's levels; shares and sign-map keys follow them (spec 4.16, `setLevels` in
   * `simulation.ts`). `origin[i]` is the old index of new item `i`, or null for a new item. One
   * undo step.
   */
  setLevels(nodeId: string, levels: string[], origin: (number | null)[]): void
  updateEdge(
    edgeId: string,
    patch: Partial<Pick<GEdge, 'evidence' | 'note' | 'sign' | 'strength'>>,
  ): void
  /** Removes nodes (with their incident edges) and edges; clears the selection if it was removed. */
  removeSelection(nodeIds: string[], edgeIds: string[]): void
  select(selection: GraphState['selection']): void
  /** Selects the node and sets `focusNameOf`, so its name field is focused for renaming. */
  focusName(nodeId: string): void
  clearFocusName(): void
  /**
   * Replaces the whole graph and clears selection, `focusNameOf` and the undo history (New, Open,
   * autosave restore, lessons): none of these can be undone.
   */
  replaceGraph(graph: Graph): void
  /** Sets the graph title; a blank name clears it. */
  setGraphName(name: string): void
  /** `graph = autoLayout(graph)` */
  layout(): void
  /**
   * Makes `nodeIds` the adjusted set (spec 4.14, "Use this set"): each listed node whose role is
   * `other` or `adjusted` becomes `adjusted`; every other `adjusted` node becomes `other`.
   * Exposure, outcome, latent and selected nodes never change. One undo step.
   */
  setAdjustedSet(nodeIds: string[]): void
  /** Older graphs, most recent last; at most `HISTORY_LIMIT`. */
  past: Graph[]
  /** Graphs undone, most recent last; at most `HISTORY_LIMIT`. */
  future: Graph[]
  /** Starts at 0; +1 on every undo and redo, so editors re-read their fields. */
  revision: number
  /** Restores the last graph of `past`; no-op when it is empty. */
  undo(): void
  /** Restores the last graph of `future`; no-op when it is empty. */
  redo(): void
}

/** Structural equality of plain graph data; arrays item by item, absent keys equal `undefined`. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => sameData(x, b[i]))
    )
  }
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)])
  for (const k of keys) if (!sameData(ra[k], rb[k])) return false
  return true
}

/** `list` with `item` appended, dropping the oldest entries beyond `HISTORY_LIMIT`. */
function pushLimited(list: Graph[], item: Graph): Graph[] {
  const next = [...list, item]
  return next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next
}

function exists(graph: Graph, selection: Selection): boolean {
  if (selection === null) return true
  return selection.kind === 'node'
    ? graph.nodes.some((n) => n.id === selection.id)
    : graph.edges.some((e) => e.id === selection.id)
}

export const useGraphStore = create<GraphState>()((set, get) => {
  /**
   * The state update that makes `graph` current and records the previous graph for undo, or null
   * when `graph` equals the current one (then nothing may be set).
   */
  function record(
    graph: Graph,
  ): Pick<GraphState, 'graph' | 'past' | 'future'> | null {
    const { graph: before, past } = get()
    if (graph === before || sameData(graph, before)) return null
    return { graph, past: pushLimited(past, before), future: [] }
  }

  /** Commits `graph` with `record`; returns whether it changed anything. */
  function commit(graph: Graph): boolean {
    const update = record(graph)
    if (update) set(update)
    return update !== null
  }

  /** Moves the graph from the top of `from` into place, pushing the current one onto `to`. */
  function travel(from: 'past' | 'future') {
    const state = get()
    const source = state[from]
    if (source.length === 0) return
    const to = from === 'past' ? 'future' : 'past'
    const graph = source[source.length - 1]
    set({
      graph,
      [from]: source.slice(0, -1),
      [to]: pushLimited(state[to], state.graph),
      selection: exists(graph, state.selection) ? state.selection : null,
      focusNameOf: null,
      revision: state.revision + 1,
    })
  }

  return {
    graph: emptyGraph(),
    selection: null,
    focusNameOf: null,
    past: [],
    future: [],
    revision: 0,

    addNodeAt(pos) {
      const { graph, node } = addNode(get().graph, { pos })
      set({
        ...record(graph),
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
      // Renaming to the same name changes nothing; `value` is then the graph as it was.
      if (!commit(graph)) return { ...result, value: before }
      return { ...result, value: graph }
    },

    updateNode(nodeId, patch) {
      commit(updateNode(get().graph, nodeId, patch))
    },

    setLevels(nodeId, levels, origin) {
      commit(setLevels(get().graph, nodeId, levels, origin))
    },

    moveNode(nodeId, pos) {
      commit(moveNode(get().graph, nodeId, pos))
    },

    moveNodes(moves) {
      commit(moves.reduce((g, m) => moveNode(g, m.id, m.pos), get().graph))
    },

    connect(source, target) {
      const graph = get().graph
      const check = canAddEdge(graph, source, target)
      if (check.ok) {
        const result = addEdge(graph, source, target)
        if (result.ok) commit(result.value)
      }
      return check
    },

    updateEdge(edgeId, patch) {
      commit(updateEdge(get().graph, edgeId, patch))
    },

    removeSelection(nodeIds, edgeIds) {
      const { graph: before, selection } = get()
      const graph = removeEdges(removeNodes(before, nodeIds), edgeIds)
      const update = record(graph)
      if (!update) return
      set({ ...update, selection: exists(graph, selection) ? selection : null })
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
      set({ graph, selection: null, focusNameOf: null, past: [], future: [] })
    },

    setGraphName(name) {
      const { name: _old, ...rest } = get().graph
      void _old
      commit(name.trim() === '' ? rest : { ...rest, name })
    },

    layout() {
      commit(autoLayout(get().graph))
    },

    setAdjustedSet(nodeIds) {
      const wanted = new Set(nodeIds)
      const graph = get().graph
      let changed = false
      const nodes = graph.nodes.map((node) => {
        if (node.role !== 'other' && node.role !== 'adjusted') return node
        const role: Role = wanted.has(node.id) ? 'adjusted' : 'other'
        if (role === node.role) return node
        changed = true
        return { ...node, role }
      })
      if (changed) commit({ ...graph, nodes })
    },

    undo() {
      if (get().past.length === 0) return
      travel('past')
      lessonEvent({ kind: 'undo' })
    },

    redo() {
      travel('future')
    },
  }
})
