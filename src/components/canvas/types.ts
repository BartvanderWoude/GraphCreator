import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/react'
import type { Role } from '@/model/schema'
import { CircleNode } from './CircleNode'
import { CircleConnectionLine, FloatingEdge } from './FloatingEdge'

/** Data of a React Flow node of type `circle` (derived from a `GNode`, spec 8 redesign contracts). */
export type CircleNodeData = {
  name: string
  role: Role
  /** The node has no variable type: shows the warning dot. */
  untyped: boolean
  /** The node is the source picked in connect mode: keeps the hover rim on. */
  connectSource: boolean
}

/** Data of a React Flow edge of type `floating`. */
export type FloatingEdgeData = {
  /** Number of evidence items; the evidence chip shows when it is above 0. */
  evidenceCount: number
}

export type CircleFlowNode = Node<CircleNodeData, 'circle'>
export type FloatingFlowEdge = Edge<FloatingEdgeData, 'floating'>

/** Node types for `<ReactFlow nodeTypes>`; defined once, outside any component. */
export const nodeTypes = { circle: CircleNode } satisfies NodeTypes

/** Edge types for `<ReactFlow edgeTypes>`. */
export const edgeTypes = { floating: FloatingEdge } satisfies EdgeTypes

/** For `<ReactFlow connectionLineComponent>`. */
export { CircleConnectionLine }
