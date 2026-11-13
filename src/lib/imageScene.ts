/**
 * The picture of a graph as shapes in image coordinates (spec 4.11 "PDF, legend and dark
 * theme"): what SVG, PNG, PDF and TikZ draw, with the legend placed once. The types are fixed in
 * phase 31; `imageScene` is built in phase 37. Pure, no DOM.
 */
import { ROLE_LABELS } from '@/lib/copy'
import { edgeEndpoints, type Circle } from '@/lib/geometry'
import type { ImageOptions } from '@/lib/imageExport'
import type { GNode, Graph } from '@/model/graph'
import { lineHeight, NODE_DIAMETER, nodeLabel } from '@/model/nodeSize'
import { EXPORT_PALETTES, type ExportPalette } from '@/model/palette'
import { ROLES, type Role } from '@/model/schema'
import { signBadge } from '@/model/simulation'

/** Space around the nodes' bounding box, in px (re-exported by `imageExport.ts`). */
export const EXPORT_MARGIN = 24

/** Legend box sizes in px. */
export const LEGEND = {
  width: 96,
  padding: 8,
  row: 20,
  swatch: 10,
  gap: 8,
  beside: 16,
  font: 12,
} as const

export type LegendCorner =
  'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'beside'

export interface SceneCircle {
  cx: number
  cy: number
  r: number
  fill: string
  stroke: string
  strokeWidth: number
}

/** A line of text; `y` is its baseline. */
export interface SceneText {
  x: number
  y: number
  text: string
  size: number
  weight: 400 | 500
  color: string
  anchor: 'middle' | 'start'
}

/** An edge line and its arrowhead triangle (tip first). */
export interface SceneEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
  head: [[number, number], [number, number], [number, number]]
}

export interface SceneLegend {
  x: number
  y: number
  width: number
  height: number
  corner: LegendCorner
  background: string
  border: string
  items: { role: Role; label: string; swatch: SceneCircle; text: SceneText }[]
}

/** A sign badge on an edge (4.16 "Images"): a small circle and its glyph, `+`, `−` or `±`. */
export interface SceneBadge {
  circle: SceneCircle
  text: SceneText
}

/** Everything a picture shows. The image's top-left is 0,0 and y grows downward. */
export interface Scene {
  title: string
  width: number
  height: number
  background: string
  /** In drawing order. */
  edges: SceneEdge[]
  /** Sign badges (only with the `signs` option), drawn after the edges and before the circles. */
  badges: SceneBadge[]
  circles: SceneCircle[]
  /** The wrapped name lines. */
  texts: SceneText[]
  /** `circles[i]` belongs to graph node `nodeIds[i]`. */
  nodeIds: string[]
  legend: SceneLegend | null
}

/** Circle outline, edge stroke and arrowhead, as on the canvas (5.7.7, `FloatingEdge`). */
const OUTLINE_WIDTH = 2
const EDGE_WIDTH = 1.5
const EDGE_GAP = 2
const ARROW_LENGTH = 9
const ARROW_WIDTH = 9
/** How far the line runs into the arrowhead, so no seam shows between them. */
const ARROW_OVERLAP = 1
/**
 * Baseline below the middle of a line box, in em: half of IBM Plex Sans's ascent (1.025 em) minus
 * its descent (0.275 em), where CSS puts it. 4.875 px for 13 px text in a 16 px line.
 */
const BASELINE = 0.375
/** The legend swatch's outline width. */
const SWATCH_LINE = 1.5
/** Sign badge (4.16 "Images", 5.9 "Canvas"): a 16 px circle with a 1 px line, 12 px glyph. */
const BADGE_RADIUS = 8
const BADGE_LINE = 1
const BADGE_FONT = 12
const BADGE_GLYPHS = {
  positive: '+',
  negative: '\u2212',
  mixed: '\u00b1',
} as const
/** Free space the legend box keeps from circles and edges when it sits in a corner. */
const LEGEND_CLEARANCE = 8

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** The circle a node occupies on the canvas: centred on `pos + d/2`, radius `d/2`. */
function circleOf(node: GNode): Circle {
  const d = NODE_DIAMETER
  return { cx: node.pos.x + d / 2, cy: node.pos.y + d / 2, r: d / 2 }
}

/** True when the open boxes share an area (touching edges do not count). */
function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  )
}

/** True when the segment touches or crosses the closed box, or lies in it (Liang–Barsky). */
function segmentHitsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: Box,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  let t0 = 0
  let t1 = 1
  for (const [p, q] of [
    [-dx, x1 - box.left],
    [dx, box.right - x1],
    [-dy, y1 - box.top],
    [dy, box.bottom - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      t0 = Math.max(t0, t)
    } else {
      if (t < t0) return false
      t1 = Math.min(t1, t)
    }
  }
  return true
}

/**
 * A sign badge centred on `x`, `y`: the circle's 1 px line lies inside its 8 px radius, as the
 * canvas draws a 16 px circle with a border, and the glyph's baseline follows the node text rule.
 */
function badgeAt(
  x: number,
  y: number,
  glyph: string,
  palette: ExportPalette,
): SceneBadge {
  return {
    circle: {
      cx: x,
      cy: y,
      r: BADGE_RADIUS - BADGE_LINE / 2,
      fill: palette.background,
      stroke: palette.edge,
      strokeWidth: BADGE_LINE,
    },
    text: {
      x,
      y: y + BADGE_FONT * BASELINE,
      text: glyph,
      size: BADGE_FONT,
      weight: 500,
      color: palette.edge,
      anchor: 'middle',
    },
  }
}

/**
 * The legend box at `x`, `y`: one row per role in `roles`, a swatch circle and the role's label,
 * the label's baseline placed as CSS would centre 12 px text in the row.
 */
function legendAt(
  x: number,
  y: number,
  corner: LegendCorner,
  roles: Role[],
  palette: ExportPalette,
): SceneLegend {
  return {
    x,
    y,
    width: LEGEND.width,
    height: 2 * LEGEND.padding + roles.length * LEGEND.row,
    corner,
    background: palette.background,
    border: palette.border,
    items: roles.map((role, i) => {
      const middle = y + LEGEND.padding + (i + 0.5) * LEGEND.row
      return {
        role,
        label: ROLE_LABELS[role],
        swatch: {
          cx: x + LEGEND.padding + LEGEND.swatch / 2,
          cy: middle,
          r: LEGEND.swatch / 2 - SWATCH_LINE / 2,
          fill: palette.roles[role].fill,
          stroke: palette.roles[role].line,
          strokeWidth: SWATCH_LINE,
        },
        text: {
          x: x + LEGEND.padding + LEGEND.swatch + LEGEND.gap,
          y: middle + LEGEND.font * BASELINE,
          text: ROLE_LABELS[role],
          size: LEGEND.font,
          weight: 400,
          color: palette.foreground,
          anchor: 'start',
        },
      }
    }),
  }
}

/**
 * The scene for `graph` (4.11): the canvas geometry moved so the nodes' bounding box starts at
 * `EXPORT_MARGIN`, coloured by `opts.theme`, with the legend in the first free corner of the
 * bounding box or beside it. With `opts.signs`, each drawn edge whose `signBadge` is defined gets
 * a badge halfway between its start and its arrowhead's tip.
 */
export function imageScene(graph: Graph, opts: ImageOptions = {}): Scene {
  const palette = EXPORT_PALETTES[opts.theme ?? 'light']
  const scene: Scene = {
    title: graph.name ?? 'Graph',
    width: 2 * EXPORT_MARGIN,
    height: 2 * EXPORT_MARGIN,
    background: palette.background,
    edges: [],
    badges: [],
    circles: [],
    texts: [],
    nodeIds: [],
    legend: null,
  }
  if (graph.nodes.length === 0) return scene

  const canvasCircles = new Map(graph.nodes.map((n) => [n.id, circleOf(n)]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of graph.nodes) {
    const d = NODE_DIAMETER
    minX = Math.min(minX, node.pos.x)
    minY = Math.min(minY, node.pos.y)
    maxX = Math.max(maxX, node.pos.x + d)
    maxY = Math.max(maxY, node.pos.y + d)
  }
  // Canvas coordinates minus the origin are image coordinates.
  const ox = minX - EXPORT_MARGIN
  const oy = minY - EXPORT_MARGIN
  scene.width = Math.ceil(maxX - minX + 2 * EXPORT_MARGIN)
  scene.height = Math.ceil(maxY - minY + 2 * EXPORT_MARGIN)

  for (const edge of graph.edges) {
    const source = canvasCircles.get(edge.source)
    const target = canvasCircles.get(edge.target)
    const ends =
      source && target ? edgeEndpoints(source, target, EDGE_GAP) : null
    if (!ends) continue
    const sx = ends.sx - ox
    const sy = ends.sy - oy
    const tx = ends.tx - ox
    const ty = ends.ty - oy
    const length = Math.hypot(tx - sx, ty - sy)
    const ux = length > 0 ? (tx - sx) / length : 0
    const uy = length > 0 ? (ty - sy) / length : 0
    // The line stops inside the arrowhead; the head's base and perpendicular half-width.
    const back = Math.min(ARROW_LENGTH - ARROW_OVERLAP, length)
    const bx = tx - ARROW_LENGTH * ux
    const by = ty - ARROW_LENGTH * uy
    const px = (-uy * ARROW_WIDTH) / 2
    const py = (ux * ARROW_WIDTH) / 2
    scene.edges.push({
      x1: sx,
      y1: sy,
      x2: tx - back * ux,
      y2: ty - back * uy,
      color: palette.edge,
      width: EDGE_WIDTH,
      head: [
        [tx, ty],
        [bx + px, by + py],
        [bx - px, by - py],
      ],
    })
    const badge = opts.signs ? signBadge(edge.sign) : undefined
    if (badge) {
      scene.badges.push(
        badgeAt((sx + tx) / 2, (sy + ty) / 2, BADGE_GLYPHS[badge], palette),
      )
    }
  }

  for (const node of graph.nodes) {
    const c = canvasCircles.get(node.id)!
    const colors = palette.roles[node.role]
    const cx = c.cx - ox
    const cy = c.cy - oy
    // The outline is drawn inside the circle, so the outer size matches the canvas.
    scene.circles.push({
      cx,
      cy,
      r: c.r - OUTLINE_WIDTH / 2,
      fill: colors.fill,
      stroke: colors.line,
      strokeWidth: OUTLINE_WIDTH,
    })
    scene.nodeIds.push(node.id)
    // Each name is drawn at its own size (5.7.6), with the matching line pitch and baseline.
    const { lines, fontSize } = nodeLabel(node.name)
    const pitch = lineHeight(fontSize)
    lines.forEach((line, i) => {
      const middle = cy + (i - (lines.length - 1) / 2) * pitch
      scene.texts.push({
        x: cx,
        y: middle + fontSize * BASELINE,
        text: line,
        size: fontSize,
        weight: 500,
        color: colors.text,
        anchor: 'middle',
      })
    })
  }

  if (opts.legend)
    scene.legend = placeLegend(scene, graph, palette, maxX - minX, maxY - minY)
  return scene
}

/**
 * The legend for the roles in use: in the first free corner of the drawing area (the nodes'
 * bounding box, `width` × `height` at the margin), else beside it, growing the scene.
 */
function placeLegend(
  scene: Scene,
  graph: Graph,
  palette: ExportPalette,
  width: number,
  height: number,
): SceneLegend | null {
  const used = new Set(graph.nodes.map((n) => n.role))
  const roles = ROLES.filter((role) => used.has(role))
  if (roles.length === 0) return null
  const w = LEGEND.width
  const h = 2 * LEGEND.padding + roles.length * LEGEND.row
  const left = EXPORT_MARGIN
  const top = EXPORT_MARGIN
  const right = EXPORT_MARGIN + width
  const bottom = EXPORT_MARGIN + height
  const corners: [LegendCorner, number, number][] = [
    ['top-right', right - w, top],
    ['top-left', left, top],
    ['bottom-right', right - w, bottom - h],
    ['bottom-left', left, bottom - h],
  ]
  // Circles count as their bounding squares (outline included); edges run from start to tip.
  const squares: Box[] = scene.circles.map((c) => {
    const r = c.r + c.strokeWidth / 2
    return { left: c.cx - r, top: c.cy - r, right: c.cx + r, bottom: c.cy + r }
  })
  for (const [corner, x, y] of corners) {
    const grown: Box = {
      left: x - LEGEND_CLEARANCE,
      top: y - LEGEND_CLEARANCE,
      right: x + w + LEGEND_CLEARANCE,
      bottom: y + h + LEGEND_CLEARANCE,
    }
    const blocked =
      squares.some((square) => overlaps(grown, square)) ||
      scene.edges.some((e) =>
        segmentHitsBox(e.x1, e.y1, e.head[0][0], e.head[0][1], grown),
      )
    if (!blocked) return legendAt(x, y, corner, roles, palette)
  }
  // Beside: right of the bounding box, top-aligned; the image grows to hold it with the margin.
  scene.width += LEGEND.beside + w
  scene.height = Math.max(scene.height, Math.ceil(h + 2 * EXPORT_MARGIN))
  return legendAt(right + LEGEND.beside, top, 'beside', roles, palette)
}
