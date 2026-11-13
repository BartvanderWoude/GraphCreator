import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react'
import { TriangleAlert } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/copy'
import { cn } from '@/lib/utils'
import { NODE_DIAMETER, nodeLabel } from '@/model/nodeSize'
import type { CircleFlowNode } from './types'

/** Diameter of the untyped warning dot, in px (spec 5.7.7). */
const DOT_SIZE = 20

/**
 * A variable as a circle (spec 5.2 "Node look", 5.7.7). Every circle is `NODE_DIAMETER` across;
 * the name is wrapped inside it at the font size that fits (5.7.6). Colours come from the role.
 * `data.name` is the shown name, so the circle follows the name being typed in the editor (5.3).
 *
 * Connecting follows React Flow's "easy connect" pattern: a ring-shaped source handle lies
 * behind the circle and shows 7 px around it (the rim, the drag-to-connect area), and a target
 * handle covers the whole circle but takes pointer events only while a connection is being
 * dragged. Dragging the middle of the circle moves it. Styles are in `canvas.css`.
 *
 * During a lesson step that points at this node, a pulsing label sits centred above the circle
 * (5.7.12). It is part of the node, so it pans, zooms and moves with it.
 */
export function CircleNode({
  id,
  data,
  selected,
  isConnectable,
}: NodeProps<CircleFlowNode>) {
  // 'from': this node starts the connection being dragged; 'other': another node does.
  const connecting = useConnection((c) =>
    c.inProgress ? (c.fromNode.id === id ? 'from' : 'other') : null,
  )
  const label = nodeLabel(data.name)
  const r = NODE_DIAMETER / 2
  // The dot's centre sits on the rim at the top right (45°).
  const dotOffset = r - r * Math.SQRT1_2 - DOT_SIZE / 2

  return (
    <div
      className={cn(
        'gc-node',
        connecting && 'gc-connecting',
        // The hover rim: connect-mode source, connection being dragged from it, or an Analysis
        // item pointing at it (5.7.7).
        (data.connectSource || data.highlighted || connecting === 'from') &&
          'gc-rim-on',
        selected && 'gc-selected',
      )}
      style={{ width: NODE_DIAMETER, height: NODE_DIAMETER }}
    >
      <Handle
        type="source"
        position={Position.Top}
        className="gc-handle gc-source"
        isConnectable={isConnectable}
      />
      <div
        role="img"
        aria-label={`${data.name}, ${ROLE_LABELS[data.role]}`}
        data-role={data.role}
        className="gc-circle"
        // The CSS line height is a multiple, so the pitch follows the size (5.7.6).
        style={{ fontSize: `${label.fontSize}px` }}
        title={label.truncated ? data.name : undefined}
      >
        {label.lines.map((line, i) => (
          <span key={i} className="gc-line">
            {line}
          </span>
        ))}
      </div>
      {data.untyped && (
        <span
          role="img"
          className="gc-untyped"
          title="No variable type"
          aria-label="No variable type"
          style={{ top: dotOffset, right: dotOffset }}
        >
          <TriangleAlert size={12} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      {data.pointer !== undefined && (
        // A lesson pointer (5.7.12): decorative, since the lesson panel names the same variable.
        <span className="gc-pointer" data-lesson-pointer="" aria-hidden="true">
          <span className="gc-pointer-label">{data.pointer}</span>
        </span>
      )}
      <Handle
        type="target"
        position={Position.Top}
        className="gc-handle gc-target"
        isConnectable={isConnectable}
        isConnectableStart={false}
      />
    </div>
  )
}
