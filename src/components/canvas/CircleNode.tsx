import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react'
import { TriangleAlert } from 'lucide-react'
import { MARK_LABELS, ROLE_LABELS } from '@/lib/copy'
import {
  FORM_GLYPHS,
  MARK_GLYPH,
  MARK_SIZE,
  TYPE_LETTERS,
  glyphPathData,
  markCentre,
  placeGlyph,
  type MarkCorner,
} from '@/lib/display'
import { cn } from '@/lib/utils'
import { NODE_DIAMETER, nodeLabel } from '@/model/nodeSize'
import type { Form, VarType } from '@/model/schema'
import type { CircleFlowNode } from './types'

/** The variable type of each mark letter, for the type mark's label (`TYPE_LETTERS` inverted). */
const TYPE_OF_LETTER = new Map(
  (Object.entries(TYPE_LETTERS) as [VarType, string][]).map(
    ([varType, letter]) => [letter, varType],
  ),
)

/** Each form's glyph as an SVG `d`, in a `MARK_GLYPH` px square (spec 5.11 "Canvas"). */
const GLYPH_PATHS = Object.fromEntries(
  (Object.keys(FORM_GLYPHS) as Form[]).map((form) => [
    form,
    glyphPathData(
      placeGlyph(FORM_GLYPHS[form], MARK_GLYPH / 2, MARK_GLYPH / 2, MARK_GLYPH),
    ),
  ]),
) as Record<Form, string>

/**
 * Where a 20 px rim item (a mark or the untyped dot) sits in the node: its centre on the rim at
 * 45 degrees (spec 5.7.7), as the `top` and `left` of its box.
 */
function rimPosition(corner: MarkCorner): { top: number; left: number } {
  const r = NODE_DIAMETER / 2
  const { x, y } = markCentre(r, r, r, corner)
  return { top: y - MARK_SIZE / 2, left: x - MARK_SIZE / 2 }
}

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
 * Display options (4.18, 5.11 "Canvas"): a form mark on the rim at the top right, a type mark at
 * the top left, and a dashed outline (`data-dashed`) for a latent node. The untyped dot moves to
 * the top left when a form mark is shown.
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
  const markType =
    data.typeLetter === undefined
      ? undefined
      : TYPE_OF_LETTER.get(data.typeLetter)
  const typeLabel = markType && MARK_LABELS.type(markType)
  // The dot sits at the top right, or at the top left when a form mark takes the top right (an
  // untyped node has no type mark there).
  const dotCorner: MarkCorner =
    data.form === undefined ? 'top-right' : 'top-left'

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
        data-dashed={data.dashed ? '' : undefined}
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
          style={rimPosition(dotCorner)}
        >
          <TriangleAlert size={12} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      {data.typeLetter !== undefined && (
        // Variable types on (4.18): the type's letter, top left.
        <span
          role="img"
          className="gc-mark gc-type-mark"
          aria-label={typeLabel}
          title={typeLabel}
          style={rimPosition('top-left')}
        >
          <span aria-hidden="true">{data.typeLetter}</span>
        </span>
      )}
      {data.form !== undefined && (
        // Forms on (4.18): the form's glyph, top right.
        <span
          role="img"
          className="gc-mark gc-form-mark"
          aria-label={MARK_LABELS.form(data.form)}
          title={MARK_LABELS.form(data.form)}
          style={rimPosition('top-right')}
        >
          <svg
            width={MARK_GLYPH}
            height={MARK_GLYPH}
            viewBox={`0 0 ${MARK_GLYPH} ${MARK_GLYPH}`}
            aria-hidden="true"
          >
            <path d={GLYPH_PATHS[data.form]} />
          </svg>
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
