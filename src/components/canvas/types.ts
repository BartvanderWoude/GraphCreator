import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/react'
import type { Tone } from '@/lib/display'
import type { Form, Role } from '@/model/schema'
import { CircleNode } from './CircleNode'
import { CircleConnectionLine, FloatingEdge } from './FloatingEdge'

/** Data of a React Flow node of type `circle` (derived from a `GNode`, spec 8 redesign contracts). */
export type CircleNodeData = {
  /**
   * The name the circle shows: the trimmed draft while the node editor's Name field holds one
   * (`uiStore.namePreview`, spec 5.3), the stored name otherwise.
   */
  name: string
  role: Role
  /** The node has no variable type: shows the warning dot. */
  untyped: boolean
  /** The node is the source picked in connect mode: keeps the hover rim on. */
  connectSource: boolean
  /** In `uiStore.hoverNodeIds` (an Analysis item points at it): shows the hover rim (5.7.7). */
  highlighted?: boolean
  /** The current lesson step's pointer label for this node (5.7.12); undefined outside a lesson. */
  pointer?: string
  /** The node's functional form, for the form mark; only while Forms is on (spec 4.18). */
  form?: Form
  /** `TYPE_LETTERS[varType]`, for the type mark; only while Variable types is on (4.18). */
  typeLetter?: string
  /** The node is latent and Dashed latent is on: dashed outline. */
  dashed?: boolean
}

/** Data of a React Flow edge of type `floating`. */
export type FloatingEdgeData = {
  /** Number of evidence items; the evidence chip shows when it is above 0. */
  evidenceCount: number
  /** On an open causal or biasing path; only while `analysisOn.paths` and the paths are not truncated. */
  path?: 'causal' | 'biasing'
  /**
   * The edge's sign badge (spec 5.9), from `signBadge(edge.sign)`; undefined when it has no sign
   * or the Signs display option is off (4.18).
   */
  sign?: 'positive' | 'negative' | 'mixed'
  /** Line and arrowhead colour, `signTone(edge.sign)`; only while Sign colors is on (4.18). */
  tone?: Tone
  /** Line width in px, `edgeWidth(edge.strength)`; only while Strength is on (4.18). */
  width?: number
}

export type CircleFlowNode = Node<CircleNodeData, 'circle'>
export type FloatingFlowEdge = Edge<FloatingEdgeData, 'floating'>

/** Node types for `<ReactFlow nodeTypes>`; defined once, outside any component. */
export const nodeTypes = { circle: CircleNode } satisfies NodeTypes

/** Edge types for `<ReactFlow edgeTypes>`. */
export const edgeTypes = { floating: FloatingEdge } satisfies EdgeTypes

/** For `<ReactFlow connectionLineComponent>`. */
export { CircleConnectionLine }
