import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  type ConnectionLineComponentProps,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react'
import { Bookmark } from 'lucide-react'
import { edgeEndpoints, type Circle } from '@/lib/geometry'
import { useGraphStore } from '@/store/graphStore'
import type { CircleFlowNode, FloatingFlowEdge } from './types'

/** Length and width of the closed arrowhead, in px (spec 5.7.7). */
const ARROW_LENGTH = 9
const ARROW_WIDTH = 9
/** How far the line runs into the arrowhead, so no seam shows between them. */
const ARROW_OVERLAP = 1
/** Width of the invisible line that picks up hover and clicks. */
const INTERACTION_WIDTH = 12

/** The sign badge's glyph, accessible name and title, by `FloatingEdgeData.sign` (spec 5.9). */
const SIGN_BADGES = {
  positive: { glyph: '+', label: 'Positive effect', title: 'Sign: positive' },
  negative: {
    glyph: '\u2212',
    label: 'Negative effect',
    title: 'Sign: negative',
  },
  mixed: {
    glyph: '\u00B1',
    label: 'Mixed effects per level',
    title: 'Sign: mixed',
  },
} as const

/** Selects the edge in the store, as a click on its line does. */
function selectEdge(id: string) {
  useGraphStore.getState().select({ kind: 'edge', id })
}

/** The circle a measured React Flow node occupies, in flow coordinates; null until measured. */
function circleOf(node: InternalNode | undefined): Circle | null {
  const width = node?.measured.width
  const height = node?.measured.height
  if (!node || !width || !height) return null
  const { x, y } = node.internals.positionAbsolute
  return {
    cx: x + width / 2,
    cy: y + height / 2,
    r: Math.min(width, height) / 2,
  }
}

/**
 * A straight edge from rim to rim (spec 5.2 "Edges", 5.7.7). It starts where the line between
 * the centres leaves the source circle; the arrowhead's tip ends 2 px before the target's rim.
 * Moving a circle re-aims the edge because it reads both nodes from React Flow's store.
 * An edge on an open causal or biasing path carries `data-path` on its line and arrowhead, and
 * canvas.css draws the path look from it. A signed edge shows its sign badge at the midpoint,
 * next to the evidence chip when it has one (spec 5.9 "Canvas").
 */
export function FloatingEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<FloatingFlowEdge>) {
  const sourceCircle = circleOf(useInternalNode(source))
  const targetCircle = circleOf(useInternalNode(target))
  if (!sourceCircle || !targetCircle) return null
  const ends = edgeEndpoints(sourceCircle, targetCircle)
  if (!ends) return null
  const { sx, sy, tx, ty } = ends

  // The line stops at the arrowhead's base; the marker draws the head up to the tip (tx, ty).
  const length = Math.hypot(tx - sx, ty - sy)
  const back = Math.min(ARROW_LENGTH - ARROW_OVERLAP, length)
  const ux = length > 0 ? (tx - sx) / length : 0
  const uy = length > 0 ? (ty - sy) / length : 0
  const path = `M ${sx},${sy} L ${tx - back * ux},${ty - back * uy}`

  const markerId = `gc-arrow-${id}`
  const evidenceCount = data?.evidenceCount ?? 0
  const pathKind = data?.path
  const sign = data?.sign ? SIGN_BADGES[data.sign] : undefined

  return (
    <>
      <defs>
        {/* Inside the edge's group, so canvas.css can colour it by the edge's hover and selection. */}
        <marker
          id={markerId}
          className="gc-edge-marker"
          viewBox={`0 0 ${ARROW_LENGTH} ${ARROW_WIDTH}`}
          refX={ARROW_OVERLAP}
          refY={ARROW_WIDTH / 2}
          markerWidth={ARROW_LENGTH}
          markerHeight={ARROW_WIDTH}
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path
            className="gc-edge-arrow"
            data-path={pathKind}
            d={`M 0,0 L ${ARROW_LENGTH},${ARROW_WIDTH / 2} L 0,${ARROW_WIDTH} Z`}
          />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        className="gc-edge-path"
        data-path={pathKind}
        markerEnd={`url(#${markerId})`}
        interactionWidth={INTERACTION_WIDTH}
      />
      {(sign || evidenceCount > 0) && (
        <EdgeLabelRenderer>
          {/* Badge and chip sit side by side, 4 px apart, centred together on the midpoint. */}
          <div
            className="gc-edge-labels absolute flex items-center gap-1"
            style={{
              transform: `translate(-50%, -50%) translate(${(sx + tx) / 2}px, ${(sy + ty) / 2}px)`,
            }}
          >
            {sign && (
              <span
                role="img"
                className="gc-sign-badge nodrag nopan"
                data-sign={data?.sign}
                data-selected={selected ? '' : undefined}
                style={{ pointerEvents: 'all' }}
                aria-label={sign.label}
                title={sign.title}
                onClick={() => selectEdge(id)}
              >
                {sign.glyph}
              </span>
            )}
            {evidenceCount > 0 && (
              <button
                type="button"
                className="gc-evidence-chip nodrag nopan inline-flex h-5 cursor-pointer items-center gap-1 rounded-sm border border-input bg-background px-1.5 font-mono text-[11px] leading-none text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                style={{ pointerEvents: 'all' }}
                aria-label={`${evidenceCount} evidence ${evidenceCount === 1 ? 'item' : 'items'}`}
                onClick={() => selectEdge(id)}
              >
                <Bookmark size={10} strokeWidth={1.75} aria-hidden="true" />
                {evidenceCount}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/**
 * The line shown while dragging a new connection (spec 5.7.7): dashed teal, from the source's
 * rim to the pointer, or rim to rim while the pointer is over another circle.
 */
export function CircleConnectionLine({
  fromNode,
  toNode,
  toX,
  toY,
}: ConnectionLineComponentProps<CircleFlowNode>) {
  const sourceCircle = circleOf(fromNode)
  if (!sourceCircle) return null
  const targetCircle =
    toNode && toNode.id !== fromNode.id ? circleOf(toNode) : null

  let ends: ReturnType<typeof edgeEndpoints>
  if (targetCircle) {
    ends = edgeEndpoints(sourceCircle, targetCircle)
  } else {
    // Nothing to draw while the pointer is still inside the source circle.
    const inside =
      Math.hypot(toX - sourceCircle.cx, toY - sourceCircle.cy) <= sourceCircle.r
    ends = inside
      ? null
      : edgeEndpoints(sourceCircle, { cx: toX, cy: toY, r: 0 }, 0)
  }
  if (!ends) return null

  return (
    <path
      className="gc-connection-line"
      d={`M ${ends.sx},${ends.sy} L ${ends.tx},${ends.ty}`}
    />
  )
}
